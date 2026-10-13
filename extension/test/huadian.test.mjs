import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer, summarize } from "./helpers.mjs";

let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });

const profile = {
  basic: {
    gender: "male",
    hometown: { zh: "吉林省/白山市/抚松县" },
    studentOrigin: { zh: "吉林省/白山市/抚松县" },
    politicalStatus: "league_member",
    politicalJoinDate: "2016-05",
    hasMajorDisease: "no",
    skills: { zh: "Python、嵌入式开发" },
  },
  sections: {
    education: [{ school: { zh: "新南威尔士大学" }, degree: "master", major: { zh: "信息技术" }, location: { zh: "悉尼" }, startDate: "2025-06", endDate: "2027-06" }],
    languages: [{ language: { zh: "英语" }, level: { zh: "雅思（IELTS）" }, score: "6.5" }],
    certificates: [{ name: { zh: "IELTS 6.5" } }, { name: { zh: "CET-4" } }, { name: { zh: "C1驾驶证" } }],
    awards: [{ name: { zh: "电子设计竞赛一等奖" } }, { name: { zh: "创新创业省级立项" } }],
    work: [{ company: { zh: "测试电子有限公司" }, description: { zh: "负责硬件调试。" } }],
  },
  answers: [],
};

const value = (page, label) => page.evaluate((text) => {
  const field = Array.from(document.querySelectorAll(".semi-form-field")).find((item) => item.querySelector("label").textContent === text);
  const select = field.querySelector(".semi-select-selection-text");
  return select ? select.textContent : field.querySelector("input, textarea").value;
}, label);

