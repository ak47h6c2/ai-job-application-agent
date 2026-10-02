import type { Control } from "./discover";
import { isVisible, pressKey, realClick, setNativeValue, sleep, textOf, waitFor } from "./dom";
import { closeDropdown, fillCascader, fillCustomSelect, fillNativeSelect, type ChoiceResult } from "./dropdown";
import { bestOption } from "./options";
import { normalizeLabel } from "./text";
import { datePattern, formatDate, type DateValue, type Desired } from "./values";

export type FillResult = ChoiceResult;

export type DatePart = "year" | "month" | "day";

function writeText(element: HTMLInputElement | HTMLTextAreaElement, text: string): FillResult {
  let value = text;
  let uncertain = false;
  const max = element.maxLength;
  if (max > 0 && value.length > max) {
    value = value.slice(0, max);
    uncertain = true;
  }
  const wasReadOnly = element.readOnly;
  if (wasReadOnly) element.readOnly = false;
  setNativeValue(element, value);
  if (wasReadOnly) element.readOnly = true;
  return { ok: element.value === value || element.value.length > 0, uncertain: uncertain || wasReadOnly, chosen: value, reason: uncertain ? "truncated" : undefined };
}

function plainText(desired: Desired, element?: HTMLInputElement | HTMLTextAreaElement, precision: "year" | "month" | "day" = "month"): string {
  if (desired.kind === "date") {
    if (desired.date.present) return desired.text;
    const pattern = datePattern(element?.placeholder || element?.value || "", element?.type === "date" ? "day" : precision);
    return formatDate(desired.date, pattern);
  }
  return desired.text;
}

export function hasValue(control: Control): boolean {
  switch (control.kind) {
    case "radio-group":
      return Boolean(control.members?.some((member) => member.checked)) || Boolean(control.choiceItems?.some((item) => /(is-active|checked|selected|active)/.test(item.className)));
    case "checkbox":
      return false;
    case "file":
      return Boolean((control.input as HTMLInputElement).files?.length) || /\.(pdf|docx?|jpe?g|png)\b/i.test(textOf(control.root.parentElement ?? control.root, 300));
    case "native-select": {
      const select = control.input as HTMLSelectElement;
      return Boolean(select.value) && !/^(请选择|select|choose|--)/i.test((select.selectedOptions[0]?.textContent ?? "").trim());
    }
    case "custom-select":
    case "cascader": {
      const input = control.root.querySelector<HTMLInputElement>("input:not([type=hidden])");
      if (input?.value.trim()) return true;
      if (control.root.querySelector(".ant-select-selection-item, .el-tag, .select2-selection__choice, .vs__selected, .ivu-select-selected-value, .el-select__placeholder:not(.is-transparent), .el-cascader__tags")) return true;
      const placeholder = (input?.placeholder || control.root.querySelector("[class*=placeholder]")?.textContent || "").trim();
      const shown = textOf(control.root, 120);
      return Boolean(shown) && shown !== placeholder && !/^(请选择|请输入|select|choose|--)/i.test(shown);
    }
    case "date":
    case "date-range":
      return Boolean((control.rangeInputs ?? [control.input]).some((input) => (input as HTMLInputElement | undefined)?.value.trim()));
    case "contenteditable":
      return Boolean(control.root.textContent?.trim());
    default:
      return Boolean((control.input as HTMLInputElement | undefined)?.value.trim());
  }
}

