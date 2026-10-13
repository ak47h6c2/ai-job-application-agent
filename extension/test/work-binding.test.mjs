import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer } from "./helpers.mjs";
let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });
const shanghai = { company: { zh: "测试上海公司" }, title: { zh: "硬件工程师" }, type: "internship", startDate: "2023-03", endDate: "2023-06", description: { zh: "上海的电路设计职责" } };
const alps = { company: { zh: "阿尔派电子大连研发中心" }, title: { zh: "回路工程师" }, type: "internship", startDate: "2023-09", endDate: "2024-03", description: { zh: "阿尔派的车载系统验证和故障调试" } };
const profile = { basic: {}, sections: { work: [shanghai, alps], projects: [{ name: { zh: "AI求职项目" }, description: { zh: "项目专用介绍，不能当作阿尔派职责" } }] }, answers: [] };
async function editor(page, entries, heading = "实习/工作经历") {
  await page.evaluate(({ entries, heading }) => {
    document.body.innerHTML = `<h3>${heading}</h3>`;
    for (const [index, entry] of entries.entries()) {
      const form = document.createElement("form");
      const fields = [["company", "工作单位"], ["title", "职务"], ["start", "入职时间"], ["end", "离职时间"], ["description", "主要工作职责和业绩"]];
      for (const [key, label] of fields) {
        const item = document.createElement("div"); item.className = "el-form-item";
        item.innerHTML = `<label for="${key}-${index}">${label}</label>` + (key === "description" ? `<textarea id="${key}-${index}" maxlength="500" placeholder="请填写主要工作职责和业绩"></textarea>` : `<input id="${key}-${index}">`);
        item.querySelector("input,textarea").value = entry[key] ?? ""; form.append(item);
      }
      document.body.append(form);
    }
  }, { entries, heading });
}
test("legacy project mapping cannot turn work responsibilities into a project description", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await editor(page, [{ company: alps.company.zh, start: "2023-09-01", end: "2024-03-01" }]);
  const report = await fill(page, profile, { memory: { "主要工作职责和业绩": "projects.description" } });
  assert.equal(await page.locator("#description-0").inputValue(), alps.description.zh);
  assert.equal(report.items.find(item => item.label === "主要工作职责和业绩").target, "work.description");
  await page.close();
});

test("a saved referee's 项目经理 title cannot turn the following work editor into a project", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await editor(page, [{ company: alps.company.zh, start: "2023-09-01", end: "2024-03-01" }]);
  await page.evaluate(() => {
    const card = document.createElement("div");
    card.innerHTML = '<div class="el-form-item"><label class="el-form-item__label">证明人职务</label><div class="el-form-item__content"><div class="labelOnly-text">项目经理</div></div></div><p>项目经理</p>';
    document.querySelector("h3").after(card);
  });
  const planned = await page.evaluate(data => window.JobAutofill.plan(data), profile);
  assert.ok(planned.every(item => item.section === "work"));
  assert.equal(planned.find(item => item.label === "工作单位").target, "work.company");
  assert.equal(planned.find(item => item.label === "主要工作职责和业绩").target, "work.description");
  await fill(page, profile);
  assert.equal(await page.locator("#description-0").inputValue(), alps.description.zh);
  await page.close();
});
test("an existing company and dates bind every field to that work record, regardless of library order", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await editor(page, [{ company: "阿尔派电子(中国)大连研发中心", start: "2023-09-01", end: "2024-03-01" }]);
  const report = await fill(page, profile);
  assert.equal(await page.locator("#description-0").inputValue(), alps.description.zh);
  assert.equal(await page.locator("#title-0").inputValue(), alps.title.zh);
  assert.equal(report.items.find(item => item.target === "work.description").entry, 1);
  assert.ok(report.items.find(item => item.target === "work.description").targetLabel.includes(alps.company.zh));
  assert.deepEqual((await page.evaluate(data => window.JobAutofill.capture(data), profile)).proposals.filter(item => item.values.some(value => value.key !== "company")), []);
  await page.close();
});

