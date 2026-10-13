import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer, summarize } from "./helpers.mjs";

let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });

const profile = {
  basic: { name: { zh: "测试姓名" }, birthDate: "2000-04-12", politicalJoinDate: "2016-05", graduationDate: "2027-06" },
  sections: {}, answers: [],
};

test("ICBC-style Ant Design 3 pickers: day, month and a 'YYYY年' year picker get the profile dates", async () => {
  const page = await openFixture(browser, base, "icbc-antd3.html");
  const report = await fill(page, profile);
  const values = await page.evaluate(() => window.formValues());
  assert.deepEqual(values, { name: "测试姓名", birth: "2000-04-12", joined: "2016-05", graduation: "2027" }, summarize(report));
  assert.deepEqual(await page.locator(".ant-calendar-picker-input").evaluateAll(inputs => inputs.map(input => input.value)), ["2000-04-12", "2016-05", "2027年"]);
  assert.ok(!report.items.some(item => item.status === "failed"), summarize(report));
  // Every popup is closed again.
  assert.equal(await page.locator(".ant-calendar-picker-container").evaluateAll(popups => popups.filter(popup => getComputedStyle(popup).display !== "none" && popup.offsetParent !== null).length), 0);
  await page.close();
});

test("filling still completes while the tab is in the background (document.hidden)", async () => {
  const page = await openFixture(browser, base, "icbc-antd3.html");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  });
  const started = Date.now();
  const report = await fill(page, profile);
  assert.deepEqual(await page.evaluate(() => window.formValues()), { name: "测试姓名", birth: "2000-04-12", joined: "2016-05", graduation: "2027" }, summarize(report));
  assert.ok(Date.now() - started < 20000);
  await page.close();
});
