import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({
  APP_ORIGIN: "https://claimtidy.com",
  SUPABASE_URL: "http://127.0.0.1:54321",
  DATABASE_URL: "postgresql://unused",
});

describe("api", () => {
  it("reports health", async () => {
    const res = await buildApp({ config }).inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("allows only the app origin", async () => {
    const app = buildApp({ config });
    const ok = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://claimtidy.com" } });
    expect(ok.headers["access-control-allow-origin"]).toBe("https://claimtidy.com");
    const bad = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(bad.statusCode).toBe(403);
  });

  it("rejects a bad configuration", () => {
    expect(() => loadConfig({ APP_ORIGIN: "not a url", SUPABASE_URL: "http://x", DATABASE_URL: "x" })).toThrow();
  });
});
