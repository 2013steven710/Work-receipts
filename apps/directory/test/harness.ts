import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb, type Db, migrate } from "../src/db.js";
import { hashNonce } from "../src/idtokens.js";
import { createMailer } from "../src/mailer.js";

// Integration harness: the directory listens on 54390, where local Supabase Auth (region "au")
// sends its hooks (supabase/config.toml). Requires `supabase start`.

export const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const HOOK_SECRET = "v1,whsec_Y2xhaW10aWR5LWxvY2FsLWRldi1ob29rLXNlY3JldCE=";
const ADMIN_DB = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const APP_ORIGIN = "http://localhost:3000";
export const GOOGLE_CLIENT_ID = "test-google-client";
export const DIRECTORY_PORT = 54390;

export interface Harness {
  url: string;
  db: Db;
  supabaseDb: pg.Pool;
  googleToken(claims: Record<string, unknown>, rawNonce: string): Promise<string>;
  close(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const admin = new pg.Pool({ connectionString: ADMIN_DB });
  const exists = await admin.query("select 1 from pg_database where datname = 'directory_test'");
  if (exists.rowCount === 0) await admin.query("create database directory_test");
  const dbUrl = ADMIN_DB.replace(/\/postgres$/, "/directory_test");

  // A stand-in for Google's key set.
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const jwks: Server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => jwks.listen(0, "127.0.0.1", resolve));
  const jwksUrl = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}/certs`;

  const stack = { supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, anonKey: ANON_KEY, hookSecret: HOOK_SECRET };
  const config = loadConfig({
    DATABASE_URL: dbUrl,
    APP_ORIGIN,
    KEY_SECRET: "k".repeat(32),
    TICKET_SECRET: "t".repeat(32),
    CODE_SECRET: "c".repeat(32),
    // "us" points at the same local stack, which only ever calls the "au" hooks.
    REGIONS: JSON.stringify({ au: stack, us: stack }),
    GOOGLE_CLIENT_ID,
    JWKS_OVERRIDES: JSON.stringify({ google: jwksUrl }),
    DEV_OUTBOX: "1",
  });
  const db = createDb(dbUrl);
  await db.query("drop table if exists directory_keys, email_codes, directory_conflicts");
  await migrate(db);
  const app = buildApp({ config, db, mailer: createMailer(config) });
  await app.listen({ host: "0.0.0.0", port: DIRECTORY_PORT });

  return {
    url: `http://127.0.0.1:${DIRECTORY_PORT}`,
    db,
    supabaseDb: admin,
    async googleToken(claims, rawNonce) {
      return new SignJWT({ nonce: hashNonce(rawNonce), iss: "https://accounts.google.com", aud: GOOGLE_CLIENT_ID, ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    },
    async close() {
      await app.close();
      await db.end();
      await admin.end();
      await new Promise((resolve) => jwks.close(resolve));
    },
  };
}

export async function resetState(h: Harness): Promise<void> {
  await h.db.query("truncate directory_keys, email_codes, directory_conflicts");
  await h.supabaseDb.query("delete from auth.users where email like '%@claimtidy.test'");
}

export async function post(h: Harness, path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${h.url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_ORIGIN },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export async function latestCode(h: Harness, email: string): Promise<string> {
  const res = await fetch(`${h.url}/dev/outbox?to=${encodeURIComponent(email)}`);
  const mails = (await res.json()) as { subject: string }[];
  const match = mails.at(-1)?.subject.match(/(\d{6})$/);
  if (!match?.[1]) throw new Error(`no code mailed to ${email}`);
  return match[1];
}

/** Redeem the directory's sign-in token at the regional Supabase, as the web app does. */
export async function redeem(token: { tokenHash?: unknown; tokenType?: unknown }): Promise<{ status: number; accessToken: string | undefined; userId: string | undefined; error: string | undefined }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ type: token.tokenType, token_hash: token.tokenHash }),
  });
  const json = (await res.json()) as { access_token?: string; user?: { id: string }; msg?: string; message?: string };
  return { status: res.status, accessToken: json.access_token, userId: json.user?.id, error: json.msg ?? json.message };
}

export function claims(accessToken: string): Record<string, unknown> {
  const part = accessToken.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

/** Sign up directly at the regional Auth endpoint, bypassing the directory. */
export async function directSignUp(email: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, create_user: true }),
  });
  return { status: res.status, body: await res.text() };
}
