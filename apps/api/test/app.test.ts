import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({ REGION: "au", APP_ORIGIN: "https://claimtidy.com" });

describe("api", () => {
  it("reports health and region", async () => {
    const res = await buildApp(config).inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, region: "au" });
  });

  it("allows only the app origin", async () => {
    const app = buildApp(config);
    const ok = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://claimtidy.com" } });
    expect(ok.headers["access-control-allow-origin"]).toBe("https://claimtidy.com");
    const bad = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(bad.statusCode).toBe(403);
  });

  it("rejects an unknown region", () => {
    expect(() => loadConfig({ REGION: "eu", APP_ORIGIN: "https://claimtidy.com" })).toThrow();
  });
});