test("new manual mappings and skips are scoped to their section; compatible old mappings still work", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await editor(page, [{ company: alps.company.zh, start: "2023-09" }]);
  const items = await page.evaluate(data => window.JobAutofill.plan(data), profile);
  const key = items.find(item => item.target === "work.description").mappingKey;
  let planned = await page.evaluate(([data, memory]) => window.JobAutofill.plan(data, { memory }), [profile, { [key]: "skip" }]);
  assert.equal(planned.find(item => item.label === "主要工作职责和业绩").target, undefined);
  planned = await page.evaluate(([data, memory]) => window.JobAutofill.plan(data, { memory }), [profile, { [key]: "projects.description" }]);
  assert.equal(planned.find(item => item.label === "主要工作职责和业绩").target, "work.description");
  planned = await page.evaluate(([data, memory]) => window.JobAutofill.plan(data, { memory }), [profile, { [`manual::${key}`]: "projects.description" }]);
  assert.equal(planned.find(item => item.label === "主要工作职责和业绩").target, "projects.description");
  planned = await page.evaluate(([data, memory]) => window.JobAutofill.plan(data, { memory }), [profile, { "主要工作职责和业绩": "work.description" }]);
  assert.equal(planned.find(item => item.label === "主要工作职责和业绩").target, "work.description");
  await page.evaluate(() => { document.querySelector("h3").textContent = "项目经历"; });
  planned = await page.evaluate(([data, memory]) => window.JobAutofill.plan(data, { memory }), [profile, { [key]: "skip", "主要工作职责和业绩": "projects.description" }]);
  assert.equal(planned.find(item => item.label === "主要工作职责和业绩").target, "projects.description");
  await page.close();
});
test("an unknown work company never borrows another employer's responsibilities", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await editor(page, [{ company: "资料库未收录的公司", start: "2023-09-01" }]);
  const report = await fill(page, profile);
  assert.equal(await page.locator("#description-0").inputValue(), "");
  assert.equal(report.items.find(item => item.target === "work.description").reason, "entry-not-in-profile");
  await page.close();
});
test("same employer in different periods is selected by date and keeps both editors separate", async () => {
  const page = await openFixture(browser, base, "labels.html");
  const later = { ...alps, startDate: "2025-01", endDate: "2025-06", title: { zh: "后续岗位" }, description: { zh: "后续期间的独立职责" } };
  const data = { ...profile, sections: { work: [alps, later] } };
  await editor(page, [{ company: alps.company.zh, start: "2025-01-01" }, { company: alps.company.zh, start: "2023-09-01" }]);
  await fill(page, data);
  assert.equal(await page.locator("#description-0").inputValue(), later.description.zh);
  assert.equal(await page.locator("#description-1").inputValue(), alps.description.zh);
  assert.deepEqual((await page.evaluate(data => window.JobAutofill.capture(data), data)).proposals, []);
  await page.close();
});
test("ambiguous or conflicting work periods stay empty; branch names are not discarded", async () => {
  const page = await openFixture(browser, base, "labels.html");
  const later = { ...alps, startDate: "2025-01", description: { zh: "后续职责" } };
  const branch = { ...alps, company: { zh: "测试公司(上海)" } };
  const data = { ...profile, sections: { work: [alps, later, branch] } };
  await editor(page, [{ company: alps.company.zh }, { company: alps.company.zh, start: "2020-01-01" }, { company: "测试公司(北京)" }]);
  await fill(page, data);
  assert.deepEqual(await page.locator("textarea").evaluateAll(items => items.map(item => item.value)), ["", "", ""]);
  await page.close();
});

test("capturing an ambiguous employer cannot overwrite the first record; a unique title can resolve it", async () => {
  const page = await openFixture(browser, base, "labels.html");
  const later = { ...alps, startDate: "2025-01", endDate: "2025-06", title: { zh: "后续岗位" }, description: { zh: "后续期间的职责" } };
  const data = { ...profile, sections: { work: [alps, later] } };
  await editor(page, [{ company: alps.company.zh, description: "页面中新修改的职责" }]);
  let proposals = (await page.evaluate(data => window.JobAutofill.capture(data), data)).proposals;
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].blocked, true);
  assert.equal(proposals[0].checked, false);
  assert.deepEqual(proposals[0].values, []);
  await page.locator("#title-0").fill(later.title.zh);
  proposals = (await page.evaluate(data => window.JobAutofill.capture(data), data)).proposals;
  const description = proposals.find(item => item.values.some(value => value.key === "description"));
  assert.equal(description.index, 1);
  assert.equal(description.checked, false);
  await page.close();
});