async function typeDate(input: HTMLInputElement, date: DateValue, precision: "year" | "month" | "day", library: boolean): Promise<FillResult> {
  if (input.type === "date" || input.type === "month") {
    const value = input.type === "month" ? `${date.year}-${date.month || "01"}` : `${date.year}-${date.month || "01"}-${date.day || "01"}`;
    setNativeValue(input, value);
    return { ok: input.value === value, chosen: value };
  }
  const hint = input.placeholder || input.value || "";
  const primary = datePattern(hint, precision);
  const other = primary.precision === "month" ? ("day" as const) : ("month" as const);
  const attempts = [
    primary,
    { ...primary, sep: "-", cjk: false },
    { ...primary, sep: "/", cjk: false },
    { ...primary, sep: ".", cjk: false },
    { ...primary, cjk: true },
    { ...primary, precision: other, cjk: false },
  ];
  const wasReadOnly = input.readOnly;
  if (wasReadOnly) input.readOnly = false;
  if (!library) {
    // Plain inputs with a JS picker (laydate, My97, jQuery UI): write without opening the panel,
    // because pressing Enter in an open panel confirms the panel's own date (usually today).
    const text = formatDate(date, primary);
    setNativeValue(input, text);
    await sleep(120);
    if (wasReadOnly) input.readOnly = true;
    if (input.value === text) return { ok: true, uncertain: wasReadOnly, chosen: text };
    if (wasReadOnly) input.readOnly = false;
  }
  let last = "";
  for (const pattern of attempts) {
    const text = formatDate(date, pattern);
    if (text === last) continue;
    last = text;
    realClick(input);
    await sleep(60);
    setNativeValue(input, text, { blur: false });
    pressKey(input, "Enter");
    await sleep(80);
    // Close the picker panel, then check whether the widget kept (and reformatted) the value.
    pressKey(input, "Escape");
    input.blur();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await sleep(150);
    if (input.value.replace(/\s/g, "").includes(date.year)) {
      if (wasReadOnly) input.readOnly = true;
      return { ok: true, uncertain: wasReadOnly, chosen: input.value };
    }
  }
  if (wasReadOnly) input.readOnly = true;
  // Typing was rejected (custom format or a non-editable picker): click through the calendar panel.
  if (await pickFromPanel(input, date, precision)) return { ok: true, uncertain: true, chosen: input.value };
  closeDropdown({ id: "", kind: "date", root: input });
  return { ok: false, reason: "date-not-accepted" };
}

const PICKER_PANELS = ".el-picker-panel, .el-date-picker, .ivu-picker-panel-body";
const PREV_YEAR = ".el-icon-d-arrow-left, button.d-arrow-left, .d-arrow-left, [aria-label*='前一年'], [aria-label*='Previous Year'], .ivu-date-picker-prev-btn-arrow-double";
const NEXT_YEAR = ".el-icon-d-arrow-right, button.d-arrow-right, .d-arrow-right, [aria-label*='后一年'], [aria-label*='Next Year'], .ivu-date-picker-next-btn-arrow-double";
const PREV_MONTH = ".el-icon-arrow-left, button.arrow-left, [aria-label*='上个月'], [aria-label*='Previous Month']";
const NEXT_MONTH = ".el-icon-arrow-right, button.arrow-right, [aria-label*='下个月'], [aria-label*='Next Month']";
const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Picks a date by clicking an Element-style calendar panel: year arrows, then the month or day cell. */
async function pickFromPanel(input: HTMLInputElement, date: DateValue, precision: "year" | "month" | "day"): Promise<boolean> {
  realClick(input);
  const panel = await waitFor(() => Array.from(document.querySelectorAll<HTMLElement>(PICKER_PANELS)).find(isVisible) ?? null, 800);
  if (!panel) return false;
  const header = () => textOf(panel.querySelector(".el-date-picker__header, .el-picker-panel__header, .ivu-date-picker-header") ?? panel, 120);
  const yearShown = () => Number(/(\d{4})/.exec(header())?.[1] ?? NaN);
  const monthShown = () => {
    const text = header().toLowerCase();
    const numeric = /(\d{1,2})\s*月/.exec(text);
    if (numeric) return Number(numeric[1]);
    const index = MONTH_NAMES.findIndex((name) => text.includes(name));
    return index >= 0 ? index + 1 : NaN;
  };
  const press = (selector: string) => {
    const button = Array.from(panel.querySelectorAll<HTMLElement>(selector)).find(isVisible);
    if (!button) return false;
    realClick(button);
    return true;
  };
  const year = Number(date.year);
  const month = Number(date.month || "1");
  for (let step = 0; step < 150 && yearShown() !== year; step += 1) {
    if (!press(yearShown() > year ? PREV_YEAR : NEXT_YEAR)) return false;
    await sleep(25);
  }
  if (yearShown() !== year) return false;

  const monthTable = panel.querySelector<HTMLElement>(".el-month-table, .ivu-date-picker-cells-month");
  if (precision !== "day" && monthTable && isVisible(monthTable)) {
    const cells = Array.from(monthTable.querySelectorAll<HTMLElement>("td, .ivu-date-picker-cells-cell"));
    const cell = cells[month - 1];
    if (!cell) return false;
    realClick(cell.querySelector(".cell, a, div, span, em") ?? cell);
    await sleep(150);
    return input.value.includes(date.year);
  }

  const dayTable = panel.querySelector<HTMLElement>(".el-date-table");
  if (!dayTable || !isVisible(dayTable)) return false;
  for (let step = 0; step < 400; step += 1) {
    const shown = yearShown() * 12 + monthShown();
    const wanted = year * 12 + month;
    if (Number.isNaN(shown) || shown === wanted) break;
    if (!press(shown > wanted ? PREV_MONTH : NEXT_MONTH)) return false;
    await sleep(20);
  }
  const day = String(Number(date.day || "1"));
  const cell = Array.from(dayTable.querySelectorAll<HTMLElement>("td.available, td:not(.prev-month):not(.next-month):not(.disabled)")).find(
    (td) => !td.classList.contains("prev-month") && !td.classList.contains("next-month") && textOf(td, 4) === day,
  );
  if (!cell) return false;
  realClick(cell.querySelector("span, div") ?? cell);
  await sleep(150);
  return input.value.includes(date.year);
}

