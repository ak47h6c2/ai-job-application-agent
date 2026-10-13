import type { Control } from "./discover";
import { SEARCH_SETTLE_MS, isVisible, pressEscape, pressKey, realClick, setNativeValue, sleep, textOf, typeInto, waitFor } from "./dom";
import { allowsOther, closeDropdown, fillCascader, fillCustomSelect, fillNativeSelect, isMultiSelect, OTHER_OPTION, type ChoiceResult } from "./dropdown";
import { ambiguousOptions, bestOption } from "./options";
import { normalizeLabel } from "./text";
import { datePattern, formatDate, numericValue, parseDate, splitMulti, type DateValue, type Desired } from "./values";

export type FillResult = ChoiceResult;

export type DatePart = "year" | "month" | "day";

/** Cuts long text at the last sentence end that fits, so descriptions do not stop mid-sentence. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const cut = Math.max(...["。", "！", "？", "；", ".", "!", "?", ";", "\n"].map((mark) => head.lastIndexOf(mark)));
  if (cut >= max * 0.6) return head.slice(0, cut + 1).trim();
  // Otherwise end at the last comma and close the sentence there.
  const soft = Math.max(...["，", "、", ","].map((mark) => head.lastIndexOf(mark)));
  if (soft >= max * 0.6) return head.slice(0, soft) + (head[soft] === "," ? "." : "。");
  return head;
}

function writeText(element: HTMLInputElement | HTMLTextAreaElement, text: string, limit?: number): FillResult {
  let value = text;
  let uncertain = false;
  if (element instanceof HTMLInputElement && element.type === "number") {
    const number = numericValue(text);
    if (number === null) return { ok: false, reason: "not-a-number" };
    uncertain = number !== text.trim();
    value = number;
  }
  // The widget's own maxlength, or a limit stated by the label or a "0/200" counter.
  const max = Math.min(element.maxLength > 0 ? element.maxLength : Infinity, limit && limit > 0 ? limit : Infinity);
  if (Number.isFinite(max) && value.length > max) {
    value = truncateText(value, max);
    uncertain = true;
  }
  const wasReadOnly = element.readOnly;
  if (wasReadOnly) element.readOnly = false;
  setNativeValue(element, value);
  if (wasReadOnly) element.readOnly = true;
  const truncated = Number.isFinite(max) && text.length > max;
  return { ok: element.value === value || element.value.length > 0, uncertain: uncertain || wasReadOnly, chosen: value, reason: truncated ? "truncated" : undefined };
}

function plainText(desired: Desired, element?: HTMLInputElement | HTMLTextAreaElement, precision: "year" | "month" | "day" = "month"): string {
  if (desired.kind === "date") {
    if (desired.date.present) return desired.text;
    const pattern = datePattern(element?.placeholder || element?.value || "", element?.type === "date" ? "day" : precision);
    return formatDate(desired.date, pattern);
  }
  return desired.text;
}

async function fillAutocomplete(control: Control, desired: Desired): Promise<FillResult> {
  const input = control.input as HTMLInputElement;
  if (!input) return { ok: false, reason: "no-input" };
  realClick(input);
  typeInto(input, desired.text);
  await sleep(SEARCH_SETTLE_MS);
  // Debounced remote suggestions appear only after typing. Never choose another open dropdown.
  const suggestions = () => {
    const listIds = [control.root.getAttribute("aria-owns"), control.root.getAttribute("aria-controls"), input.getAttribute("aria-controls"), input.getAttribute("aria-owns")];
    const owned = listIds.map(id => id ? document.getElementById(id) : null).find(Boolean);
    return Array.from((owned ?? control.root).querySelectorAll<HTMLElement>("li, [role=option]"))
      .filter(isVisible);
  };
  const match = await waitFor(() => {
    const found = bestOption(suggestions(), element => textOf(element, 200), desired);
    return found && found.score >= 90 ? found : null;
  }, 1800, 100);
  if (match) {
    realClick(match.item);
    await sleep(150);
    closeDropdown(control);
    const chosen = textOf(match.item, 200);
    return { ok: Boolean(input.value.trim()), uncertain: match.score < 100, chosen: input.value.trim() || chosen };
  }
  closeDropdown(control);
  await sleep(150);
  return input.value.trim() === desired.text.trim()
    ? { ok: true, uncertain: true, chosen: input.value, reason: "autocomplete-free-text" }
    : { ok: false, reason: "value-not-accepted" };
}

export function hasValue(control: Control): boolean {
  switch (control.kind) {
    case "radio-group":
      return Boolean(control.members?.some((member) => member.checked)) || Boolean(control.choiceItems?.some((item) => /(is-active|checked|selected|active)/.test(item.className)));
    case "checkbox": {
      // Ticked, or unticked by the user after we ticked it: either way their choice stands.
      const box = control.input as HTMLInputElement;
      return box.checked || box.dataset.jafTicked === "1";
    }
    case "checkbox-group":
      return Boolean(control.members?.some((member) => member.checked));
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

function showsDate(input: HTMLInputElement, date: DateValue): boolean {
  const shown = parseDate(input.value);
  return Boolean(shown && !shown.present && shown.year === date.year && (!shown.month || !date.month || shown.month === date.month));
}

/** Ant Design 3 month and year panels have no editable box: page to the year, then click the cell. */
async function clickAntPanel(popup: HTMLElement, input: HTMLInputElement, date: DateValue): Promise<boolean> {
  const press = (selector: string) => {
    const button = popup.querySelector<HTMLElement>(selector);
    if (!button || !isVisible(button)) return false;
    realClick(button);
    return true;
  };
  const year = Number(date.year);
  const monthPanel = popup.querySelector<HTMLElement>(".ant-calendar-month-panel");
  if (monthPanel && isVisible(monthPanel)) {
    const shown = () => Number(/\d{4}/.exec(textOf(monthPanel.querySelector(".ant-calendar-month-panel-year-select") ?? monthPanel, 40))?.[0] ?? NaN);
    for (let step = 0; step < 100 && shown() !== year; step += 1) {
      if (!press(shown() > year ? ".ant-calendar-month-panel-prev-year-btn" : ".ant-calendar-month-panel-next-year-btn")) return false;
      await sleep(25);
    }
    const cell = monthPanel.querySelectorAll<HTMLElement>(".ant-calendar-month-panel-cell")[Number(date.month || "1") - 1];
    if (shown() !== year || !cell) return false;
    realClick(cell.querySelector(".ant-calendar-month-panel-month") ?? cell);
  } else {
    const yearPanel = popup.querySelector<HTMLElement>(".ant-calendar-year-panel");
    if (!yearPanel || !isVisible(yearPanel)) return false;
    const decade = () => Number(/\d{4}/.exec(textOf(yearPanel.querySelector(".ant-calendar-year-panel-decade-select") ?? yearPanel, 40))?.[0] ?? NaN);
    for (let step = 0; step < 30 && !(decade() <= year && year < decade() + 10); step += 1) {
      if (!press(decade() > year ? ".ant-calendar-year-panel-prev-decade-btn" : ".ant-calendar-year-panel-next-decade-btn")) return false;
      await sleep(25);
    }
    const cell = Array.from(yearPanel.querySelectorAll<HTMLElement>(".ant-calendar-year-panel-cell")).find((item) => textOf(item, 8) === date.year);
    if (!cell) return false;
    realClick(cell.querySelector(".ant-calendar-year-panel-year") ?? cell);
  }
  await sleep(200);
  return showsDate(input, date);
}

