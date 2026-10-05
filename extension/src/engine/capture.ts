// Reads what the user typed into an application form and turns it into profile updates,
// so filling two or three applications by hand builds up the profile library.
import { PRESENT, SCHEMA, basicField, sectionDef, type FieldDef, type FieldValue, type Lang, type ProfileData } from "../../../shared/profileSchema";
import { matchAnswer } from "./classify";
import type { Control } from "./discover";
import { isVisible, textOf } from "./dom";
import { detectLang, plan, PRIMARY_KEYS, type Planned } from "./engine";
import { choiceLabel, hasValue } from "./fillers";
import { enumValueOf } from "./options";
import { visibleDialogs } from "./repeat";
import { BASIC_SECTION, matchHeadingText, OTHER_SECTION, type WorkVariant } from "./sections";
import { compact, hasCJK, normalizeLabel, toHalfWidth } from "./text";
import { splitRegion } from "./values";

export interface CapturedValue {
  section: string;
  key: string;
  entry: number;
  variant: WorkVariant;
  value: string;
  label: string;
}

export interface CapturedAnswer {
  question: string;
  answer: string;
}

export interface PageCapture {
  lang: Lang;
  values: CapturedValue[];
  answers: CapturedAnswer[];
}

export interface ProposalValue {
  key: string;
  value: string;
  lang: Lang;
}

/** One suggested change to the profile, shown to the user before saving. */
export interface Proposal {
  id: string;
  /** "basic", a section key, or "answer". */
  section: string;
  /** Profile entry to update; null adds a new entry. */
  index: number | null;
  values: ProposalValue[];
  question?: string;
  title: string;
  detail: string;
  previous?: string;
  /** Replaces a value that is already in the profile. */
  change: boolean;
  checked: boolean;
}

export interface CapturePayload {
  basic: ProposalValue[];
  entries: { section: string; index: number | null; values: ProposalValue[] }[];
  answers: { question: string; answer: string; lang: Lang }[];
}

// ---------------------------------------------------------------- reading widgets

const PLACEHOLDER = /^(请选择|请输入|请填写|请选择\.\.\.|--+.*|select|select\.\.\.|choose|please select|please choose|none selected)$/i;
const OTHER = /^(其他|其它|other|others)$/i;
const TAG_TEXT =
  ".el-select__tags-text, .el-tag__content, .ant-select-selection-item-content, .select2-selection__choice__display, .vs__selected, .ivu-tag-text, .arco-tag-content, .t-tag__text, .chosen-choices .search-choice span";
const SINGLE_TEXT =
  ".ant-select-selection-item, .ivu-select-selected-value, .select2-selection__rendered, .chosen-single span, .el-select__selected-item:not(.is-transparent) > span, .el-select__placeholder:not(.is-transparent), .arco-select-view-value, .t-input__inner";
const ACTIVE_CHOICE = /(is-active|is-checked|checked|selected|active)/;

function usable(text: string | null | undefined): string {
  const value = (text ?? "").replace(/ /g, " ").trim();
  return value && !PLACEHOLDER.test(value.replace(/\s+/g, "")) ? value : "";
}

function selectText(select: HTMLSelectElement): string {
  return Array.from(select.selectedOptions)
    .filter((option) => option.value !== "" || option.textContent?.trim())
    .map((option) => usable(option.textContent))
    .filter(Boolean)
    .join("、");
}

function uniqueTexts(elements: Element[]): string[] {
  const texts = elements.filter((element) => isVisible(element) || element.textContent?.trim()).map((element) => usable((element.getAttribute("title") || element.textContent || "").replace(/^×\s*/, "")));
  return texts.filter((text, index) => text && texts.indexOf(text) === index);
}

