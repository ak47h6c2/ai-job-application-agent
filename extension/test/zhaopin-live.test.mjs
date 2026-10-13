import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer } from "./helpers.mjs";

let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });
const entry = { degree: "master", school: { zh: "测试硕士大学" }, major: { zh: "信息技术（AI方向）" }, startDate: "2025-06", endDate: "2027-06", degreeCategory: { zh: "工学" }, overseasStudy: "yes", minorType: "none" };
const profile = { basic: {}, sections: { education: [entry] }, answers: [], settings: { fillSensitive: false } };

test("Zhaopin live controls: autocomplete selects its suggestion, readonly date pickers retain dates, separate choices fill and capture", async () => {
  const page = await openFixture(browser, base, "zhaopin-live-education.html");
  const report = await fill(page, profile);
  const state = await page.evaluate(() => JSON.parse(JSON.stringify({ entry: window.vm.entry, selections: window.vm.selections, saves: window.vm.saves })));
  assert.equal(state.entry.major, entry.major.zh);
  assert.equal(state.selections, 1);
  assert.equal(state.entry.start, "2025-06-01");
  assert.equal(state.entry.end, "2027-06-01");
  assert.deepEqual([state.entry.degree, state.entry.award, state.entry.discipline, state.entry.overseas, state.entry.minorType], ["master", "master", "engineering", "yes", "none"]);
  assert.equal(state.saves, 0);
  assert.equal(report.items.find(item => item.target === "education.major").status, "filled");
  const { proposals } = await page.evaluate(data => window.JobAutofill.capture(data), profile);
  assert.deepEqual(proposals, []);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("autocomplete with no matching suggestion retains free text and asks for review", async () => {
  const page = await openFixture(browser, base, "zhaopin-live-education.html");
  await page.evaluate(() => { window.vm.suggestions = []; });
  const report = await fill(page, profile);
  assert.equal(await page.evaluate(() => window.vm.entry.major), entry.major.zh);
  assert.equal(await page.evaluate(() => window.vm.selections), 0);
  assert.equal(report.items.find(item => item.target === "education.major").reason, "autocomplete-free-text");
  await page.close();
});

test("autocomplete that rejects free text never reports filling success", async () => {
  const page = await openFixture(browser, base, "zhaopin-live-education.html");
  await page.evaluate(() => { window.vm.suggestions = []; window.vm.strict = true; });
  const report = await fill(page, profile);
  assert.equal(await page.evaluate(() => window.vm.entry.major), "");
  assert.equal(report.items.find(item => item.target === "education.major").status, "failed");
  assert.equal(report.items.find(item => item.target === "education.major").reason, "value-not-accepted");
  await page.close();
});

test("missing overseas and minor choices stay empty even for a Chinese school", async () => {
  const page = await openFixture(browser, base, "zhaopin-live-education.html");
  const unknown = { ...profile, sections: { education: [{ ...entry, country: { zh: "中国/大陆" }, overseasStudy: undefined, minorType: undefined, degreeCategory: undefined }] } };
  const report = await fill(page, unknown);
  assert.deepEqual(await page.evaluate(() => [window.vm.entry.discipline, window.vm.entry.overseas, window.vm.entry.minorType]), ["", "", ""]);
  assert.ok(report.items.filter(item => ["education.degreeCategory", "education.overseasStudy", "education.minorType"].includes(item.target)).every(item => item.reason === "missing-in-profile"));
  await page.close();
});

test("education controls rebuilt after several choices still finish in one fill operation", async () => {
  const page = await openFixture(browser, base, "zhaopin-live-education.html");
  await page.evaluate(() => { window.vm.rebuild = true; window.vm.entry.degree = ""; });
  const report = await fill(page, profile);
  const state = await page.evaluate(() => JSON.parse(JSON.stringify({ entry: window.vm.entry, saves: window.vm.saves })));
  assert.deepEqual([state.entry.degree, state.entry.award, state.entry.major, state.entry.school, state.entry.discipline, state.entry.start, state.entry.end, state.entry.overseas, state.entry.minorType], ["master", "master", entry.major.zh, "测试硕士大学", "engineering", "2025-06-01", "2027-06-01", "yes", "none"]);
  assert.equal(state.saves, 0);
  assert.equal(report.items.length, 9);
  assert.ok(report.items.filter(item => item.target === "education.degree").every(item => ["filled", "uncertain"].includes(item.status)));
  await page.close();
});

test("real work labels keep salary and each referee detail in the correct entry during filling and capture", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate(() => {
    const heading = document.createElement("h3"); heading.textContent = "实习/工作经历"; document.body.append(heading);
    const labels = ["工作单位", "职务", "职位月薪(税前)", "是否有证明人", "证明人姓名", "证明人关系", "证明人职务", "证明人单位", "证明人联系方式"];
    for (let index = 0; index < 2; index++) {
      for (const [field, label] of labels.entries()) {
        const item = document.createElement("div"); item.className = "form-item";
        const id = `work-${index}-${field}`;
        item.innerHTML = `<label for="${id}"></label>` + (label === "是否有证明人" ? `<select id="${id}"><option value="">请选择</option><option value="yes">是</option><option value="no">否</option></select>` : `<input id="${id}">`);
        item.querySelector("label").textContent = label; document.body.append(item);
      }
    }
  });
  const work = ["甲", "乙"].map((name, index) => ({ company: { zh: `测试公司${name}` }, title: { zh: `测试职位${name}` }, salary: { zh: `${10000 + index * 5000}` }, hasReference: "yes", referenceName: { zh: `证明人${name}` }, referenceRelation: { zh: `直属领导${name}` }, referenceTitle: { zh: `测试经理${name}` }, referenceCompany: { zh: `证明单位${name}` }, referencePhone: `1380013800${index}` }));
  const data = { ...profile, sections: { work } };
  await fill(page, data);
  for (const [index, record] of work.entries()) {
    const values = await page.evaluate(index => Array.from(document.querySelectorAll(`[id^="work-${index}-"]`)).filter(el => el.matches("input,select")).map(el => el.value), index);
    assert.deepEqual(values, [record.company.zh, record.title.zh, record.salary.zh, "yes", record.referenceName.zh, record.referenceRelation.zh, record.referenceTitle.zh, record.referenceCompany.zh, record.referencePhone]);
  }
  const { proposals } = await page.evaluate(data => window.JobAutofill.capture(data), data);
  assert.deepEqual(proposals, []);
  await page.close();
});
