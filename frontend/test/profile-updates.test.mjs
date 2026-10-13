import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../../extension/package.json", import.meta.url));
const { build } = require("esbuild");
const compiled = await build({ entryPoints: [fileURLToPath(new URL("../src/profileUpdates.ts", import.meta.url))], bundle: true, write: false, platform: "node", format: "esm" });
const { applyTranslation, applyAnswerDraft, mergeConcurrent } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const a = { school: { zh: "甲大学" }, major: { zh: "甲专业" } };
const b = { school: { zh: "乙大学" }, major: { zh: "乙专业" } };
const before = { basic: { name: { zh: "测试名字" }, phone: "111" }, sections: { education: [a, b] }, answers: [], settings: { fillSensitive: false } };
const result = { ...before, basic: { ...before.basic, name: { zh: "测试名字", en: "Test Name" } }, sections: { education: [{ school: { zh: "甲大学", en: "University A" }, major: { zh: "甲专业", en: "Major A" } }, { school: { zh: "乙大学", en: "University B" }, major: { zh: "乙专业", en: "Major B" } }] } };

test("delayed translation preserves newer basic edits and adds only unchanged translations", () => {
  const current = { ...before, basic: { name: { zh: "修改后的名字" }, phone: "222" } };
  const merged = applyTranslation(current, before, result, "en");
  assert.deepEqual(merged.profile.basic, current.basic);
  assert.equal(merged.profile.sections.education[0].school.en, "University A");
});
test("translation follows reordered entries and never restores a deleted entry", () => {
  const reordered = applyTranslation({ ...before, sections: { education: [b, a] } }, before, result, "en");
  assert.deepEqual(reordered.profile.sections.education.map(entry => entry.school.en), ["University B", "University A"]);
  const deleted = applyTranslation({ ...before, sections: { education: [b] } }, before, result, "en");
  assert.equal(deleted.profile.sections.education.length, 1);
  assert.equal(deleted.profile.sections.education[0].school.en, "University B");
});
test("translation does not overwrite edited entries or manually entered target text", () => {
  const edited = { ...a, major: { zh: "修改后的专业" } };
  const merged = applyTranslation({ ...before, basic: { ...before.basic, name: { zh: "测试名字", en: "My Own Name" } }, sections: { education: [edited, b] } }, before, result, "en");
  assert.equal(merged.profile.basic.name.en, "My Own Name");
  assert.deepEqual(merged.profile.sections.education[0], edited);
});
test("empty draft entries removed by backend normalization never receive another entry's translation", () => {
  const withEmpty = { ...before, sections: { education: [{}, a, b] } };
  const merged = applyTranslation(withEmpty, withEmpty, result, "en");
  assert.deepEqual(merged.profile.sections.education[0], {});
  assert.deepEqual(merged.profile.sections.education.slice(1).map(entry => entry.school.en), ["University A", "University B"]);
});
test("delayed answer drafts preserve manual changes and deleted questions", () => {
  const original = { id: "one", question: "Why?", answer: "" };
  assert.equal(applyAnswerDraft([{ ...original, answer: "My own answer" }], original, "AI answer").applied, false);
  assert.equal(applyAnswerDraft([{ ...original, question: "Changed?" }], original, "AI answer").applied, false);
  assert.deepEqual(applyAnswerDraft([], original, "AI answer").answers, []);
  assert.equal(applyAnswerDraft([original], original, "AI answer").answers[0].answer, "AI answer");
});

test("conflict merge keeps local edits and adds what the extension saved meanwhile", () => {
  const settings = { fillSensitive: false };
  const answer = (id, text) => ({ id, question: `问题${id}`, answer: text });
  const base = { basic: { phone: "111", email: "old@a.com" }, sections: { education: [a], work: [] }, answers: [answer("1", "旧"), answer("2", "保留")], settings, updatedAt: "r1" };
  const local = { ...base, basic: { phone: "222" }, sections: { education: [a, b], work: [] }, answers: [answer("3", "新问"), answer("1", "我改的")] };
  const server = { ...base, basic: { phone: "111", email: "old@a.com", wechat: "wx" }, sections: { education: [a, { school: { zh: "丙大学" } }], work: [{ company: { zh: "插件新增公司" } }] },
    answers: [answer("1", "旧"), answer("2", "保留"), answer("4", "插件学到")], updatedAt: "r2" };
  const merged = mergeConcurrent(base, local, server);
  assert.deepEqual(merged.basic, { phone: "222", wechat: "wx" });
  assert.deepEqual(merged.sections.education, [a, b, { school: { zh: "丙大学" } }]);
  assert.deepEqual(merged.sections.work, [{ company: { zh: "插件新增公司" } }]);
  assert.deepEqual(merged.answers.map(item => [item.id, item.answer]), [["3", "新问"], ["1", "我改的"], ["4", "插件学到"]]);
  assert.equal(merged.updatedAt, "r2");
});

test("conflict merge never duplicates an entry the extension changed while the user edited another one", () => {
  const settings = { fillSensitive: false };
  const e1 = { company: { zh: "甲公司" }, description: { zh: "旧描述" } };
  const e2 = { company: { zh: "乙公司" } };
  const base = { basic: {}, sections: { work: [e1, e2] }, answers: [], settings, updatedAt: "r1" };
  const local = { ...base, sections: { work: [{ ...e1, description: { zh: "网页端改的描述" } }, e2] } };
  // The server sends keys in its own order; equal entries must still be recognized.
  const server = { ...base, sections: { work: [{ description: { zh: "旧描述" }, company: { zh: "甲公司" } }, { ...e2, companyType: "private" }] }, updatedAt: "r2" };
  assert.deepEqual(mergeConcurrent(base, local, server).sections.work, [
    { company: { zh: "甲公司" }, description: { zh: "网页端改的描述" } },
    { company: { zh: "乙公司" }, companyType: "private" },
  ]);
  // Both sides changed the same entry: the user's field wins, the extension's other field is kept.
  const both = { ...base, sections: { work: [{ ...e1, description: { zh: "插件写入" }, title: { zh: "开发工程师" } }, e2] }, updatedAt: "r2" };
  assert.deepEqual(mergeConcurrent(base, local, both).sections.work, [{ ...e1, description: { zh: "网页端改的描述" }, title: { zh: "开发工程师" } }, e2]);
  // A deleted entry stays deleted even if the extension changed it meanwhile.
  assert.deepEqual(mergeConcurrent(base, { ...base, sections: { work: [e1] } }, server).sections.work, [e1]);
});
