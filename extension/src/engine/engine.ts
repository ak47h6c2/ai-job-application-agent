import { SCHEMA, addressRegionKey, preferredAddressUse, readValue, sectionDef, type Entry, type Lang, type ProfileData } from "../../../shared/profileSchema";
import { allCandidates, classify, compatibleField, contextualMemoryKey, findCandidate, LIST_FIELDS, matchAnswer, memoryKey, scoreLabel, type Target } from "./classify";
import { discoverControls, type Control, type ControlKind } from "./discover";
import { docPosition, isVisible, sleep, textOf } from "./dom";
import { looksOverseas } from "./dropdown";
import { choiceLabel, fillControl, fillDatePart, fillDateRange, fillFile, hasValue, setPresent, type DatePart, type FillResult } from "./fillers";
import { readLabel, type LabelInfo } from "./label";
import { enumValueOf } from "./options";
import { clickAndSettle, findAddButton, findSaveButton, newDialog, sectionText, visibleDialogs, waitClosed } from "./repeat";
import { BASIC_SECTION, OTHER_SECTION, UNKNOWN_SECTION, findHeadings, hasRepeatableHeadings, sectionFor, type Heading, type SectionContext, type WorkVariant } from "./sections";
import { compact, hasCJK, labelCore, normalizeLabel } from "./text";
import { DATE_SHIFT_KEY, entriesFor, familyEntryIndex, familyRole, impliedYesNo, resolveDesired, sameDateText, shiftDesired, type Desired, type FamilyRole } from "./values";
import { sameWorkCompany, workPeriodMatches } from "./work";

export type FieldStatus = "filled" | "uncertain" | "failed" | "skipped" | "unmatched" | "question" | "empty";

export interface FieldReport {
  id: string;
  kind: ControlKind;
  label: string;
  target?: string;
  targetLabel?: string;
  section?: string;
  entry?: number;
  status: FieldStatus;
  value?: string;
  reason?: string;
  options?: string[];
  /** Character limit for free text (maxlength, or "不超过200字" in the label). */
  maxLength?: number;
  /** Minimum length the label asks for ("不少于300字"). */
  minLength?: number;
  /** Site mapping identity includes the section and heading, not only the field label. */
  mappingKey?: string;
  contextSection?: string | null;
  heading?: string;
}

/** A character counter beside the box ("562/200", antd's data-count="0 / 200"): the second number is the limit. */
function counterLimit(control: Control): number | undefined {
  const COUNTER = /^\s*\d+\s*\/\s*(\d{1,5})\s*$/;
  // Only this field's own wrapper: a wider scope would pick up the counter of a neighbouring box.
  const item = control.root.closest(".ant-form-item, .el-form-item, .ivu-form-item, .arco-form-item, .t-form__item, .layui-form-item") ?? control.root.parentElement ?? control.root;
  if (item.querySelectorAll("input:not([type=hidden]), textarea, select, [contenteditable=true]").length > 1) return undefined;
  for (const element of [control.root, ...Array.from(item.querySelectorAll("*"))]) {
    const attribute = COUNTER.exec(element.getAttribute("data-count") ?? "");
    if (attribute) return Number(attribute[1]);
    if (element.childElementCount || element.closest("[data-jaf-ui]")) continue;
    const text = COUNTER.exec(element.textContent ?? "");
    if (text) return Number(text[1]);
  }
  return undefined;
}

/** Minimum-length hints ("不少于300字", "300字以上", "at least 150 words") state no upper limit. */
const MIN_HINT = /(?:不少于|不低于|不得少于|至少|最少)\s*(\d{2,5})\s*(?:个)?字|(\d{2,5})\s*(?:个)?字(?:及以上|以上)|(?:at least|minimum(?: of)?|no less than)\s*(\d{2,4})\s*words?/gi;
const RANGE_HINT = /(\d{2,5})\s*[-~～—至到]\s*(\d{2,5})\s*(?:个)?字/;

/** Limit from the widget (maxlength, a "0/200" counter) or the label ("（不超过200字）", "max 150 words"). */
export function textLimit(control: Control, label: string): number | undefined {
  const input = control.input as HTMLInputElement | HTMLTextAreaElement | undefined;
  if (input && input.maxLength > 0 && input.maxLength < 100000) return input.maxLength;
  const counter = counterLimit(control);
  if (counter) return counter;
  const text = label.replace(MIN_HINT, " ");
  const range = RANGE_HINT.exec(text);
  if (range) return Number(range[2]);
  const zh = /(?:不超过|不多于|限|最多|少于)?\s*(\d{2,5})\s*(?:个)?字/.exec(text);
  if (zh) return Number(zh[1]);
  const en = /(\d{2,4})\s*(?:words?)/i.exec(text);
  if (en) return Number(en[1]) * 6;
  return undefined;
}

/** Minimum length the label asks for ("不少于300字", "字数在200-500字之间"), so drafts are long enough. */
export function textMinimum(label: string): number | undefined {
  const range = RANGE_HINT.exec(label);
  if (range) return Number(range[1]);
  const match = new RegExp(MIN_HINT.source, "i").exec(label);
  if (!match) return undefined;
  return match[3] ? Number(match[3]) * 6 : Number(match[1] ?? match[2]);
}

export interface FillReport {
  lang: Lang;
  items: FieldReport[];
  added: { section: string; count: number; mode: "inline" | "dialog" }[];
  notes: string[];
}

export interface EngineContext {
  profile: ProfileData;
  lang: Lang | "auto";
  memory?: Map<string, string>;
  overwrite?: boolean;
  getFile?: (kind: string, lang: Lang) => Promise<File | null>;
}

export interface Planned {
  control: Control;
  info: LabelInfo;
  context: SectionContext;
  target: Target | null;
  entry: number;
  part?: DatePart;
  range?: "start" | "end";
  /** Index of the level (province / city / district) when a region is split across dropdowns. */
  regionPart?: number;
  familyRole?: FamilyRole;
  /** Profile entry inferred from the editor's existing identity fields (relative to variant). */
  profileEntry?: number | null;
}

const DROPDOWN_KINDS = new Set(["native-select", "custom-select"]);
/** Free-text widgets, whose length limits matter when filling and drafting. */
const TEXT_KINDS: ControlKind[] = ["text", "textarea", "contenteditable"];

