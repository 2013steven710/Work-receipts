import { defineConfig } from "vitest/config";

// pnpm test:api — integration tests that need local Supabase running (pnpm test:db starts it).
export default defineConfig({
  test: {
    projects: ["apps/directory"],
  },
});
