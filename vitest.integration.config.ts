import { defineConfig } from "vitest/config";

// pnpm test:api — integration tests that need local Supabase running (pnpm test:db starts it).
export default defineConfig({
  test: {
    projects: ["apps/directory", { extends: "apps/api/vitest.config.ts", test: { name: "api-integration", include: ["apps/api/test/**/*.integration.test.ts"] } }],
    // Every suite listens on the same port for the Auth hooks, so files run one at a time.
    fileParallelism: false,
  },
});