export async function fillDate(control: Control, desired: Desired, fieldPrecision: "month" | "day"): Promise<FillResult> {
  if (desired.kind !== "date") {
    const input = control.input as HTMLInputElement;
    return input ? writeText(input, desired.text) : { ok: false, reason: "no-input" };
  }
  if (desired.date.present) return { ok: false, reason: "present" };
  const precision = control.datePrecision ?? fieldPrecision;
  return typeDate(control.input as HTMLInputElement, desired.date, precision, control.kind === "date" && control.root !== control.input);
}

export async function fillDateRange(control: Control, start: Desired | null, end: Desired | null, precision: "month" | "day"): Promise<FillResult> {
  const [first, second] = control.rangeInputs ?? [];
  const results: FillResult[] = [];
  if (first && start?.kind === "date" && !start.date.present) {
    realClick(first);
    await sleep(60);
    setNativeValue(first, formatDate(start.date, datePattern(first.placeholder, control.datePrecision ?? precision)), { blur: false });
    results.push({ ok: true });
  }
  if (second && end?.kind === "date" && !end.date.present) {
    setNativeValue(second, formatDate(end.date, datePattern(second.placeholder, control.datePrecision ?? precision)), { blur: false });
    pressKey(second, "Enter");
    results.push({ ok: true });
  }
  await sleep(120);
  pressKey(second ?? first, "Escape");
  (document.activeElement as HTMLElement | null)?.blur?.();
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  const ok = results.length > 0 && Boolean(first?.value);
  return { ok, uncertain: Boolean(end?.kind === "date" && end.date.present), chosen: [first?.value, second?.value].filter(Boolean).join(" ~ ") };
}

function datePartValue(date: DateValue, part: DatePart): string {
  if (part === "year") return date.year;
  if (part === "month") return date.month.replace(/^0/, "");
  return date.day.replace(/^0/, "");
}

/** Year / month dropdowns or inputs for one date (e.g. two selects under "开始时间"). */
export async function fillDatePart(control: Control, desired: Desired, part: DatePart): Promise<FillResult> {
  if (desired.kind !== "date" || desired.date.present) return { ok: false, reason: "present" };
  const value = datePartValue(desired.date, part);
  if (!value) return { ok: false, reason: "missing" };
  const variants = part === "year" ? [value, `${value}年`] : [value, value.padStart(2, "0"), `${value}月`, `${value.padStart(2, "0")}月`];
  if (control.kind === "native-select" || control.kind === "custom-select") {
    for (const variant of variants) {
      const target = { kind: "text" as const, text: variant, fallback: false };
      const result = control.kind === "native-select" ? await fillNativeSelect(control.input as HTMLSelectElement, target) : await fillCustomSelect(control, target);
      if (result.ok) return result;
    }
    return { ok: false, reason: "no-matching-option" };
  }
  return writeText(control.input as HTMLInputElement, part === "year" ? value : value.padStart(2, "0"));
}

function choiceLabel(member: HTMLInputElement): string {
  const label = member.closest("label") ?? (member.id ? document.querySelector(`label[for="${CSS.escape(member.id)}"]`) : null);
  if (label) return textOf(label, 80);
  const next = member.nextElementSibling ?? member.parentElement?.nextElementSibling;
  return (next ? textOf(next, 80) : "") || member.value;
}

export async function fillChoice(control: Control, desired: Desired): Promise<FillResult> {
  if (control.members?.length) {
    const radios = control.members.filter((member) => !member.disabled);
    const match = bestOption(radios, choiceLabel, desired);
    if (!match) return { ok: false, reason: "no-matching-option", options: radios.map(choiceLabel) };
    if (!match.item.checked) {
      match.item.click();
      if (!match.item.checked) realClick(match.item.closest("label") ?? match.item);
    }
    await sleep(30);
    return { ok: match.item.checked, chosen: choiceLabel(match.item) };
  }
  const items = control.choiceItems ?? [];
  const match = bestOption(items, (item) => textOf(item, 80), desired);
  if (!match) return { ok: false, reason: "no-matching-option", options: items.map((item) => textOf(item, 80)) };
  realClick(match.item);
  await sleep(30);
  return { ok: true, chosen: textOf(match.item, 80) };
}

