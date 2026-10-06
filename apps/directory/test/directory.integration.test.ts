import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { reconcileSession, reserve } from "../src/directory.js";
import { emailKey, providerKey } from "../src/keys.js";
import { signWebhook } from "../src/webhooks.js";
import {
  APP_ORIGIN,
  claims,
  directSignUp,
  HOOK_SECRET,
  latestCode,
  post,
  redeem,
  resetState,
  startHarness,
  type Harness,
} from "./harness.js";

const KEY_SECRET = "k".repeat(32);
let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await resetState(h);
});

async function emailSignIn(email: string) {
  await post(h, "/v1/email/start", { email });
  return post(h, "/v1/email/verify", { email, code: await latestCode(h, email) });
}

describe("email sign-up and sign-in (M1)", () => {
  it("creates a new account in the country's region and issues a session", async () => {
    const verified = await emailSignIn("new@claimtidy.test");
    expect(verified.json.status).toBe("new");

    const reserved = await post(h, "/v1/reserve", { ticket: verified.json.ticket, country: "AU" });
    expect(reserved.json.region).toBe("au");

    const session = await redeem(reserved.json);
    expect(session.error ?? "").toBe("");
    expect(session.status).toBe(200);
    // The custom access token hook ran and stamped the hosting region.
    expect(claims(session.accessToken!).hosting_region).toBe("au");

    const { rows } = await h.db.query("select status, region, account_id from directory_keys");
    expect(rows).toEqual([{ status: "active", region: "au", account_id: session.userId }]);
  });

  it("routes a returning user to the same account, with one account and one region", async () => {
    const first = await emailSignIn("back@claimtidy.test");
    const reserved = await post(h, "/v1/reserve", { ticket: first.json.ticket, country: "AU" });
    const one = await redeem(reserved.json);

    const again = await emailSignIn("BACK@claimtidy.test");
    expect(again.json).toMatchObject({ status: "existing", region: "au" });
    const two = await redeem(again.json);
    expect(two.userId).toBe(one.userId);

    const users = await h.supabaseDb.query("select count(*)::int as n from auth.users where email = 'back@claimtidy.test'");
    expect(users.rows[0].n).toBe(1);
  });

  it("a second reserve for another country keeps the first region", async () => {
    const verified = await emailSignIn("race@claimtidy.test");
    await post(h, "/v1/reserve", { ticket: verified.json.ticket, country: "AU" });
    const second = await post(h, "/v1/reserve", { ticket: verified.json.ticket, country: "US" });
    expect(second.json.region).toBe("au");
  });

  it("refuses a wrong code, and locks after 5 attempts", async () => {
    const email = "guess@claimtidy.test";
    await post(h, "/v1/email/start", { email });
    const code = await latestCode(h, email);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      expect((await post(h, "/v1/email/verify", { email, code: wrong })).status).toBe(400);
    }
    expect((await post(h, "/v1/email/verify", { email, code })).status).toBe(400);
  });

  it("answers email start the same way for any address", async () => {
    const a = await post(h, "/v1/email/start", { email: "nobody@claimtidy.test" });
    expect(a.status).toBe(202);
    expect(a.json).toEqual({});
  });
});

describe("regional enforcement (BP-008)", () => {
  it("refuses a direct sign-up at a region that holds no reservation", async () => {
    const res = await directSignUp("sneaky@claimtidy.test");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const users = await h.supabaseDb.query("select count(*)::int as n from auth.users where email = 'sneaky@claimtidy.test'");
    expect(users.rows[0].n).toBe(0);
  });

  it("refuses a direct sign-up at this region when the identity is reserved for another region", async () => {
    // Reserved for "us" (as /v1/reserve does for a US country); the local stack plays "au".
    await reserve(h.db, [emailKey(KEY_SECRET, "us-person@claimtidy.test")], "us");
    const res = await directSignUp("us-person@claimtidy.test");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const users = await h.supabaseDb.query("select count(*)::int as n from auth.users where email = 'us-person@claimtidy.test'");
    expect(users.rows[0].n).toBe(0);
  });

  it("rejects hook calls without a valid signature", async () => {
    const body = JSON.stringify({ user: { email: "x@claimtidy.test", app_metadata: { provider: "email" } } });
    const unsigned = await fetch(`${h.url}/hooks/au/before-user-created`, { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(unsigned.status).toBe(401);
    const ts = Math.floor(Date.now() / 1000);
    const forged = await fetch(`${h.url}/hooks/au/before-user-created`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": "msg_1",
        "webhook-timestamp": String(ts),
        "webhook-signature": signWebhook("v1,whsec_" + Buffer.from("wrong-secret-wrong-secret!!").toString("base64"), "msg_1", ts, body),
      },
      body,
    });
    expect(forged.status).toBe(401);
    const stale = await fetch(`${h.url}/hooks/au/before-user-created`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": "msg_2",
        "webhook-timestamp": String(ts - 3600),
        "webhook-signature": signWebhook(HOOK_SECRET, "msg_2", ts - 3600, body),
      },
      body,
    });
    expect(stale.status).toBe(401);
  });
});