/** The value a widget currently shows, as display text ("" when empty). */
export function readControl(control: Control): string {
  switch (control.kind) {
    case "file":
    case "checkbox":
      return "";
    case "native-select":
      return selectText(control.input as HTMLSelectElement);
    case "radio-group": {
      const checked = control.members?.find((member) => member.checked);
      if (checked) return usable(choiceLabel(checked));
      const active = control.choiceItems?.find((item) => ACTIVE_CHOICE.test(item.className) || item.getAttribute("aria-checked") === "true");
      return active ? usable(textOf(active, 80)) : "";
    }
    case "checkbox-group":
      return (control.members ?? [])
        .filter((member) => member.checked)
        .map((member) => usable(choiceLabel(member)))
        .filter(Boolean)
        .join("、");
    case "custom-select":
    case "cascader": {
      if (!hasValue(control)) return "";
      const tags = uniqueTexts(Array.from(control.root.querySelectorAll(TAG_TEXT)));
      if (tags.length) return tags.join("、");
      const input = control.root.querySelector<HTMLInputElement>("input:not([type=hidden])");
      const typed = usable(input?.value);
      if (typed) return typed;
      const single = uniqueTexts(Array.from(control.root.querySelectorAll(SINGLE_TEXT)));
      if (single.length) return single[0];
      if (control.input instanceof HTMLSelectElement) return selectText(control.input);
      const shown = usable(textOf(control.root, 200));
      return shown === usable(input?.placeholder) ? "" : shown;
    }
    case "contenteditable":
      return usable(control.root.innerText ?? control.root.textContent);
    case "date-range":
      return (control.rangeInputs ?? []).map((input) => input.value.trim()).filter(Boolean).join(" ~ ");
    default:
      return usable((control.input as HTMLInputElement | HTMLTextAreaElement | undefined)?.value);
  }
}

const PRESENT_TEXT = /^(至今|至 今|目前|当前|现在|今|在读|在职|present|current|currently|now|ongoing|till now|to date)$/i;
const PRESENT_TOGGLE = /^(至今|目前|当前|现在|在读|在职|仍在职|present|current|now|ongoing|till now|to date|i currently (work|study) here|currently (working|studying) here|still (working|studying))$/i;

function presentTicked(container: Element | null): boolean {
  let scope: Element | null = container;
  for (let depth = 0; depth < 3 && scope; depth += 1) {
    const toggles = Array.from(scope.querySelectorAll("label, .el-checkbox, .ant-checkbox-wrapper, .ivu-checkbox-wrapper, [role=checkbox]"));
    const toggle = toggles.find((element) => PRESENT_TOGGLE.test(normalizeLabel(textOf(element, 40))));
    if (toggle) {
      const box = toggle.querySelector<HTMLInputElement>("input[type=checkbox], input[type=radio]");
      return box ? box.checked : toggle.getAttribute("aria-checked") === "true" || /is-checked|checked/.test(toggle.className);
    }
    scope = scope.parentElement;
  }
  return false;
}

// ---------------------------------------------------------------- converting to stored values

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function dateText(year: string, month?: string, day?: string): string | null {
  const y = Number(year);
  if (y < 1940 || y > 2100) return null;
  if (!month) return String(y);
  const m = Number(month);
  if (m < 1 || m > 12) return null;
  const mm = String(m).padStart(2, "0");
  if (!day) return `${y}-${mm}`;
  const d = Number(day);
  if (d < 1 || d > 31) return `${y}-${mm}`;
  return `${y}-${mm}-${String(d).padStart(2, "0")}`;
}

/** "2020年9月", "2020/09/01", "09/2020", "1 Sep 2020", "至今" -> "2020-09", "2020-09-01", "present". */
export function parseLooseDate(raw: string): string | null {
  const text = toHalfWidth(raw).trim().toLowerCase();
  if (!text) return null;
  if (PRESENT_TEXT.test(text)) return PRESENT;
  let match = /^(\d{4})\s*[-/.年]\s*(\d{1,2})(?:\s*[-/.月]\s*(\d{1,2}))?/.exec(text);
  if (match) return dateText(match[1], match[2], match[3]);
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) return dateText(match[3], match[2], match[1]);
  match = /^(\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) return dateText(match[2], match[1]);
  match = /^(?:(\d{1,2})\s+)?([a-z]{3})[a-z]*\.?,?\s+(?:(\d{1,2}),?\s+)?(\d{4})$/.exec(text);
  if (match && MONTH_NAMES.includes(match[2])) return dateText(match[4], String(MONTH_NAMES.indexOf(match[2]) + 1), match[1] ?? match[3]);
  match = /^(\d{4})(\d{2})(\d{2})?$/.exec(text);
  if (match) return dateText(match[1], match[2], match[3]);
  match = /^(\d{4})\s*年?$/.exec(text);
  if (match) return dateText(match[1]);
  return null;
}

