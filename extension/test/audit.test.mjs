import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE, fill, launch, openFixture, startServer } from "./helpers.mjs";

let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });

async function capturePanel(page, applied) {
  await page.evaluate(async ([profile, applied]) => {
    window.saveCalls = 0;
    window.chrome.runtime = { async sendMessage(message) {
      if (message.type === "get-context") return { profile, settings: { langMode: "auto" }, online: true };
      if (message.type === "capture-all") return { schemaVersion: 2, lang: "zh", proposals: [{ id: "education:new:one", section: "education", index: null, values: [{ key: "school", value: "测试大学", lang: "zh" }], title: "测试教育", detail: "测试大学", change: false, checked: true }] };
      if (message.type === "save-capture") { window.saveCalls++; await new Promise(resolve => setTimeout(resolve, 100)); return { applied }; }
      return true;
    } };
    await window.JobAutofill.openPanel();
  }, [PROFILE, applied]);
  await page.getByRole("button", { name: "把本页填好的内容存入资料库" }).click();
}

test("double-clicking import never creates duplicate education entries", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await capturePanel(page, 1);
  await page.evaluate(() => {
    const button = document.querySelector("[data-jaf-ui]").shadowRoot.querySelector(".capture-actions .primary");
    button.click(); button.click();
  });
  await page.getByText(/已存入资料库/).waitFor();
  assert.equal(await page.evaluate(() => window.saveCalls), 1);
  await page.close();
});

test("an import that writes zero values reports the problem and keeps the review list", async () => {
  const page = await openFixture(browser, base, "labels.html");
  await capturePanel(page, 0);
  await page.getByRole("button", { name: "存入资料库（1 项）" }).click();
  await page.getByText(/本次未写入/).waitFor();
  assert.ok(await page.getByText("测试教育", { exact: true }).count());
  await page.close();
});

const data = { ...PROFILE, sections: { ...PROFILE.sections, education: [
  { degree: "master", school: { zh: "测试硕士大学" }, major: { zh: "硕士专业" }, startDate: "2025-06", endDate: "2027-06" },
  { degree: "bachelor", school: { zh: "测试本科大学" }, major: { zh: "本科专业" }, startDate: "2019-09", endDate: "2023-06" },
] } };

test("editing a preselected bachelor's education uses the bachelor's entire record", async () => {
  const page = await openFixture(browser, base, "zhaopin-education.html");
  await page.evaluate(() => { window.vm.entries.splice(1); window.vm.entries[0].degree = "bachelor"; });
  await fill(page, data);
  const entry = await page.evaluate(() => JSON.parse(JSON.stringify(window.vm.entries[0])));
  assert.deepEqual([entry.degree, entry.award, entry.school, entry.major, entry.start, entry.end], ["bachelor", "bachelor", "测试本科大学", "本科专业", "2019-09", "2023-06"]);
  await page.close();
});

test("a selected education level absent from the library never borrows another degree's record", async () => {
  const page = await openFixture(browser, base, "zhaopin-education.html");
  await page.evaluate(() => { window.vm.entries.splice(1); window.vm.entries[0].degree = "bachelor"; });
  const onlyMaster = { ...data, sections: { ...data.sections, education: data.sections.education.slice(0, 1) } };
  const report = await fill(page, onlyMaster);
  assert.equal(await page.evaluate(() => window.vm.entries[0].school), "");
  assert.ok(report.items.some(item => item.reason === "entry-not-in-profile"));
  await page.close();
});

test("conflicting 学历 and 学位 cannot be silently saved as a new education entry", async () => {
  const page = await openFixture(browser, base, "zhaopin-education.html");
  await page.evaluate(() => { window.vm.entries.splice(1); Object.assign(window.vm.entries[0], { degree: "master", award: "bachelor", school: "测试混合大学", major: "混合专业" }); });
  const { proposals } = await page.evaluate(() => window.JobAutofill.capture({ basic: {}, sections: {}, answers: [] }));
  const education = proposals.filter(item => item.section === "education");
  assert.equal(education.length, 1);
  assert.equal(education[0].blocked, true);
  assert.equal(education[0].checked, false);
  assert.deepEqual(education[0].values, []);
  await page.close();
});

test("ambiguous master's editors reserve only master's entries, even when bachelor is first", async () => {
  const page = await openFixture(browser, base, "zhaopin-education.html");
  const reordered = { ...data, sections: { ...data.sections, education: [data.sections.education[1], data.sections.education[0], { ...data.sections.education[0], school: { zh: "另一所硕士大学" } }] } };
  await page.evaluate(() => { window.vm.entries.forEach(entry => { entry.degree = "master"; }); });
  await fill(page, reordered);
  assert.deepEqual(await page.evaluate(() => window.vm.entries.map(entry => entry.school)), ["测试硕士大学", "另一所硕士大学"]);
  await page.close();
});

test("two degrees at the same school are distinguished from saved cards by start date", async () => {
  const page = await openFixture(browser, base, "zhaopin-education.html");
  const sameSchool = { ...data, sections: { ...data.sections, education: data.sections.education.map(entry => ({ ...entry, school: { zh: "同一所测试大学" } })) } };
  await page.evaluate(() => {
    window.vm.entries.splice(1);
    const card = document.createElement("p"); card.textContent = "同一所测试大学 · 硕士 · 2025-06 — 2027-06";
    document.querySelector("h3").after(card);
  });
  await fill(page, sameSchool);
  const entry = await page.evaluate(() => ({ school: window.vm.entries[0].school, degree: window.vm.entries[0].degree, start: window.vm.entries[0].start }));
  assert.deepEqual(entry, { school: "同一所测试大学", degree: "bachelor", start: "2019-09" });
  await page.close();
});

test("automatically added dialogs never click Submit or Apply", async () => {
  for (const label of ["Submit", "Apply", "提交"]) {
    const page = await openFixture(browser, base, "element-ui.html");
    await page.locator(".el-dialog .el-button--primary").evaluate((button, text) => { button.querySelector('span').textContent = text; }, label);
    const report = await fill(page, PROFILE);
    const state = await page.evaluate(() => ({ work: window.vm.form.work.length, dialog: window.vm.dialog, company: window.vm.draft.company }));
    assert.equal(state.work, 0, `${label} was clicked`);
    assert.equal(state.dialog, true);
    assert.ok(state.company);
    assert.ok(report.notes.some(note => /请点保存/.test(note)));
    await page.close();
  }
});
