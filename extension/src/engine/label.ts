import type { Control } from "./discover";
import { isVisible, ownText } from "./dom";

export interface LabelInfo {
  /** Best human-visible label (form item label, <label>, aria-label...). */
  label: string;
  placeholder: string;
  /** name/id/autocomplete hints. */
  identifiers: string;
  autocomplete: string;
  /** Element that groups this control with its label (used for date ranges and "至今" lookups). */
  container: HTMLElement | null;
}

const LIBRARY_FORM_ITEMS = [
  ".el-form-item",
  ".ant-form-item",
  ".ivu-form-item",
  ".arco-form-item",
  ".t-form__item",
  ".n-form-item",
  ".semi-form-field",
  ".layui-form-item",
  ".van-field",
].join(",");

export const FORM_ITEM_SELECTORS = [
  ".el-form-item",
  ".ant-form-item",
  ".ant-row.ant-form-item",
  ".ivu-form-item",
  ".arco-form-item",
  ".t-form__item",
  ".n-form-item",
  ".semi-form-field",
  ".layui-form-item",
  ".van-field",
  ".van-cell",
  ".form-group",
  ".form-item",
  ".form-field",
  ".field",
  "[data-automation-id^=formField]",
  "[class*=form-item]",
  "[class*=formItem]",
  "[class*=form_item]",
  "[class*=FormItem]",
  "[class*=form-row]",
  "[class*=field-item]",
].join(",");

const LABEL_SELECTORS = [
  ".el-form-item__label",
  ".ant-form-item-label",
  ".ivu-form-item-label",
  ".arco-form-item-label",
  ".t-form__label",
  ".n-form-item-label",
  ".layui-form-label",
  ".van-field__label",
  ".van-cell__title",
  "label",
  "legend",
  "[class*=label]",
  "[class*=Label]",
  "[class*=title]",
  "[class*=name]",
  "dt",
  "th",
].join(",");

const CONTROL_SELECTOR = "input:not([type=hidden]), select, textarea, [contenteditable=true]";

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function textWithoutControls(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("input, select, textarea, option, button, [class*=tip], [class*=error], [class*=help], [class*=hint]").forEach((node) => node.remove());
  return clean(clone.textContent);
}

function textByIds(ids: string | null): string {
  if (!ids) return "";
  return clean(
    ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" "),
  );
}

function countControls(element: Element): number {
  return element.querySelectorAll(CONTROL_SELECTOR).length;
}

function labelInContainer(container: Element, control: Control): string {
  const candidates = Array.from(container.querySelectorAll(LABEL_SELECTORS)).filter(
    (candidate) => !candidate.contains(control.root) && !control.root.contains(candidate) && !candidate.closest(".el-select-dropdown, .ant-select-dropdown"),
  );
  for (const candidate of candidates) {
    // Skip label-like nodes that wrap other controls (e.g. a nested form item).
    if (countControls(candidate) > 0 && candidate.tagName !== "LABEL") continue;
    const text = textWithoutControls(candidate);
    if (text && text.length <= 80) return text;
  }
  return "";
}

/** Text of the nearest short text node preceding the control (for table layouts and plain markup). */
function precedingText(root: Element): string {
  let node: Element | null = root;
  for (let depth = 0; depth < 4 && node; depth += 1) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (countControls(sibling) === 0) {
        const text = textWithoutControls(sibling);
        if (text && text.length <= 60 && isVisible(sibling)) return text;
      } else {
        break;
      }
      sibling = sibling.previousElementSibling;
    }
    // Text nodes directly before the control inside the same parent.
    const parentText = node.parentElement ? ownText(node.parentElement) : "";
    if (parentText && parentText.length <= 60) return parentText;
    if (node.parentElement && countControls(node.parentElement) > 1) break;
    node = node.parentElement;
  }
  // Table cell layout: <td>标签</td><td><input></td>
  const cell = root.closest("td, dd");
  const previous = cell?.previousElementSibling;
  if (previous && countControls(previous) === 0) return textWithoutControls(previous).slice(0, 60);
  return "";
}

export function findContainer(control: Control): HTMLElement | null {
  const library = control.root.closest(LIBRARY_FORM_ITEMS) as HTMLElement | null;
  if (library && countControls(library) <= 6) return library;
  // Start above the root: generic selectors like [class*=field] can match the control itself.
  let container = control.root.parentElement?.closest(FORM_ITEM_SELECTORS) as HTMLElement | null;
  // Skip wrappers that hold nothing but this control (e.g. "input-field" divs) when they have no label.
  while (container && !labelInContainer(container, control) && container.parentElement?.closest(FORM_ITEM_SELECTORS)) {
    const parent = container.parentElement.closest(FORM_ITEM_SELECTORS) as HTMLElement;
    if (countControls(parent) > 6) break;
    container = parent;
  }
  if (container && countControls(container) > 6) return null;
  return container;
}

export function readLabel(control: Control): LabelInfo {
  const element = (control.input ?? control.root) as HTMLElement;
  const container = findContainer(control);
  const placeholder = clean(
    (control.input as HTMLInputElement | undefined)?.placeholder ||
      control.root.getAttribute("placeholder") ||
      control.root.querySelector("[class*=placeholder]")?.textContent,
  );
  const identifiers = clean([element.getAttribute("name"), element.id, element.getAttribute("formcontrolname"), element.getAttribute("data-automation-id"), element.getAttribute("ng-model"), element.getAttribute("v-model")].filter(Boolean).join(" "));
  const autocomplete = clean(element.getAttribute("autocomplete")).toLowerCase();

  let label = textByIds(element.getAttribute("aria-labelledby") ?? control.root.getAttribute("aria-labelledby"));
  if (!label && element.id) {
    const explicit = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (explicit) label = textWithoutControls(explicit);
  }
  if (!label && control.kind !== "radio-group" && control.kind !== "checkbox-group") {
    const wrapping = element.closest("label");
    if (wrapping) label = textWithoutControls(wrapping);
  }
  if (!label && (control.kind === "radio-group" || control.kind === "checkbox-group")) {
    const legend = control.root.closest("fieldset")?.querySelector("legend");
    if (legend) label = clean(legend.textContent);
  }
  if (!label && container) label = labelInContainer(container, control);
  if (!label) label = clean(element.getAttribute("aria-label") ?? control.root.getAttribute("aria-label"));
  if (!label) label = precedingText(control.root);
  if (!label) label = clean(element.getAttribute("title"));

  return { label: label.slice(0, 120), placeholder: placeholder.slice(0, 120), identifiers, autocomplete, container };
}