/** "2019.09 - 2023.06" typed into one box -> [start, end]. */
function splitDateRange(raw: string): [string, string] | null {
  const parts = toHalfWidth(raw).split(/\s*(?:~|～|至|到|—|–|\bto\b|\s-\s)\s*/i).filter(Boolean);
  if (parts.length === 1) {
    const dashed = /^(\d{4}[./]\d{1,2})-(\d{4}[./]\d{1,2}|至今|present)$/i.exec(raw.trim());
    if (dashed) parts.splice(0, 1, dashed[1], dashed[2]);
  }
  if (parts.length !== 2) return null;
  const start = parseLooseDate(parts[0]);
  const end = parseLooseDate(parts[1]);
  return start && end && start !== PRESENT ? [start, end] : null;
}

const PASS_THROUGH = /^(市辖区|市辖县|县|省直辖县级行政区划|自治区直辖县级行政区划)$/;

/** Display text of a widget -> the value format the profile stores, or null when it does not fit. */
export function toStored(field: FieldDef, raw: string): string | null {
  const text = field.type === "longtext" ? raw.trim() : raw.replace(/\s+/g, " ").trim();
  if (!text || text.length > 8000 || OTHER.test(text)) return null;
  switch (field.type) {
    case "enum":
      return field.enum ? enumValueOf(field.enum, text) : null;
    case "date":
    case "month": {
      const date = parseLooseDate(text);
      if (!date) return null;
      return field.type === "month" && date !== PRESENT ? date.slice(0, 7) : date;
    }
    case "region": {
      // Cascaders show pass-through levels ("北京市 / 市辖区 / 海淀区") that people do not write down.
      const parts = splitRegion(text).filter((part) => !PASS_THROUGH.test(part));
      return parts.length ? parts.join("/") : null;
    }
    case "email":
      return /\S+@\S+\.\S+/.test(text) ? text : null;
    default:
      return text;
  }
}

// ---------------------------------------------------------------- capturing a page

function dialogSection(dialog: Element): { section: string; variant: WorkVariant } | null {
  const titles = dialog.querySelectorAll(".el-dialog__title, .ant-modal-title, .ivu-modal-header-inner, .layui-layer-title, .arco-modal-title, .t-dialog__header, .modal-title, .el-drawer__header, h1, h2, h3, h4, header, [class*=title]");
  for (const title of Array.from(titles).slice(0, 8)) {
    const text = textOf(title, 40).replace(/^(\+|＋)?\s*(添加|新增|增加|编辑|修改|完善|填写|add|edit|new)\s*/i, "");
    const pattern = matchHeadingText(text);
    if (pattern && pattern.section !== BASIC_SECTION && pattern.section !== OTHER_SECTION) return { section: pattern.section, variant: pattern.internship ? "internship" : "all" };
  }
  return null;
}

const JUNK_LABEL = /验证码|校验码|captcha|搜索|search|关键字|关键词|keyword|密码|password|用户名|账号|account|登录|login|筛选|filter|排序|sort|分页|每页|page/i;

export interface CaptureOptions {
  /** The button the user clicked; a surrounding dialog limits the capture to that dialog. */
  clicked?: Element | null;
  memory?: Map<string, string>;
  lang?: Lang | "auto";
}

