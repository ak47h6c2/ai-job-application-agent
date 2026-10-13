import { SCHEMA } from "../../../shared/profileSchema";
import { CASCADER_ROOTS, DATE_ROOTS, SELECT_ROOTS } from "./discover";
import { MODALS, docPosition, isDisabled, isVisible, realClick, textOf, waitFor, waitForIdle } from "./dom";
import type { Heading } from "./sections";
import { compact, normalizeLabel } from "./text";

const ADD_TEXT = /^(\+|＋)|^(添加|新增|增加|继续添加|再添加)|^(add|add another|add more|add new)(\s|$)/i;
const SAVE_TEXT = /^(保存|确定|确认|完成|保存并关闭|save|ok|done|confirm|add|添加)$/i;
/** An inline entry editor's own confirm; 完成 / 确认 on a page may finish the whole application. */
const INLINE_SAVE_TEXT = /^(保存|确定|保存并关闭|save|ok)$/i;
const CANCEL_TEXT = /(取消|关闭|cancel|close|删除|delete)/i;
const CLICKABLE = "button, a, [role=button], span, div, i, p, li, label";

export const DIALOG_SELECTORS =
  "[role=dialog], [aria-modal=true], .el-dialog, .el-drawer, .ant-modal, .ant-drawer-content, .ivu-modal, .layui-layer, .arco-modal, .t-dialog, .n-modal, .modal.show, .modal.in, .modal-dialog, [class*=dialog], [class*=Dialog], [class*=modal], [class*=Modal], [class*=drawer], [class*=popup-box]";

function sectionNames(section: string): string[] {
  const def = SCHEMA.sections.find((item) => item.key === section);
  return (def?.headings ?? []).map((heading) => compact(normalizeLabel(heading))).filter((name) => name.length >= 2);
}

function clickable(element: Element): HTMLElement {
  return (element.closest("button, a, [role=button]") as HTMLElement | null) ?? (element as HTMLElement);
}

function inRange(element: Element, start: Element | null, end: Element | null): boolean {
  if (start && docPosition(start, element) > 0) return false;
  if (end && docPosition(element, end) > 0) return false;
  return true;
}

/** "添加教育经历" / "+ 新增" / "Add another" button belonging to a section. */
export function findAddButton(section: string, headings: Heading[], scope: ParentNode = document): HTMLElement | null {
  const names = sectionNames(section);
  const real = headings.filter((heading) => !heading.nav);
  const own = real.filter((heading) => heading.section === section);
  // A highlighted tab or menu item names the section shown when the page has no title of its own; its plain
  // "+ 添加" then belongs to that section.
  const shownByMenu = !own.length && headings.some((heading) => heading.nav && heading.active && heading.section === section);
  let best: { element: HTMLElement; score: number } | null = null;
  const seen = new Set<Element>();
  scope.querySelectorAll(CLICKABLE).forEach((element) => {
    if (element.closest("[data-jaf-ui]")) return;
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const iconOnly = !text && /(add|plus|create)/i.test(`${element.className} ${element.getAttribute("aria-label") ?? ""}`);
    if (!iconOnly && (text.length === 0 || text.length > 24)) return;
    const normalized = compact(normalizeLabel(text));
    const mentionsSection = names.some((name) => normalized.includes(name));
    const addLike = iconOnly || ADD_TEXT.test(text) || /^(添加|新增|add)/.test(normalized) || (mentionsSection && /(添加|新增|增加|add)/i.test(text));
    if (!addLike) return;
    let target = clickable(element);
    // A wrapper with the same text as its button ("add-btn-wrapper" around "+ 添加荣誉或奖励") is not the
    // control: clicking it never reaches the button's handler.
    const inner = target.matches("button, a, [role=button]") ? null : target.querySelector<HTMLElement>("button, a, [role=button]");
    if (inner && compact(normalizeLabel(inner.textContent ?? "")) === normalized) target = inner;
    if (seen.has(target) || !isVisible(target) || isDisabled(target)) return;
    seen.add(target);
    // A bare "添加 / Add" beside "取消" in an open editor confirms that entry.
    // It must not be clicked as the section's "add another entry" action.
    const editor = target.closest(`form, ${DIALOG_SELECTORS}`);
    if (!mentionsSection && SAVE_TEXT.test(normalized) && editor
      && Array.from(editor.querySelectorAll("input:not([type=hidden]), textarea, select")).some(isVisible)
      && Array.from(editor.querySelectorAll("button, a, [role=button]")).some(button => isVisible(button) && /^(取消|关闭|cancel|close)$/i.test(compact(textOf(button, 30))))) return;
    let score = 0;
    if (mentionsSection) score += 60;
    if (shownByMenu) score += 45;
    for (const heading of own) {
      const index = real.indexOf(heading);
      const next = real[index + 1]?.element ?? null;
      if (inRange(target, heading.element, next)) score += 45;
      else if (heading.element.parentElement?.contains(target)) score += 30;
    }
    // A mention of a *different* section ("添加实习经历" when we want education) disqualifies.
    const other = SCHEMA.sections.some((def) => def.key !== section && sectionNames(def.key).some((name) => normalized.includes(name)));
    if (other && !mentionsSection) score = 0;
    if (iconOnly) score -= 10;
    if (score >= 40 && (!best || score > best.score)) best = { element: target, score };
  });
  return best ? (best as { element: HTMLElement }).element : null;
}

