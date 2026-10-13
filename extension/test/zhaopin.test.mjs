import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE, fill, launch, openFixture, startServer } from "./helpers.mjs";

let browser, server, base;
before(async () => {
  ({ server, base } = await startServer());
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

const father = { relation: { zh: "父亲", en: "Father" }, name: { zh: "测试父亲" }, age: "55", company: { zh: "测试甲单位" }, position: { zh: "工程师" }, phone: "13800000001", politicalStatus: "party_member" };
const mother = { relation: { zh: "母亲", en: "Mother" }, name: { zh: "测试母亲" }, age: "53", company: { zh: "测试乙单位" }, position: { zh: "教师" }, phone: "13800000002", politicalStatus: "masses" };
const profile = (family) => ({ ...PROFILE, sections: { ...PROFILE.sections, family } });

test("Zhaopin: employer yes/no questions do not become employer fields or advance family entries", async () => {
  const page = await openFixture(browser, base, "zhaopin-family.html");
  const planned = await page.evaluate((data) => window.JobAutofill.plan(data), profile([father, mother]));
  assert.ok(planned.filter((item) => item.label.includes("是否")).every((item) => item.target == null));
  assert.equal(planned.find((item) => item.label === "姓名-母亲").entry, 1);
  assert.equal(planned.find((item) => item.label === "工作单位-母亲").entry, 1);
  await page.close();
});

test("Zhaopin: father/mother fields follow the relationship, regardless of profile order", async () => {
  const page = await openFixture(browser, base, "zhaopin-family.html");
  await fill(page, profile([mother, father]));
  const state = await page.evaluate(() => JSON.parse(JSON.stringify({ members: window.vm.members, saves: window.vm.saves })));
  assert.deepEqual(state.members.map(({ name, company, position, phone, politicalStatus }) => ({ name, company, position, phone, politicalStatus })), [father, mother].map((member) => ({ name: member.name.zh, company: member.company.zh, position: member.position.zh, phone: member.phone, politicalStatus: member.politicalStatus })));
  assert.ok(state.members.every((member) => !member.bank && !member.post));
  assert.equal(state.saves, 0);
  assert.deepEqual(state.members.map((member) => member.age), ["55", "53"]);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("Zhaopin: a missing father entry never borrows the mother's details", async () => {
  const page = await openFixture(browser, base, "zhaopin-family.html");
  await fill(page, profile([mother]));
  const members = await page.evaluate(() => JSON.parse(JSON.stringify(window.vm.members)));
  assert.equal(members[0].name, "");
  assert.equal(members[0].company, "");
  assert.equal(members[1].name, mother.name.zh);
  assert.equal(members[1].company, mother.company.zh);
  await page.close();
});

test("Zhaopin: capturing named parents preserves their relationship and separates their entries", async () => {
  const page = await openFixture(browser, base, "zhaopin-family.html");
  await page.evaluate(() => {
    window.vm.members[0].name = "新父亲";
    window.vm.members[1].name = "新母亲";
  });
  const { capture } = await page.evaluate((data) => window.JobAutofill.capture(data), profile([]));
  const family = capture.values.filter((value) => value.section === "family");
  assert.equal(family.filter((value) => value.key === "name").length, 2);
  assert.deepEqual(family.filter((value) => value.key === "relation").map((value) => value.value), ["父亲", "母亲"]);
  assert.notEqual(family.find((value) => value.value === "新父亲").entry, family.find((value) => value.value === "新母亲").entry);
  await page.close();
});

test("extension update: invalid context shows refresh guidance instead of making the panel disappear", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate(async () => {
    window.chrome.runtime = { sendMessage() { throw new Error("Extension context invalidated."); } };
    await window.JobAutofill.openPanel();
  });
  assert.match(await page.locator("[data-jaf-ui] .panel").innerText(), /请刷新当前网页/);
  assert.equal(await page.locator("[data-jaf-ui] .primary.big").isDisabled(), true);
  assert.deepEqual(page.errors, []);
  await page.close();
});

const educationProfile = { ...PROFILE, sections: { ...PROFILE.sections, education: [
  { degree: "master", school: { zh: "测试大学甲" }, college: { zh: "测试硕士学院" }, major: { zh: "测试硕士专业" }, courses: { zh: "测试硕士课程" }, research: { zh: "测试硕士方向" }, studyMode: "full_time", duration: "2年", startDate: "2025-06", endDate: "2027-06" },
  { degree: "bachelor", school: { zh: "测试大学乙" }, college: { zh: "测试本科学院" }, major: { zh: "测试本科专业" }, courses: { zh: "测试本科课程" }, research: { zh: "测试本科方向" }, studyMode: "full_time", duration: "4", startDate: "2019-09", endDate: "2023-06" },
] } };

test("Zhaopin: nonadjacent 学历 and 学位 belong to one entry; two education entries stay separate", async () => {
  const page = await openFixture(browser, base, "zhaopin-education.html");
  const data = educationProfile;
  const planned = await page.evaluate((profile) => window.JobAutofill.plan(profile), data);
  assert.ok(planned.filter((item) => /学科门类/.test(item.label)).every((item) => item.target === "education.degreeCategory"));
  assert.ok(planned.filter((item) => /是否有国外/.test(item.label)).every((item) => item.target === "education.overseasStudy"));
  assert.ok(planned.filter((item) => /是否有第二学位/.test(item.label)).every((item) => item.target === "education.minorType"));
  assert.deepEqual(planned.filter((item) => item.target === "education.degree").map((item) => item.entry), [0, 0, 1, 1]);
  assert.deepEqual(planned.filter((item) => item.target === "education.startDate").map((item) => item.entry), [0, 1]);
  await fill(page, data);
  const state = await page.evaluate(() => JSON.parse(JSON.stringify({ entries: window.vm.entries, saves: window.vm.saves })));
  assert.deepEqual(state.entries.map(({ school, degree, award, start, end, mode }) => ({ school, degree, award, start, end, mode })), [
    { school: "测试大学甲", degree: "master", award: "master", start: "2025-06", end: "2027-06", mode: "full_time" },
    { school: "测试大学乙", degree: "bachelor", award: "bachelor", start: "2019-09", end: "2023-06", mode: "full_time" },
  ]);
  assert.ok(state.entries.every((entry) => !entry.discipline && !entry.overseas && !entry.secondDegree));
  assert.equal(state.saves, 0);
  assert.deepEqual(state.entries.map(entry => entry.duration), ["2", "4"]);
  assert.deepEqual(state.entries.map(({ college, major, courses, research }) => ({ college, major, courses, research })), data.sections.education.map(entry => Object.fromEntries(["college", "major", "courses", "research"].map(key => [key, entry[key].zh]))));
  const { proposals } = await page.evaluate(profile => window.JobAutofill.capture(profile), data);
  assert.deepEqual(proposals.filter(item => item.section === "education"), []);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("Zhaopin: overwrite repairs a master's editor containing bachelor's details without saving it", async () => {
  const page = await openFixture(browser, base, "zhaopin-education.html");
  await page.evaluate(() => {
    window.vm.entries.splice(1);
    Object.assign(window.vm.entries[0], { degree: "master", award: "bachelor", school: "测试大学乙", college: "测试本科学院", major: "测试本科专业", courses: "测试本科课程", duration: "4", start: "2019-09", end: "2023-06" });
  });
  await fill(page, educationProfile, { overwrite: true });
  const { entry, saves } = await page.evaluate(() => JSON.parse(JSON.stringify({ entry: window.vm.entries[0], saves: window.vm.saves })));
  assert.deepEqual(Object.fromEntries(["degree", "award", "school", "college", "major", "courses", "duration", "start", "end"].map(key => [key, entry[key]])), {
    degree: "master", award: "master", school: "测试大学甲", college: "测试硕士学院", major: "测试硕士专业", courses: "测试硕士课程", duration: "2", start: "2025-06", end: "2027-06",
  });
  assert.equal(saves, 0);
  const { proposals } = await page.evaluate(data => window.JobAutofill.capture(data), educationProfile);
  assert.deepEqual(proposals.filter(item => item.section === "education"), []);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("Zhaopin: preselected master's level keeps all fields in the same education editor, including capture", async () => {
  const page = await openFixture(browser, base, "zhaopin-education.html");
  await page.evaluate(() => { window.vm.entries.splice(1); window.vm.entries[0].degree = "master"; });
  // Both profile entries are present, as on the real page; only the master's editor is open.
  const report = await fill(page, educationProfile);
  const state = await page.evaluate(() => JSON.parse(JSON.stringify({ entry: window.vm.entries[0], saves: window.vm.saves })));
  assert.equal(state.entry.school, "测试大学甲");
  assert.equal(state.entry.award, "master");
  assert.equal(state.entry.major, "测试硕士专业");
  assert.equal(state.entry.start, "2025-06");
  assert.equal(state.entry.end, "2027-06");
  assert.equal(state.saves, 0);
  assert.equal(report.items.find(item => item.label === "学历").status, "skipped");
  const { capture, proposals } = await page.evaluate(data => window.JobAutofill.capture(data), educationProfile);
  assert.deepEqual([...new Set(capture.values.filter(value => value.section === "education").map(value => value.entry))], [0]);
  assert.deepEqual(proposals.filter(item => item.section === "education"), []);
  assert.deepEqual(page.errors, []);
  await page.close();
});
