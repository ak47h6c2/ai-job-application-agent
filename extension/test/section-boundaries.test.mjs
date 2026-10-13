import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer } from "./helpers.mjs";
let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });
const profile = { basic: {}, sections: {
  awards: [{ name: { zh: "测试电子竞赛一等奖" }, type: { zh: "竞赛" }, date: "2022-08", description: { zh: "竞赛的真实获奖说明" } }],
  projects: [{ name: { zh: "AI求职项目，不能放到奖项里" }, description: { zh: "项目描述" } }],
  work: [{ company: { zh: "测试企业" }, type: "internship", description: { zh: "实习职责" } }],
}, answers: [] };

test("Zhaopin 奖励/荣誉 uses only award facts for name, type, date and description", async () => {
  const page = await openFixture(browser, base, "zhaopin-awards.html");
  const planned = await page.evaluate(p => window.JobAutofill.plan(p), profile);
  assert.deepEqual(planned.map(i => i.target), [undefined, "awards.name", "awards.type", "awards.date", "awards.description"]);
  const report = await fill(page, profile);
  assert.deepEqual(await page.locator("input,select").evaluateAll(es => es.map(e => e.value)), ["", "测试电子竞赛一等奖", "竞赛", "2022-08", "竞赛的真实获奖说明"]);
  assert.ok(report.items.filter(i => i.target).every(i => i.target.startsWith("awards.")));
  assert.deepEqual((await page.evaluate(p => window.JobAutofill.capture(p), profile)).proposals, []);
  await page.close();
});

test("missing awards stay empty and never borrow projects or offer invented award drafts", async () => {
  const page = await openFixture(browser, base, "zhaopin-awards.html");
  const data = { ...profile, sections: { ...profile.sections, awards: [] } };
  const report = await fill(page, data);
  assert.deepEqual(await page.locator("input,select").evaluateAll(es => es.map(e => e.value)), ["", "", "", "", ""]);
  assert.ok(report.items.filter(i => i.target).every(i => i.status === "empty" && i.reason === "missing-in-profile"));
  assert.ok(!report.items.some(i => i.status === "question"));
  await page.close();
});

test("an award name alone never invents its category, date or description", async () => {
  const page = await openFixture(browser, base, "zhaopin-awards.html");
  const data = { ...profile, sections: { ...profile.sections, awards: [{ name: { zh: "已确认的真实竞赛一等奖" } }] } };
  const report = await fill(page, data);
  assert.deepEqual(await page.locator("input,select").evaluateAll(es => es.map(e => e.value)), ["", "已确认的真实竞赛一等奖", "", "", ""]);
  assert.equal(report.items.filter(i => i.status === "empty").length, 3);
  assert.ok(!report.items.some(i => i.status === "question"));
  await page.close();
});

test("unknown form headings stop the previous section and generic unscoped fields stay unrecognized", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate(() => {
    document.body.innerHTML = '<section><h3>项目经历</h3><p>已保存的项目</p></section><section><h6>新网站专用信息</h6><label for="n">名称</label><input id="n"><label for="t">类型</label><input id="t"><label for="d">详细描述</label><input id="d"></section>';
  });
  let planned = await page.evaluate(p => window.JobAutofill.plan(p), profile);
  assert.ok(planned.every(i => !i.target && i.section === "unknown"));
  await page.evaluate(() => { document.querySelectorAll('h3,h6').forEach(e => e.remove()); });
  planned = await page.evaluate(p => window.JobAutofill.plan(p), profile);
  assert.ok(planned.every(i => !i.target));
  await page.close();
});

test("China Mobile template aliases remain separate even with identical generic labels", async () => {
  const page = await openFixture(browser, base, "labels.html");
  const cases = [
    ["科研项目或研究经历", "名称", "projects.name"], ["校内活动或社会实践", "详细描述", "campus.description"],
    ["专业论著", "类型", "publications.type"], ["奖励 / 荣誉", "名称", "awards.name"],
    ["英语能力", "成绩", "languages.score"], ["其他外语能力", "成绩", "languages.score"],
    ["家庭成员情况", "姓名", "family.name"], ["全职工作经历", "类型", "work.type"],
    ["项目经历", "类型", undefined], ["奖励/荣誉", "工作单位", undefined],
  ];
  await page.evaluate(cases => { document.body.innerHTML = cases.map(([heading, label], i) => `<section><h6>${heading} 必填</h6><label for="f${i}">${label}</label><input id="f${i}"></section>`).join(''); }, cases);
  const planned = await page.evaluate(p => window.JobAutofill.plan(p), profile);
  assert.deepEqual(planned.map(i => i.target), cases.map(c => c[2]));
  await page.close();
});

test("old AI memories cannot cross award boundaries; automatic one-field mapping is rechecked before filling", async () => {
  const page = await openFixture(browser, base, "zhaopin-awards.html");
  let planned = await page.evaluate(p => window.JobAutofill.plan(p), profile);
  const name = planned.find(i => i.label === "名称");
  const memory = { [name.mappingKey]: "projects.name", "类型": "work.type" };
  planned = await page.evaluate(([p, memory]) => window.JobAutofill.plan(p, { memory }), [profile, memory]);
  assert.deepEqual(planned.map(i => i.target), [undefined, "awards.name", "awards.type", "awards.date", "awards.description"]);
  const rejected = await page.evaluate(([p, id]) => window.JobAutofill.fillOne(p, id, "projects.name", { automatic: true }), [profile, name.id]);
  assert.equal(rejected.reason, "section-mismatch");
  assert.equal(await page.locator("#award-name").inputValue(), "");
  await page.locator("#award-name").fill("用户在 AI 等待期间手填的奖项");
  const protectedValue = await page.evaluate(([p, id]) => window.JobAutofill.fillOne(p, id, "awards.name", { automatic: true }), [profile, name.id]);
  assert.equal(protectedValue.reason, "has-value");
  assert.equal(await page.locator("#award-name").inputValue(), "用户在 AI 等待期间手填的奖项");
  await page.close();
});
