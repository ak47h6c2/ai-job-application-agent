import type { Control } from "./discover";
import { isDisabled, isVisible, pressKey, realClick, sleep, textOf, typeInto, waitFor } from "./dom";
import { bestOption, searchTerms } from "./options";
import { compact, normalizeLabel, toHalfWidth } from "./text";
import type { Desired } from "./values";

export interface ChoiceResult {
  ok: boolean;
  uncertain?: boolean;
  chosen?: string;
  reason?: string;
  options?: string[];
}

const OPTION_SELECTORS = [
  ".el-select-dropdown__item",
  ".el-select-v2__item",
  ".ant-select-item-option",
  ".ivu-select-item",
  ".arco-select-option",
  ".t-select-option",
  ".semi-select-option",
  ".n-base-select-option",
  ".layui-form-select dl dd",
  ".select2-results__option",
  ".chosen-results li",
  ".vs__dropdown-option",
  ".multiselect__option",
  ".van-picker-column__item",
  ".van-dropdown-item__option",
  ".dropdown-menu .dropdown-item",
  ".dropdown-menu li",
  "[role=option]",
  "[data-automation-id=promptOption]",
].join(",");

const POPUP_SELECTORS =
  ".el-select-dropdown, .el-popper, .ant-select-dropdown, .ivu-select-dropdown, .arco-select-popup, .t-popup, .semi-popover, .n-base-select-menu, .layui-anim, .select2-dropdown, .chosen-drop, .vs__dropdown-menu, [role=listbox], .dropdown-menu, [class*=dropdown], [class*=popper], [class*=popup], [class*=options]";

const PLACEHOLDER_OPTION = /^(请选择|请选择.*|--.*|select( an option)?|please select|choose( one)?|none selected)$/i;

function optionText(element: Element): string {
  return (element.getAttribute("title") || textOf(element, 200)).trim();
}

function visibleOptions(scope: ParentNode = document): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(OPTION_SELECTORS)).filter(
    (element) =>
      isVisible(element) &&
      !isDisabled(element) &&
      !element.classList.contains("layui-select-tips") &&
      !element.closest("[data-jaf-ui]") &&
      // antd renders a zero-size accessibility listbox; isVisible already drops it.
      !PLACEHOLDER_OPTION.test(normalizeLabel(optionText(element))),
  );
}

function popupOf(option: Element): Element {
  return option.parentElement?.closest(POPUP_SELECTORS) ?? option.parentElement ?? option;
}

function distance(a: Element, b: Element): number {
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  return Math.abs(ra.left - rb.left) + Math.abs(ra.bottom - rb.top);
}

/** Options belonging to the dropdown that `control` just opened. */
export function openOptions(control: Control, before: Set<Element>): HTMLElement[] {
  const owned = control.root.querySelector("[aria-controls], [aria-owns]") ?? control.root;
  const listId = owned.getAttribute("aria-controls") || owned.getAttribute("aria-owns");
  if (listId) {
    const list = document.getElementById(listId);
    const inList = list ? visibleOptions(list) : [];
    if (inList.length) return inList;
  }
  const inside = visibleOptions(control.root);
  if (inside.length) return inside;
  const all = visibleOptions(document);
  if (!all.length) return genericOptions(before);
  const groups = new Map<Element, HTMLElement[]>();
  all.forEach((option) => {
    const popup = popupOf(option);
    groups.set(popup, [...(groups.get(popup) ?? []), option]);
  });
  const ranked = Array.from(groups.entries()).sort(([popupA, a], [popupB, b]) => {
    const freshA = a.some((option) => !before.has(option)) ? 0 : 1;
    const freshB = b.some((option) => !before.has(option)) ? 0 : 1;
    if (freshA !== freshB) return freshA - freshB;
    return distance(control.root, popupA) - distance(control.root, popupB);
  });
  return ranked[0][1];
}

const GENERIC_ITEMS = "li, dd, [class*=option], [class*=item]";

function isFloating(element: Element): boolean {
  for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === "absolute" || position === "fixed") return true;
  }
  return false;
}