const YEAR_HINT = /^(年|年份|year|yyyy|选择年份?)$/i;
const MONTH_HINT = /^(月|月份|month|mm|选择月份?)$/i;
const DAY_HINT = /^(日|day|dd)$/i;
const RANGE_LABEL = /(起止|起始|起讫|时间段|期间|在校时间|就读时间|学习时间|工作时间|实习时间|项目时间|任职时间|经历时间|period|dates|duration|from.*to)|^(时间|日期)$/i;
const QUESTION_LABEL = /[?？]|为什么|为何|请简述|请描述|简述|描述一下|谈谈|说说|介绍一下|如何看待|why|describe|tell us|explain|what (makes|interests|motivates)|how (would|do|did)/i;
const FACTUAL_SECTIONS = new Set(["awards", "certificates", "publications", OTHER_SECTION, UNKNOWN_SECTION]);
const YES_NO_QUESTION = /是否|有无|能否|是不是|^(?:is|are|do|does|did|has|have|can|will|would)\b/i;

/** "入党时间" for someone who is not a party member, or "入团时间" for someone who is not (only) a league member. */
function joinDateMismatch(label: string, status: string): boolean {
  const party = /党/.test(label) && !/团/.test(label);
  const league = /团/.test(label) && !/党/.test(label);
  if (party) return !["party_member", "probationary_member"].includes(status);
  if (league) return Boolean(status) && status !== "league_member";
  return false;
}

function partHint(control: Control, info: LabelInfo): DatePart | undefined {
  const own = normalizeLabel(info.placeholder || control.root.getAttribute("aria-label") || (control.input?.getAttribute("aria-label") ?? ""));
  if (YEAR_HINT.test(own)) return "year";
  if (MONTH_HINT.test(own)) return "month";
  if (DAY_HINT.test(own)) return "day";
  const automation = control.root.getAttribute("data-automation-id") ?? control.input?.getAttribute("data-automation-id") ?? "";
  if (/year/i.test(automation)) return "year";
  if (/month/i.test(automation)) return "month";
  return undefined;
}

function isDateTarget(target: Target | null): target is Extract<Target, { scope: "field" }> {
  return Boolean(target && target.scope === "field" && (target.field.type === "date" || target.field.type === "month"));
}

function withKey(target: Extract<Target, { scope: "field" }>, key: string): Target {
  const candidate = findCandidate(target.section, key);
  return candidate ? { ...target, key, field: candidate.field } : target;
}

/** An education record abroad: marked so, in another country, or in a city outside China. */
function studiedAbroad(entry: Entry | undefined): boolean {
  if (!entry) return false;
  if (readValue(entry.overseasStudy, "zh").value === "yes") return true;
  const country = readValue(entry.country, "zh").value;
  if (country) return !/中国|china|prc/i.test(country);
  const location = readValue(entry.location, "zh").value;
  return Boolean(location) && looksOverseas({ kind: "text", text: location, fallback: false });
}

export function detectLang(planned: Planned[]): Lang {
  const htmlLang = document.documentElement.lang.toLowerCase();
  const labels = planned.map((item) => item.info.label || item.info.placeholder).filter(Boolean);
  if (!labels.length) {
    // Many Chinese sites keep a template's lang="en"; what the page actually shows decides.
    const sample = `${document.title} ${(document.body?.innerText ?? "").slice(0, 3000)}`;
    const cjk = (sample.match(/[一-鿿]/g) ?? []).length;
    const latin = (sample.match(/[a-z]/gi) ?? []).length;
    if (cjk || latin) return cjk * 3 >= latin ? "zh" : "en";
    return htmlLang.startsWith("zh") ? "zh" : "en";
  }
  const cjk = labels.filter(hasCJK).length;
  return cjk / labels.length >= 0.3 ? "zh" : "en";
}

/** The field a part's own placeholder names within one section ("请选择一级学科" -> degreeCategory). */
function placeholderField(section: string, placeholder: string): string | null | undefined {
  const text = normalizeLabel(placeholder);
  if (!text) return undefined;
  let best: { key: string; score: number } | null = null;
  for (const candidate of allCandidates()) {
    if (candidate.section !== section) continue;
    // Only a placeholder that clearly names a field counts: "二级学科" merely resembles 专业's "学科".
    const score = scoreLabel(text, candidate);
    if (score >= 90 && (!best || score > best.score)) best = { key: candidate.field.key, score };
  }
  return best ? best.key : null;
}

/**
 * Several dropdowns under one label ("主修专业": 一级学科 / 二级学科 / 专业方向) are different facts. Each part
 * takes the field its placeholder names; a part whose placeholder names no field is left for the user.
 */
function splitByPlaceholder(planned: Planned[]): void {
  const groups = new Map<Element, Planned[]>();
  for (const item of planned) {
    const target = item.target;
    if (!item.info.container || target?.scope !== "field" || item.regionPart !== undefined || ["date", "month", "region"].includes(target.field.type)) continue;
    groups.set(item.info.container, [...(groups.get(item.info.container) ?? []), item]);
  }
  for (const group of groups.values()) {
    const targets = group.map((item) => item.target as Extract<Target, { scope: "field" }>);
    const placeholders = group.map((item) => normalizeLabel(item.info.placeholder));
    if (group.length < 2 || placeholders.some((text) => !text) || new Set(placeholders).size !== group.length) continue;
    const count = (key: string) => targets.filter((target) => target.key === key).length;
    // Only parts that would otherwise write the same fact twice need their placeholder.
    if (!targets.some((target) => count(target.key) > 1)) continue;
    group.forEach((item, index) => {
      const target = targets[index];
      const named = placeholderField(target.section, item.info.placeholder);
      if (named) item.target = withKey(target, named);
      else if (count(target.key) > 1) item.target = null;
    });
  }
}

/**
 * Wrappers of separate entries: for each label repeated in the section, the largest ancestor holding only one
 * occurrence. A wrapper counts once several different repeated labels agree on it, so two dates of one entry
 * ("开始时间" twice) never split it.
 */
function entryBlocks(items: Planned[]): Element[] {
  const byLabel = new Map<string, Planned[]>();
  for (const item of items) {
    const label = labelCore(normalizeLabel(item.info.label || item.info.placeholder));
    if (label) byLabel.set(label, [...(byLabel.get(label) ?? []), item]);
  }
  const labelsOf = new Map<Element, Set<string>>();
  for (const [label, group] of byLabel) {
    if (group.length < 2) continue;
    for (const item of group) {
      let block = item.control.root;
      for (let node = block.parentElement; node && node !== document.body; node = node.parentElement) {
        if (group.some((other) => other !== item && node!.contains(other.control.root))) break;
        block = node;
      }
      labelsOf.set(block, (labelsOf.get(block) ?? new Set<string>()).add(label));
    }
  }
  const blocks = Array.from(labelsOf).filter(([, labels]) => labels.size >= 2).map(([block]) => block);
  return blocks.filter((block) => !blocks.some((other) => other !== block && other.contains(block))).sort(docPosition);
}

