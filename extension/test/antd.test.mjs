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

test("Ant Design: rc-select (virtual list + search), cascader, pickers, radio, Form.List", async () => {
  const page = await openFixture(browser, base, "antd.html");
  const report = await fill(page);
  if (process.env.DEBUG) console.log(summarize(report), report.notes, report.added);
  const values = await page.evaluate(() => window.__values);

  assert.equal(values.name, "李明");
  assert.equal(values.gender, "1");
  assert.equal(values.birth, "2001-05-12");
  assert.equal(values.nation, "汉族");
  assert.equal(values.political, "共青团员");
  assert.equal(values.phone, "13800138000");
  assert.deepEqual(values.hometown, ["gd", "sz", "ns"]);
  assert.equal(values.fresh, "Y");
  assert.equal(values.education.length, 2);
  assert.deepEqual(values.education.map((entry) => entry.school), ["北京大学", "浙江大学"]);
  assert.deepEqual(values.education.map((entry) => entry.degree), ["硕士研究生", "本科"]);
  assert.deepEqual(values.education.map((entry) => entry.range?.map((date) => date.slice(0, 7))), [["2023-09", "2026-06"], ["2019-09", "2023-06"]]);
  assert.equal(values.language, "英语");
  assert.equal(values.level, "CET-6");
  assert.deepEqual(page.errors, []);
});

test("Ant Design: a value far down a virtual list is found by scrolling", async () => {
  const page = await openFixture(browser, base, "antd.html");
  const report = await fill(page, { basic: { ethnicity: "基诺族", politicalStatus: "masses" } });
  if (process.env.DEBUG) console.log(summarize(report));
  const values = await page.evaluate(() => window.__values);
  assert.equal(values.nation, "基诺族");
  assert.equal(values.political, "群众");
});
