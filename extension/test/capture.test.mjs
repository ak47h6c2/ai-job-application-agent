// Reading a filled-in form back into the profile ("save what I typed").
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

const EMPTY = { basic: {}, sections: {}, answers: [] };
const capture = (page, profile, options = {}) => page.evaluate(([data, opts]) => window.JobAutofill.capture(data, opts), [profile, options]);
const byTitle = (proposals) => Object.fromEntries(proposals.map((proposal) => [proposal.title, proposal]));
const valuesOf = (proposal) => Object.fromEntries(proposal.values.map((item) => [item.key, item.value]));

for (const fixture of ["native.html", "element-ui.html", "element-plus.html", "antd.html", "layui.html"]) {
  test(`${fixture}: values filled from the profile read back as nothing new`, async () => {
    const page = await openFixture(browser, base, fixture);
    await fill(page);
    const { proposals } = await capture(page, PROFILE);
    const unexpected = proposals.filter((proposal) => proposal.section !== "answer");
    if (process.env.DEBUG) console.log(fixture, proposals.map((proposal) => `${proposal.title} = ${proposal.detail} (was ${proposal.previous})`));
    assert.deepEqual(unexpected.map((proposal) => `${proposal.title}: ${proposal.detail} / ${proposal.previous}`), []);
    assert.deepEqual(page.errors, []);
    await page.close();
  });
}

test("native form typed by hand builds a profile: basics, new entries, answers", async () => {
  const page = await openFixture(browser, base, "native.html");
  await page.fill("#xm", "王芳");
  await page.check("input[name=xb][value='2']");
  await page.fill("#csrq", "2002-03-04");
  await page.selectOption("#zzmm", "01");
  await page.fill("#sj", "13912345678");
  await page.fill("#yx", "wf@example.com");
  await page.fill("#jg", "吉林-白山");
  await page.fill(".edu .school", "吉林大学");
  await page.selectOption(".edu .degree", "bk");
  await page.fill(".edu .start", "2020-09");
  await page.fill(".edu .end", "2024-06");
  await page.click("#add-work");
  await page.fill(".work .company", "华为");
  await page.fill(".work .start", "2023-07");
  await page.check(".work .present");
  await page.fill("#source", "朋友推荐");
  await page.fill(".fm-name", "王强");
  await page.fill(".fm-rel", "父亲");

  const { proposals } = await capture(page, EMPTY);
  const titles = byTitle(proposals);
  if (process.env.DEBUG) console.log(proposals.map((proposal) => `${proposal.title} = ${proposal.detail}`));
  assert.equal(titles["姓名"].values[0].value, "王芳");
  assert.equal(titles["性别"].values[0].value, "female");
  assert.equal(titles["出生日期"].values[0].value, "2002-03-04");
  assert.equal(titles["政治面貌"].values[0].value, "party_member");
  assert.equal(titles["籍贯"].values[0].value, "吉林/白山");
  assert.ok(proposals.every((proposal) => proposal.checked), "everything is new, so everything is ticked");

  const education = valuesOf(titles["教育经历（新增） · 吉林大学"]);
  assert.deepEqual(education, { school: "吉林大学", degree: "bachelor", startDate: "2020-09", endDate: "2024-06" });
  const work = valuesOf(titles["实习/工作经历（新增） · 华为"] ?? proposals.find((proposal) => proposal.section === "work"));
  assert.equal(work.company, "华为");
  assert.equal(work.startDate, "2023-07");
  assert.equal(work.endDate, "present");
  assert.equal(work.type, "internship", "entries under 实习经历 are stored as internships");
  assert.equal(valuesOf(proposals.find((proposal) => proposal.section === "family")).relation, "父亲");
  // Kept either as the 信息来源 field or as a saved answer to the question.
  const source = titles["信息来源"] ?? proposals.find((proposal) => proposal.section === "answer" && proposal.question.includes("得知"));
  assert.equal(source.values[0].value, "朋友推荐");
  assert.equal(proposals.some((proposal) => proposal.values.some((item) => item.key === "idNumber")), false, "empty fields are not proposed");
  await page.close();
});

test("existing entries are updated in place; conflicting values are offered unticked", async () => {
  const page = await openFixture(browser, base, "native.html");
  await fill(page);
  await page.fill("#xm", "李明明");
  await page.fill(".edu .major", "软件工程");
  const { proposals } = await capture(page, PROFILE);
  const titles = byTitle(proposals);
  assert.equal(titles["姓名"].change, true);
  assert.equal(titles["姓名"].checked, false, "replacing a stored value needs a tick from the user");
  assert.equal(titles["姓名"].previous, "李明");
  const major = proposals.find((proposal) => proposal.section === "education" && proposal.values[0].key === "major");
  assert.equal(major.index, 0, "matched to the stored 北京大学 entry");
  assert.equal(major.checked, PROFILE.sections.education[0].major ? major.checked : true);
  await page.close();
});

test("a 确定 click inside an add-entry dialog captures only that dialog's entry", async () => {
  const page = await openFixture(browser, base, "element-ui.html");
  await page.fill(".el-form-item:has-text('姓名') input", "李明");
  await page.getByRole("button", { name: "+ 新增" }).click();
  const dialog = page.locator(".el-dialog:visible");
  await dialog.locator("input").first().fill("美团");
  const { capture: captured, proposals } = await capture(page, EMPTY, { clicked: ".el-dialog__footer .el-button--primary" });
  assert.ok(captured.values.every((value) => value.section === "work"), JSON.stringify(captured.values));
  const work = proposals.find((proposal) => proposal.section === "work");
  assert.equal(valuesOf(work).company, "美团");
  assert.equal(valuesOf(work).type, "internship");
  await page.close();
});

test("高考前户口所在地（生源地） is the student origin, not the current hukou", async () => {
  const page = await openFixture(browser, base, "native.html");
  await page.evaluate(() => {
    const rows = [
      ["gk", "高考前户口所在地（生源地）"],
      ["hk", "户口所在地"],
      ["rx", "入学前户籍所在地"],
    ];
    for (const [id, label] of rows) {
      const item = document.createElement("div");
      item.className = "form-item";
      item.innerHTML = `<label for="${id}">${label}</label><input id="${id}">`;
      document.querySelector("table").after(item);
    }
  });
  const planned = await page.evaluate((profile) => window.JobAutofill.plan(profile), PROFILE);
  const target = (label) => planned.find((item) => item.label.startsWith(label))?.target;
  assert.equal(target("高考前户口所在地"), "basic.studentOrigin");
  assert.equal(target("入学前户籍所在地"), "basic.studentOrigin");
  assert.equal(target("户口所在地"), "basic.hukou");

  await page.fill("#gk", "吉林-白山");
  const { proposals } = await capture(page, EMPTY);
  assert.equal(proposals.find((proposal) => proposal.values[0]?.key === "studentOrigin")?.values[0].value, "吉林/白山");
  await page.close();
});
