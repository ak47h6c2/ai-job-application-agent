import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf" };

export const PROFILE = JSON.parse(await readFile(new URL("./profile.json", import.meta.url), "utf8"));

export async function startServer() {
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    try {
      const body = await readFile(join(ROOT, path));
      response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

const DEFAULT_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** Uses CHROMIUM_PATH or a preinstalled Chromium; otherwise Playwright's own full Chromium (needed for extensions). */
export function browserOptions() {
  const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(DEFAULT_CHROMIUM) ? DEFAULT_CHROMIUM : undefined);
  return executablePath ? { executablePath, headless: true } : { channel: "chromium", headless: true };
}

export async function launch() {
  return chromium.launch(browserOptions());
}

export async function openFixture(browser, base, name, { viewport = { width: 1280, height: 900 } } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/test/fixtures/${name}`);
  await page.waitForLoadState("networkidle");
  await page.addScriptTag({ path: join(ROOT, "test/.build/harness.js") });
  page.errors = errors;
  return page;
}

export async function fill(page, profile = PROFILE, options = {}) {
  return page.evaluate(([data, opts]) => window.JobAutofill.fill(data, opts), [profile, { files: { resume_zh: "PDF-ZH", resume_en: "PDF-EN", photo: "IMG" }, ...options }]);
}

export function summarize(report) {
  return report.items.map((item) => `${item.status.padEnd(9)} ${item.label} -> ${item.target ?? "-"} ${item.value ? `= ${item.value}` : ""} ${item.reason ?? ""}`).join("\n");
}
