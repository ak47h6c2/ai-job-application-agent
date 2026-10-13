import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserOptions, startServer } from "./helpers.mjs";

// A copy of the built extension, so bumping its version does not touch dist/ used by the other tests.
const EXTENSION = mkdtempSync(join(tmpdir(), "jaf-update-"));
let context, server, base;

// fs.cpSync fails on Windows with Node 24 for non-ASCII paths (see build.mjs).
function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyDir(join(from, entry.name), join(to, entry.name));
    else copyFileSync(join(from, entry.name), join(to, entry.name));
  }
}

before(async () => {
  copyDir(fileURLToPath(new URL("../dist", import.meta.url)), EXTENSION);
  ({ server, base } = await startServer());
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "jaf-update-profile-")), {
    ...browserOptions(),
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, "--headless=new"],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  // Like a real unpacked install: loaded with developer mode on.
  const extensions = await context.newPage();
  await extensions.goto("chrome://extensions/");
  await extensions.evaluate(() => new Promise((resolve) => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, resolve)));
  await extensions.close();
});

after(async () => {
  await context?.close();
  server?.close();
  rmSync(EXTENSION, { recursive: true, force: true });
});

const shadow = (page, selector) => page.locator(`[data-jaf-ui] >> ${selector}`);
const version = (manifest) => JSON.parse(manifest).version;

test("extension: a rebuilt unpacked extension reloads itself and replaces the script in an open page", { timeout: 60000 }, async () => {
  const page = await context.newPage();
  await page.goto(`${base}/test/fixtures/native.html`);
  await shadow(page, ".launcher").click({ timeout: 8000 });
  const running = version(readFileSync(join(EXTENSION, "manifest.json"), "utf8"));
  await shadow(page, ".panel .version").waitFor({ timeout: 8000 });
  assert.equal(await shadow(page, ".panel .version").textContent(), `v${running}`);

  // A new build lands in the folder while the page stays open.
  const next = running.replace(/\d+$/, (patch) => String(Number(patch) + 1));
  const path = join(EXTENSION, "manifest.json");
  writeFileSync(path, readFileSync(path, "utf8").replace(`"version": "${running}"`, `"version": "${next}"`));
  await shadow(page, ".close").click();
  await shadow(page, ".launcher").click();

  // Without reloading the page, the new copy takes over: one launcher, and its panel shows the new version.
  await page.waitForFunction((expected) => {
    const hosts = document.querySelectorAll("[data-jaf-ui]");
    return hosts.length === 1 && !hosts[0].shadowRoot?.querySelector(".panel") && hosts[0].shadowRoot?.querySelector(".launcher") && expected;
  }, next, { timeout: 15000 });
  await shadow(page, ".launcher").click();
  await shadow(page, ".panel .version").waitFor({ timeout: 8000 });
  assert.equal(await shadow(page, ".panel .version").textContent(), `v${next}`);
  assert.equal(await page.locator("[data-jaf-ui]").count(), 1);
  await page.close();
});