/**
 * Ant Design 3 pickers keep their own editable box in the popup. It only accepts the widget's exact format
 * ("2027年" for a year picker), and Enter on unparsed text would commit the panel's current date instead,
 * so each format is tried and Enter is pressed only once the box stops reporting it as invalid.
 */
async function typeAntCalendar(input: HTMLInputElement, date: DateValue, precision: "year" | "month" | "day"): Promise<FillResult | null> {
  if (!input.closest(".ant-calendar-picker")) return null;
  const popup = () => Array.from(document.querySelectorAll<HTMLElement>(".ant-calendar-picker-container")).find(isVisible) ?? null;
  realClick(input);
  const opened = await waitFor(popup, 800);
  if (!opened) return null;
  const { year } = date;
  const month = date.month || "01";
  const day = date.day || "01";
  let result: FillResult = { ok: false, reason: "date-not-accepted" };
  const box = opened.querySelector<HTMLInputElement>(".ant-calendar-input");
  const formats = [formatDate(date, datePattern(input.value || input.placeholder, precision)),
    `${year}-${month}-${day}`, `${year}-${month}`, `${year}/${month}/${day}`, `${year}/${month}`, `${year}.${month}.${day}`, `${year}.${month}`,
    `${year}年${month}月${day}日`, `${year}年${month}月`, `${year}年`, year];
  for (const text of box ? Array.from(new Set(formats)) : []) {
    setNativeValue(box!, text, { blur: false });
    await sleep(80);
    if (box!.classList.contains("ant-calendar-input-invalid")) continue;
    pressKey(box!, "Enter");
    await sleep(200);
    if (showsDate(input, date)) {
      result = { ok: true, uncertain: Boolean(parseDate(input.value)?.day && !date.day), chosen: input.value };
      break;
    }
  }
  if (!result.ok && (await clickAntPanel(popup() ?? opened, input, date))) result = { ok: true, chosen: input.value };
  if (popup()) {
    if (box) pressEscape(box);
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await sleep(150);
  }
  return result;
}

