import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fill, launch, openFixture, startServer } from "./helpers.mjs";

let browser, server, base;
before(async () => {
  ({ server, base } = await startServer());
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

const DATA = { basic: {
  address: { zh: "10 Test St", en: "10 Test St" }, postcode: { zh: "2000", en: "2000" },
  mailingAddress: { zh: "通讯路1号", en: "1 Mailing Rd" }, mailingPostcode: "100000",
  homeAddress: { zh: "家庭路2号", en: "2 Home Rd" }, homePostcode: "200001",
  expectedCity: { zh: "北京" },
}, sections: {}, answers: [] };

const item = (id, label, attributes = "") => `<div class="form-item"><label for="${id}">${label}</label><input id="${id}" ${attributes}></div>`;
async function pageWith(html) {
  const page = await openFixture(browser, base, "labels.html");
  await page.evaluate((markup) => { document.body.innerHTML = markup; }, html);
  return page;
}
const capture = (page, data) => page.evaluate((data) => window.JobAutofill.capture(data), data);

test("Zhaopin contact capture: domestic address/postcode are new correspondence data, not residence conflicts", async () => {
  const page = await pageWith("<h3>基本信息</h3>" + item("zip", "邮编") + item("address", "详细地址") + item("exam", "考试意向城市") + item("relation", "紧急联系人与本人关系"));
  await page.fill("#zip", "100000");
  await page.fill("#address", "通讯路1号");
  await page.fill("#exam", "上海");
  await page.fill("#relation", "母亲");
  const data = { ...DATA, basic: { address: DATA.basic.address, postcode: DATA.basic.postcode, expectedCity: DATA.basic.expectedCity } };
  const { proposals } = await capture(page, data);
  assert.deepEqual(proposals.flatMap((p) => p.values.map((v) => v.key)).sort(), ["mailingPostcode", "mailingAddress", "examCity", "emergencyRelation"].sort());
  assert.ok(proposals.every((p) => p.checked && !p.change && !p.previous));
  assert.deepEqual(proposals.map((p) => p.title).sort(), ["通讯地址邮编", "通讯详细地址", "考试意向城市", "与紧急联系人关系"].sort());
  await page.close();
});

test("three address blocks with generic labels fill and capture their own address and postcode", async () => {
  const html = ["现居地址", "通讯地址", "家庭地址"].map((name, i) => `<fieldset><legend>${name}</legend>${item(`a${i}`, "详细地址")}${item(`p${i}`, "邮编", 'autocomplete="postal-code"')}</fieldset>`).join("");
  const page = await pageWith(html);
  await fill(page, DATA);
  assert.deepEqual(await page.locator("input").evaluateAll((inputs) => inputs.map((input) => input.value)), ["10 Test St", "2000", "通讯路1号", "100000", "家庭路2号", "200001"]);
  assert.deepEqual((await capture(page, DATA)).proposals, []);
  await page.close();
});

test("missing correspondence data never falls back to residence, even with address autocomplete", async () => {
  const page = await pageWith(item("a", "详细地址", 'autocomplete="street-address"') + item("p", "邮编", 'autocomplete="postal-code"') + item("r", "现居地址"));
  await fill(page, { ...DATA, basic: { address: DATA.basic.address, postcode: DATA.basic.postcode } });
  assert.equal(await page.inputValue("#a"), "");
  assert.equal(await page.inputValue("#p"), "");
  assert.equal(await page.inputValue("#r"), "10 Test St");
  await page.close();
});

test("default address purpose is configurable and independent of the page language", async () => {
  const page = await pageWith(item("a", "Street address") + item("p", "Postal code") + item("mail", "Mailing address", 'autocomplete="street-address"'));
  await fill(page, { ...DATA, basic: { ...DATA.basic, preferredAddressUse: "current" } }, { lang: "en" });
  assert.deepEqual(await page.locator("input").evaluateAll((inputs) => inputs.map((input) => input.value)), ["10 Test St", "2000", "1 Mailing Rd"]);
  const next = await pageWith(item("a", "Street address") + item("p", "Postal code"));
  await fill(next, DATA, { lang: "en" });
  assert.deepEqual(await next.locator("input").evaluateAll((inputs) => inputs.map((input) => input.value)), ["1 Mailing Rd", "100000"]);
  await page.close();
  await next.close();
});

test("province/city/district dropdowns use the region of the matching address purpose", async () => {
  const page = await pageWith(`<div class="form-item"><label>通讯地址</label>
    <select id="province"><option value="">请选择</option><option>吉林省</option></select>
    <select id="city"><option value="">请选择</option><option>白山市</option></select>
    <select id="district"><option value="">请选择</option><option>抚松县</option></select><input id="detail">
  </div>`);
  const data = { ...DATA, basic: { ...DATA.basic, addressRegion: { zh: "澳大利亚/新南威尔士州/悉尼" }, mailingAddressRegion: { zh: "吉林省/白山市/抚松县" } } };
  await fill(page, data);
  assert.deepEqual(await page.locator("select").evaluateAll((selects) => selects.map((select) => select.value)), ["吉林省", "白山市", "抚松县"]);
  assert.equal(await page.inputValue("#detail"), "通讯路1号");
  assert.deepEqual((await capture(page, data)).proposals, []);
  await page.close();
});

test("a changed residence is still a real conflict requiring an explicit tick", async () => {
  const page = await pageWith(item("a", "现居地址"));
  await page.fill("#a", "20 New St");
  const { proposals } = await capture(page, DATA);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].values[0].key, "address");
  assert.equal(proposals[0].previous, "10 Test St");
  assert.equal(proposals[0].checked, false);
  await page.close();
});

test("current city and stale site mappings do not turn a generic contact address into residence", async () => {
  const page = await pageWith(item("city", "现居住地") + item("zip", "邮编") + item("address", "详细地址"));
  const planned = await page.evaluate((data) => window.JobAutofill.plan(data, { legacyMemory: true, memory: { "邮编": "basic.postcode", "详细地址": "basic.address" } }), DATA);
  assert.deepEqual(planned.map((item) => item.target), ["basic.currentCity", "basic.mailingPostcode", "basic.mailingAddress"]);
  await page.close();
});

test("new manual mappings and explicit skip choices are respected after the schema update", async () => {
  const page = await pageWith(item("zip", "邮编") + item("address", "详细地址"));
  const planned = await page.evaluate((data) => window.JobAutofill.plan(data, { memory: { "邮编": "basic.postcode", "详细地址": "skip" } }), DATA);
  assert.equal(planned[0].target, "basic.postcode");
  assert.equal(planned[1].target, undefined);
  await page.close();
});

test("ambiguous address purposes and other people's details never take the user's residence", async () => {
  const page = await pageWith(item("ambiguous", "现居地址/通讯地址") + item("company", "公司地址", 'autocomplete="street-address"') + "<h3>家庭成员</h3>" + item("parentzip", "邮编", 'autocomplete="postal-code"') + item("parentaddress", "地址", 'autocomplete="street-address"'));
  await fill(page, DATA);
  assert.deepEqual(await page.locator("input").evaluateAll((inputs) => inputs.map((input) => input.value)), ["", "", "", ""]);
  assert.deepEqual(page.errors, []);
  await page.close();
});