export function capturePage(profile: ProfileData, options: CaptureOptions = {}): PageCapture {
  const dialogs = options.clicked ? visibleDialogs().filter((dialog) => dialog.contains(options.clicked!)) : [];
  const dialog = dialogs.find((candidate) => !dialogs.some((other) => other !== candidate && other.contains(candidate))) ?? null;
  const forced = dialog ? dialogSection(dialog) : null;
  const { planned } = plan(dialog ?? document, { profile, memory: options.memory, forcedSection: forced?.section, forcedVariant: forced?.variant });
  const lang = options.lang && options.lang !== "auto" ? options.lang : detectLang(planned);

  const values: CapturedValue[] = [];
  const answers: CapturedAnswer[] = [];
  const push = (item: Planned, section: string, key: string, value: string) =>
    values.push({ section, key, entry: item.entry, variant: item.context.variant, value, label: item.info.label || item.info.placeholder });
  const dateParts = new Map<Element, { item: Planned; section: string; key: string; parts: Partial<Record<"year" | "month" | "day", string>> }>();
  const regionParts = new Map<Element, { item: Planned; section: string; key: string; parts: string[] }>();

  for (const item of planned) {
    const { control, target } = item;
    if (control.kind === "file" || control.kind === "checkbox" || target?.scope === "attachment") continue;
    if (!isVisible(control.root)) continue;
    const raw = readControl(control);

    if (target?.scope === "field") {
      const { section, field } = target;
      const container = item.info.container ?? control.root;
      if (control.kind === "date-range") {
        const [start, end] = (control.rangeInputs ?? []).map((input) => parseLooseDate(input.value));
        if (start) push(item, section, "startDate", start);
        if (end) push(item, section, "endDate", end);
        else if (start && presentTicked(container)) push(item, section, "endDate", PRESENT);
        continue;
      }
      if (item.part) {
        const group = dateParts.get(container) ?? { item, section, key: target.key, parts: {} };
        const digits = /\d{1,4}/.exec(raw)?.[0];
        if (digits) group.parts[item.part] = digits;
        dateParts.set(container, group);
        continue;
      }
      if (item.regionPart !== undefined) {
        const group = regionParts.get(container) ?? { item, section, key: target.key, parts: [] };
        if (raw) group.parts[item.regionPart] = raw;
        regionParts.set(container, group);
        continue;
      }
      if (!raw) {
        if (target.key === "endDate" && presentTicked(container)) push(item, section, "endDate", PRESENT);
        continue;
      }
      if (field.derived && field.key !== "firstName" && field.key !== "lastName") continue;
      if (target.key === "startDate") {
        const range = splitDateRange(raw);
        if (range) {
          push(item, section, "startDate", range[0]);
          push(item, section, "endDate", range[1]);
          continue;
        }
      }
      const stored = toStored(field, raw);
      if (stored !== null) push(item, section, target.key, stored);
      // A basic yes/no or choice that does not fit the profile's options is still worth keeping as an answer.
      else if (section === BASIC_SECTION && field.type === "enum" && !OTHER.test(raw)) answers.push({ question: item.info.label || item.info.placeholder, answer: raw });
      continue;
    }

    if (!raw || OTHER.test(raw)) continue;
    if (target?.scope === "answer") {
      answers.push({ question: target.answer.question, answer: raw });
      continue;
    }
    // Unrecognized fields: keep site-wide questions ("从哪里得知招聘信息") as answers, not per-entry details.
    if (item.context.section && item.context.section !== BASIC_SECTION) continue;
    const question = (item.info.label || item.info.placeholder).trim();
    if (question.length < 2 || question.length > 300 || JUNK_LABEL.test(question) || raw.length > 5000) continue;
    answers.push({ question, answer: raw });
  }

  dateParts.forEach(({ item, section, key, parts }) => {
    if (!parts.year) return;
    const date = dateText(parts.year, parts.month, parts.day);
    if (date) push(item, section, key, date);
  });
  regionParts.forEach(({ item, section, key, parts }) => {
    const filled = parts.filter(Boolean);
    if (filled.length) push(item, section, key, filled.join("/"));
  });
  return { lang, values, answers };
}

// ---------------------------------------------------------------- comparing with the profile

function norm(text: string): string {
  return compact(toHalfWidth(text).toLowerCase()).replace(/[.。:：;；!！?？'"“”‘’]/g, "");
}

function ownValue(value: FieldValue | undefined, field: FieldDef, lang: Lang): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return field.localized && lang === "en" ? "" : value;
  return field.localized ? value[lang] ?? "" : value.zh ?? value.en ?? "";
}

/** English pages often still hold Chinese text (e.g. a Chinese company name); store that as Chinese. */
function slotLang(field: FieldDef, value: string, lang: Lang): Lang {
  return field.localized && lang === "en" && hasCJK(value) ? "zh" : lang;
}

type Comparison = "same" | "new" | "richer" | "different";

/** "广东省/深圳市/南山区", "广东省深圳市南山区" and "广东 / 深圳 / 南山" all become "广东深圳南山". */
function regionKey(value: string): string {
  return splitRegion(value)
    .filter((part) => !PASS_THROUGH.test(part))
    .map((part) => norm(part).replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|省|市|区|县)/g, ""))
    .join("");
}

