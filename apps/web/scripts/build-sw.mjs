// Bundles sw/sw.ts (and the shared queue/sync code) into public/sw.js.
import { build } from "esbuild";

await build({
  entryPoints: ["sw/sw.ts"],
  outfile: "public/sw.js",
  bundle: true,
  format: "iife",
  target: ["es2022", "safari16"],
  minify: process.env.NODE_ENV === "production",
  legalComments: "none",
});
