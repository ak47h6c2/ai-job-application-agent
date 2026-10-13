import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer } from "./helpers.mjs";

let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });

const profile = {
  basic: { name: { zh: "测试姓名", en: "Test Name" }, firstName: { en: "Test" }, email: "test@example.com", phone: "13800138000", computerLevel: { zh: "计算机二级" } },
  sections: {
    education: [
      { school: { zh: "测试大学" }, major: { zh: "本科专业" }, degree: "bachelor", startDate: "2019-09", endDate: "2023-06" },
      { school: { zh: "测试大学" }, major: { zh: "硕士专业" }, degree: "bachelor", startDate: "2023-09", endDate: "2026-06" },
    ],
  },
  answers: [],
};

async function planOf(html) {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate(markup => { document.body.innerHTML = markup; }, html);
  const planned = await page.evaluate(p => window.JobAutofill.plan(p), profile);
  return { page, planned };
}

test("a job or page title above the form does not hide the fields under it", async () => {
  let { page, planned } = await planOf('<h1>Graduate Software Engineer</h1><form><label for="f">First Name</label><input id="f"><label for="e">Email</label><input id="e" type="email"><label for="p">Phone</label><input id="p" type="tel"></form>');
  assert.deepEqual(planned.map(i => [i.section, i.target]), [[null, "basic.firstName"], [null, "basic.email"], [null, "basic.phone"]]);
  await page.close();
  ({ page, planned } = await planOf('<h2>2026校园招聘网申</h2><div><label for="n">姓名</label><input id="n"><label for="m">手机号码</label><input id="m"><label for="e">电子邮箱</label><input id="e"></div>'));
  assert.deepEqual(planned.map(i => i.target), ["basic.name", "basic.phone", "basic.email"]);
  await page.close();
});

test("a dialog titled 编辑教育经历 fills as education", async () => {
  const { page, planned } = await planOf('<h3>基本信息</h3><label for="n">姓名</label><input id="n"><div class="el-dialog"><div class="el-dialog__header"><span class="el-dialog__title">编辑教育经历</span></div><div class="el-dialog__body"><label for="s">学校名称</label><input id="s"><label for="m">专业</label><input id="m"></div></div>');
  assert.deepEqual(planned.map(i => [i.section, i.target]), [["basic", "basic.name"], ["education", "education.school"], ["education", "education.major"]]);
  await page.close();
});

test("a saved entry's subheading stays inside its section; an unknown sibling heading still ends it", async () => {
  let { page, planned } = await planOf('<div class="block"><h3>教育经历</h3><div class="card"><h4>某某大学 本科</h4></div><label for="s">学校名称</label><input id="s"><label for="m">专业</label><input id="m"></div><div class="block"><h3>实习经历</h3></div>');
  assert.deepEqual(planned.map(i => i.target), ["education.school", "education.major"]);
  await page.close();
  ({ page, planned } = await planOf('<h3>教育经历</h3><label for="s">学校名称</label><input id="s"><h3>本网站专用问题</h3><label for="n">名称</label><input id="n"><label for="c">计算机水平</label><input id="c"><label for="e">电子邮箱</label><input id="e">'));
  // Unknown block: no entry fields, no personal contact details, but neutral profile facts still apply.
  assert.deepEqual(planned.map(i => [i.section, i.target]), [["education", "education.school"], ["unknown", undefined], ["unknown", "basic.computerLevel"], ["unknown", undefined]]);
  await page.close();
});

test("an editor's unpadded start date selects the matching record of the same school", async () => {
  for (const [start, major] of [["2019年9月", "本科专业"], ["2023.9", "硕士专业"]]) {
    const { page } = await planOf(`<h3>教育经历</h3><label for="s">学校名称</label><input id="s" value="测试大学"><label for="d">入学时间</label><input id="d" value="${start}"><label for="m">专业</label><input id="m">`);
    await fill(page, profile);
    assert.equal(await page.locator("#m").inputValue(), major, start);
    await page.close();
  }
});

test("AI drafting reads only job-description paragraphs, never form values or contact details", async () => {
  const { page } = await planOf('<section><h2>岗位职责</h2><p>负责测试平台开发，联系 hr@example.com 或 13900001111。</p><p>参与需求评审。</p></section><form><h3>基本信息</h3><label for="n">姓名</label><input id="n" value="不应发送的姓名"><label for="q">为什么选择我们</label><textarea id="q">不应发送的草稿</textarea></form>');
  const description = await page.evaluate(() => window.JobAutofill.jobDescription());
  assert.match(description, /负责测试平台开发/);
  assert.match(description, /参与需求评审/);
  assert.doesNotMatch(description, /不应发送|hr@example|13900001111/);
  await page.close();
});

test("updates of a stored entry carry its identity so a moved entry is not overwritten", async () => {
  const { page } = await planOf('<h3>教育经历</h3><label for="s">学校名称</label><input id="s" value="测试大学"><label for="d">入学时间</label><input id="d" value="2023-09"><label for="m">专业</label><input id="m" value="新专业">');
  const payload = await page.evaluate(p => window.JobAutofill.payload(p), profile);
  const update = payload.entries.find(entry => entry.index !== null);
  assert.equal(update.index, 1);
  assert.deepEqual(update.identity, [{ key: "school", value: "测试大学", lang: "zh" }, { key: "startDate", value: "2023-09", lang: "zh" }]);
  await page.close();
});

test("text limits from a '0/50' counter or the label are respected and reported as truncated", async () => {
  const long = "我做事认真负责，善于沟通协作。我在项目中负责需求分析和测试验证，能够快速学习新技术。希望在银行科技岗位持续成长，创造价值。";
  const data = { basic: { selfEvaluation: { zh: long }, skills: { zh: long } }, sections: {}, answers: [] };
  const { page } = await planOf('<h3>自我评价</h3><div class="ant-form-item"><label for="s">自我评价</label><textarea id="s"></textarea><span class="count">0/50</span></div><div><label for="k">专业技能（不超过30字）</label><textarea id="k"></textarea></div>');
  const report = await fill(page, data);
  const [self, skills] = await page.locator("textarea").evaluateAll(es => es.map(e => e.value));
  assert.ok(self.length <= 50 && self.length > 20, self);
  assert.ok(skills.length <= 30 && skills.length > 10, skills);
  assert.ok(report.items.filter(i => i.reason === "truncated").length === 2, JSON.stringify(report.items));
  await page.close();
});

test("a salary range picks the bracket it overlaps most and asks for review", async () => {
  const data = { basic: { expectedSalary: { zh: "10000~15000元/月" } }, sections: {}, answers: [] };
  const { page } = await planOf('<label for="s">期望月薪资（选填）</label><select id="s"><option value="">请选择</option><option>5000以下</option><option>5000-8000</option><option>8000-12000</option><option>12000-20000</option><option>20000以上</option></select>');
  const report = await fill(page, data);
  assert.equal(await page.locator("select").evaluate(s => s.selectedOptions[0].textContent), "12000-20000");
  await page.close();
});