/** Fallback for unknown libraries: short text items in a floating layer that became visible after opening. */
function genericOptions(before: Set<Element>): HTMLElement[] {
  const fresh = Array.from(document.querySelectorAll<HTMLElement>(GENERIC_ITEMS)).filter(
    (element) =>
      !before.has(element) &&
      isVisible(element) &&
      element.children.length <= 3 &&
      !element.querySelector("input, select, textarea, label") &&
      textOf(element, 80).length > 0 &&
      textOf(element, 80).length <= 40 &&
      !element.closest("[data-jaf-ui], form label, [class*=form-item]"),
  );
  const groups = new Map<Element, HTMLElement[]>();
  fresh.forEach((element) => groups.set(element.parentElement!, [...(groups.get(element.parentElement!) ?? []), element]));
  const best = Array.from(groups.values())
    .filter((group) => isFloating(group[0]))
    .sort((a, b) => b.length - a.length)[0];
  return best && best.length >= 2 ? best : [];
}

export function snapshotOptions(): Set<Element> {
  return new Set([...visibleOptions(document), ...Array.from(document.querySelectorAll(GENERIC_ITEMS)).filter(isVisible)]);
}

function triggerOf(control: Control): HTMLElement {
  const selectors = [
    ".el-select__wrapper",
    ".el-input__inner",
    ".el-input",
    ".ant-select-selector",
    ".ivu-select-selection",
    ".arco-select-view",
    ".t-input",
    ".layui-select-title",
    ".select2-selection",
    ".chosen-single",
    ".chosen-choices",
    ".vs__dropdown-toggle",
    ".multiselect__tags",
    ".el-cascader .el-input",
    ".ant-select-selector",
  ];
  for (const selector of selectors) {
    const found = control.root.querySelector<HTMLElement>(selector);
    if (found && isVisible(found)) return found;
  }
  return control.root;
}

function isExpanded(control: Control): boolean {
  const flag = control.root.getAttribute("aria-expanded") ?? control.root.querySelector("[aria-expanded]")?.getAttribute("aria-expanded");
  return flag === "true";
}

/** Opened (or focused for typing) even if no options are rendered yet, e.g. an empty remote search. */
function looksActive(control: Control): boolean {
  if (isExpanded(control)) return true;
  const classes = [control.root, ...Array.from(control.root.querySelectorAll("*"))].map((element) => element.className?.toString?.() ?? "").join(" ");
  return /(is-focus|is-focused|is-active|ant-select-open|ant-select-focused|select2-container--open|chosen-with-drop|layui-form-selected|vs--open|multiselect--active|ivu-select-visible|arco-select-view-focus)/.test(classes);
}

function freshOrAny(control: Control, before: Set<Element>, started: number, patience: number): HTMLElement[] | null {
  const found = openOptions(control, before);
  if (!found.length) return null;
  // Popups of the previous dropdown can still be fading out; wait briefly for this one's options.
  if (found.every((option) => before.has(option)) && Date.now() - started < patience) return null;
  return found;
}

export async function openDropdown(control: Control): Promise<{ before: Set<Element>; options: HTMLElement[] }> {
  const before = snapshotOptions();
  if (!isExpanded(control)) realClick(triggerOf(control));
  let started = Date.now();
  let options = (await waitFor(() => freshOrAny(control, before, started, 500), 1200)) ?? [];
  if (!options.length && !looksActive(control)) {
    // Some widgets only open on focus or on the inner input.
    const input = control.root.querySelector<HTMLElement>("input") ?? control.root;
    input.focus();
    realClick(input);
    started = Date.now();
    options = (await waitFor(() => freshOrAny(control, before, started, 400), 800)) ?? [];
  }
  return { before, options };
}

export function closeDropdown(control: Control): void {
  const input = control.root.querySelector("input") ?? control.root;
  pressKey(input, "Escape");
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  (document.activeElement as HTMLElement | null)?.blur?.();
}

