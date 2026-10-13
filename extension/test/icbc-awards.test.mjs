import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer, summarize } from "./helpers.mjs";

let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });

const profile = {
  basic: { name: { zh: "测试姓名" } },
  sections: { awards: [
    { name: { zh: "测试竞赛省级一等奖" }, level: { zh: "省级" }, date: "2021-12" },
    { name: { zh: "测试创新项目立项" }, level: { zh: "校级" } },
  ] },
  answers: [],
};

test("ICBC empty optional section: the highlighted menu item lets Add create one block per profile award", async () => {
  const page = await openFixture(browser, base, "icbc-awards.html");
  const report = await fill(page, profile);
  const awards = await page.evaluate(() => window.awards);
  assert.deepEqual(awards, [{ name: "测试竞赛省级一等奖", date: "2021-12", level: "省级" }, { name: "测试创新项目立项", level: "校级" }], summarize(report) + JSON.stringify(report.notes));
  await page.close();
});
