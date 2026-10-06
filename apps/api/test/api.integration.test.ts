import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { latestCode, post, redeem, resetState, startHarness, SERVICE_KEY, SUPABASE_URL, type Harness } from "../../directory/test/harness.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb, type Db } from "../src/db.js";
import { createStorage } from "../src/storage.js";

// Runs against local Supabase with the account directory answering its Auth hooks.

const env = {
  REGION: "au",
  APP_ORIGIN: "http://localhost:3000",
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY: SERVICE_KEY,
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

let h: Harness;
let app: FastifyInstance;
let db: Db;
const users: Record<"a" | "b", { id: string; token: string }> = {} as never;

async function signUp(email: string, country: string) {
  await post(h, "/v1/email/start", { email });
  const verified = await post(h, "/v1/email/verify", { email, code: await latestCode(h, email) });
  const reserved = await post(h, "/v1/reserve", { ticket: verified.json.ticket, country });
  const session = await redeem(reserved.json);
  if (!session.accessToken || !session.userId) throw new Error(`sign-up failed: ${session.error}`);
  return { id: session.userId, token: session.accessToken };
}

function call(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, who: "a" | "b" | null, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: who ? { authorization: `Bearer ${users[who].token}` } : {},
    ...(payload !== undefined && { payload: payload as object }),
  });
}