/** Any "添加教育经历"-style button on the page, found in one pass over text nodes (for showing the launcher). */
export function hasSectionAddButton(root: Element | null = document.body): boolean {
  if (!root) return false;
  const names = SCHEMA.sections.flatMap((section) => sectionNames(section.key));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").trim();
    if (text.length < 3 || text.length > 24 || !/(添加|新增|增加|add)/i.test(text)) continue;
    const normalized = compact(normalizeLabel(text));
    const element = node.parentElement;
    if (element && names.some((name) => normalized.includes(name)) && !element.closest("[data-jaf-ui]") && isVisible(clickable(element))) return true;
  }
  return false;
}

export function visibleDialogs(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(DIALOG_SELECTORS)).filter(
    (element) => isVisible(element) && !element.closest("[data-jaf-ui]") && element.querySelector("input:not([type=hidden]), textarea, select, .el-select, .ant-select"),
  );
}

/** Outermost newly visible dialog (ignores nested wrappers of the same dialog). */
export function newDialog(before: HTMLElement[]): HTMLElement | null {
  const fresh = visibleDialogs().filter((dialog) => !before.includes(dialog));
  const outer = fresh.filter((dialog) => !fresh.some((other) => other !== dialog && other.contains(dialog)));
  return outer[outer.length - 1] ?? null;
}

export function findSaveButton(scope: Element, { inline = false } = {}): HTMLElement | null {
  const buttons = Array.from(scope.querySelectorAll<HTMLElement>("button, a, [role=button], .layui-layer-btn0, input[type=button], input[type=submit]")).filter(
    (button) => isVisible(button) && !isDisabled(button),
  );
  const scored = buttons
    .map((button) => {
      const text = ((button as HTMLInputElement).value || textOf(button, 30)).replace(/\s+/g, "");
      if (!(inline ? INLINE_SAVE_TEXT : SAVE_TEXT).test(text) || CANCEL_TEXT.test(text)) return null;
      const primary = /(primary|btn0|submit|confirm|ok)/i.test(button.className) ? 10 : 0;
      return { button, score: primary + (/保存|save/i.test(text) ? 5 : 0) };
    })
    .filter(Boolean) as { button: HTMLElement; score: number }[];
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.button ?? null;
}

export async function clickAndSettle(element: HTMLElement): Promise<void> {
  realClick(element);
  await waitForIdle(document.body, 300, 2500);
}

export async function waitClosed(dialog: HTMLElement, timeout = 4000): Promise<boolean> {
  return Boolean(await waitFor(() => !isVisible(dialog) || null, timeout, 100));
}

/** Visible text between a section heading and the next heading, ignoring form controls. */
export function sectionText(section: string, headings: Heading[]): string {
  const real = headings.filter((heading) => !heading.nav);
  const own = real.filter((heading) => heading.section === section);
  const skip = `option, select, script, style, textarea, [contenteditable], [role=option], [role=listbox], [data-jaf-ui], [aria-hidden=true], ${SELECT_ROOTS}, ${CASCADER_ROOTS}, ${DATE_ROOTS}`;
  let text = "";
  const collect = (start: Node, next: Element | null, extraSkip?: string) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    walker.currentNode = start;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (next && (next === node.parentElement || docPosition(next, node) < 0)) break;
      const parent = node.parentElement;
      if (!parent || parent.closest(skip) || (extraSkip && parent.closest(extraSkip))) continue;
      if (!isVisible(parent)) continue;
      text += ` ${node.textContent ?? ""}`;
      if (text.length > 20000) break;
    }
  };
  for (const heading of own) collect(heading.element, real[real.indexOf(heading) + 1]?.element ?? null);
  // A tabbed resume shows one section under its highlighted tab, often titled only in its add dialog
  // (rencaishichang.chd.com.cn): the saved rows are the visible text outside dialogs.
  const titledOutsideDialogs = own.some((heading) => !heading.element.closest(MODALS));
  if (!titledOutsideDialogs && headings.some((heading) => heading.nav && heading.active && heading.section === section)) collect(document.body, null, MODALS);
  return compact(text.toLowerCase());
}