async function typeDate(input: HTMLInputElement, date: DateValue, precision: "year" | "month" | "day", library: boolean): Promise<FillResult> {
  const antCalendar = await typeAntCalendar(input, date, precision);
  if (antCalendar) return antCalendar;
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
    pressEscape(input);
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
  pressEscape(second ?? first);
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

export function choiceLabel(member: HTMLInputElement): string {
  const label = member.closest("label") ?? (member.id ? document.querySelector(`label[for="${CSS.escape(member.id)}"]`) : null);
  if (label) return textOf(label, 80);
  const next = member.nextElementSibling ?? member.parentElement?.nextElementSibling;
  return (next ? textOf(next, 80) : "") || member.value;
}

export async function fillChoice(control: Control, desired: Desired): Promise<FillResult> {
  if (control.members?.length) {
    const radios = control.members.filter((member) => !member.disabled);
    let match = bestOption(radios, choiceLabel, desired);
    const tied = match ? null : ambiguousOptions(radios, choiceLabel, desired);
    if (tied) return { ok: false, reason: "ambiguous-option", options: tied };
    let chosenOther = false;
    if (!match && allowsOther(desired)) {
      const other = radios.find((radio) => OTHER_OPTION.test(choiceLabel(radio).replace(/\s+/g, "")));
      if (other) {
        match = { item: other, score: 0 };
        chosenOther = true;
      }
    }
    if (!match) return { ok: false, reason: "no-matching-option", options: radios.map(choiceLabel) };
    if (!match.item.checked) {
      match.item.click();
      if (!match.item.checked) realClick(match.item.closest("label") ?? match.item);
    }
    await sleep(30);
    return { ok: match.item.checked, chosen: choiceLabel(match.item), uncertain: chosenOther || undefined, reason: chosenOther ? "chose-other" : undefined };
  }
  const items = control.choiceItems ?? [];
  const match = bestOption(items, (item) => textOf(item, 80), desired);
  if (!match) return { ok: false, reason: "no-matching-option", options: items.map((item) => textOf(item, 80)) };
  realClick(match.item);
  await sleep(30);
  return { ok: true, chosen: textOf(match.item, 80) };
}

/** Ticks every option of a multi-choice group named in the value ("北京、上海"). Never unticks. */
export async function fillCheckboxGroup(control: Control, desired: Desired): Promise<FillResult> {
  const members = (control.members ?? []).filter((member) => !member.disabled);
  const chosen: string[] = [];
  for (const item of splitMulti(desired)) {
    const match = bestOption(members, choiceLabel, item);
    if (!match) continue;
    if (!match.item.checked) {
      match.item.click();
      if (!match.item.checked) realClick(match.item.closest("label") ?? match.item);
      await sleep(30);
    }
    chosen.push(choiceLabel(match.item));
  }
  if (!chosen.length) return { ok: false, reason: "no-matching-option", options: members.map(choiceLabel) };
  return { ok: true, chosen: chosen.join("、"), uncertain: chosen.length < splitMulti(desired).length };
}

/** Multi-select dropdowns: pick each listed value in turn. */
async function fillMultiSelect(control: Control, desired: Desired): Promise<FillResult> {
  const items = splitMulti(desired);
  const chosen: string[] = [];
  for (const item of items) {
    const result = control.kind === "native-select" ? await fillNativeSelect(control.input as HTMLSelectElement, item) : await fillCustomSelect(control, item);
    if (result.ok && result.reason !== "chose-other" && result.chosen) chosen.push(result.chosen);
  }
  if (control.kind === "custom-select") closeDropdown(control);
  if (!chosen.length) return { ok: false, reason: "no-matching-option" };
  return { ok: true, chosen: chosen.join("、"), uncertain: chosen.length < items.length };
}

export function fillCheckbox(control: Control, desired: Desired): FillResult {
  const box = control.input as HTMLInputElement;
  const want = desired.kind === "enum" ? desired.value === "yes" : /^(是|yes|true|1)$/i.test(desired.text);
  if (box.checked !== want) {
    box.click();
    box.dataset.jafTicked = "1";
  }
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
  if (!file.size) return { ok: false, reason: "empty-file" };
  const input = control.input as HTMLInputElement;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(200);
  return { ok: Boolean(input.files?.length), chosen: file.name };
}

export async function fillControl(control: Control, desired: Desired, options: { precision: "month" | "day"; part?: string; maxLength?: number }): Promise<FillResult> {
  switch (control.kind) {
    case "native-select":
      if (options.part === undefined && isMultiSelect(control)) return fillMultiSelect(control, desired);
      return fillNativeSelect(control.input as HTMLSelectElement, desired, options.part);
    case "custom-select":
      if (options.part === undefined && isMultiSelect(control) && splitMulti(desired).length > 1) return fillMultiSelect(control, desired);
      return fillCustomSelect(control, desired, options.part);
    case "checkbox-group":
      return fillCheckboxGroup(control, desired);
    case "cascader":
      return fillCascader(control, desired);
    case "date":
      return fillDate(control, desired, options.precision);
    case "radio-group":
      return fillChoice(control, desired);
    case "checkbox":
      return fillCheckbox(control, desired);
    case "contenteditable": {
      const truncated = Boolean(options.maxLength && desired.text.length > options.maxLength);
      const text = truncated ? truncateText(desired.text, options.maxLength!) : desired.text;
      control.root.focus();
      control.root.textContent = text;
      control.root.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      control.root.blur();
      return { ok: true, chosen: text, uncertain: truncated || undefined, reason: truncated ? "truncated" : undefined };
    }
    case "autocomplete":
      return fillAutocomplete(control, desired);
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
      return writeText(input, text, options.maxLength);
    }
    default:
      return { ok: false, reason: "unsupported" };
  }
}

export async function waitForValue(control: Control): Promise<boolean> {
  return Boolean(await waitFor(() => hasValue(control), 400));
}