function compare(current: string, next: string, field: FieldDef): Comparison {
  if (!current.trim()) return "new";
  switch (field.type) {
    case "date":
    case "month":
      if (current === next || current.startsWith(next)) return "same";
      return next.startsWith(current) ? "richer" : "different";
    case "region": {
      const a = regionKey(current);
      const b = regionKey(next);
      // "广东/深圳" on the page vs "广东省/深圳市/南山区" stored: same place, less detail.
      if (a.startsWith(b)) return "same";
      return b.startsWith(a) ? "richer" : "different";
    }
    case "longtext": {
      const a = norm(current);
      const b = norm(next);
      // Shorter than what is stored (cut to the site's length limit): keep the profile.
      if (a === b || a.includes(b)) return "same";
      return b.includes(a) ? "richer" : "different";
    }
    default:
      return norm(current) === norm(next) ? "same" : "different";
  }
}

function display(field: FieldDef, value: string, lang: Lang): string {
  if (field.type === "enum") return (SCHEMA.enums[field.enum ?? ""] ?? []).find((option) => option.value === value)?.[lang] ?? value;
  if (value === PRESENT) return lang === "zh" ? "至今" : "Present";
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

function sameEntry(entryValue: FieldValue | undefined, captured: string): boolean {
  const wanted = norm(captured);
  if (wanted.length < 2) return false;
  const stored = typeof entryValue === "string" ? [entryValue] : [entryValue?.zh ?? "", entryValue?.en ?? ""];
  return stored.map(norm).some((value) => value.length >= 2 && (value === wanted || value.includes(wanted) || wanted.includes(value)));
}

function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/[\s*:：?？。.,，、()（）[\]【】\-_/]+/g, "");
}