describe("Google / Microsoft identities", () => {
  const nonce = "n".repeat(24);

  it("verifies the ID token and routes by the stable provider ID, even after the email changes", async () => {
    const token = await h.googleToken({ sub: "g-123", email: "old@claimtidy.test", email_verified: true }, nonce);
    const first = await post(h, "/v1/oauth/resolve", { provider: "google", idToken: token, nonce });
    expect(first.json.status).toBe("new");
    await post(h, "/v1/reserve", { ticket: first.json.ticket, country: "US" });

    const changed = await h.googleToken({ sub: "g-123", email: "new-address@claimtidy.test", email_verified: true }, nonce);
    const again = await post(h, "/v1/oauth/resolve", { provider: "google", idToken: changed, nonce });
    expect(again.json).toMatchObject({ status: "existing", region: "us" });
  });

  it("rejects bad tokens, wrong nonces and wrong audiences", async () => {
    const good = await h.googleToken({ sub: "g-1" }, nonce);
    expect((await post(h, "/v1/oauth/resolve", { provider: "google", idToken: good, nonce: "x".repeat(24) })).status).toBe(401);
    expect((await post(h, "/v1/oauth/resolve", { provider: "google", idToken: good + "x", nonce })).status).toBe(401);
    const otherAud = await h.googleToken({ sub: "g-1", aud: "someone-else" }, nonce);
    expect((await post(h, "/v1/oauth/resolve", { provider: "google", idToken: otherAud, nonce })).status).toBe(401);
    expect((await post(h, "/v1/oauth/resolve", { provider: "microsoft", idToken: good, nonce })).status).toBe(401);
  });

  it("routes a provider sign-in with a verified email to the existing email account (BP-010)", async () => {
    const verified = await emailSignIn("linked@claimtidy.test");
    const reserved = await post(h, "/v1/reserve", { ticket: verified.json.ticket, country: "AU" });
    await redeem(reserved.json);

    const token = await h.googleToken({ sub: "g-777", email: "linked@claimtidy.test", email_verified: true }, nonce);
    expect((await post(h, "/v1/oauth/resolve", { provider: "google", idToken: token, nonce })).json).toMatchObject({ status: "existing", region: "au" });

    // An unverified email is never used for matching.
    const unverified = await h.googleToken({ sub: "g-778", email: "linked@claimtidy.test", email_verified: false }, nonce);
    expect((await post(h, "/v1/oauth/resolve", { provider: "google", idToken: unverified, nonce })).json.status).toBe("new");
  });
});

describe("session reconciliation (custom access token hook logic)", () => {
  const A = "aaaaaaaa-0000-4000-8000-000000000001";
  const B = "bbbbbbbb-0000-4000-8000-000000000002";
  const google = providerKey(KEY_SECRET, "https://accounts.google.com", "g-9");
  const mail = emailKey(KEY_SECRET, "a@claimtidy.test");

  it("registers a newly linked identity to the account and region", async () => {
    expect(await reconcileSession(h.db, "au", A, [mail])).toEqual({ ok: true });
    expect(await reconcileSession(h.db, "au", A, [mail, google])).toEqual({ ok: true });
    const { rows } = await h.db.query("select count(*)::int as n from directory_keys where account_id = $1 and status = 'active'", [A]);
    expect(rows[0].n).toBe(2);
  });

  it("claims a pending reservation for this region", async () => {
    await reserve(h.db, [mail], "au");
    expect(await reconcileSession(h.db, "au", A, [mail])).toEqual({ ok: true });
  });

  it("fails closed when an identity belongs to another account or region, and records the conflict", async () => {
    await reconcileSession(h.db, "au", A, [google]);
    expect(await reconcileSession(h.db, "au", B, [google])).toMatchObject({ ok: false });
    expect(await reconcileSession(h.db, "us", A, [google])).toMatchObject({ ok: false });
    await reserve(h.db, [mail], "us");
    expect(await reconcileSession(h.db, "au", A, [mail])).toMatchObject({ ok: false });
    const { rows } = await h.db.query("select count(*)::int as n from directory_conflicts");
    expect(rows[0].n).toBe(3);
  });
});

describe("privacy", () => {
  it("stores no plain email or provider ID", async () => {
    const verified = await emailSignIn("private.person@claimtidy.test");
    await post(h, "/v1/reserve", { ticket: verified.json.ticket, country: "AU" });
    const token = await h.googleToken({ sub: "google-sub-xyz", email: "p2@claimtidy.test", email_verified: true }, "n".repeat(24));
    const g = await post(h, "/v1/oauth/resolve", { provider: "google", idToken: token, nonce: "n".repeat(24) });
    await post(h, "/v1/reserve", { ticket: g.json.ticket, country: "GB" });

    const dump = await h.db.query(
      "select row_to_json(t)::text as r from (select * from directory_keys) t union all select row_to_json(e)::text from email_codes e",
    );
    const text = dump.rows.map((r) => r.r as string).join("\n");
    expect(text).not.toMatch(/@|private\.person|google-sub-xyz/);
    const keys = await h.db.query("select key from directory_keys");
    for (const { key } of keys.rows) expect(key).toMatch(/^[pe]:[0-9a-f]{64}$/);
  });

  it("refuses other origins", async () => {
    const res = await fetch(`${h.url}/v1/email/start`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ email: "x@claimtidy.test" }),
    });
    expect(res.status).toBe(403);
    expect(APP_ORIGIN).toBe("http://localhost:3000");
  });
});
