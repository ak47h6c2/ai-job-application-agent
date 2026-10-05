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

test("Layui: plugin selects over hidden native selects, plugin radios, laydate", async () => {
  const page = await openFixture(browser, base, "layui.html");
  await page.waitForFunction(() => window.ready);
  const report = await fill(page);
  if (process.env.DEBUG) console.log(summarize(report), report.notes);
  const values = await page.evaluate(() => window.read());
  assert.equal(values.name, "李明");
  assert.equal(values.sex, "男");
  assert.equal(values.birth, "2001-05-12");
  assert.equal(values.political, "2");
  assert.equal(values.degree, "3");
  assert.equal(values.grad, "2026-06");
  assert.equal(values.phone, "13800138000");
  assert.equal(values.adjust, "1");
  // The visible layui widgets must reflect the choice, not only the hidden inputs.
  assert.equal(await page.$eval("input[name=sex][value='男'] + .layui-form-radio", (element) => element.classList.contains("layui-form-radioed")), true);
  assert.equal(await page.$$eval(".layui-select-title input", (inputs) => inputs.map((input) => input.value).join("|")), "共青团员|硕士研究生");
  assert.deepEqual(page.errors, []);
});
