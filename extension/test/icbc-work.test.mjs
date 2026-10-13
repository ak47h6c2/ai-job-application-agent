import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer, summarize } from "./helpers.mjs";

let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });

const long = "负责测试平台前端页面开发与联调，完成表单、权限菜单和数据可视化页面。".repeat(8);
const profile = {
  basic: { name: { zh: "测试姓名" } },
  sections: { work: [
    { company: { zh: "测试电子有限公司" }, title: { zh: "硬件工程师" }, type: "internship", startDate: "2023-03", endDate: "2023-06", description: { zh: "负责样机调试。" } },
    { company: { zh: "测试研发中心" }, title: { zh: "回路工程师" }, type: "internship", startDate: "2023-09", endDate: "2024-03", description: { zh: "负责系统验证。" } },
    { company: { zh: "测试智能科技有限公司" }, title: { zh: "开发工程师" }, type: "internship", startDate: "2025-12", endDate: "2026-02", description: { zh: long } },
  ] },
  answers: [],
};

test("ICBC work: each block keeps one record, Add creates the rest, long results respect the counter", async () => {
  const page = await openFixture(browser, base, "icbc-work.html");
  const report = await fill(page, profile);
  const jobs = await page.evaluate(() => window.jobs);
  const info = summarize(report);
  assert.equal(jobs.length, 3, info);
  assert.deepEqual(jobs.map(job => [job.start, job.end, job.company, job.title, job.form]), [
    ["2023-03", "2023-06", "测试电子有限公司", "硬件工程师", "实习"],
    ["2023-09", "2024-03", "测试研发中心", "回路工程师", "实习"],
    ["2025-12", "2026-02", "测试智能科技有限公司", "开发工程师", "实习"],
  ], info);
  assert.ok(jobs.every(job => !job.level && !job.kind), info);
  assert.ok(jobs[2].result.length <= 200 && jobs[2].result.length > 100, info);
  await page.close();
});

test("an empty section on a page declaring lang=en but showing Chinese fills in Chinese", async () => {
  const page = await openFixture(browser, base, "icbc-work.html");
  await page.evaluate(() => { document.documentElement.lang = "en"; document.querySelector(".block").remove(); });
  const report = await fill(page, profile);
  assert.equal(report.lang, "zh");
  assert.ok(!report.items.some(item => item.reason === "other-language"), summarize(report));
  await page.close();
});
