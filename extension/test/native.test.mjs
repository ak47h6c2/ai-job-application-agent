import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer, summarize } from "./helpers.mjs";

let browser, server, base;
before(async () => {
  ({ server, base } = await startServer());
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

test("native HTML form: basics, repeated sections, answers, files", async () => {
  const page = await openFixture(browser, base, "native.html");
  const report = await fill(page);
  if (process.env.DEBUG) console.log(summarize(report), report.notes);
  const value = (selector) => page.$eval(selector, (element) => element.value);
  const values = (selector) => page.$$eval(selector, (elements) => elements.map((element) => element.value));

  assert.equal(report.lang, "zh");
  assert.equal(await value("#xm"), "李明");
  assert.equal(await page.$eval("input[name=xb][value='1']", (element) => element.checked), true);
  assert.equal(await value("#csrq"), "2001-05-12");
  assert.equal(await value("#zzmm"), "03");
  assert.equal(await value("#mz"), "汉族");
  assert.equal(await value("#sj"), "13800138000");
  assert.equal(await value("#yx"), "liming@example.com");
  assert.equal(await value("#jg"), "广东省深圳市南山区");
  assert.equal(await value("#sfz"), "", "ID number is not filled unless enabled");
  assert.equal(await page.$eval("input[name=tj][value=Y]", (element) => element.checked), true);

  assert.deepEqual(await values(".edu .school"), ["北京大学", "浙江大学"]);
  assert.deepEqual(await values(".edu .degree"), ["ss", "bk"]);
  assert.deepEqual(await values(".edu .start"), ["2023-09", "2019-09"]);
  assert.deepEqual(await values(".edu .end"), ["2026-06", "2023-06"]);

  assert.deepEqual(await values(".work .company"), ["字节跳动", "腾讯"]);
  assert.deepEqual(await values(".work .start"), ["2025-06", "2024-07"]);
  assert.deepEqual(await values(".work .end"), ["", "2024-09"]);
  assert.deepEqual(await page.$$eval(".work .present", (elements) => elements.map((element) => element.checked)), [true, false]);
  assert.deepEqual(await values(".work .desc"), ["负责推荐系统接口开发。", "编写自动化测试。"]);

  assert.equal(await value(".fm-name"), "李强");
  assert.equal(await value(".fm-rel"), "父亲");
  assert.equal(await value(".fm-phone"), "13900000000");

  assert.equal(await value("#source"), "学校就业网");
  assert.equal(await value("#why"), "");
  assert.ok(report.items.some((item) => item.status === "question" && item.label.includes("为什么")));
  assert.equal(await page.$eval("#cv", (element) => element.files[0]?.name), "resume_zh.pdf");
  assert.equal(await page.$eval("#agree", (element) => element.checked), false, "never ticks agreements");
  assert.deepEqual(page.errors, []);
});

test("does not overwrite existing values unless asked", async () => {
  const page = await openFixture(browser, base, "native.html");
  await page.fill("#xm", "已有姓名");
  await fill(page);
  assert.equal(await page.$eval("#xm", (element) => element.value), "已有姓名");
  await fill(page, undefined, { overwrite: true });
  assert.equal(await page.$eval("#xm", (element) => element.value), "李明");
});

test("long text is cut at a sentence end; length limits are reported for AI drafting", async () => {
  const page = await openFixture(browser, base, "native.html");
  await page.evaluate(() => {
    const block = document.createElement("div");
    block.innerHTML = `
      <div class="form-item"><label>自我评价</label><textarea id="self" maxlength="24"></textarea></div>
      <div class="form-item"><label>请谈谈你的职业规划（不超过300字）</label><textarea id="plan"></textarea></div>`;
    document.querySelector("#why").closest(".form-item").after(block);
  });
  const profile = JSON.parse(JSON.stringify((await import("./helpers.mjs")).PROFILE));
  profile.basic.selfEvaluation = { zh: "热爱后端开发。有扎实的计算机基础，乐于学习新技术。" };
  const report = await fill(page, profile);
  assert.equal(await page.$eval("#self", (element) => element.value), "热爱后端开发。有扎实的计算机基础。");
  const plan = report.items.find((item) => item.label.includes("职业规划"));
  assert.equal(plan.status, "question");
  assert.equal(plan.maxLength, 300);
});

test("birth date and gender come from the ID number when not filled in", async () => {
  const page = await openFixture(browser, base, "native.html");
  const profile = JSON.parse(JSON.stringify((await import("./helpers.mjs")).PROFILE));
  delete profile.basic.birthDate;
  delete profile.basic.gender;
  profile.basic.idNumber = "110101200105120038";
  await fill(page, profile);
  assert.equal(await page.$eval("#csrq", (element) => element.value), "2001-05-12");
  assert.equal(await page.$eval("input[name=xb][value='1']", (element) => element.checked), true);
  assert.equal(await page.$eval("#sfz", (element) => element.value), "", "the ID itself stays private");
});
