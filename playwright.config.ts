import { defineConfig, devices } from "@playwright/test";

// pnpm e2e:mobile — the full local stack in mobile emulation. Needs local Supabase running
// (pnpm test:db or pnpm db:start). WebKit (iPhone) runs in CI; set E2E_WEBKIT=1 to run it locally.

const WEB = "http://localhost:3000";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322";
const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const HOOK_SECRET = "v1,whsec_Y2xhaW10aWR5LWxvY2FsLWRldi1ob29rLXNlY3JldCE=";

const projects = [{ name: "android", use: { ...devices["Pixel 7"] } }];
if (process.env.CI || process.env.E2E_WEBKIT === "1") projects.push({ name: "iphone", use: { ...devices["iPhone 14"] } });

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: WEB, trace: "retain-on-failure" },
  projects,
  webServer: [
    {
      command: "node scripts/ensure-db.mjs directory_e2e && pnpm --filter @claimtidy/directory build && node apps/directory/dist/server.js",
      url: "http://127.0.0.1:54390/health",
      reuseExistingServer: false,
      env: {
        PORT: "54390",
        DATABASE_URL: `${DB}/directory_e2e`,
        APP_ORIGIN: WEB,
        KEY_SECRET: "e2e-key-secret-e2e-key-secret-e2e!",
        TICKET_SECRET: "e2e-ticket-secret-e2e-ticket-secret",
        CODE_SECRET: "e2e-code-secret-e2e-code-secret-e2e",
        REGIONS: JSON.stringify({ au: { supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, anonKey: ANON_KEY, hookSecret: HOOK_SECRET } }),
        DEV_OUTBOX: "1",
        NODE_ENV: "test",
      },
    },
    {
      command: "pnpm --filter @claimtidy/api build && node apps/api/dist/server.js",
      url: "http://127.0.0.1:8081/health",
      reuseExistingServer: false,
      env: {
        PORT: "8081",
        REGION: "au",
        APP_ORIGIN: WEB,
        SUPABASE_URL,
        SUPABASE_SERVICE_KEY: SERVICE_KEY,
        DATABASE_URL: `${DB}/postgres`,
        NODE_ENV: "test",
      },
    },
    {
      command: "pnpm --filter @claimtidy/web build && pnpm --filter @claimtidy/web start -p 3000",
      url: WEB,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        NEXT_PUBLIC_DIRECTORY_URL: "http://localhost:54390",
        NEXT_PUBLIC_API_URLS: JSON.stringify({ au: "http://localhost:8081" }),
      },
    },
  ],
});