export interface PlanOptions {
  forcedSection?: string;
  forcedVariant?: WorkVariant;
  memory?: Map<string, string>;
  profile: ProfileData;
}

export function plan(scope: ParentNode, options: PlanOptions): { planned: Planned[]; headings: Heading[] } {
  const controls = discoverControls(scope);
  const headings = options.forcedSection ? [] : findHeadings(document.body);
  const pageHasSections = hasRepeatableHeadings(headings);
  const planned: Planned[] = controls.map((control) => {
    const info = readLabel(control);
    const context: SectionContext = options.forcedSection
      ? { section: options.forcedSection, variant: options.forcedVariant ?? "all", heading: null }
      : sectionFor(control.root, headings);
    const target = classify(control, info, {
      context,
      pageHasSections,
      forcedSection: options.forcedSection,
      memory: options.memory,
      answers: options.profile.answers ?? [],
      addressUse: preferredAddressUse(options.profile),
    });
    return { control, info, context, target, entry: 0, part: partHint(control, info) };
  });

  // A year/month hint only means "date part" when the sibling part sits in the same field.
  planned.forEach((item) => {
    if (!item.part) return;
    const siblings = planned.filter((other) => other !== item && other.part && other.part !== item.part && other.info.container && other.info.container === item.info.container);
    if (!siblings.length) item.part = undefined;
  });

  // Province / city / district as separate dropdowns under one label ("籍贯": 省 市 县).
  const regionGroups = new Map<Element, Planned[]>();
  planned.forEach((item) => {
    const target = item.target;
    if (!item.info.container || target?.scope !== "field") return;
    if (target.field.type !== "region" && !addressRegionKey(target.key)) return;
    regionGroups.set(item.info.container, [...(regionGroups.get(item.info.container) ?? []), item]);
  });
  regionGroups.forEach((group) => {
    const target = group[0].target as Extract<Target, { scope: "field" }>;
    const pickers = group.filter((item) => DROPDOWN_KINDS.has(item.control.kind) || item.control.kind === "cascader");
    if (!pickers.length) return;
    // Each address purpose has its own region; never borrow another address's region.
    const regionKey = addressRegionKey(target.key);
    if (regionKey && target.section === BASIC_SECTION) {
      pickers.forEach((item) => (item.target = withKey(target, regionKey)));
    }
    const dropdowns = pickers.filter((item) => DROPDOWN_KINDS.has(item.control.kind));
    if (dropdowns.length >= 2 || (dropdowns.length === 1 && regionKey)) dropdowns.forEach((item, index) => (item.regionPart = index));
  });

  // After region levels are known, other multi-part labels are split by their placeholders.
  splitByPlaceholder(planned);

  // Two date widgets under one label ("起止时间") become start + end.
  const byContainer = new Map<Element, Planned[]>();
  planned.forEach((item) => {
    if (item.info.container && (isDateTarget(item.target) || item.control.kind === "date") && !item.part) {
      byContainer.set(item.info.container, [...(byContainer.get(item.info.container) ?? []), item]);
    }
  });
  byContainer.forEach((group) => {
    if (group.length !== 2) return;
    const [first, second] = group;
    const target = first.target;
    if (!isDateTarget(target) || target.section === BASIC_SECTION) return;
    const sameKey = isDateTarget(second.target) && second.target.key === target.key;
    if (!sameKey && !RANGE_LABEL.test(normalizeLabel(first.info.label))) return;
    first.target = withKey(target, "startDate");
    second.target = withKey(target, "endDate");
  });
  planned.forEach((item) => {
    if (item.control.kind === "date-range" && isDateTarget(item.target)) item.range = "start";
  });

  // Number entries inside repeatable sections: the same question asked again starts the next entry.
  // Different labels for one fact ("学历" / "学位", "单位类别" / "工作单位") stay in the current entry.
  const counters = new Map<string, { index: number; seen: Map<string, Set<string>> }>();
  planned.forEach((item) => {
    if (!item.target || item.target.scope !== "field" || item.target.section === BASIC_SECTION) return;
    if (item.target.section === "family") {
      const role = familyRole(item.info.label || item.info.placeholder);
      if (role) {
        item.familyRole = role;
        const index = familyEntryIndex(options.profile, role);
        // Keep missing parents in separate capture groups, after existing profile entries.
        item.entry = index >= 0 ? index : (options.profile.sections.family?.length ?? 0) + (role === "father" ? 0 : 1);
        return;
      }
    }
    const bucket = `${item.target.section}:${item.context.variant}`;
    const state = counters.get(bucket) ?? { index: 0, seen: new Map<string, Set<string>>() };
    const key = `${item.target.key}#${item.part ?? ""}#${item.regionPart ?? ""}`;
    const label = labelCore(normalizeLabel(item.info.label || item.info.placeholder));
    const labels = state.seen.get(key);
    if (labels && (!label || labels.has(label))) {
      state.index += 1;
      state.seen.clear();
    }
    state.seen.set(key, (state.seen.get(key) ?? new Set<string>()).add(label));
    counters.set(bucket, state);
    item.entry = state.index;
  });
  // Entries wrapped in their own blocks ("最高学历" / "其他高校教育经历1" / "高中教育经历") are numbered by block,
  // which also keeps two labels of one fact ("学位", "学位类型") in the same entry.
  const buckets = new Map<string, Planned[]>();
  planned.forEach((item) => {
    if (item.target?.scope !== "field" || item.target.section === BASIC_SECTION || item.familyRole) return;
    const bucket = `${item.target.section}:${item.context.variant}`;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), item]);
  });
  for (const items of buckets.values()) {
    const blocks = entryBlocks(items);
    if (blocks.length < 2) continue;
    for (const item of items) {
      const inside = blocks.findIndex((block) => block.contains(item.control.root));
      const after = blocks.filter((block) => docPosition(block, item.control.root) < 0).length;
      // Outside every block: before the first one it leads the first entry; later it is an unwrapped block
      // of its own (a 高中 block with only dates) and must not borrow the previous entry's record.
      item.entry = inside >= 0 ? inside : after === 0 ? 0 : blocks.length + after - 1;
    }
  }
  bindEducationEntries(planned, options.profile, headings);
  bindWorkEntries(planned, options.profile, headings);
  return { planned, headings };
}

