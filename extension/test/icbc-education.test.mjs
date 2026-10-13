import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer, summarize } from "./helpers.mjs";

let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });

const profile = {
  basic: { name: { zh: "测试姓名" }, highestDegree: "master" },
  sections: {
    education: [
      { school: { zh: "测试科技大学" }, major: { zh: "智能科学与技术" }, degree: "master", startDate: "2025-06", endDate: "2027-06", college: { zh: "测试计算机学院" }, location: { zh: "测试城" }, studyMode: "full_time", degreeCategory: { zh: "工学" } },
      { school: { zh: "测试工业大学" }, major: { zh: "电子信息工程" }, degree: "bachelor", startDate: "2019-09", endDate: "2023-06", college: { zh: "测试电子学院" }, studyMode: "full_time" },
    ],
  },
  answers: [],
};

test("ICBC education blocks: each block gets its own record, 学位 subtypes are left to the user, 高中 stays empty", async () => {
  const page = await openFixture(browser, base, "icbc-education.html");
  const planned = await page.evaluate(p => window.JobAutofill.plan(p), profile);
  const sections = new Set(planned.filter(i => i.target?.startsWith("education.")).map(i => i.section));
  assert.deepEqual([...sections], ["education"], "the active 教育经历（待完善） menu item gives the section");
  const report = await fill(page, profile);
  const values = await page.evaluate(() => window.formValues());
  const info = summarize(report);
  // 学位类型 is resolved from the entry's 学科门类 (工学 -> 工学硕士); the bachelor has no 学科门类, so it stays open.
  assert.deepEqual(values.highest, { mode: "全日制普通硕士学位研究生（包括全日制学硕、全日制专硕）", degreeType: "工学硕士", start: "2025-06-01", end: "2027-06-01", location: "测试城", college: "测试计算机学院", category: "工学", direction: "智能科学与技术" }, info);
  assert.deepEqual(values.other, { mode: "普通全日制本科", degree: "学士", start: "2019-09-01", end: "2023-06-01", school: "测试工业大学", college: "测试电子学院", direction: "电子信息工程" }, info);
  assert.equal(values.high, undefined, info);
  const degree = report.items.find(item => item.label === "学位" && item.status !== "filled");
  assert.equal(degree?.reason, "ambiguous-option", info);
  assert.ok(!report.items.some(item => item.label === "主修专业" && /subject/.test(item.target ?? "")), info);
  await page.close();
});

test("ICBC education with the remaining facts in the profile fills every block that has a record", async () => {
  const page = await openFixture(browser, base, "icbc-education.html");
  const [master, bachelor] = profile.sections.education;
  const complete = { ...profile, sections: { education: [
    { ...master, major: { zh: "信息技术（AI方向）" }, catalogMajor: { zh: "计算机科学与技术" }, degreeName: { zh: "电子信息硕士" }, degreeKind: { zh: "专业硕士" }, majorClass: { zh: "计算机类" }, mainExperience: "yes", studentLeader: "no" },
    { ...bachelor, degreeCategory: { zh: "工学" }, majorClass: { zh: "电子信息类" }, mainExperience: "yes", studentLeader: "no", minorType: "none", upgraded: "no" },
  ] } };
  const report = await fill(page, complete);
  const values = await page.evaluate(() => window.formValues());
  const info = summarize(report);
  assert.equal(values.highest.degree, "专业硕士", info);
  assert.equal(values.highest.subject, "计算机类", info);
  // The overseas major is not in the list; its stated equivalents are.
  assert.deepEqual([values.highest.direction, values.highest.degreeType], ["计算机科学与技术", "电子信息硕士"], info);
  assert.deepEqual([values.highest.main, values.highest.leader], ["是", "否"], info);
  assert.deepEqual([values.other.degreeType, values.other.category, values.other.subject], ["工学学士", "工学", "电子信息类"], info);
  assert.deepEqual([values.other.main, values.other.double, values.other.upgraded, values.other.leader], ["是", "否", "否", "否"], info);
  assert.equal(values.high, undefined, info);
  await page.close();
});
