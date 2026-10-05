// Label -> profile field on a page with sections; guards against labels that contain another field's name
// (高考前「户口所在地」, 家庭成员「出生日期」, 学校「所在城市」…) being filled with the wrong data.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE, launch, openFixture, startServer } from "./helpers.mjs";

let browser, server, base;
before(async () => {
  ({ server, base } = await startServer());
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

// null = must stay unrecognized (better left empty than filled with something else).
const CASES = {
  基本信息: {
    姓名: "basic.name", 曾用名: "basic.formerName", 亲属姓名: null, 出生地: "basic.birthplace", 入党时间: "basic.politicalJoinDate",
    手机号码: "basic.phone", 家庭电话: "basic.homePhone", 固定电话: "basic.homePhone", 紧急联系人电话: "basic.emergencyPhone",
    户口所在地: "basic.hukou", "高考前户口所在地（生源地）": "basic.studentOrigin", 入学前户籍所在地: "basic.studentOrigin", 高考所在省份: "basic.studentOrigin",
    户口所在派出所: null, 档案所在地: "basic.archiveLocation", 党组织关系所在地: null, 现居住地: "basic.currentCity",
    第一学历: "basic.firstDegree", 最高学历: "basic.highestDegree", 英语等级: "basic.englishLevel", 普通话水平: "basic.mandarinLevel", 高考分数: "basic.gaokaoScore",
    获取招聘信息渠道: "basic.referralSource", 驾照类型: "basic.driverLicenseType", 是否有驾照: "basic.hasDriverLicense",
    推荐人: null, 现工作单位: null, 参加工作时间: null, "Phone Device Type": null, "Phone Extension": null, "Country Phone Code": "basic.phoneCode",
    "Address Line 2": null, Suburb: "basic.suburb", State: "basic.state", "Country of residence": "basic.residenceCountry", "Middle name": null,
  },
  教育经历: {
    学校名称: "education.school", 学校所在城市: "education.location", 学校所在地: "education.location", 院校性质: "basic.schoolLevel",
    专业: "education.major", 专业类别: null, 研究方向: "education.research", 辅修专业: "education.minor", 学历证书编号: null, 学位: "education.degree",
  },
  实习经历: {
    单位名称: "work.company", 单位性质: "work.companyType", 公司规模: null, 所属行业: "work.industry", 证明人: "work.referenceName",
    证明人职务: "work.referenceTitle", 证明人电话: "work.referencePhone", 薪资: "work.salary", 主要业绩: "work.description", 联系电话: null,
  },
  项目经历: { 项目名称: "projects.name", 所在单位: "projects.organization" },
  证书: { 证书名称: "certificates.name", 证书编号: null },
  家庭成员: {
    姓名: "family.name", 关系: "family.relation", 出生年月: "family.birthDate", 年龄: null, 民族: null, 身份证号: null,
    现居住地: "family.location", 学历: "family.degree", 工作单位: "family.company", 联系电话: "family.phone", 政治面貌: "family.politicalStatus",
  },
  References: { "Referee name": null, Company: null, Position: null },
};

test("labels map to the right profile field in each section", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate((cases) => {
    let n = 0;
    for (const [heading, labels] of Object.entries(cases)) {
      const title = document.createElement("h3");
      title.textContent = heading;
      document.body.append(title);
      for (const label of Object.keys(labels)) {
        n += 1;
        const item = document.createElement("div");
        item.className = "form-item";
        item.innerHTML = `<label for="f${n}"></label><input id="f${n}">`;
        item.querySelector("label").textContent = label;
        document.body.append(item);
      }
    }
  }, CASES);
  const planned = await page.evaluate((profile) => window.JobAutofill.plan(profile), PROFILE);
  const wrong = [];
  let index = 0;
  for (const [heading, labels] of Object.entries(CASES)) {
    for (const [label, expected] of Object.entries(labels)) {
      const actual = planned[index++]?.target ?? null;
      if (actual !== expected) wrong.push(`${heading} · ${label}: ${actual} (expected ${expected})`);
    }
  }
  assert.deepEqual(wrong, []);
  await page.close();
});
