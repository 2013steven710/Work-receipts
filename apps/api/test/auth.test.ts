import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createAuthenticator } from "../src/auth.js";
import { loadConfig } from "../src/config.js";

// Self-hosted Supabase (Hostinger) signs access tokens with a shared HS256 secret.
const SECRET = "s".repeat(40);
const config = loadConfig({
  REGION: "uk",
  APP_ORIGIN: "https://claimtidy.com",
  SUPABASE_URL: "http://api-gw:8000",
  SUPABASE_SERVICE_KEY: "unused",
  DATABASE_URL: "postgresql://unused",
  SUPABASE_JWT_SECRET: SECRET,
  SUPABASE_JWT_ISSUER: "https://db-uk.claimtidy.com/auth/v1",
});

const token = (claims: Record<string, unknown>, secret = SECRET, alg = "HS256") =>
  new SignJWT({
    role: "authenticated",
    hosting_region: "uk",
    sub: "aaaaaaaa-0000-4000-8000-000000000001",
    iss: "https://db-uk.claimtidy.com/auth/v1",
    aud: "authenticated",
    ...claims,
  })
    .setProtectedHeader({ alg })
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));

describe("self-hosted token verification", () => {
  const auth = createAuthenticator(config);

  it("accepts a token signed with the region's secret", async () => {
    await expect(auth(`Bearer ${await token({})}`)).resolves.toMatchObject({ userId: "aaaaaaaa-0000-4000-8000-000000000001" });
  });

  it("refuses another secret, another region, another issuer, and the service role", async () => {
    await expect(auth(`Bearer ${await token({}, "x".repeat(40))}`)).rejects.toThrow();
    await expect(auth(`Bearer ${await token({ hosting_region: "au" })}`)).rejects.toThrow();
    await expect(auth(`Bearer ${await token({ iss: "https://evil.example/auth/v1" })}`)).rejects.toThrow();
    await expect(auth(`Bearer ${await token({ role: "service_role" })}`)).rejects.toThrow();
    await expect(auth(`Bearer ${await token({}, SECRET, "HS512")}`)).rejects.toThrow();
  });
});
