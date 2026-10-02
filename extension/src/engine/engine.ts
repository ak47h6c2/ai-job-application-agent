import { SCHEMA, readValue, sectionDef, type Lang, type ProfileData } from "../../../shared/profileSchema";
import { classify, findCandidate, matchAnswer, memoryKey, type Target } from "./classify";
import { discoverControls, type Control, type ControlKind } from "./discover";
import { isVisible, sleep, textOf } from "./dom";
import { fillControl, fillDatePart, fillDateRange, fillFile, hasValue, setPresent, type DatePart, type FillResult } from "./fillers";
import { readLabel, type LabelInfo } from "./label";
import { clickAndSettle, findAddButton, findSaveButton, newDialog, sectionText, visibleDialogs, waitClosed } from "./repeat";
import { BASIC_SECTION, findHeadings, hasRepeatableHeadings, sectionFor, type Heading, type SectionContext, type WorkVariant } from "./sections";
import { compact, hasCJK, normalizeLabel } from "./text";
import { entriesFor, impliedYesNo, resolveDesired, type Desired } from "./values";

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
}

/** Limit from the widget (maxlength) or the label ("（不超过200字）", "max 150 words"). */
export function textLimit(control: Control, label: string): number | undefined {
  const input = control.input as HTMLInputElement | HTMLTextAreaElement | undefined;
  if (input && input.maxLength > 0 && input.maxLength < 100000) return input.maxLength;
  const zh = /(?:不超过|不多于|限|最多|以内|少于)?\s*(\d{2,5})\s*(?:个)?字/.exec(label);
  if (zh) return Number(zh[1]);
  const en = /(\d{2,4})\s*(?:words?)/i.exec(label);
  if (en) return Number(en[1]) * 6;
  return undefined;
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
}

const DROPDOWN_KINDS = new Set(["native-select", "custom-select"]);

const YEAR_HINT = /^(年|年份|year|yyyy|选择年份?)$/i;
const MONTH_HINT = /^(月|月份|month|mm|选择月份?)$/i;
const DAY_HINT = /^(日|day|dd)$/i;
const RANGE_LABEL = /(起止|起始|起讫|时间段|期间|在校时间|就读时间|学习时间|工作时间|实习时间|项目时间|任职时间|经历时间|period|dates|duration|from.*to)|^(时间|日期)$/i;
const QUESTION_LABEL = /[?？]|为什么|为何|请简述|请描述|简述|描述一下|谈谈|说说|介绍一下|如何看待|why|describe|tell us|explain|what (makes|interests|motivates)|how (would|do|did)/i;

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

export function detectLang(planned: Planned[]): Lang {
  const htmlLang = document.documentElement.lang.toLowerCase();
  const labels = planned.map((item) => item.info.label || item.info.placeholder).filter(Boolean);
  if (!labels.length) return htmlLang.startsWith("en") ? "en" : hasCJK(document.title) || htmlLang.startsWith("zh") ? "zh" : "en";
  const cjk = labels.filter(hasCJK).length;
  return cjk / labels.length >= 0.3 ? "zh" : "en";
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
    if (target.field.type !== "region" && target.key !== "address") return;
    regionGroups.set(item.info.container, [...(regionGroups.get(item.info.container) ?? []), item]);
  });
  regionGroups.forEach((group) => {
    const target = group[0].target as Extract<Target, { scope: "field" }>;
    const pickers = group.filter((item) => DROPDOWN_KINDS.has(item.control.kind) || item.control.kind === "cascader");
    if (!pickers.length) return;
    // 家庭住址 as 省/市/区 dropdowns + a text box: the dropdowns take the address region.
    if (target.key === "address" && target.section === BASIC_SECTION) {
      pickers.forEach((item) => (item.target = withKey(target, "addressRegion")));
    }
    const dropdowns = pickers.filter((item) => DROPDOWN_KINDS.has(item.control.kind));
    if (dropdowns.length >= 2 || (dropdowns.length === 1 && target.key === "address")) dropdowns.forEach((item, index) => (item.regionPart = index));
  });

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

  // Number entries inside repeatable sections: a repeated field starts the next entry.
  const counters = new Map<string, { index: number; seen: Set<string> }>();
  planned.forEach((item) => {
    if (!item.target || item.target.scope !== "field" || item.target.section === BASIC_SECTION) return;
    const bucket = `${item.target.section}:${item.context.variant}`;
    const state = counters.get(bucket) ?? { index: 0, seen: new Set<string>() };
    const key = `${item.target.key}#${item.part ?? ""}`;
    if (state.seen.has(key)) {
      state.index += 1;
      state.seen.clear();
    }
    state.seen.add(key);
    counters.set(bucket, state);
    item.entry = state.index;
  });
  return { planned, headings };
}