function existingText(control: Control): string {
  if (!hasValue(control)) return "";
  if (control.input instanceof HTMLSelectElement) return control.input.selectedOptions[0]?.textContent?.trim() ?? "";
  if (control.kind === "radio-group") {
    const checked = control.members?.find(member => member.checked);
    return checked ? choiceLabel(checked) : "";
  }
  return control.input?.value?.trim() || textOf(control.root.querySelector(".ant-select-selection-item, .ivu-select-selected-value") ?? control.root, 200);
}

/** Existing 学历 / school values select a complete education record, before blank forms use order. */
function bindEducationEntries(planned: Planned[], profile: ProfileData, headings: Heading[]): void {
  const groups = new Map<number, Planned[]>();
  planned.forEach(item => {
    if (item.target?.scope === "field" && item.target.section === "education") groups.set(item.entry, [...(groups.get(item.entry) ?? []), item]);
  });
  const entries = profile.sections.education ?? [];
  const claimed = new Set<number>();
  const pending: { group: Planned[]; matches?: number[] }[] = [];
  const identity = (value: string) => compact(value.toLowerCase());
  // Sites show their own spelling around the name: "UNSW Sydney(新南威尔士大学)" for 新南威尔士大学.
  const sameSchool = (index: number, value: string) => ["zh", "en"].some(lang => {
    const stored = identity(readValue(entries[index].school, lang as Lang).value), shown = identity(value);
    return Boolean(stored) && (stored === shown || (Math.min(stored.length, shown.length) >= 4 && (shown.includes(stored) || stored.includes(shown))));
  });
  for (const group of groups.values()) {
    const fields = (key: string) => group.filter(item => item.target?.scope === "field" && item.target.key === key);
    const degreeFields = fields("degree");
    const level = degreeFields.find(item => /^(学历|学历层次|教育程度|education level|level of study)$/.test(labelCore(normalizeLabel(item.info.label))) && existingText(item.control))
      ?? degreeFields.find(item => existingText(item.control));
    const degree = level ? enumValueOf("degree", existingText(level.control)) : null;
    const school = fields("school").map(item => existingText(item.control)).find(Boolean);
    const start = fields("startDate").filter(item => !item.part).map(item => existingText(item.control)).find(Boolean);
    if (!degree && !school && !start) { pending.push({ group }); continue; }
    let matches = entries.map((_, index) => index).filter(index => !claimed.has(index) && (!degree || readValue(entries[index].degree, "zh").value === degree));
    if (school) {
      const schools = matches.filter(index => sameSchool(index, school));
      // A selected level can repair a stale school belonging to another known degree.
      if (schools.length || !degree || !entries.some((_, index) => sameSchool(index, school))) matches = schools;
    }
    if (start && matches.length > 1) {
      matches = matches.filter(index => sameDateText(readValue(entries[index].startDate, "zh").value, start));
    }
    if (matches.length > 1) { pending.push({ group, matches }); continue; }
    const selected = matches[0] ?? null;
    group.forEach(item => { item.profileEntry = selected; });
    if (selected !== null) claimed.add(selected);
  }
  const present = presentEntries(profile, "education", "all", headings);
  // Reserve constrained editors before assigning records to empty editors.
  pending.sort((a, b) => Number(Boolean(b.matches)) - Number(Boolean(a.matches)));
  pending.forEach(({ group, matches }) => {
    const selected = (matches ?? entries.map((_, index) => index)).find(index => !claimed.has(index) && !present.has(index)) ?? null;
    group.forEach(item => { item.profileEntry = selected; });
    if (selected !== null) claimed.add(selected);
  });
}

function bindWorkEntries(planned: Planned[], profile: ProfileData, headings: Heading[]): void {
  const groups = new Map<string, Planned[]>();
  for (const item of planned) {
    if (item.target?.scope !== "field" || item.target.section !== "work") continue;
    const key = `${item.context.variant}:${item.entry}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const claimed = new Map<WorkVariant, Set<number>>();
  const pending: { group: Planned[]; candidates: number[] }[] = [];
  for (const group of groups.values()) {
    const variant = group[0].context.variant;
    const entries = entriesFor(profile, "work", variant);
    const used = claimed.get(variant) ?? new Set<number>(); claimed.set(variant, used);
    const value = (key: string) => group.filter(item => item.target?.scope === "field" && item.target.key === key && !item.part).map(item => existingText(item.control)).find(Boolean);
    const company = value("company"), start = value("startDate"), end = value("endDate"), title = value("title");
    const type = enumValueOf("workType", value("type") ?? "");
    let candidates = entries.map((_, index) => index).filter(index => !used.has(index));
    if (company) candidates = candidates.filter(index => sameWorkCompany(entries[index].company, company));
    else if (type) candidates = candidates.filter(index => readValue(entries[index].type, "zh").value === type);
    candidates = candidates.filter(index => workPeriodMatches(entries[index], start, end));
    if (title && candidates.length > 1) {
      const titles = candidates.filter(index => ["zh", "en"].some(lang => compact(readValue(entries[index].title, lang as Lang).value.toLowerCase()) === compact(title.toLowerCase())));
      if (titles.length) candidates = titles;
    }
    if (!company && !start && !end && !title) { pending.push({ group, candidates }); continue; }
    const selected = candidates.length === 1 ? candidates[0] : null;
    group.forEach(item => { item.profileEntry = selected; });
    if (selected !== null) used.add(selected);
  }
  for (const { group, candidates } of pending) {
    const variant = group[0].context.variant, used = claimed.get(variant)!;
    const present = presentEntries(profile, "work", variant, headings);
    const selected = candidates.find(index => !used.has(index) && !present.has(index)) ?? null;
    group.forEach(item => { item.profileEntry = selected; });
    if (selected !== null) used.add(selected);
  }
}

/** The one tied option that another value of the same profile entry names, e.g. 工学 -> 工学学士. */
function entryDetailOption(profile: ProfileData, section: string, entryIndex: number, variant: WorkVariant, fieldKey: string, options: string[]): string | null {
  const entry = entriesFor(profile, section, variant)[entryIndex];
  const fields = sectionDef(section)?.fields ?? [];
  if (!entry || options.length < 2) return null;
  const facts = fields
    .filter((field) => field.key !== fieldKey && !field.sensitive && !["date", "month", "longtext"].includes(field.type))
    .flatMap((field) => (["zh", "en"] as Lang[]).map((lang) => readValue(entry[field.key], lang).value))
    .map((value) => compact(value.toLowerCase()))
    .filter((value) => value.length >= 2);
  const named = options.filter((option) => facts.some((fact) => compact(option.toLowerCase()).includes(fact)));
  return named.length === 1 ? named[0] : null;
}

function targetString(target: Target | null): string | undefined {
  if (!target) return undefined;
  if (target.scope === "field") return `${target.section}.${target.key}`;
  if (target.scope === "answer") return `answer.${target.answer.id}`;
  return `attachment.${target.kind}`;
}

function targetLabel(target: Target | null, entry: number, lang: Lang, profile: ProfileData, variant: WorkVariant): string | undefined {
  if (!target) return undefined;
  if (target.scope === "answer") return (lang === "zh" ? "常用问答：" : "Saved answer: ") + target.answer.question;
  if (target.scope === "attachment") return SCHEMA.attachmentKinds.find((kind) => kind.key === target.kind)?.[lang];
  if (target.section === BASIC_SECTION) return target.field[lang];
  const section = sectionDef(target.section);
  if (target.section === "work") {
    const company = readValue(entriesFor(profile, "work", variant)[entry]?.company, lang).value;
    if (company) return `${section?.[lang] ?? "work"} #${entry + 1} · ${company} · ${target.field[lang]}`;
  }
  return `${section?.[lang] ?? target.section} #${entry + 1} · ${target.field[lang]}`;
}

