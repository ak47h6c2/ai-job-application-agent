import { SCHEMA } from "../../../shared/profileSchema";
import { docPosition, isDisabled, isVisible, realClick, textOf, waitFor, waitForIdle } from "./dom";
import type { Heading } from "./sections";
import { compact, normalizeLabel } from "./text";

const ADD_TEXT = /^(\+|＋)|^(添加|新增|增加|继续添加|再添加)|^(add|add another|add more|add new)(\s|$)/i;
const SAVE_TEXT = /^(保存|确定|确认|完成|提交|保存并关闭|save|ok|done|confirm|submit|add|添加|apply)$/i;
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
    const target = clickable(element);
    if (seen.has(target) || !isVisible(target) || isDisabled(target)) return;
    seen.add(target);
    let score = 0;
    if (mentionsSection) score += 60;
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

export function findSaveButton(scope: Element): HTMLElement | null {
  const buttons = Array.from(scope.querySelectorAll<HTMLElement>("button, a, [role=button], .layui-layer-btn0, input[type=button], input[type=submit]")).filter(
    (button) => isVisible(button) && !isDisabled(button),
  );
  const scored = buttons
    .map((button) => {
      const text = ((button as HTMLInputElement).value || textOf(button, 30)).replace(/\s+/g, "");
      if (!SAVE_TEXT.test(text) || CANCEL_TEXT.test(text)) return null;
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
  let text = "";
  for (const heading of own) {
    const next = real[real.indexOf(heading) + 1]?.element ?? null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    walker.currentNode = heading.element;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (next && (next === node.parentElement || docPosition(next, node) < 0)) break;
      const parent = node.parentElement;
      if (!parent || parent.closest("option, select, script, style, textarea, [data-jaf-ui], [aria-hidden=true]")) continue;
      if (!isVisible(parent)) continue;
      text += ` ${node.textContent ?? ""}`;
      if (text.length > 20000) break;
    }
  }
  return compact(text.toLowerCase());
}