function targetString(target: Target | null): string | undefined {
  if (!target) return undefined;
  if (target.scope === "field") return `${target.section}.${target.key}`;
  if (target.scope === "answer") return `answer.${target.answer.id}`;
  return `attachment.${target.kind}`;
}

function targetLabel(target: Target | null, entry: number, lang: Lang): string | undefined {
  if (!target) return undefined;
  if (target.scope === "answer") return (lang === "zh" ? "常用问答：" : "Saved answer: ") + target.answer.question;
  if (target.scope === "attachment") return SCHEMA.attachmentKinds.find((kind) => kind.key === target.kind)?.[lang];
  if (target.section === BASIC_SECTION) return target.field[lang];
  const section = sectionDef(target.section);
  return `${section?.[lang] ?? target.section} #${entry + 1} · ${target.field[lang]}`;
}

const PRIMARY_KEYS: Record<string, string> = {
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
  entriesFor(profile, section, variant).forEach((entry, index) => {
    const values = [readValue(entry[key], "zh").value, readValue(entry[key], "en").value].map((value) => compact(value.toLowerCase())).filter((value) => value.length >= 2);
    if (values.some((value) => text.includes(value))) present.add(index);
  });
  return present;
}

export class FillSession {
  readonly items: FieldReport[] = [];
  readonly added: FillReport["added"] = [];
  readonly notes: string[] = [];
  private readonly done = new WeakSet<Element>();
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
      targetLabel: targetLabel(item.target, item.entry, this.lang),
      section: item.target?.scope === "field" ? item.target.section : undefined,
      entry: item.entry,
      status,
      maxLength: ["textarea", "text", "contenteditable"].includes(item.control.kind) ? textLimit(item.control, item.info.label) : undefined,
      ...extra,
    };
    item.control.root.setAttribute("data-jaf-state", status);
    const existing = this.items.findIndex((other) => other.id === report.id && other.entry === report.entry);
    if (existing >= 0) this.items[existing] = report;
    else this.items.push(report);
    return report;
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
      const question = (control.kind === "textarea" || control.kind === "contenteditable" || control.kind === "text") && label.length >= 4 && (QUESTION_LABEL.test(label) || control.kind === "textarea");
      if (control.kind === "checkbox") return null;
      return this.record(item, question && !hasValue(control) ? "question" : "unmatched");
    }

    if (!this.ctx.overwrite && control.kind !== "checkbox" && hasValue(control)) return this.record(item, "skipped", { reason: "has-value" });

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
      return this.outcome(item, await fillControl(control, desired, { precision: "month" }), desired);
    }

    const { section, field } = target;
    let entryIndex = item.entry;
    if (section !== BASIC_SECTION) {
      const remaining = this.remainingFor(section, item.context.variant, headings);
      if (entryIndex >= remaining.length) return this.record(item, "skipped", { reason: "no-more-entries" });
      entryIndex = remaining[entryIndex];
    }
    const desired = resolveDesired(this.ctx.profile, lang, section, field, entryIndex, item.context.variant);
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
      if (field.type === "longtext" && ["textarea", "contenteditable", "text"].includes(control.kind)) {
        return this.record(item, "question", { reason: "missing-in-profile" });
      }
      return this.record(item, "empty", { reason: "missing-in-profile" });
    }
    const precision = field.type === "date" ? "day" : "month";

    if (item.range && control.kind === "date-range") {
      const endField = findCandidate(section, "endDate")?.field;
      const end = endField ? resolveDesired(this.ctx.profile, lang, section, endField, entryIndex, item.context.variant) : null;
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
    let result = await fillControl(control, desired, { precision });
    const yesNo = !result.ok && result.reason === "no-matching-option" ? impliedYesNo(desired) : null;
    if (yesNo) result = { ...(await fillControl(control, yesNo, { precision })), uncertain: true };
    return this.outcome(item, result, desired);
  }

  async fillAll(planned: Planned[], headings: Heading[], entryOverride?: number, fresh = false): Promise<number> {
    let count = 0;
    const overwrite = this.ctx.overwrite;
    // A freshly opened "add" dialog may keep values from the previous entry; replace them.
    if (fresh) this.ctx.overwrite = true;
    for (const item of planned) {
      if (entryOverride !== undefined && item.target?.scope === "field" && item.target.section !== BASIC_SECTION) item.entry = entryOverride;
      if (!isVisible(item.control.root) && item.control.kind !== "file") continue;
      const report = await this.fillPlanned(item, headings);
      if (report) count += 1;
      await sleep(15);
    }
    this.ctx.overwrite = overwrite;
    return count;
  }

  /** Clicks "添加" until each section on the page has as many entries as the profile. */
  async addMissingEntries(planned: Planned[], headings: Heading[]): Promise<void> {
    const buckets = new Map<string, { section: string; variant: WorkVariant; formEntries: number }>();
    for (const heading of headings) {
      if (heading.nav || heading.section === BASIC_SECTION) continue;
      const bucket = `${heading.section}:${heading.variant}`;
      if (!buckets.has(bucket)) buckets.set(bucket, { section: heading.section, variant: heading.variant, formEntries: 0 });
    }
    planned.forEach((item) => {
      if (item.target?.scope !== "field" || item.target.section === BASIC_SECTION) return;
      const bucket = buckets.get(`${item.target.section}:${item.context.variant}`);
      if (bucket) bucket.formEntries = Math.max(bucket.formEntries, item.entry + 1);
    });

    for (const { section, variant, formEntries } of buckets.values()) {
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
        // Inline forms that need their own "保存" before the next entry can be added.
        const block = commonBlock(fresh.map((item) => item.control.root));
        const save = block ? findSaveButton(block) : null;
        if (save && !textOf(save, 20).match(/提交|submit/i)) await clickAndSettle(save);
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

/** Fills everything it can on the current document. */
export async function fillPage(ctx: EngineContext): Promise<FillReport> {
  const session = new FillSession(ctx);
  const first = plan(document, { profile: ctx.profile, memory: ctx.memory });
  session.lang = ctx.lang === "auto" ? detectLang(first.planned) : ctx.lang;
  await session.fillAll(first.planned, first.headings);
  await session.addMissingEntries(first.planned, first.headings);
  // Widgets revealed by earlier answers (e.g. "其他" -> free text) get one more pass.
  const second = plan(document, { profile: ctx.profile, memory: ctx.memory });
  await session.fillAll(second.planned, second.headings);
  return session.report();
}

/** Fills one control with an explicitly chosen target (manual mapping from the panel). */
export async function fillWithTarget(ctx: EngineContext, controlId: string, targetKey: string, lang: Lang): Promise<FieldReport | null> {
  const { planned, headings } = plan(document, { profile: ctx.profile, memory: ctx.memory });
  const item = planned.find((candidate) => candidate.control.id === controlId);
  if (!item) return null;
  const [section, key] = targetKey.split(".");
  if (section === "answer") {
    const answer = ctx.profile.answers.find((candidate) => candidate.id === key);
    item.target = answer ? { scope: "answer", answer, score: 100, via: "manual" } : null;
  } else {
    const candidate = findCandidate(section, key);
    item.target = candidate ? { scope: "field", section, key, field: candidate.field, score: 100, via: "manual" } : null;
  }
  const session = new FillSession({ ...ctx, overwrite: true });
  session.lang = lang;
  return session.fillPlanned(item, headings);
}

export function rememberKey(label: string): string {
  return memoryKey(label);
}