export const PRIMARY_KEYS: Record<string, string> = {
  education: "school",
  work: "company",
  projects: "name",
  campus: "organization",
  awards: "name",
  publications: "title",
  languages: "language",
  certificates: "name",
  family: "name",
};

/** Profile entries already shown on the page as saved cards (not editable inputs). */
function presentEntries(profile: ProfileData, section: string, variant: WorkVariant, headings: Heading[]): Set<number> {
  const present = new Set<number>();
  const key = PRIMARY_KEYS[section];
  if (!key || !headings.some((heading) => heading.section === section)) return present;
  const text = sectionText(section, headings);
  const entries = entriesFor(profile, section, variant);
  entries.forEach((entry, index) => {
    const values = [readValue(entry[key], "zh").value, readValue(entry[key], "en").value].map((value) => compact(value.toLowerCase())).filter((value) => value.length >= 2);
    if (!values.some((value) => text.includes(value))) return;
    const duplicate = entries.some((other, position) => position !== index && ["zh", "en"].some(lang => values.includes(compact(readValue(other[key], lang as Lang).value.toLowerCase()))));
    if (duplicate) {
      const start = compact(readValue(entry.startDate, "zh").value);
      if (!start || !text.replace(/[.年月日]/g, "").includes(start)) return;
    }
    present.add(index);
  });
  return present;
}

export class FillSession {
  readonly items: FieldReport[] = [];
  readonly added: FillReport["added"] = [];
  readonly notes: string[] = [];
  private readonly done = new WeakSet<Element>();
  private readonly recordedRoots = new Map<string, Element>();
  private remaining = new Map<string, number[]>();
  lang: Lang = "zh";

  constructor(private readonly ctx: EngineContext) {}

  private planOptions(extra: Partial<PlanOptions> = {}): PlanOptions {
    return { profile: this.ctx.profile, memory: this.ctx.memory, ...extra };
  }

  private remainingFor(section: string, variant: WorkVariant, headings: Heading[]): number[] {
    const bucket = `${section}:${variant}`;
    if (!this.remaining.has(bucket)) {
      const present = presentEntries(this.ctx.profile, section, variant, headings);
      const all = entriesFor(this.ctx.profile, section, variant).map((_, index) => index);
      this.remaining.set(bucket, all.filter((index) => !present.has(index)));
      if (present.size) this.notes.push(`${sectionDef(section)?.[this.lang] ?? section}: ${present.size} ${this.lang === "zh" ? "条已在页面上，跳过" : "already on the page, skipped"}`);
    }
    return this.remaining.get(bucket)!;
  }

  private record(item: Planned, status: FieldStatus, extra: Partial<FieldReport> = {}): FieldReport {
    const report: FieldReport = {
      id: item.control.id,
      kind: item.control.kind,
      label: item.info.label || item.info.placeholder || item.info.identifiers,
      target: targetString(item.target),
      targetLabel: targetLabel(item.target, item.profileEntry ?? item.entry, this.lang, this.ctx.profile, item.context.variant),
      section: item.target?.scope === "field" ? item.target.section : undefined,
      entry: item.profileEntry ?? item.entry,
      status,
      maxLength: TEXT_KINDS.includes(item.control.kind) ? textLimit(item.control, item.info.label) : undefined,
      minLength: TEXT_KINDS.includes(item.control.kind) ? textMinimum(item.info.label) : undefined,
      mappingKey: contextualMemoryKey(item.info.label || item.info.placeholder, item.context),
      contextSection: item.context.section,
      heading: normalizeLabel(item.context.heading?.textContent ?? ""),
      ...extra,
    };
    let existing = this.items.findIndex((other) => other.id === report.id && other.entry === report.entry);
    if (existing < 0) existing = this.items.findIndex(other => other.label === report.label && other.target === report.target && other.entry === report.entry && !this.recordedRoots.get(other.id)?.isConnected);
    const previous = this.items[existing];
    // A page may replace the widget while retaining the value we just filled.
    if (previous && status === "skipped" && report.reason === "has-value" && ["filled", "uncertain"].includes(previous.status) && normalizeLabel(existingText(item.control)) === normalizeLabel(previous.value ?? "")) {
      report.status = previous.status;
      report.value = previous.value;
      report.reason = previous.reason;
      report.options = previous.options;
    }
    this.recordedRoots.set(report.id, item.control.root);
    item.control.root.setAttribute("data-jaf-state", report.status);
    if (existing >= 0) this.items[existing] = report;
    else this.items.push(report);
    return report;
  }

  /** Dates moved by this site's date-shift setting (see shiftDesired). */
  private shifted(desired: Desired | null): Desired | null {
    const days = Number(this.ctx.memory?.get(DATE_SHIFT_KEY) ?? 0) || 0;
    return desired && days ? shiftDesired(desired, days) : desired;
  }

