// Loads the built extension into Chromium against a real backend with a seeded profile.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { PROFILE, browserOptions, startServer } from "./helpers.mjs";

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
  backend = spawn(process.env.PYTHON ?? "python3", ["-c", `import uvicorn; uvicorn.run("backend.app.api:app", host="127.0.0.1", port=${API_PORT}, log_level="warning")`], {
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
    ...browserOptions(),
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
  if (process.env.UPDATE_SCREENSHOTS) await page.screenshot({ path: fileURLToPath(new URL("../../docs/assets/ui/extension-panel.png", import.meta.url)) });

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

test("extension: exports the form structure without any filled-in values", async () => {
  const page = await context.newPage();
  await page.goto(`${base}/test/fixtures/iframe-host.html`);
  await shadow(page, ".launcher").click({ timeout: 8000 });
  await shadow(page, "text=一键填写本页").click();
  await shadow(page, "text=再填一次").waitFor({ timeout: 60000 });
  const [download] = await Promise.all([page.waitForEvent("download"), shadow(page, "text=导出页面结构（用于适配新网站）").click()]);
  const exported = readFileSync(await download.path(), "utf8");
  const data = JSON.parse(exported);
  const controls = data.frames.flatMap((frame) => frame.controls);
  assert.ok(controls.some((control) => control.label === "学校名称" && control.recognizedAs === "education.school"));
  assert.ok(data.frames.some((frame) => frame.headings.some((heading) => heading.section === "education")));
  for (const secret of ["李明", "13800138000", "liming@example.com", "北京大学"]) assert.ok(!exported.includes(secret), `export leaks ${secret}`);
  await page.close();
});

test("extension: on a read-only resume page it offers to click 编辑, then fills the form", async () => {
  const page = await context.newPage();
  await page.goto(`${base}/test/fixtures/readonly-resume.html`);
  await shadow(page, ".launcher").click({ timeout: 8000 });
  await shadow(page, "text=一键填写本页").click();
  await shadow(page, "text=/展示模式/").waitFor({ timeout: 30000 });
  await shadow(page, "text=帮我点「编辑」并填写").click();
  await page.waitForFunction(() => document.querySelector("#name").value === "李明", null, { timeout: 60000 });
  await shadow(page, "text=再填一次").waitFor({ timeout: 60000 });
  assert.equal(await page.$eval("#phone", (element) => element.value), "13800138000");
  assert.equal(await page.$eval("#political", (element) => element.value), "共青团员");
  await page.close();
});

test("extension: AI drafts every open question on the page (fake OpenAI-compatible model)", async () => {
  const { createServer } = await import("node:http");
  const fake = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const question = JSON.parse(body).messages.at(-1).content.split("\n")[0].replace("Question: ", "");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: `草稿：${question}` } }] }));
    });
  });
  await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
  await fetch(`${API}/api/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "openai", base_url: `http://127.0.0.1:${fake.address().port}/v1`, model: "fake", api_key: "sk-test-12345678" }),
  });
  try {
    const page = await context.newPage();
    await page.goto(`${base}/test/fixtures/native.html`);
    await page.evaluate(() => {
      const item = document.createElement("div");
      item.className = "form-item";
      item.innerHTML = "<label>请描述你遇到的最大困难以及如何解决？</label><textarea id='hard'></textarea>";
      const second = document.createElement("div");
      second.className = "form-item";
      second.innerHTML = "<label>谈谈你对数字化转型的理解？</label><textarea id='digital'></textarea>";
      document.querySelector("#why").closest(".form-item").after(item, second);
    });
    await shadow(page, ".launcher").click({ timeout: 8000 });
    await shadow(page, "text=一键填写本页").click();
    await shadow(page, "text=再填一次").waitFor({ timeout: 60000 });
    await shadow(page, "text=AI 全部起草").click();
    await page.waitForFunction(() => document.querySelector("#hard").value && document.querySelector("#digital").value, null, { timeout: 30000 });
    assert.equal(await page.$eval("#hard", (element) => element.value), "草稿：请描述你遇到的最大困难以及如何解决？");
    assert.equal(await page.$eval("#digital", (element) => element.value), "草稿：谈谈你对数字化转型的理解？");
    await page.close();
  } finally {
    await fetch(`${API}/api/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openai", base_url: "", model: "", api_key: "" }) });
    fake.close();
  }
});

test("extension: clicking 提交 reads what was typed by hand and saves it into the profile", async () => {
  const page = await context.newPage();
  await page.goto(`${base}/test/fixtures/native.html`);
  await page.fill("#jg", "吉林省/白山市");
  await page.fill(".edu .school", "东北师范大学");
  await page.fill(".edu .major", "统计学");
  await page.locator("button[type=submit]").click();
  await shadow(page, "text=从本页读到的新资料").waitFor({ timeout: 10000 });
  const card = await shadow(page, ".capture").innerText();
  assert.match(card, /教育经历（新增） · 东北师范大学/);
  // 籍贯 differs from the stored one, so it is offered but not ticked.
  assert.match(card, /资料库里是：广东省\/深圳市\/南山区/);
  await shadow(page, "text=/存入资料库（\\d+ 项）/").click();
  await shadow(page, "text=/已存入资料库/").waitFor();
  const profile = (await (await fetch(`${API}/api/profile`)).json()).profile;
  const added = profile.sections.education.find((entry) => entry.school?.zh === "东北师范大学");
  assert.deepEqual(added.major, { zh: "统计学" });
  assert.equal(profile.basic.hometown.zh, "广东省/深圳市/南山区", "unticked conflicts are not saved");
  await page.close();
});

