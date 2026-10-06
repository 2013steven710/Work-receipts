import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "directory", include: ["test/**/*.test.ts"], fileParallelism: false },
});