/** Proposed profile updates for what was captured: new values, richer values and (unticked) conflicts. */
export function diffCapture(profile: ProfileData, capture: PageCapture): Proposal[] {
  const { lang } = capture;
  const proposals: Proposal[] = [];

  // Basic fields: last captured value wins.
  const basic = new Map<string, string>();
  capture.values
    .filter((value) => value.section === BASIC_SECTION)
    // Filled from a saved answer (e.g. 信息来源 <- "从哪里得知招聘信息"): nothing new.
    .filter((value) => {
      const answer = matchAnswer(value.label, profile.answers ?? []);
      return !(answer?.scope === "answer" && norm(answer.answer.answer) === norm(value.value));
    })
    .forEach((value) => basic.set(value.key, value.value));
  const first = basic.get("firstName");
  const last = basic.get("lastName");
  if (first && last) {
    if (hasCJK(first + last) && !basic.has("name")) basic.set("name", `${last}${first}`);
    else if (!hasCJK(first + last) && !basic.has("pinyin")) basic.set("pinyin", `${first} ${last}`);
  }
  basic.delete("firstName");
  basic.delete("lastName");

  basic.forEach((value, key) => {
    const field = basicField(key);
    if (!field || field.derived) return;
    const valueLang = slotLang(field, value, lang);
    const current = ownValue(profile.basic[key], field, valueLang);
    const result = compare(current, value, field);
    if (result === "same") return;
    proposals.push({
      id: `basic:${key}:${valueLang}`,
      section: BASIC_SECTION,
      index: null,
      values: [{ key, value, lang: valueLang }],
      title: field[lang] + (field.sensitive ? (lang === "zh" ? "（敏感）" : " (sensitive)") : ""),
      detail: display(field, value, lang),
      previous: current ? display(field, current, lang) : undefined,
      change: result !== "new",
      checked: !field.sensitive && result !== "different",
    });
  });

  // Repeatable sections: group values into entries, then match each entry to the profile by its main field.
  const entries = new Map<string, { section: string; variant: WorkVariant; values: Map<string, string> }>();
  capture.values
    .filter((value) => value.section !== BASIC_SECTION)
    .forEach((value) => {
      const bucket = `${value.section}:${value.variant}:${value.entry}`;
      const entry = entries.get(bucket) ?? { section: value.section, variant: value.variant, values: new Map<string, string>() };
      entry.values.set(value.key, value.value);
      entries.set(bucket, entry);
    });
  const claimed = new Map<string, Set<number>>();

  entries.forEach(({ section, variant, values }) => {
    const def = sectionDef(section);
    const primaryKey = PRIMARY_KEYS[section];
    const primary = primaryKey ? values.get(primaryKey) : undefined;
    if (!def || !primaryKey || !primary) return;
    const used = claimed.get(section) ?? new Set<number>();
    claimed.set(section, used);
    const stored = profile.sections[section] ?? [];
    const startDate = values.get("startDate");
    const index = stored.findIndex((entry, position) => {
      if (used.has(position) || !sameEntry(entry[primaryKey], primary)) return false;
      // Same school twice (bachelor + master): tell them apart by start date.
      const storedStart = typeof entry.startDate === "string" ? entry.startDate : "";
      return !startDate || !storedStart || storedStart.startsWith(startDate) || startDate.startsWith(storedStart);
    });
    const name = def[lang];

    if (index < 0) {
      if (section === "work" && variant !== "all" && !values.has("type")) values.set("type", variant === "internship" ? "internship" : "full_time");
      const list: ProposalValue[] = [];
      const shown: string[] = [];
      values.forEach((value, key) => {
        const field = def.fields.find((candidate) => candidate.key === key);
        if (!field) return;
        list.push({ key, value, lang: slotLang(field, value, lang) });
        if (shown.length < 4 && key !== primaryKey) shown.push(display(field, value, lang));
      });
      proposals.push({
        id: `${section}:new:${norm(primary)}:${startDate ?? ""}`,
        section,
        index: null,
        values: list,
        title: `${name}${lang === "zh" ? "（新增）" : " (new)"} · ${primary}`,
        detail: shown.join(" · "),
        change: false,
        checked: true,
      });
      return;
    }

    used.add(index);
    values.forEach((value, key) => {
      const field = def.fields.find((candidate) => candidate.key === key);
      if (!field) return;
      const valueLang = slotLang(field, value, lang);
      const current = ownValue(stored[index][key], field, valueLang);
      const result = compare(current, value, field);
      if (result === "same") return;
      proposals.push({
        id: `${section}:${index}:${key}:${valueLang}`,
        section,
        index,
        values: [{ key, value, lang: valueLang }],
        title: `${name} · ${primary} · ${field[lang]}`,
        detail: display(field, value, lang),
        previous: current ? display(field, current, lang) : undefined,
        change: result !== "new",
        checked: result !== "different",
      });
    });
  });

  // Answers to questions that are not part of the profile.
  const seen = new Set<string>();
  for (const { question, answer } of capture.answers) {
    const key = normalizeQuestion(question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const existing = (profile.answers ?? []).find((item) => normalizeQuestion(item.question) === key);
    const current = existing?.answer ?? "";
    if (current && norm(current) === norm(answer)) continue;
    proposals.push({
      id: `answer:${key}`,
      section: "answer",
      index: null,
      values: [{ key: "answer", value: answer, lang }],
      question,
      title: `${lang === "zh" ? "常用问答" : "Saved answer"} · ${question.slice(0, 40)}`,
      detail: answer.length > 60 ? `${answer.slice(0, 60)}…` : answer,
      previous: current ? (current.length > 60 ? `${current.slice(0, 60)}…` : current) : undefined,
      change: Boolean(current),
      checked: !current,
    });
  }
  return proposals;
}

/** Request body for POST /api/profile/capture from the proposals the user kept ticked. */
export function capturePayload(proposals: Proposal[]): CapturePayload {
  const kept = proposals.filter((proposal) => proposal.checked);
  return {
    basic: kept.filter((proposal) => proposal.section === BASIC_SECTION).flatMap((proposal) => proposal.values),
    entries: kept.filter((proposal) => proposal.section !== BASIC_SECTION && proposal.section !== "answer").map((proposal) => ({ section: proposal.section, index: proposal.index, values: proposal.values })),
    answers: kept
      .filter((proposal) => proposal.section === "answer")
      .map((proposal) => ({ question: proposal.question ?? "", answer: proposal.values[0]?.value ?? "", lang: proposal.values[0]?.lang ?? "zh" })),
  };
}
