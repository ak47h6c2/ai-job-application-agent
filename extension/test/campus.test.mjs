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

test("campus resume (bank style): new fields, publications, multi-select, checkbox group, 其他 fallback, number input", async () => {
  const page = await openFixture(browser, base, "campus.html");
  const report = await fill(page);
  if (process.env.DEBUG) console.log(summarize(report), report.notes, report.added);
  const f = await page.evaluate(() => JSON.parse(JSON.stringify(window.vm.f)));

  assert.equal(f.religion, "无");
  assert.equal(f.computer, "全国计算机等级考试二级");
  assert.equal(f.relatives, "否");
  assert.equal(f.criminal, "0");
  assert.deepEqual(f.work.map((work) => work.company), ["字节跳动", "腾讯"]);
  assert.equal(f.paper.title, "基于大模型的网申表单识别");
  assert.equal(f.paper.venue, "计算机学报");
  assert.equal(f.paper.rank, "第一作者");
  assert.equal(f.paper.date, "2025-08");
  assert.equal(f.cert, "全国计算机等级考试二级");
  assert.equal(f.school, "其他");
  assert.ok(report.items.some((item) => item.reason === "chose-other"));
  assert.equal(f.org, "深圳分行");
  assert.deepEqual(f.jobs, ["后端开发", "数据分析"]);
  assert.deepEqual(f.cities, ["北京", "深圳"]);
  assert.equal(await page.$eval("#salary", (element) => element.value), "15000");
  assert.deepEqual(page.errors, []);
});