function searchInputOf(control: Control, options: HTMLElement[]): HTMLInputElement | null {
  const own = control.root.querySelector<HTMLInputElement>("input:not([type=hidden]):not([readonly])");
  if (own && !own.disabled) return own;
  const popup = options[0] ? popupOf(options[0]) : null;
  // Only a real floating popup may provide the search box (never the surrounding form).
  if (popup && popup !== options[0] && !popup.contains(control.root) && isFloating(popup) && popup.querySelectorAll("input").length <= 2) {
    const inPopup = popup.querySelector<HTMLInputElement>("input:not([type=hidden])");
    if (inPopup && isVisible(inPopup)) return inPopup;
  }
  const fresh = document.querySelector<HTMLInputElement>(".select2-search__field, .chosen-search input, .el-select-dropdown input, .ant-select-dropdown input");
  return fresh && isVisible(fresh) ? fresh : null;
}

function scrollContainer(options: HTMLElement[]): HTMLElement | null {
  let node: HTMLElement | null = options[0]?.parentElement ?? null;
  while (node && node !== document.body) {
    if (node.scrollHeight > node.clientHeight + 8 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

function displayedValue(control: Control): string {
  const input = control.root.querySelector<HTMLInputElement>("input:not([type=hidden])");
  const item = control.root.querySelector(".ant-select-selection-item, .el-select__selected-item, .el-select__placeholder:not(.is-transparent), .select2-selection__rendered, .chosen-single span, .layui-select-title input, .ivu-select-selected-value, .arco-select-view-value, .vs__selected");
  const nativeSelect = control.input instanceof HTMLSelectElement ? control.input.selectedOptions[0]?.textContent ?? "" : "";
  return [input?.value ?? "", item?.getAttribute("title") ?? item?.textContent ?? "", nativeSelect, textOf(control.root, 200)].join(" ");
}

function looksSelected(control: Control, chosen: string): boolean {
  const shown = compact(toHalfWidth(displayedValue(control)).toLowerCase());
  const wanted = compact(toHalfWidth(chosen).toLowerCase());
  return Boolean(wanted) && shown.includes(wanted);
}

async function pick(control: Control, option: HTMLElement): Promise<ChoiceResult> {
  const chosen = optionText(option);
  realClick(option);
  await sleep(120);
  const ok = await waitFor(() => looksSelected(control, chosen), 600);
  if (visibleOptions(document).includes(option)) {
    // Single selects close by themselves; give the popup a moment, then force it closed.
    if (!(await waitFor(() => !isVisible(option) || null, 400))) closeDropdown(control);
  }
  return { ok: true, uncertain: !ok, chosen };
}

/** Selects the option that best matches `desired` in any dropdown-like widget. */
export async function fillCustomSelect(control: Control, desired: Desired, part?: string): Promise<ChoiceResult> {
  const { before, options: opened } = await openDropdown(control);
  let options = opened;
  let match = bestOption(options, optionText, desired, part);
  if (match) return pick(control, match.item);

  const search = searchInputOf(control, options);
  if (search) {
    for (const term of searchTerms(desired, part)) {
      if (!search.isConnected) break;
      typeInto(search, term);
      // Remote search (school/company lookups) can take a moment.
      const found = await waitFor(() => {
        const current = openOptions(control, before);
        return bestOption(current, optionText, desired, part) ?? null;
      }, 1800, 100);
      if (found) return pick(control, found.item);
      options = openOptions(control, before);
    }
  }

  // Virtualized lists only render what is in view: scroll through them.
  const scroller = scrollContainer(options);
  if (scroller) {
    const seen = new Set<string>();
    for (let step = 0; step < 60; step += 1) {
      scroller.scrollTop += Math.max(60, scroller.clientHeight * 0.8);
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(60);
      const current = openOptions(control, before);
      current.forEach((option) => seen.add(optionText(option)));
      match = bestOption(current, optionText, desired, part);
      if (match) return pick(control, match.item);
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) break;
    }
  }

  const available = Array.from(new Set(openOptions(control, before).map(optionText))).slice(0, 30);
  if (search) typeInto(search, "");
  closeDropdown(control);
  return { ok: false, reason: available.length ? "no-matching-option" : "dropdown-did-not-open", options: available };
}

export async function fillNativeSelect(select: HTMLSelectElement, desired: Desired, part?: string): Promise<ChoiceResult> {
  const options = Array.from(select.options).filter((option) => {
    const text = (option.textContent ?? "").trim();
    return !option.disabled && Boolean(text) && !(option.value === "" && PLACEHOLDER_OPTION.test(text));
  });
  const match = bestOption(options, (option) => option.textContent ?? "", desired, part);
  if (!match) return { ok: false, reason: "no-matching-option", options: options.map((option) => (option.textContent ?? "").trim()).slice(0, 30) };
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  select.focus({ preventScroll: true });
  setter ? setter.call(select, match.item.value) : (select.value = match.item.value);
  match.item.selected = true;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  select.blur();
  return { ok: true, chosen: (match.item.textContent ?? "").trim() };
}

const CASCADER_MENUS = ".el-cascader-menu, .ant-cascader-menu, .ivu-cascader-menu, .arco-cascader-list, .t-cascader__menu, .n-cascader-submenu";
const CASCADER_ITEMS = ".el-cascader-node, .ant-cascader-menu-item, .ivu-cascader-menu-item, .arco-cascader-option, .t-cascader__item, .n-cascader-option, li";
const CASCADER_SUGGESTIONS = ".el-cascader__suggestion-item, .ant-cascader-menu-item, .ivu-cascader-menu-item, [role=option]";
const PASS_THROUGH = /^(市辖区|市区|城区|县|省直辖县级行政区划|自治区直辖县级行政区划|直辖市)$/;

function openMenus(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(CASCADER_MENUS)).filter(isVisible);
}

function menuItems(menu: Element): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(CASCADER_ITEMS)).filter((item) => isVisible(item) && !isDisabled(item) && !item.querySelector(CASCADER_ITEMS));
}

