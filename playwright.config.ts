import { defineConfig, devices } from "@playwright/test";

// pnpm e2e:mobile — the full local stack in mobile emulation: local Supabase (pnpm test:db starts
// it, with Mailpit for sign-in codes), the API, the web app, and a stand-in for Google's and
// Microsoft's sign-in and storage (scripts/fake-cloud.mjs). WebKit (iPhone) runs in CI; set
// E2E_WEBKIT=1 to run it locally.

const WEB = "http://localhost:3000";
const FAKE = "http://localhost:54399";

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
      command: "node scripts/fake-cloud.mjs 54399",
      url: `${FAKE}/__state`,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @claimtidy/api build && node apps/api/dist/server.js",
      url: "http://127.0.0.1:8081/health",
      reuseExistingServer: false,
      env: {
        PORT: "8081",
        APP_ORIGIN: WEB,
        SUPABASE_URL: "http://127.0.0.1:54321",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        GOOGLE_CLIENT_ID: "fake-google",
        GOOGLE_CLIENT_SECRET: "fake-google-secret",
        GOOGLE_TOKEN_URL: `${FAKE}/google/token`,
        MICROSOFT_CLIENT_ID: "fake-microsoft",
        MICROSOFT_CLIENT_SECRET: "fake-microsoft-secret",
        MICROSOFT_TOKEN_URL: `${FAKE}/microsoft/token`,
        NODE_ENV: "test",
      },
    },
    {
      command: "pnpm --filter @claimtidy/web build && pnpm --filter @claimtidy/web start -p 3000",
      url: WEB,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        NEXT_PUBLIC_API_URL: "http://localhost:8081",
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "fake-google",
        NEXT_PUBLIC_GOOGLE_AUTH_URL: `${FAKE}/google/auth`,
        NEXT_PUBLIC_GOOGLE_API_BASE: `${FAKE}/google`,
        NEXT_PUBLIC_MICROSOFT_CLIENT_ID: "fake-microsoft",
        NEXT_PUBLIC_MICROSOFT_AUTH_URL: `${FAKE}/microsoft/auth`,
        NEXT_PUBLIC_MICROSOFT_API_BASE: `${FAKE}/graph`,
      },
    },
  ],
});
