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
  const transcript = new FormData();
  transcript.append("kind", "transcript");
  transcript.append("file", new Blob(["%PDF-1.4 transcript"], { type: "application/pdf" }), "测试成绩单.pdf");
  await fetch(`${API}/api/attachments`, { method: "POST", body: transcript });

  ({ server, base } = await startServer());
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "jaf-profile-")), {
    ...browserOptions(),
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, "--headless=new"],
    viewport: { width: 1280, height: 900 },
  });
  // Under load the first worker listed can be one without chrome.storage yet (or not this extension's): wait for ours.
  const hasStorage = (candidate) => candidate.evaluate(() => Boolean(globalThis.chrome?.storage?.local)).catch(() => false);
  let worker;
  for (let tries = 0; tries < 50 && !worker; tries += 1) {
    for (const candidate of context.serviceWorkers()) if (!worker && (await hasStorage(candidate))) worker = candidate;
    if (!worker) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(worker, "the extension's service worker did not start");
  await worker.evaluate((apiBase) => chrome.storage.local.set({ settings: { apiBase } }), API);
});

after(async () => {
  await context?.close();
  server?.close();
  backend?.kill();
});

const shadow = (page, selector) => page.locator(`[data-jaf-ui] >> ${selector}`);

async function fakeDraftServer(respond) {
  const { createServer } = await import("node:http");
  const fake = createServer((request, response) => {
    let body = "";
    request.on("data", chunk => body += chunk);
    request.on("end", () => respond(JSON.parse(body), answer => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: answer } }] }));
    }));
  });
  await new Promise(resolve => fake.listen(0, "127.0.0.1", resolve));
  await fetch(`${API}/api/settings`, { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "openai", base_url: `http://127.0.0.1:${fake.address().port}/v1`, model: "fake", api_key: "sk-test-12345678" }) });
  return async () => {
    await fetch(`${API}/api/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ base_url: "", model: "", api_key: "" }) });
    fake.close();
  };
}

async function skillDraftPage() {
  const page = await context.newPage();
  await page.goto(`${base}/test/fixtures/native.html`);
  await shadow(page, ".launcher").waitFor({ timeout: 8000 });
  await page.evaluate(() => {
    document.body.innerHTML = `<h3>技能/爱好</h3><form>
      <div class="el-form-item"><label>计算机技能</label><input id="computer" maxlength="30" placeholder="请填写计算机技能"></div>
      <div class="el-form-item"><label>其他技能</label><textarea id="other" maxlength="1000" placeholder="请填写其他技能"></textarea></div>
      <div class="el-form-item"><label>成绩单</label><input id="scan-transcript" type="file"></div>
    </form>`;
  });
  await shadow(page, ".launcher").click();
  await shadow(page, "text=识别栏位 / AI 起草").click();
  await shadow(page, "text=AI 全部起草（2）").waitFor({ timeout: 20000 });
  assert.equal(await page.$eval("#scan-transcript", input => input.files.length), 0, "reading fields must not attach a transcript");
  return page;
}

test("extension: AI draft-all survives stripped markers and form remounts and updates the panel", async () => {
  let callCount = 0;
  const stop = await fakeDraftServer((body, respond) => {
    callCount++;
    const prompt = body.messages.at(-1).content;
    assert.ok(!prompt.includes("13800138000"), "private contact is not sent to AI");
    respond(prompt.startsWith("Question: 计算机技能") ? "Python、SQL、Git、Linux" : "系统验证、测试用例编写、硬件调试");
  });
  const page = await skillDraftPage();
  try {
    await page.evaluate(() => {
      document.querySelector("#computer").removeAttribute("data-jaf-id");
      document.querySelector("#other").outerHTML = '<textarea id="other" maxlength="1000" placeholder="请填写其他技能"></textarea>';
      document.querySelector("#computer").addEventListener("input", () => {
        const other = document.querySelector("#other");
        other.outerHTML = '<textarea id="other" maxlength="1000" placeholder="请填写其他技能"></textarea>';
      });
    });
    await shadow(page, "text=AI 全部起草（2）").click();
    await shadow(page, ".message").filter({ hasText: "已将「其他技能」草稿填入网页" }).waitFor({ timeout: 30000 });
    assert.equal(await page.locator("#computer").inputValue(), "Python、SQL、Git、Linux");
    assert.equal(await page.locator("#other").inputValue(), "系统验证、测试用例编写、硬件调试");
    assert.match(await shadow(page, ".chips").innerText(), /需检查 2\s+未填 0/);
    assert.equal(await shadow(page, "button").filter({ hasText: /^AI 起草$/ }).count(), 0);
    assert.equal(callCount, 2);
  } finally { await page.close(); await stop(); }
});

test("extension: AI drafts preserve manual edits, retain undelivered text and report empty replies", { timeout: 60000 }, async () => {
  let reply, requested;
  let ready = new Promise(resolve => requested = resolve);
  const stop = await fakeDraftServer((_body, respond) => { reply = respond; requested(); });
  const page = await skillDraftPage();
  try {
    await shadow(page, "button").filter({ hasText: /^AI 起草$/ }).first().click();
    await ready;
    await page.fill("#computer", "我手动填写的技能");
    reply("Python、SQL");
    await shadow(page, ".message").filter({ hasText: "已保留你的内容" }).waitFor({ timeout: 20000 });
    assert.equal(await page.locator("#computer").inputValue(), "我手动填写的技能");
    assert.equal(await shadow(page, "textarea[aria-label='计算机技能 AI 草稿']").inputValue(), "Python、SQL");
    ready = new Promise(resolve => requested = resolve);
    await shadow(page, "button").filter({ hasText: /^AI 起草$/ }).last().click();
    await ready;
    await page.evaluate(() => {
      const old = document.querySelector("#other");
      const row = old.closest(".el-form-item");
      const markup = '<div class="el-form-item"><label>其他技能</label><textarea id="other" maxlength="1000" placeholder="请填写其他技能"></textarea></div>';
      row.outerHTML = markup + markup;
    });
    reply("硬件调试");
    await shadow(page, ".message").filter({ hasText: "找不到唯一对应" }).waitFor({ timeout: 20000 });
    assert.deepEqual(await page.locator("textarea#other").evaluateAll(inputs => inputs.map(input => input.value)), ["", ""]);
    assert.equal(await shadow(page, "textarea[aria-label='其他技能 AI 草稿']").inputValue(), "硬件调试");
    ready = new Promise(resolve => requested = resolve);
    await shadow(page, "button").filter({ hasText: /^AI 起草$/ }).first().click();
    await ready;
    reply("  ");
    await shadow(page, ".message").filter({ hasText: "AI 返回了空内容" }).waitFor({ timeout: 20000 });
    assert.equal(await page.locator("#computer").inputValue(), "我手动填写的技能");
    await page.screenshot({ path: fileURLToPath(new URL("../../output/zhaopin-qa/ai-draft-guard-test.png", import.meta.url)) });
  } finally { await page.close(); await stop(); }
});

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
  const uploaded = await frame.$eval("#cv", async (element) => ({ size: element.files[0].size, text: await element.files[0].text() }));
  const storedAttachments = (await (await fetch(`${API}/api/attachments`)).json()).attachments;
  const storedResume = storedAttachments.find((file) => file.kind === "resume_zh");
  const storedText = await (await fetch(`${API}/api/attachments/${storedResume.id}/file`)).text();
  assert.deepEqual(uploaded, { size: 13, text: "%PDF-1.4 fake" }, `backend resume: ${JSON.stringify({ size: storedResume.size, text: storedText })}`);

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
  // The list of profile fields is built when the dropdown gets focus.
  await row.locator("select").focus();
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
  assert.match(card, /教育经历 · 新增经历\s+东北师范大学/);
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

test("extension: filling again immediately uses profile changes made while the panel was open", async () => {
  const original = (await (await fetch(`${API}/api/profile`)).json()).profile;
  const page = await context.newPage();
  try {
    await page.goto(`${base}/test/fixtures/native.html`);
    await shadow(page, ".launcher").click();
    await shadow(page, "text=一键填写本页").click();
    await shadow(page, "text=再填一次").waitFor({ timeout: 60000 });
    const changed = { ...original, basic: { ...original.basic, phone: { zh: "13900000009", en: "13900000009" } } };
    await fetch(`${API}/api/profile`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: changed }) });
    await page.fill("#sj", "");
    await shadow(page, "text=再填一次").click();
    await shadow(page, "text=再填一次").waitFor({ timeout: 60000 });
    assert.equal(await page.$eval("#sj", element => element.value), "13900000009");
  } finally {
    await fetch(`${API}/api/profile`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: original }) });
    await page.close();
  }
});

test("extension: a disconnected save shows offline, retains selected changes and succeeds after reconnecting", async () => {
  const page = await context.newPage();
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const probe = (await import("node:http")).createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const unavailableApi = `http://127.0.0.1:${probe.address().port}`;
  await new Promise(resolve => probe.close(resolve));
  try {
    await page.goto(`${base}/test/fixtures/native.html`);
    await shadow(page, ".launcher").waitFor({ timeout: 8000 });
    await page.evaluate(() => {
      document.body.innerHTML = '<h3>基本信息</h3><div class="form-item"><label for="network-email">邮箱</label><input id="network-email" value="reconnected@example.com"></div>';
    });
    await shadow(page, ".launcher").click({ timeout: 8000 });
    await shadow(page, ".profile-line .dot.on").waitFor();
    assert.equal(await shadow(page, ".profile-line .dot.on").count(), 1);
    await shadow(page, "text=把本页填好的内容存入资料库").click();
    await shadow(page, ".capture-row input").check();
    await worker.evaluate(apiBase => chrome.storage.local.set({ settings: { apiBase } }), unavailableApi);
    await shadow(page, "text=存入资料库（1 项）").click();
    await shadow(page, "text=/无法连接本地后台.*start-webui\\.bat/").waitFor();
    assert.equal(await shadow(page, ".profile-line .dot.on").count(), 0);
    assert.match(await shadow(page, ".profile-line").innerText(), /离线/);
    assert.equal(await shadow(page, ".capture-row input").isChecked(), true);
    assert.equal(await shadow(page, ".capture-row").count(), 1);
    await worker.evaluate(apiBase => chrome.storage.local.set({ settings: { apiBase } }), API);
    await shadow(page, "text=存入资料库（1 项）").click();
    await shadow(page, "text=/已存入资料库 1 项/").waitFor();
    assert.equal(await shadow(page, ".capture-row").count(), 0);
    assert.equal(await shadow(page, ".profile-line .dot.on").count(), 1);
    const saved = (await (await fetch(`${API}/api/profile`)).json()).profile;
    assert.equal(saved.basic.email, "reconnected@example.com");
  } finally {
    await worker.evaluate(apiBase => chrome.storage.local.set({ settings: { apiBase } }), API);
    await page.close();
  }
});