  private outcome(item: Planned, result: FillResult, desired: Desired | null): FieldReport {
    if (!result.ok) return this.record(item, "failed", { reason: result.reason, options: result.options, value: desired?.text });
    const shaky = result.uncertain || desired?.fallback || (item.target?.score ?? 100) < 60;
    return this.record(item, shaky ? "uncertain" : "filled", { value: result.chosen ?? desired?.text, reason: result.reason ?? (desired?.fallback ? "other-language" : undefined) });
  }

  async fillPlanned(item: Planned, headings: Heading[]): Promise<FieldReport | null> {
    const { control, target } = item;
    if (this.done.has(control.root)) return null;
    this.done.add(control.root);
    const lang = this.lang;

    if (!target) {
      const label = item.info.label || item.info.placeholder;
      const question = !FACTUAL_SECTIONS.has(item.context.section ?? "") && (control.kind === "textarea" || control.kind === "contenteditable" || control.kind === "text") && label.length >= 4 && (QUESTION_LABEL.test(label) || control.kind === "textarea");
      if (control.kind === "checkbox") return null;
      return this.record(item, question && !hasValue(control) ? "question" : "unmatched");
    }

    if (!this.ctx.overwrite && hasValue(control)) return this.record(item, "skipped", { reason: "has-value" });

    if (target.scope === "attachment") {
      if (!this.ctx.getFile) return this.record(item, "failed", { reason: "no-file-source" });
      let kind = target.kind;
      if (kind.startsWith("resume_")) {
        const explicit = /英文|english/i.test(item.info.label) ? "resume_en" : /中文|chinese/i.test(item.info.label) ? "resume_zh" : null;
        kind = explicit ?? (lang === "en" ? "resume_en" : "resume_zh");
      }
      item.target = { ...target, kind };
      const file = await this.ctx.getFile(kind, lang);
      if (!file) return this.record(item, "empty", { reason: `missing-attachment:${kind}` });
      return this.outcome(item, await fillFile(control, file), { kind: "text", text: file.name, fallback: false });
    }

    if (target.scope === "answer") {
      if (!target.answer.answer?.trim()) return this.record(item, "empty", { reason: "answer-not-written" });
      const desired: Desired = { kind: "text", text: target.answer.answer, fallback: false };
      const maxLength = TEXT_KINDS.includes(control.kind) ? textLimit(control, item.info.label) : undefined;
      return this.outcome(item, await fillControl(control, desired, { precision: "month", maxLength }), desired);
    }

    const { section, field } = target;
    // "资格证书" in basic info: every certificate the profile lists, for the user to trim to what the site asks.
    if (item.context.section === BASIC_SECTION && LIST_FIELDS.has(`${section}.${field.key}`)) {
      const names = entriesFor(this.ctx.profile, section, "all").map((entry) => readValue(entry[field.key], lang).value).filter(Boolean);
      if (!names.length) return this.record(item, "empty", { reason: "missing-in-profile" });
      const desired: Desired = { kind: "text", text: names.join("、"), fallback: false };
      const result = await fillControl(control, desired, { precision: "month", maxLength: textLimit(control, item.info.label) });
      return this.outcome(item, { ...result, uncertain: true, reason: result.ok ? result.reason ?? "joined-entries" : result.reason }, desired);
    }
    // One stored date serves "入党（团）时间"; a label asking for the other kind stays empty.
    if (field.key === "politicalJoinDate" && joinDateMismatch(item.info.label || item.info.placeholder, readValue(this.ctx.profile.basic.politicalStatus, "zh").value)) {
      return this.record(item, "skipped", { reason: "political-status-mismatch" });
    }
    let entryIndex = item.entry;
    if (section === "family" && item.familyRole) {
      entryIndex = familyEntryIndex(this.ctx.profile, item.familyRole);
      if (entryIndex < 0) return this.record(item, "empty", { reason: "missing-family-member" });
    } else if (["education", "work"].includes(section) && item.profileEntry !== undefined) {
      if (item.profileEntry === null) return this.record(item, "empty", { reason: "entry-not-in-profile" });
      entryIndex = item.profileEntry;
    } else if (section !== BASIC_SECTION) {
      const remaining = this.remainingFor(section, item.context.variant, headings);
      if (!entriesFor(this.ctx.profile, section, item.context.variant).length) return this.record(item, "empty", { reason: "missing-in-profile" });
      if (entryIndex >= remaining.length) return this.record(item, "skipped", { reason: "no-more-entries" });
      entryIndex = remaining[entryIndex];
    }
    const desired = this.shifted(resolveDesired(this.ctx.profile, lang, section, field, entryIndex, item.context.variant));
    if (!desired) {
      if (field.sensitive) return this.record(item, "skipped", { reason: "sensitive" });
      // The profile has no value, but a saved answer to the same question may.
      const answer = section === BASIC_SECTION ? matchAnswer(item.info.label || item.info.placeholder, this.ctx.profile.answers ?? []) : null;
      if (answer) {
        item.target = answer;
        this.done.delete(control.root);
        return this.fillPlanned(item, headings);
      }
      // An empty long-text field on the page is effectively an open question: offer AI drafting.
      if (!FACTUAL_SECTIONS.has(section) && field.type === "longtext" && ["textarea", "contenteditable", "text"].includes(control.kind)) {
        return this.record(item, "question", { reason: "missing-in-profile" });
      }
      return this.record(item, "empty", { reason: "missing-in-profile" });
    }
    const precision = field.type === "date" ? "day" : "month";

    if (item.range && control.kind === "date-range") {
      const endField = findCandidate(section, "endDate")?.field;
      const end = endField ? this.shifted(resolveDesired(this.ctx.profile, lang, section, endField, entryIndex, item.context.variant)) : null;
      return this.outcome(item, await fillDateRange(control, desired, end, precision), desired);
    }
    if (desired.kind === "date" && desired.date.present) {
      return this.outcome(item, await setPresent(control, item.info.container), desired);
    }
    if (item.regionPart !== undefined && desired.kind === "region") {
      const part = desired.parts[item.regionPart];
      if (!part) return this.record(item, "empty", { reason: "missing-region-level" });
      const result = await fillControl(control, desired, { precision, part });
      // The next level (city, district) loads its options only after this choice.
      await sleep(400);
      return this.outcome(item, result, { ...desired, text: part });
    }
    if (item.part && desired.kind === "date") {
      return this.outcome(item, await fillDatePart(control, desired, item.part), desired);
    }
    const maxLength = TEXT_KINDS.includes(control.kind) ? textLimit(control, item.info.label) : undefined;
    // A yes/no fact typed into a free-text box that is not phrased as a question ("其他病史") reads as 无 / 有.
    if (desired.kind === "enum" && desired.enumKey === "yesno" && TEXT_KINDS.includes(control.kind) && !YES_NO_QUESTION.test(item.info.label || item.info.placeholder)) {
      const text = desired.value === "no" ? (lang === "zh" ? "无" : "None") : (lang === "zh" ? "有" : "Yes");
      return this.outcome(item, await fillControl(control, { kind: "text", text, fallback: desired.fallback }, { precision, maxLength }), desired);
    }
    // A school abroad: a 学习形式 list names that itself ("海外留学生"), whatever the study mode.
    if (section === "education" && field.key === "studyMode" && DROPDOWN_KINDS.has(control.kind) && studiedAbroad(entriesFor(this.ctx.profile, section, item.context.variant)[entryIndex])) {
      const abroad = await fillControl(control, { kind: "text", text: "海外留学生", fallback: false }, { precision });
      if (abroad.ok && abroad.reason !== "chose-other") return this.outcome(item, { ...abroad, uncertain: true, reason: "overseas-study" }, desired);
    }
    let result = await fillControl(control, desired, { precision, maxLength });
    const yesNo = !result.ok && result.reason === "no-matching-option" ? impliedYesNo(desired) : null;
    if (yesNo) result = { ...(await fillControl(control, yesNo, { precision })), uncertain: true };
    // A site list without the profile's wording may still list its stated equivalent (国内对应专业, 学位名称).
    // 其他 is the last resort: the profile's stated equivalent comes first (国内对应专业 for an overseas major).
    if ((!result.ok && ["ambiguous-option", "no-matching-option"].includes(result.reason ?? "")) || result.reason === "chose-other") {
      const alternate = sectionDef(section)?.fields.find((candidate) => candidate.alternateOf === field.key);
      const value = alternate ? resolveDesired(this.ctx.profile, lang, section, alternate, entryIndex, item.context.variant) : null;
      if (value) {
        const retry = await fillControl(control, value, { precision });
        if (retry.ok && retry.reason !== "chose-other") result = { ...retry, uncertain: true, reason: "alternate-value" };
      }
    }
    // "工学学士 / 理学学士 …" all mean bachelor; another fact of the same entry (学科门类 工学) can pick one.
    const detail = !result.ok && result.reason === "ambiguous-option" && section !== BASIC_SECTION ? entryDetailOption(this.ctx.profile, section, entryIndex, item.context.variant, field.key, result.options ?? []) : null;
    if (detail) result = { ...(await fillControl(control, { kind: "text", text: detail, fallback: false }, { precision })), uncertain: true, reason: "entry-detail" };
    return this.outcome(item, result, desired);
  }

