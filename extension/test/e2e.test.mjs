// Loads the built extension into Chromium against a real backend with a seeded profile.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { PROFILE, startServer } from "./helpers.mjs";

const EXTENSION = fileURLToPath(new URL("../dist", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const API_PORT = 8765;
const API = `http://127.0.0.1:${API_PORT}`;
let backend, context, server, base;

async function waitHealthy() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${API}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("backend did not start");
}

before(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "jaf-e2e-"));
  backend = spawn("python3", ["-c", `import uvicorn; uvicorn.run("backend.app.api:app", host="127.0.0.1", port=${API_PORT}, log_level="warning")`], {
    cwd: REPO,
    env: { ...process.env, JOB_AGENT_DATA_DIR: dataDir },
    stdio: "inherit",
  });
  await waitHealthy();
  await fetch(`${API}/api/profile`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: PROFILE }) });
  const form = new FormData();
  form.append("kind", "resume_zh");
  form.append("file", new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }), "李明-简历.pdf");
  await fetch(`${API}/api/attachments`, { method: "POST", body: form });

  ({ server, base } = await startServer());
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "jaf-profile-")), {
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, "--headless=new"],
    viewport: { width: 1280, height: 900 },
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  await worker.evaluate((apiBase) => chrome.storage.local.set({ settings: { apiBase } }), API);
});

after(async () => {
  await context?.close();
  server?.close();
  backend?.kill();
});

const shadow = (page, selector) => page.locator(`[data-jaf-ui] >> ${selector}`);

test("extension: launcher -> panel -> fill (Element UI page), review list, record application", async () => {
  const page = await context.newPage();
  await page.goto(`${base}/test/fixtures/element-ui.html`);
  await shadow(page, ".launcher").click({ timeout: 8000 });
  await shadow(page, "text=一键填写本页").click();
  await shadow(page, "text=再填一次").waitFor({ timeout: 60000 });
  const form = await page.evaluate(() => JSON.parse(JSON.stringify(window.vm.form)));
  assert.equal(form.name, "李明");
  assert.deepEqual(form.hometown, ["gd", "sz", "ns"]);
  assert.equal(form.education.length, 2);
  assert.equal(form.work.length, 2);
  const chips = await shadow(page, ".chips").innerText();
  assert.match(chips, /已填 \d+/);
  await page.screenshot({ path: fileURLToPath(new URL("../../docs/assets/ui/extension-panel.png", import.meta.url)) });

  // Simulate submitting the application, then record it from the panel.
  await shadow(page, "text=记录这次投递").click();
  await shadow(page, "text=记录投递").click();
  await shadow(page, "text=已记入投递记录").waitFor();
  const records = (await (await fetch(`${API}/api/applications`)).json()).records;
  assert.equal(records.length, 1);
  assert.equal(records[0].source, "extension");
  assert.equal(records[0].status, "applied");
  await page.close();
});

test("extension: fills a form inside an iframe, uploads the stored resume, learns typed answers", async () => {
  const page = await context.newPage();
  await page.goto(`${base}/test/fixtures/iframe-host.html`);
  await shadow(page, ".launcher").click({ timeout: 8000 });
  await shadow(page, "text=一键填写本页").click();
  await shadow(page, "text=再填一次").waitFor({ timeout: 60000 });
  const frame = page.frames().find((candidate) => candidate.url().endsWith("native.html"));
  assert.equal(await frame.$eval("#xm", (element) => element.value), "李明");
  assert.deepEqual(await frame.$$eval(".edu .school", (elements) => elements.map((element) => element.value)), ["北京大学", "浙江大学"]);
  assert.equal(await frame.$eval("#cv", (element) => element.files[0]?.name), "李明-简历.pdf");
  assert.equal(await frame.$eval("#cv", async (element) => (await element.files[0].text())), "%PDF-1.4 fake");

  // The open question is listed; the user answers it by hand and the panel offers to remember it.
  assert.ok(await shadow(page, "text=您为什么选择我们公司？").count());
  await frame.fill("#why", "认同公司的技术氛围。");
  await frame.$eval("#why", (element) => element.blur());
  await shadow(page, "text=/记住我填的 1 条答案/").click();
  await shadow(page, "text=/已保存 1 条答案/").waitFor();
  const answers = (await (await fetch(`${API}/api/profile`)).json()).profile.answers;
  assert.ok(answers.some((answer) => answer.question === "您为什么选择我们公司？" && answer.answer === "认同公司的技术氛围。"));
  await page.close();
});

test("extension: manual mapping of an unrecognized field is remembered for the site", async () => {
  const page = await context.newPage();
  await page.goto(`${base}/test/fixtures/native.html`);
  await page.evaluate(() => {
    const item = document.createElement("div");
    item.className = "form-item";
    item.innerHTML = '<label>内推码</label><input id="odd">';
    document.querySelector("h3").before(item);
  });
  await shadow(page, ".launcher").click({ timeout: 8000 });
  await shadow(page, "text=一键填写本页").click();
  await shadow(page, "text=再填一次").waitFor({ timeout: 60000 });
  const row = shadow(page, ".row:has-text('内推码')");
  await row.locator("select").selectOption("basic.email");
  await page.waitForFunction(() => document.querySelector("#odd").value === "liming@example.com");
  // A second visit fills it automatically.
  await page.reload();
  await page.evaluate(() => {
    const item = document.createElement("div");
    item.className = "form-item";
    item.innerHTML = '<label>内推码</label><input id="odd">';
    document.querySelector("h3").before(item);
  });
  await shadow(page, ".launcher").click({ timeout: 8000 });
  await shadow(page, "text=一键填写本页").click();
  await shadow(page, "text=再填一次").waitFor({ timeout: 60000 });
  assert.equal(await page.$eval("#odd", (element) => element.value), "liming@example.com");
  await page.close();
});
