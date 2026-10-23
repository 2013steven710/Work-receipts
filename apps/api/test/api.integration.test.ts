import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb, type Db } from "../src/db.js";

// Runs against local Supabase (pnpm test:db starts it). Users sign in the way the app does:
// a one-time email token, redeemed at Supabase Auth.

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let app: FastifyInstance;
let db: Db;
const tokens: Record<string, string> = {};

async function signIn(email: string): Promise<{ id: string; token: string }> {
  const link = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  }).then((r) => r.json() as Promise<{ hashed_token: string; verification_type: string }>);
  const session = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ type: link.verification_type, token_hash: link.hashed_token }),
  }).then((r) => r.json() as Promise<{ access_token: string; user: { id: string } }>);
  return { id: session.user.id, token: session.access_token };
}

const call = (method: "GET" | "POST", url: string, who: string | null, payload?: object) =>
  app.inject({ method, url, headers: who ? { authorization: `Bearer ${tokens[who]}` } : {}, ...(payload && { payload }) });

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: DB_URL });
  await admin.connect();
  await admin.query("delete from auth.users where email like '%@api.claimtidy.test'");
  await admin.end();
  const config = loadConfig({ APP_ORIGIN: "http://localhost:3000", SUPABASE_URL, DATABASE_URL: DB_URL });
  db = createDb(DB_URL);
  app = buildApp({ config, db });
  tokens.a = (await signIn("a@api.claimtidy.test")).token;
  tokens.b = (await signIn("b@api.claimtidy.test")).token;
});

afterAll(async () => {
  await app.close();
  await db.end();
});

describe("account API", () => {
  it("requires a valid session", async () => {
    expect((await call("GET", "/v1/me", null)).statusCode).toBe(401);
    const forged = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${tokens.a}x` } });
    expect(forged.statusCode).toBe(401);
  });

  it("answers the country question once, with the country's defaults", async () => {
    expect((await call("GET", "/v1/me", "a")).json().profile).toBeNull();
    expect((await call("POST", "/v1/profile", "a", { country: "AU", timeZone: "Mars/Olympus" })).statusCode).toBe(400);
    expect((await call("POST", "/v1/profile", "a", { country: "NZ", timeZone: "Pacific/Auckland" })).json()).toEqual({ error: "currency_required" });

    const created = await call("POST", "/v1/profile", "a", { country: "au", timeZone: "Australia/Sydney", holidayRegion: "NSW" });
    expect(created.statusCode).toBe(201);
    expect((await call("POST", "/v1/profile", "a", { country: "US", timeZone: "America/New_York" })).json()).toEqual({ created: false });
    expect((await call("GET", "/v1/me", "a")).json().profile).toMatchObject({ country: "AU", tax_pack: "au", home_currency: "AUD", time_zone: "Australia/Sydney" });

    await call("POST", "/v1/profile", "b", { country: "GB", timeZone: "Europe/London" });
    expect((await call("GET", "/v1/me", "b")).json().profile).toMatchObject({ tax_pack: "uk", home_currency: "GBP" });
    expect((await call("GET", "/v1/me", "a")).json().profile.country).toBe("AU");
  });

  it("only accepts the app's origin", async () => {
    const res = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(res.statusCode).toBe(403);
  });
});