  async fillAll(planned: Planned[], headings: Heading[], entryOverride?: number, fresh = false): Promise<number> {
    let count = 0;
    const overwrite = this.ctx.overwrite;
    // A freshly opened "add" dialog may keep values from the previous entry; replace them.
    if (fresh) this.ctx.overwrite = true;
    for (const item of planned) {
      if (entryOverride !== undefined && item.target?.scope === "field" && item.target.section !== BASIC_SECTION) {
        item.entry = entryOverride;
        item.profileEntry = undefined;
      }
      if (!isVisible(item.control.root) && item.control.kind !== "file") continue;
      const report = await this.fillPlanned(item, headings);
      // Progress means a value was written. Re-rendered controls that already hold their value are not new work,
      // so they must not keep the re-plan loop in fillPage() going.
      const wrote = Boolean(report && (report.status === "filled" || report.status === "uncertain"));
      if (wrote) count += 1;
      // Pace only after changing the page; idle timers are throttled to about 1s in background tabs.
      if (wrote || report?.status === "failed") await sleep(15);
    }
    this.ctx.overwrite = overwrite;
    return count;
  }

  /** Clicks "添加" until each section on the page has as many entries as the profile. */
  async addMissingEntries(planned: Planned[], headings: Heading[]): Promise<void> {
    const buckets = new Map<string, { section: string; variant: WorkVariant; formEntries: number; fields: number; primary: boolean }>();
    for (const heading of headings) {
      if ([BASIC_SECTION, OTHER_SECTION, UNKNOWN_SECTION].includes(heading.section)) continue;
      // A resume menu's highlighted item names the section on screen when the form itself has no title
      // (an empty 荣誉或奖励 page with only "+ 添加荣誉或奖励").
      const shownByMenu = heading.nav && heading.active && !headings.some((other) => !other.nav && other.section === heading.section);
      if (heading.nav && !shownByMenu) continue;
      const bucket = `${heading.section}:${heading.variant}`;
      if (!buckets.has(bucket)) buckets.set(bucket, { section: heading.section, variant: heading.variant, formEntries: 0, fields: 0, primary: false });
    }
    planned.forEach((item) => {
      if (item.target?.scope !== "field" || item.target.section === BASIC_SECTION) return;
      const bucket = buckets.get(`${item.target.section}:${item.context.variant}`);
      if (!bucket) return;
      bucket.formEntries = Math.max(bucket.formEntries, item.entry + 1);
      bucket.fields += 1;
      if (item.target.key === PRIMARY_KEYS[item.target.section]) bucket.primary = true;
    });

    for (const { section, variant, formEntries, fields, primary } of buckets.values()) {
      // Fields of a section without its school / company / name are a summary ("教育背景" in basic info, filled
      // from the education records elsewhere), not an editor that takes more entries.
      if (fields && !primary) continue;
      let currentHeadings = headings;
      const remaining = this.remainingFor(section, variant, currentHeadings);
      const missing = remaining.length - formEntries;
      let added = 0;
      for (let step = 0; step < missing; step += 1) {
        const button = findAddButton(section, currentHeadings);
        if (!button) {
          if (step === 0) this.notes.push(`${sectionDef(section)?.[this.lang]}: ${this.lang === "zh" ? "未找到「添加」按钮，请手动添加后再点填写" : "no Add button found"}`);
          break;
        }
        const dialogsBefore = visibleDialogs();
        const entry = formEntries + step;
        await clickAndSettle(button);
        const dialog = newDialog(dialogsBefore);
        if (dialog) {
          const { planned: inDialog } = plan(dialog, this.planOptions({ forcedSection: section, forcedVariant: variant }));
          // Many libraries reuse the same dialog DOM for every entry.
          inDialog.forEach((item) => this.done.delete(item.control.root));
          await this.fillAll(inDialog, currentHeadings, entry, true);
          const save = findSaveButton(dialog);
          if (save) {
            await clickAndSettle(save);
            if (!(await waitClosed(dialog))) {
              this.notes.push(`${sectionDef(section)?.[this.lang]} #${entry + 1}: ${this.lang === "zh" ? "弹窗未能保存，请检查必填项" : "dialog did not save; check required fields"}`);
              break;
            }
          } else {
            this.notes.push(`${sectionDef(section)?.[this.lang]} #${entry + 1}: ${this.lang === "zh" ? "已填好弹窗，请点保存" : "dialog filled; please click save"}`);
            added += 1;
            break;
          }
          added += 1;
          this.added.push({ section, count: 1, mode: "dialog" });
          continue;
        }
        const { planned: after, headings: refreshed } = plan(document, this.planOptions());
        currentHeadings = refreshed;
        const fresh = after.filter((item) => !this.done.has(item.control.root) && item.target?.scope === "field" && item.target.section === section);
        if (!fresh.length) break;
        await this.fillAll(fresh, currentHeadings, entry);
        // Inline forms that need their own "保存" before the next entry can be added. Only the entry's own
        // editor counts: a block that also holds other sections' fields is the whole form.
        const block = commonBlock(fresh.map((item) => item.control.root));
        const ownEditor = block && !after.some((item) => item.context.section !== section && block.contains(item.control.root));
        const save = ownEditor ? findSaveButton(block, { inline: true }) : null;
        if (save) await clickAndSettle(save);
        added += 1;
        this.added.push({ section, count: 1, mode: "inline" });
      }
    }
  }