export function fillCheckbox(control: Control, desired: Desired): FillResult {
  const box = control.input as HTMLInputElement;
  const want = desired.kind === "enum" ? desired.value === "yes" : /^(是|yes|true|1)$/i.test(desired.text);
  if (box.checked !== want) box.click();
  return { ok: box.checked === want, chosen: want ? "✓" : "✗" };
}

const PRESENT_WORDS = /^(至今|至 今|目前|当前|现在|在读|在职|仍在职|今|present|current|now|ongoing|till now|to date|i currently (work|study) here|currently (working|studying) here|still (working|studying))$/i;

/** Ticks the "至今 / I currently work here" toggle near an end-date field. */
export async function setPresent(control: Control, container: Element | null): Promise<FillResult> {
  let scope: Element | null = container ?? control.root.parentElement;
  for (let depth = 0; depth < 4 && scope; depth += 1) {
    const toggles = Array.from(scope.querySelectorAll<HTMLElement>("label, .el-checkbox, .ant-checkbox-wrapper, .ivu-checkbox-wrapper, [role=checkbox], button, span"));
    const toggle = toggles.find((element) => isVisible(element) && PRESENT_WORDS.test(normalizeLabel(textOf(element, 40))));
    if (toggle) {
      const box = toggle.querySelector<HTMLInputElement>("input[type=checkbox], input[type=radio]") ?? (toggle.closest("label")?.querySelector<HTMLInputElement>("input") ?? null);
      if (box) {
        if (!box.checked) box.click();
        return { ok: box.checked, chosen: textOf(toggle, 40) };
      }
      if (toggle.getAttribute("aria-checked") !== "true") realClick(toggle);
      return { ok: true, chosen: textOf(toggle, 40) };
    }
    scope = scope.parentElement;
  }
  // A dropdown end-date with a "至今" option.
  if (control.kind === "custom-select" || control.kind === "native-select") {
    const desired = { kind: "text" as const, text: "至今", fallback: false };
    const result = control.kind === "native-select" ? await fillNativeSelect(control.input as HTMLSelectElement, desired) : await fillCustomSelect(control, desired);
    if (result.ok) return result;
  }
  if (control.kind === "text") return writeText(control.input as HTMLInputElement, "至今");
  return { ok: false, reason: "present-toggle-not-found" };
}

export async function fillFile(control: Control, file: File): Promise<FillResult> {
  const input = control.input as HTMLInputElement;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(200);
  return { ok: Boolean(input.files?.length), chosen: file.name };
}

export async function fillControl(control: Control, desired: Desired, options: { precision: "month" | "day"; part?: string }): Promise<FillResult> {
  switch (control.kind) {
    case "native-select":
      return fillNativeSelect(control.input as HTMLSelectElement, desired, options.part);
    case "custom-select":
      return fillCustomSelect(control, desired, options.part);
    case "cascader":
      return fillCascader(control, desired);
    case "date":
      return fillDate(control, desired, options.precision);
    case "radio-group":
      return fillChoice(control, desired);
    case "checkbox":
      return fillCheckbox(control, desired);
    case "contenteditable": {
      control.root.focus();
      control.root.textContent = desired.text;
      control.root.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: desired.text }));
      control.root.blur();
      return { ok: true, chosen: desired.text };
    }
    case "text":
    case "textarea": {
      const input = control.input as HTMLInputElement | HTMLTextAreaElement;
      if (desired.kind === "date" && control.kind === "text" && (input.readOnly || control.datePrecision || input.hasAttribute("lay-key"))) {
        return fillDate(control, desired, options.precision);
      }
      // Text inputs that open a picker list on click (custom city/school selectors).
      if (input.readOnly && (desired.kind === "enum" || desired.kind === "region")) {
        const viaDropdown = await fillCustomSelect({ ...control, kind: "custom-select", root: (input.parentElement as HTMLElement) ?? input }, desired);
        if (viaDropdown.ok) return viaDropdown;
      }
      const text = plainText(desired, input, options.precision);
      return writeText(input, text);
    }
    default:
      return { ok: false, reason: "unsupported" };
  }
}

export async function waitForValue(control: Control): Promise<boolean> {
  return Boolean(await waitFor(() => hasValue(control), 400));
}
