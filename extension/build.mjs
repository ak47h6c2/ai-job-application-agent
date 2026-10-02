import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
const testOnly = process.argv.includes("--test");

const common = { bundle: true, format: "iife", target: "chrome110", logLevel: "info", legalComments: "none" };

if (testOnly) {
  await build({ ...common, entryPoints: ["src/testing/harness.ts"], outfile: "test/.build/harness.js", sourcemap: "inline" });
  process.exit(0);
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("static", "dist", { recursive: true });

const options = {
  ...common,
  entryPoints: { content: "src/content/index.ts", background: "src/background.ts", popup: "src/popup/popup.ts" },
  outdir: "dist",
  minify: !watch,
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching…");
} else {
  await build(options);
}