export async function fillCascader(control: Control, desired: Desired): Promise<ChoiceResult> {
  const parts = desired.kind === "region" ? desired.parts : [desired.text];
  realClick(triggerOf(control));
  const menus = await waitFor(() => (openMenus().length ? openMenus() : null), 1200);
  if (menus) {
    let level = 0;
    let partIndex = 0;
    const path: string[] = [];
    while (partIndex < parts.length && level < 6) {
      const menu = openMenus()[level];
      if (!menu) break;
      const items = menuItems(menu);
      const match = bestOption(items, optionText, desired, parts[partIndex]);
      let target = match?.item;
      if (!target) {
        const passThrough = items.length === 1 ? items[0] : items.find((item) => PASS_THROUGH.test(optionText(item)));
        if (!passThrough) break;
        target = passThrough;
      } else {
        partIndex += 1;
      }
      path.push(optionText(target));
      const menuCount = openMenus().length;
      realClick(target);
      await waitFor(() => openMenus().length !== menuCount || !isVisible(menu) || null, 900);
      level += 1;
      if (!openMenus().length) break;
    }
    const stillOpen = openMenus().length > 0;
    if (path.length && partIndex === parts.length && !stillOpen) return { ok: true, chosen: path.join(" / ") };
    if (path.length && partIndex === parts.length) {
      // Path matched but the widget wants a deeper level (e.g. 区县); leave it open for the user.
      closeDropdown(control);
      return { ok: true, uncertain: true, chosen: path.join(" / "), reason: "needs-deeper-level" };
    }
  }

  // Filterable cascaders: type the most specific part and pick the suggestion containing the whole path.
  const input = control.root.querySelector<HTMLInputElement>("input:not([readonly])");
  if (input) {
    const last = parts[parts.length - 1];
    typeInto(input, last);
    const suggestion = await waitFor(() => {
      const items = Array.from(document.querySelectorAll<HTMLElement>(CASCADER_SUGGESTIONS)).filter(isVisible);
      return bestOption(items, optionText, { kind: "text", text: parts.join(" / "), fallback: false }) ?? bestOption(items, optionText, desired, last);
    }, 1500, 100);
    if (suggestion) {
      realClick(suggestion.item);
      await sleep(150);
      return { ok: true, uncertain: true, chosen: optionText(suggestion.item) };
    }
  }
  closeDropdown(control);
  return { ok: false, reason: "cascader-path-not-found" };
}
