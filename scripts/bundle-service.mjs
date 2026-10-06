// Bundles a Node service (run from its package directory) into dist/server.js. Workspace packages
// (@claimtidy/*) are inlined because they ship TypeScript source; npm dependencies stay external
// and are installed in the container image.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// esbuild is resolved from the service's own dependencies, so filtered installs work.
const { build } = createRequire(resolve("package.json"))("esbuild");

const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith("@claimtidy/"));

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
});
