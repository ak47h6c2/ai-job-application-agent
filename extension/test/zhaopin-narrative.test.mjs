import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer } from "./helpers.mjs";

let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });
const data = { basic: { selfEvaluation: { zh: "测试个人评价" }, skills: { zh: "Python、SQL" } }, sections: { campus: [{ description: { zh: "测试社团经历" } }], languages: [{ language: { zh: "英语" }, level: { zh: "IELTS" }, score: "7" }] }, answers: [] };
const groups = {
  自我评价: { 内容: "basic.selfEvaluation" },
  校园经历: { "校园工作经历（学生干部经历、学生会工作、社团骨干等）": null, 校园大赛经历: null, 科研项目经历: null, "出版论著、专利设计经历": null },
  奖励活动: { 受到奖励: null, 专业资格证书: null },
  "技能/爱好": { "CET-4成绩": null, "CET-6成绩": null, "TEM-4成绩": null, "TEM-8成绩": null, "TOEFL iBT/IELTS成绩": null, 其他语言证书: null, 计算机技能: "basic.computerSkills", 其他技能: "basic.otherSkills", 个人爱好: "basic.hobbies" },
};
async function fields(page) {
  await page.evaluate(groups => {
    let index = 0;
    for (const [heading, labels] of Object.entries(groups)) {
      const title = document.createElement("h3"); title.textContent = heading; document.body.append(title);
      for (const label of Object.keys(labels)) {
        const item = document.createElement("div"); item.className = "el-form-item";
        item.innerHTML = `<label for="n-${index}"></label><textarea id="n-${index++}"></textarea>`;
        item.querySelector("label").textContent = label; document.body.append(item);
      }
    }
  }, groups);
}
test("actual narrative labels keep distinct questions and exam scores separate", async () => {
  const page = await openFixture(browser, base, "labels.html"); await fields(page);
  const planned = await page.evaluate(data => window.JobAutofill.plan(data), data);
  const errors = [];
  let index = 0;
  for (const [heading, labels] of Object.entries(groups)) for (const [label, expected] of Object.entries(labels)) {
    const actual = planned[index++]?.target ?? null;
    if (actual !== expected) errors.push(`${heading} · ${label}: ${actual} (expected ${expected})`);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test("exam scores ignore old AI mappings to a different language exam", async () => {
  const page = await openFixture(browser, base, "labels.html"); await fields(page);
  const initial = await page.evaluate(data => window.JobAutofill.plan(data), data);
  const examLabels = ["CET-4成绩", "CET-6成绩", "TEM-4成绩", "TEM-8成绩"];
  const memory = Object.fromEntries(initial.filter(item => examLabels.includes(item.label)).map(item => [item.mappingKey, "languages.score"]));
  const result = await page.evaluate(([data, memory]) => window.JobAutofill.plan(data, { memory }), [data, memory]);
  assert.ok(result.filter(item => examLabels.includes(item.label)).every(item => item.target === undefined));
  const withAnswer = { ...data, answers: [{ id: "cet4", question: "CET-4成绩", answer: "440" }] };
  const report = await fill(page, withAnswer, { memory });
  assert.equal(report.items.find(item => item.label === "CET-4成绩").value, "440");
  assert.ok(report.items.filter(item => examLabels.slice(1).includes(item.label)).every(item => !item.value));
  await page.close();
});

test("specific narrative answers fill only their own topic; capture never overwrites a campus entry", async () => {
  const page = await openFixture(browser, base, "labels.html"); await fields(page);
  const answers = [
    { id: "campus", question: "校园工作经历（学生干部经历、学生会工作、社团骨干等）", answer: "测试学生会职务与经历" },
    { id: "contest", question: "校园大赛经历", answer: "测试比赛经历" },
    { id: "cet6", question: "CET-6成绩", answer: "500" },
    { id: "ielts", question: "TOEFL iBT/IELTS成绩", answer: "雅思7分" },
    { id: "generic", question: "校园经历", answer: "不应被套用到所有校园问题" },
  ];
  const profile = { ...data, basic: { ...data.basic, computerSkills: { zh: "Python、SQL" }, otherSkills: { zh: "技术报告写作" } }, answers };
  const report = await fill(page, profile);
  const values = await page.locator("textarea").evaluateAll(items => items.map(item => item.value));
  assert.deepEqual(values, ["测试个人评价", answers[0].answer, answers[1].answer, "", "", "", "", "", "500", "", "", "雅思7分", "", "Python、SQL", "技术报告写作", ""]);
  assert.ok(!values.includes(answers[4].answer));
  assert.equal(report.items[0].target, "basic.selfEvaluation");
  assert.deepEqual((await page.evaluate(data => window.JobAutofill.capture(data), profile)).proposals, []);
  await page.locator("#n-1").fill("用户重新整理的完整校园工作经历");
  await page.locator("#n-3").fill("用户核对过的科研项目描述");
  const capture = await page.evaluate(data => window.JobAutofill.capture(data), profile);
  assert.ok(capture.proposals.every(item => item.section === "answer"));
  assert.equal(capture.proposals.length, 2);
  assert.deepEqual(capture.proposals.map(item => item.question).sort(), [answers[0].question, "科研项目经历"].sort());
  await page.close();
});

test("generic self-evaluation heading does not turn an ordinary campus content field into personal summary", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate(() => { document.body.innerHTML = '<h3>校园经历</h3><div class="form-item"><label for="description">内容</label><textarea id="description"></textarea></div>'; });
  const planned = await page.evaluate(data => window.JobAutofill.plan(data), data);
  assert.equal(planned[0].target, "campus.description");
  await page.close();
});
