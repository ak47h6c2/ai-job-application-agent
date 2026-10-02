import { build, context } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const watch = process.argv.includes("--watch");
const testOnly = process.argv.includes("--test");

// fs.cpSync crashes on Windows with Node 24 when the path contains non-ASCII characters
// (e.g. a project folder named in Chinese), so copy files one by one.
function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else copyFileSync(source, target);
  }
}

const common = { bundle: true, format: "iife", target: "chrome110", logLevel: "info", legalComments: "none" };

if (testOnly) {
  await build({ ...common, entryPoints: ["src/testing/harness.ts"], outfile: "test/.build/harness.js", sourcemap: "inline" });
  process.exit(0);
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
copyDir("static", "dist");

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
  if (!existsSync("dist/manifest.json")) throw new Error("dist/manifest.json was not written");
  console.log(`Extension built: ${resolve("dist")}`);
  console.log("Load it via chrome://extensions -> Developer mode -> Load unpacked.");
}
