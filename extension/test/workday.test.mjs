import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer, summarize } from "./helpers.mjs";

let browser, server, base;
before(async () => {
  ({ server, base } = await startServer());
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

test("English ATS (Workday style): English profile values, yes/no work rights, month/year parts, Add buttons", async () => {
  const page = await openFixture(browser, base, "workday.html");
  const report = await fill(page);
  if (process.env.DEBUG) console.log(summarize(report), report.notes, report.added);
  const value = (selector) => page.$eval(selector, (element) => element.value);
  const values = (selector) => page.$$eval(selector, (elements) => elements.map((element) => element.value));

  assert.equal(report.lang, "en");
  assert.equal(await value("#first"), "Ming");
  assert.equal(await value("#last"), "Li");
  assert.equal(await value("#email"), "liming@example.com");
  assert.equal(await value("#phone"), "0412 345 678");
  assert.equal(await value("#salary"), "AUD 75,000");
  assert.equal(await page.$eval("input[name=rights][value=yes]", (element) => element.checked), true);
  assert.equal(await page.$eval("input[name=spons][value=no]", (element) => element.checked), true);

  assert.deepEqual(await values(".work .company"), ["ByteDance", "Tencent"]);
  assert.deepEqual(await values(".work .title"), ["Backend Intern", "QA Intern"]);
  assert.deepEqual(await values(".work .from-m"), ["06", "07"]);
  assert.deepEqual(await values(".work .from-y"), ["2025", "2024"]);
  assert.deepEqual(await values(".work .to-y"), ["", "2024"]);
  assert.deepEqual(await page.$$eval(".work .current", (elements) => elements.map((element) => element.checked)), [true, false]);
  assert.deepEqual(await values(".work .desc"), ["Built recommendation APIs.", "Wrote automated tests."]);

  assert.deepEqual(await values(".edu .school"), ["Peking University", "Zhejiang University"]);
  assert.deepEqual(await page.$$eval(".edu .degree", (elements) => elements.map((element) => element.dataset.value)), ["Master's Degree", "Bachelor's Degree"]);
  assert.deepEqual(await values(".edu .major"), ["Computer Science", "Software Engineering"]);
  assert.equal(await page.$eval("#cv", (element) => element.files[0]?.name), "resume_en.pdf");
  assert.equal(await page.$eval("#terms", (element) => element.checked), false);
  assert.deepEqual(page.errors, []);
});
