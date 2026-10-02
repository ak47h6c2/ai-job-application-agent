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

test("Element UI: selects, remote search, cascader, date pickers, radio buttons, dialog entries", async () => {
  const page = await openFixture(browser, base, "element-ui.html");
  const report = await fill(page);
  if (process.env.DEBUG) console.log(summarize(report), report.notes, report.added);
  const form = await page.evaluate(() => JSON.parse(JSON.stringify(window.vm.form)));

  assert.equal(form.name, "李明");
  assert.equal(form.gender, "M");
  assert.equal(form.birth, "2001-05-12");
  assert.equal(form.political, "共青团员");
  assert.equal(form.nation, "汉族");
  assert.equal(form.phone, "13800138000");
  assert.equal(form.email, "liming@example.com");
  assert.deepEqual(form.hometown, ["gd", "sz", "ns"]);
  assert.deepEqual(form.city, ["bj", "bjs", "hd"]);
  assert.equal(form.adjust, "是");
  assert.equal(form.salary, "15k-20k");

  assert.equal(form.education.length, 2);
  assert.deepEqual(form.education.map((edu) => edu.school), ["北京大学", "浙江大学"]);
  assert.deepEqual(form.education.map((edu) => edu.degree), ["硕士研究生", "本科"]);
  assert.deepEqual(form.education.map((edu) => edu.range), [["2023-09", "2026-06"], ["2019-09", "2023-06"]]);
  assert.deepEqual(form.education.map((edu) => edu.mode), ["全日制", "全日制"]);

  assert.equal(form.work.length, 2);
  assert.deepEqual(form.work.map((work) => work.company), ["字节跳动", "腾讯"]);
  assert.deepEqual(form.work.map((work) => work.start), ["2025-06", "2024-07"]);
  assert.equal(form.work[0].present, true);
  assert.equal(form.work[1].end, "2024-09");
  assert.equal(form.work[1].desc, "编写自动化测试。");

  assert.equal(form.awards[0].name, "国家奖学金");
  assert.equal(form.awards[0].date, "2022-10");
  assert.deepEqual(page.errors, []);
});
