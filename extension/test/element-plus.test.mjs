import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE, fill, launch, openFixture, startServer, summarize } from "./helpers.mjs";

let browser, server, base;
before(async () => {
  ({ server, base } = await startServer());
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

test("Element Plus: filterable select with long list, cascader without suffixes, month pickers", async () => {
  const page = await openFixture(browser, base, "element-plus.html");
  const profile = structuredClone(PROFILE);
  profile.basic.hukou = { zh: "广东省/深圳市/南山区" };
  const report = await fill(page, profile);
  if (process.env.DEBUG) console.log(summarize(report), report.notes, report.added);
  const form = await page.evaluate(() => JSON.parse(JSON.stringify(window.vm.form)));

  assert.equal(form.name, "李明");
  assert.equal(form.gender, "男");
  assert.equal(form.birth, "2001-05");
  assert.equal(form.highest, "硕士");
  assert.equal(form.political, "共青团员");
  assert.deepEqual(form.hukou, ["gd", "sz", "ns"]);
  assert.equal(form.phone, "13800138000");
  assert.equal(form.email, "liming@example.com");
  assert.equal(form.self, "热爱后端开发，有扎实的计算机基础。");
  assert.deepEqual(form.education.map((entry) => entry.school), ["北京大学", "浙江大学"]);
  assert.deepEqual(form.education.map((entry) => entry.degree), ["硕士", "本科"]);
  assert.deepEqual(form.education.map((entry) => entry.range), [["2023-09", "2026-06"], ["2019-09", "2023-06"]]);
  assert.equal(form.projects[0].name, "智能求职助手");
  assert.equal(form.projects[0].start, "2025-01");
  assert.equal(form.projects[0].end, "2025-05");
  assert.deepEqual(page.errors, []);
});