test("Huadian resume: view mode is left alone, the pencil button opens it, then every field gets its own fact", { timeout: 90000 }, async () => {
  const page = await openFixture(browser, base, "huadian-resume.html");
  // View mode: disabled widgets take nothing, and the support chat is never a form field.
  const view = await fill(page, profile);
  assert.equal(view.items.length, 0, summarize(view));
  assert.equal(await value(page, "资格证书"), "");
  assert.equal(await page.evaluate(() => window.JobAutofill.editButtons()), 1);
  await page.evaluate(() => window.JobAutofill.clickEdit());

  const report = await fill(page, profile);
  const log = summarize(report);
  assert.ok(!report.items.some((item) => /请输入/.test(item.label)), log);
  const expected = {
    性别: "男",
    籍贯: "吉林省白山市抚松县",
    // A city-level list is searched one level up.
    生源地: "吉林省白山市",
    政治面貌: "共青团员",
    // A league member has no 入党 date.
    入党时间: "",
    资格证书: "IELTS 6.5、CET-4、C1驾驶证",
    毕业院校所在地: "海外",
    最高外语水平: "6≤雅思＜7",
    专业技术职称: "",
    熟悉专业及特长: "Python、嵌入式开发",
    入学主要业绩: "",
    // A basic-info box names no work entry.
    主要业绩: "",
    奖惩经历: "电子设计竞赛一等奖、创新创业省级立项",
    其他病史: "无",
  };
  for (const [label, text] of Object.entries(expected)) assert.equal(await value(page, label), text, `${label}\n${log}`);
  const reasons = Object.fromEntries(report.items.map((item) => [item.label, item.reason]));
  assert.equal(reasons["毕业院校所在地"], "chose-overseas", log);
  assert.equal(reasons["资格证书"], "joined-entries", log);
  assert.equal(reasons["入党时间"], "political-status-mismatch", log);
  // Reading the page back offers nothing the fill took from the profile: the site's bracket restates
  // the stored IELTS score, and an untouched 0 is no weight.
  const { proposals } = await page.evaluate((data) => window.JobAutofill.capture(data), profile);
  const keys = proposals.flatMap((proposal) => proposal.values.map((item) => item.key));
  assert.ok(!keys.includes("englishLevel") && !keys.includes("weight"), JSON.stringify(proposals.map((proposal) => proposal.title)));
  // The joined certificate list is no single certificate to store.
  assert.ok(!proposals.some((proposal) => proposal.section === "certificates"), JSON.stringify(proposals.map((proposal) => proposal.title)));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("Huadian 社会实践经历: the tab and dialog are campus experience, so 实践单位 is the organization, not an employer; a saved row is not added again", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div class="semi-tabs-bar" role="tablist"><div class="semi-tabs-tab" role="tab">工作经历</div>
        <div class="semi-tabs-tab semi-tabs-tab-active" role="tab" aria-selected="true">社会实践经历</div><div class="semi-tabs-tab" role="tab">证书</div></div>
      <table><tr><th>是否有社会实践</th><th>实践单位</th><th>工作内容</th></tr><tr><td>是</td><td>测试电力电子协会</td><td>组织技术交流活动。</td></tr></table>
      <div class="semi-modal"><div class="semi-modal-content" role="dialog" aria-modal="true"><div class="semi-modal-title">社会实践经历</div>
        <div class="semi-form-field"><label for="org">实践单位</label><input id="org"></div>
        <div class="semi-form-field"><label for="start">开始日期</label><input id="start" placeholder="请选择日期"></div>
        <div class="semi-form-field"><label for="end">结束日期</label><input id="end" placeholder="结束日期为空默认至今"></div>
        <div class="semi-form-field"><label for="content">工作内容</label><textarea id="content"></textarea></div></div></div>`;
  });
  const profile = {
    basic: {},
    sections: {
      work: [{ company: { zh: "测试电子有限公司" }, startDate: "2025-06", endDate: "2027-06", description: { zh: "负责硬件调试。" } }],
      campus: [
        { organization: { zh: "测试电力电子协会" }, role: { zh: "成员" }, startDate: "2020-01", endDate: "2022-12", description: { zh: "组织技术交流活动。" } },
        { organization: { zh: "测试商会" }, role: { zh: "会员" }, startDate: "2025-09", endDate: "2026-03", description: { zh: "协助年会筹备。" } },
      ],
    },
    answers: [],
  };
  const report = await fill(page, profile);
  const log = summarize(report);
  assert.equal(await page.$eval("#org", (element) => element.value), "测试商会", log);
  assert.equal(await page.$eval("#content", (element) => element.value), "协助年会筹备。", log);
  assert.match(await page.$eval("#start", (element) => element.value), /^2025-09/, log);
  assert.match(await page.$eval("#end", (element) => element.value), /^2026-03/, log);
  await page.close();
});

test("reading back the grade band chosen for a stored GPA proposes no change to the GPA", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate(() => {
    document.body.innerHTML = '<h3>教育经历</h3><div class="form-item"><label for="s">学校名称</label><input id="s" value="测试工业大学"></div>'
      + '<div class="form-item"><label for="g">必修课平均成绩</label><select id="g"><option>80-89分/3.0-3.9</option><option selected>70-79分/2.0-2.9</option></select></div>';
  });
  const profile = { basic: {}, sections: { education: [{ school: { zh: "测试工业大学" }, gpa: "2.75" }] }, answers: [] };
  const { proposals } = await page.evaluate((data) => window.JobAutofill.capture(data), profile);
  assert.ok(!proposals.some((proposal) => proposal.values.some((item) => item.key === "gpa")), JSON.stringify(proposals));
  await page.close();
});

test("Huadian work tab: the highlighted tab claims the plain 添加, each entry is saved in its modal, Escape never closes it", { timeout: 90000 }, async () => {
  const page = await openFixture(browser, base, "huadian-work.html");
  const work = [
    { company: { zh: "测试电子有限公司" }, title: { zh: "硬件工程师" }, type: "internship", startDate: "2023-03", endDate: "2023-06", description: { zh: "负责样机调试。" } },
    { company: { zh: "测试研发中心" }, title: { zh: "回路工程师" }, type: "internship", startDate: "2023-09", endDate: "2024-03", description: { zh: "负责系统验证。" } },
  ];
  const report = await fill(page, { basic: {}, sections: { work }, answers: [] });
  const saved = await page.evaluate(() => window.saved);
  assert.equal(await page.evaluate(() => window.escapeClosed), 0, summarize(report));
  assert.deepEqual(saved.map((entry) => [entry.company, entry.title, entry.start.slice(0, 7), entry.end.slice(0, 7), entry.description]), [
    ["测试电子有限公司", "硬件工程师", "2023-03", "2023-06", "负责样机调试。"],
    ["测试研发中心", "回路工程师", "2023-09", "2024-03", "负责系统验证。"],
  ], summarize(report));
  assert.deepEqual(report.added.map((item) => item.mode), ["dialog", "dialog"]);
  await page.close();
});

test("a site that stores dates a day early: the date-shift setting types the next day and reads it back unshifted", { timeout: 60000 }, async () => {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate(() => { document.body.innerHTML = '<h3>基本信息</h3><div class="form-item"><label for="b">出生日期</label><input id="b" type="date"></div><div class="form-item"><label for="s">入职时间</label><input id="s"></div>'; });
  const profile = { basic: { birthDate: "2000-04-12" }, sections: {}, answers: [] };
  const memory = { "setting::date-shift": "1" };
  await fill(page, profile, { memory });
  assert.equal(await page.$eval("#b", (element) => element.value), "2000-04-13");
  const { proposals } = await page.evaluate(([data, options]) => window.JobAutofill.capture(data, options), [profile, { memory }]);
  assert.ok(!proposals.some((proposal) => proposal.values.some((item) => item.key === "birthDate")), JSON.stringify(proposals));
  // Without the setting the same page reads as a different birth date.
  const plain = await page.evaluate((data) => window.JobAutofill.capture(data), profile);
  assert.ok(plain.proposals.some((proposal) => proposal.values.some((item) => item.key === "birthDate" && item.value === "2000-04-13")));
  await page.close();
});

test("Huadian education: each dialog gets its own labels, 是否最高全日制, 全日制, 海外留学生, the domestic major and the grade band", { timeout: 120000 }, async () => {
  const page = await openFixture(browser, base, "huadian-education.html");
  const education = [
    { school: { zh: "新南威尔士大学" }, degree: "master", major: { zh: "信息技术（AI方向）" }, catalogMajor: { zh: "计算机科学与技术" }, location: { zh: "悉尼" },
      startDate: "2025-06", endDate: "2027-06", studyMode: "full_time", degreeCategory: { zh: "工学" }, degreeName: { zh: "电子信息硕士" }, duration: "2", gpa: { zh: "目前WAM75/100" } },
    { school: { zh: "测试工业大学" }, degree: "bachelor", major: { zh: "电子信息工程" }, location: { zh: "测试市" }, startDate: "2019-09", endDate: "2023-06",
      studyMode: "full_time", degreeCategory: { zh: "工学" }, duration: "4", gpa: { zh: "2.75" }, rank: { zh: "前50%" } },
  ];
  const report = await fill(page, { basic: {}, sections: { education }, answers: [] }, { memory: { "setting::date-shift": "1" } });
  const saved = await page.evaluate(() => window.saved);
  const log = summarize(report);
  assert.equal(saved.length, 2, log);
  const pick = (entry) => [entry.start, entry.end, entry.school, entry.level, entry.highest, entry.degree, entry.fullTime, entry.mode, entry.major, entry.rank, entry.duration, entry.grade, entry.failed];
  assert.deepEqual(pick(saved[0]), ["2025-06-02", "2027-06-02", "新南威尔士大学", "硕士研究生", "是", "电子信息硕士", "是", "海外留学生", "计算机科学与技术", "", "2", "70-79分/2.0-2.9", ""], log);
  assert.deepEqual(pick(saved[1]), ["2019-09-02", "2023-06-02", "测试工业大学", "本科", "否", "工学学士", "是", "全国普通高等院校全日制", "电子信息工程", "前50%", "4", "70-79分/2.0-2.9", ""], log);
  await page.close();
});
