import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer } from "./helpers.mjs";

let browser, server, base;
before(async () => { ({ server, base } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });

async function pageWith(html) {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate(markup => { document.body.innerHTML = markup; }, html);
  return page;
}

const checked = (page, id) => page.$eval(`#${id}`, element => element.checked);

test("commitment and negated checkboxes are never ticked; the user's own choice survives a refill", async () => {
  const profile = { basic: { hasCriminalRecord: "yes", hasDriverLicense: "yes" }, sections: {}, answers: [] };
  const page = await pageWith(`<h3>声明</h3>
    <div><label><input type="checkbox" id="clean">本人承诺无违法违纪行为</label></div>
    <div><label><input type="checkbox" id="agree">本人已阅读并同意以上声明</label></div>
    <div><label><input type="checkbox" id="licence">有驾照</label></div>`);
  const report = await fill(page, profile);
  assert.equal(await checked(page, "clean"), false, JSON.stringify(report.items));
  assert.equal(await checked(page, "agree"), false);
  assert.equal(await checked(page, "licence"), true);
  // The user unticks what we ticked: the next fill leaves it alone, as it does a box the user ticked.
  await page.click("#licence");
  await fill(page, { ...profile, basic: { hasDriverLicense: "yes" } });
  assert.equal(await checked(page, "licence"), false);
  await page.close();
});

test("minimum lengths are not limits; ranges give both, and rich-text boxes are cut at a sentence end", async () => {
  const sentence = "我做事认真负责，善于沟通协作。";
  const data = { basic: { careerPlan: { zh: sentence.repeat(4) }, selfEvaluation: { zh: sentence.repeat(4) }, skills: { zh: sentence.repeat(4) } }, sections: {}, answers: [] };
  const page = await pageWith(`<h3>自我评价</h3>
    <div class="form-item"><label for="plan">职业规划（不少于30字）</label><textarea id="plan"></textarea></div>
    <div class="form-item"><label for="self">自我评价（字数在20-40字之间）</label><textarea id="self"></textarea></div>
    <div class="form-item"><label>专业技能（不超过30字）</label><div contenteditable="true" id="skills"></div></div>`);
  const report = await fill(page, data);
  assert.equal(await page.$eval("#plan", element => element.value), sentence.repeat(4), "a minimum never truncates");
  const self = await page.$eval("#self", element => element.value);
  assert.ok(self.length <= 40 && self.endsWith("。"), self);
  const item = report.items.find(entry => entry.label.startsWith("自我评价"));
  assert.deepEqual([item.minLength, item.maxLength], [20, 40]);
  assert.equal(report.items.find(entry => entry.label.startsWith("职业规划")).minLength, 30);
  const skills = await page.$eval("#skills", element => element.textContent);
  assert.ok(skills.length <= 30 && skills.endsWith("。"), skills);
  await page.close();
});

test("graduation date stays empty while the latest programme is still running", async () => {
  const education = [
    { school: { zh: "测试大学" }, degree: "bachelor", startDate: "2019-09", endDate: "2023-06" },
    { school: { zh: "测试大学" }, degree: "master", startDate: "2024-09", endDate: "present" },
  ];
  const page = await pageWith('<div class="form-item"><label for="g">毕业时间</label><input id="g"></div>');
  await fill(page, { basic: {}, sections: { education }, answers: [] });
  assert.equal(await page.$eval("#g", element => element.value), "");
  await page.evaluate(() => { document.querySelector("#g").value = ""; });
  await fill(page, { basic: {}, sections: { education: [education[0], { ...education[1], endDate: "2026-06" }] }, answers: [] });
  assert.equal(await page.$eval("#g", element => element.value), "2026-06");
  await page.close();
});