  report(): FillReport {
    return { lang: this.lang, items: this.items, added: this.added, notes: this.notes };
  }
}

function commonBlock(elements: Element[]): Element | null {
  if (!elements.length) return null;
  let node: Element | null = elements[0].parentElement;
  while (node && !elements.every((element) => node!.contains(element))) node = node.parentElement;
  return node && node !== document.body ? node : null;
}

/** Classifies controls for review and AI drafting without writing values or fetching files. */
export function inspectPage(ctx: EngineContext): FillReport {
  const { planned } = plan(document, { profile: ctx.profile, memory: ctx.memory });
  const lang = ctx.lang === "auto" ? detectLang(planned) : ctx.lang;
  const items = planned.map((item): FieldReport => {
    const { control, target } = item;
    const label = item.info.label || item.info.placeholder || item.info.identifiers;
    let status: FieldStatus = "unmatched";
    let reason: string | undefined;
    if (hasValue(control)) { status = "skipped"; reason = "has-value"; }
    else if (target?.scope === "attachment" || control.kind === "checkbox") status = "skipped";
    else if (target?.scope === "field") {
      const entry = item.profileEntry !== undefined ? item.profileEntry : item.entry;
      const value = entry === null ? null : resolveDesired(ctx.profile, lang, target.section, target.field, entry, item.context.variant);
      if (value || target.field.sensitive) status = "skipped";
      else {
        const hasEntry = target.section === BASIC_SECTION || entriesFor(ctx.profile, target.section, item.context.variant).length > 0;
        status = hasEntry && !FACTUAL_SECTIONS.has(target.section) && target.field.type === "longtext" && ["text", "textarea", "contenteditable"].includes(control.kind) ? "question" : "empty";
        reason = "missing-in-profile";
      }
    } else if (target?.scope === "answer") status = target.answer.answer?.trim() ? "skipped" : "question";
    else if (!FACTUAL_SECTIONS.has(item.context.section ?? "") && label.length >= 4 && ["text", "textarea", "contenteditable"].includes(control.kind)
      && (QUESTION_LABEL.test(label) || control.kind === "textarea")) status = "question";
    return { id: control.id, kind: control.kind, label, status, reason, target: targetString(target),
      targetLabel: targetLabel(target, item.profileEntry ?? item.entry, lang, ctx.profile, item.context.variant),
      maxLength: TEXT_KINDS.includes(control.kind) ? textLimit(control, label) : undefined,
      minLength: TEXT_KINDS.includes(control.kind) ? textMinimum(label) : undefined, mappingKey: contextualMemoryKey(label, item.context),
      contextSection: item.context.section, heading: normalizeLabel(item.context.heading?.textContent ?? "") };
  });
  return { lang, items, added: [], notes: ["scan-only"] };
}

/** Fills everything it can on the current document. */
export async function fillPage(ctx: EngineContext): Promise<FillReport> {
  const session = new FillSession(ctx);
  const first = plan(document, { profile: ctx.profile, memory: ctx.memory });
  session.lang = ctx.lang === "auto" ? detectLang(first.planned) : ctx.lang;
  await session.fillAll(first.planned, first.headings);
  await session.addMissingEntries(first.planned, first.headings);
  // Choices can rebuild a whole form several times, invalidating the remaining roots.
  // Re-plan only until no unseen controls remain; never repeat the Add/Save workflow.
  for (let pass = 0; pass < 8; pass += 1) {
    const next = plan(document, { profile: ctx.profile, memory: ctx.memory });
    if (!(await session.fillAll(next.planned, next.headings))) break;
  }
  return session.report();
}

/** Fills one control with an explicitly chosen target (manual mapping from the panel). */
export async function fillWithTarget(ctx: EngineContext, controlId: string, targetKey: string, lang: Lang, automatic = false, expectedMappingKey?: string): Promise<FieldReport | null> {
  const { planned, headings } = plan(document, { profile: ctx.profile, memory: ctx.memory });
  const item = planned.find((candidate) => candidate.control.id === controlId);
  if (!item) return null;
  const [section, key] = targetKey.split(".");
  if (automatic && (section === "answer" || !compatibleField(section, key, item.info.label || item.info.placeholder, item.context)
    || (expectedMappingKey && expectedMappingKey !== contextualMemoryKey(item.info.label || item.info.placeholder, item.context)))) {
    return { id: controlId, kind: item.control.kind, label: item.info.label, status: "unmatched", reason: "section-mismatch" };
  }
  if (section === "answer") {
    const answer = ctx.profile.answers.find((candidate) => candidate.id === key);
    item.target = answer ? { scope: "answer", answer, score: 100, via: "manual" } : null;
  } else {
    const candidate = findCandidate(section, key);
    item.target = candidate ? { scope: "field", section, key, field: candidate.field, score: 100, via: "manual" } : null;
  }
  const session = new FillSession({ ...ctx, overwrite: !automatic });
  session.lang = lang;
  return session.fillPlanned(item, headings);
}

export function rememberKey(label: string): string {
  return memoryKey(label);
}