async function uploadReceipt(who: "a" | "b", clientUuid: string): Promise<string> {
  const signed = (await call("POST", "/v1/uploads", who, { contentType: "image/jpeg", clientUuid })).json() as { path: string; token: string };
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/receipts/${signed.path}?token=${signed.token}`, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]),
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  return signed.path;
}

beforeAll(async () => {
  h = await startHarness();
  await resetState(h);
  const config = loadConfig(env);
  db = createDb(config.DATABASE_URL);
  app = buildApp({ config, db, storage: createStorage(config) });
  users.a = await signUp("api-a@claimtidy.test", "AU");
  users.b = await signUp("api-b@claimtidy.test", "AU");
});

afterAll(async () => {
  await app.close();
  await db.end();
  await h.close();
});

describe("sessions", () => {
  it("requires a valid regional token", async () => {
    expect((await call("GET", "/v1/me", null)).statusCode).toBe(401);
    const forged = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${users.a.token}x` } });
    expect(forged.statusCode).toBe(401);
  });

  it("refuses a token stamped for another region", async () => {
    const config = loadConfig({ ...env, REGION: "us" });
    const usApp = buildApp({ config, db, storage: createStorage(config) });
    const res = await usApp.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${users.a.token}` } });
    expect(res.statusCode).toBe(401);
    await usApp.close();
  });
});

describe("profile (country question)", () => {
  it("needs a profile before capturing", async () => {
    const res = await call("POST", "/v1/uploads", "a", { contentType: "image/jpeg", clientUuid: randomUUID() });
    expect(res.json()).toEqual({ error: "profile_required" });
  });

  it("creates the profile once, with the country's defaults and starter categories", async () => {
    expect((await call("POST", "/v1/profile", "a", { country: "US", timeZone: "America/New_York" })).json()).toEqual({ error: "wrong_region" });
    expect((await call("POST", "/v1/profile", "a", { country: "AU", timeZone: "Mars/Olympus" })).statusCode).toBe(400);

    const created = await call("POST", "/v1/profile", "a", { country: "au", timeZone: "Australia/Sydney", holidayRegion: "NSW" });
    expect(created.statusCode).toBe(201);
    const again = await call("POST", "/v1/profile", "a", { country: "AU", timeZone: "Australia/Perth" });
    expect(again.json()).toEqual({ created: false });

    const me = (await call("GET", "/v1/me", "a")).json();
    expect(me.profile).toMatchObject({ country: "AU", tax_pack: "au", home_currency: "AUD", time_zone: "Australia/Sydney", hosting_region: "au" });
    expect(me.categories).toHaveLength(7);
    await call("POST", "/v1/profile", "b", { country: "NZ", homeCurrency: "NZD", timeZone: "Pacific/Auckland" });
    expect((await call("GET", "/v1/me", "b")).json().profile).toMatchObject({ tax_pack: "generic", home_currency: "NZD" });
  });
});

describe("capture: upload and save", () => {
  it("saves an entry once, however many times the device retries", async () => {
    const clientUuid = randomUUID();
    const imagePath = await uploadReceipt("a", clientUuid);
    const me = (await call("GET", "/v1/me", "a")).json();
    const body = { clientUuid, accountId: users.a.id, kind: "receipt", cardType: "personal", categoryId: me.categories[1].id, imagePath };

    const results = await Promise.all(Array.from({ length: 5 }, () => call("POST", "/v1/entries", "a", body)));
    const ids = new Set(results.map((r) => r.json().id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    const { rows } = await db.query("select count(*)::int as n from entries where client_uuid = $1", [clientUuid]);
    expect(rows[0].n).toBe(1);
  });

  it("refuses items queued under another account", async () => {
    const clientUuid = randomUUID();
    const imagePath = await uploadReceipt("a", clientUuid);
    const res = await call("POST", "/v1/entries", "b", { clientUuid, accountId: users.a.id, kind: "receipt", cardType: "personal", categoryId: null, imagePath });
    expect(res.json()).toEqual({ error: "account_mismatch" });
    const stolen = await call("POST", "/v1/entries", "b", { clientUuid, accountId: users.b.id, kind: "receipt", cardType: "personal", categoryId: null, imagePath });
    expect(stolen.json()).toEqual({ error: "bad_image_path" });
  });

  it("refuses an image that was never uploaded, and someone else's category", async () => {
    const clientUuid = randomUUID();
    const missing = await call("POST", "/v1/entries", "a", {
      clientUuid, accountId: users.a.id, kind: "receipt", cardType: "personal", categoryId: null, imagePath: `${users.a.id}/${clientUuid}/nope.jpg`,
    });
    expect(missing.json()).toEqual({ error: "image_not_uploaded" });
    const bCategory = (await call("GET", "/v1/me", "b")).json().categories[0].id;
    const imagePath = await uploadReceipt("a", clientUuid);
    const res = await call("POST", "/v1/entries", "a", { clientUuid, accountId: users.a.id, kind: "receipt", cardType: "personal", categoryId: bCategory, imagePath });
    expect(res.json()).toEqual({ error: "bad_category" });
  });

  it("a signed upload URL can't overwrite an existing object", async () => {
    const signed = (await call("POST", "/v1/uploads", "a", { contentType: "image/jpeg", clientUuid: randomUUID() })).json();
    const put = () =>
      fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/receipts/${signed.path}?token=${signed.token}`, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: new Uint8Array([1, 2, 3]),
      });
    expect((await put()).ok).toBe(true);
    expect((await put()).ok).toBe(false);
  });

  it("edits and undoes a draft entry, and keeps other users out", async () => {
    const clientUuid = randomUUID();
    const imagePath = await uploadReceipt("a", clientUuid);
    const me = (await call("GET", "/v1/me", "a")).json();
    const { id } = (await call("POST", "/v1/entries", "a", { clientUuid, accountId: users.a.id, kind: "receipt", cardType: "personal", categoryId: me.categories[0].id, imagePath })).json();

    expect((await call("PATCH", `/v1/entries/${id}`, "b", { cardType: "company" })).statusCode).toBe(404);
    expect((await call("PATCH", `/v1/entries/${id}`, "a", { cardType: "company", categoryId: me.categories[2].id })).statusCode).toBe(200);
    const { rows } = await db.query("select card_type, category_id from entries where id = $1", [id]);
    expect(rows[0]).toEqual({ card_type: "company", category_id: me.categories[2].id });

    expect((await call("DELETE", `/v1/entries/${id}`, "b")).statusCode).toBe(404);
    expect((await call("DELETE", `/v1/entries/${id}`, "a")).statusCode).toBe(204);
    const gone = await db.query("select count(*)::int as n from storage.objects where name = $1", [imagePath]);
    expect(gone.rows[0].n).toBe(0);
  });

  it("only accepts the app's origin", async () => {
    const res = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(res.statusCode).toBe(403);
  });
});
