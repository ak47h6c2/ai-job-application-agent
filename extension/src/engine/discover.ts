import { isVisible } from "./dom";

export type ControlKind =
  | "text"
  | "textarea"
  | "native-select"
  | "custom-select"
  | "cascader"
  | "date"
  | "date-range"
  | "radio-group"
  | "checkbox"
  | "file"
  | "contenteditable";

export interface Control {
  id: string;
  kind: ControlKind;
  /** Element that represents the whole widget (for custom components, the library root). */
  root: HTMLElement;
  /** Primary native element: the text input, select, textarea or file input. */
  input?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  /** Radio/checkbox members of a group. */
  members?: HTMLInputElement[];
  /** Custom (non-native) choice items, e.g. button-style radios. */
  choiceItems?: HTMLElement[];
  /** Range pickers have two inputs. */
  rangeInputs?: HTMLInputElement[];
  /** Date picker granularity guessed from the widget. */
  datePrecision?: "year" | "month" | "day";
}

export const CASCADER_ROOTS = [".el-cascader", ".ant-cascader", ".ant-select.ant-cascader", ".ivu-cascader", ".arco-cascader", ".t-cascader", ".n-cascader", ".vue-treeselect"].join(",");

export const SELECT_ROOTS = [
  ".el-select",
  ".el-select-v2",
  ".ant-select:not(.ant-cascader)",
  ".ivu-select",
  ".arco-select",
  ".t-select",
  ".semi-select",
  ".n-select",
  ".layui-form-select",
  ".select2-container",
  ".chosen-container",
  ".v-select",
  ".multiselect",
  ".vs__dropdown-toggle",
  ".van-dropdown-menu",
  ".ui-select",
  "[role=combobox]:not(input)",
  "button[aria-haspopup=listbox]",
  "div[aria-haspopup=listbox]",
].join(",");

export const DATE_ROOTS = [
  ".el-date-editor",
  ".ant-picker",
  ".ivu-date-picker",
  ".arco-picker",
  ".t-date-picker",
  ".n-date-picker",
  ".semi-datepicker",
  ".mx-datepicker",
  ".vdp-datepicker",
  ".react-datepicker-wrapper",
].join(",");

const RADIO_GROUP_ROOTS = [".el-radio-group", ".ant-radio-group", ".ivu-radio-group", ".arco-radio-group", ".t-radio-group", ".n-radio-group", "[role=radiogroup]"].join(",");
const BUTTON_RADIO_ITEMS = ".el-radio-button, .ant-radio-button-wrapper, .ivu-radio-wrapper, .t-radio-button, [role=radio]";

const SKIP_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "password", "range", "color", "search"]);

let counter = 0;
const ids = new WeakMap<Element, string>();

export function controlId(element: Element): string {
  let id = ids.get(element);
  if (!id) {
    counter += 1;
    id = `jaf-${Date.now().toString(36)}-${counter}`;
    ids.set(element, id);
    element.setAttribute("data-jaf-id", id);
  }
  return id;
}

function inside(element: Element, selector: string): HTMLElement | null {
  try {
    return element.closest(selector) as HTMLElement | null;
  } catch {
    return null;
  }
}

function isOwnUi(element: Element): boolean {
  return Boolean(element.closest("[data-jaf-ui]"));
}

function datePrecisionOf(root: Element, input?: Element | null): Control["datePrecision"] {
  const text = `${root.className} ${(input as HTMLInputElement | null)?.placeholder ?? ""} ${root.getAttribute("placeholder") ?? ""}`.toLowerCase();
  if (/year|年份|选择年(?!月)/.test(text) && !/month|月/.test(text)) return "year";
  if (/month|月份|年月|选择月/.test(text)) return "month";
  if (/date|日期|day/.test(text)) return "day";
  return undefined;
}

/** Finds every fillable widget inside `scope`, treating library components as single controls. */
export function discoverControls(scope: ParentNode = document): Control[] {
  const controls: Control[] = [];
  const claimed = new Set<Element>();
  const claim = (root: Element) => {
    claimed.add(root);
    root.querySelectorAll("input, select, textarea, [contenteditable]").forEach((element) => claimed.add(element));
  };

  scope.querySelectorAll<HTMLElement>(CASCADER_ROOTS).forEach((root) => {
    if (claimed.has(root) || isOwnUi(root) || !isVisible(root)) return;
    if (root.parentElement?.closest(CASCADER_ROOTS)) return;
    const input = root.querySelector<HTMLInputElement>("input:not([type=hidden])") ?? undefined;
    controls.push({ id: controlId(root), kind: "cascader", root, input });
    claim(root);
  });

  scope.querySelectorAll<HTMLElement>(DATE_ROOTS).forEach((root) => {
    if (claimed.has(root) || isOwnUi(root) || !isVisible(root)) return;
    if (root.parentElement?.closest(DATE_ROOTS)) return;
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>("input:not([type=hidden])"));
    if (!inputs.length) return;
    const isRange = inputs.length >= 2 || /range/.test(root.className);
    controls.push({
      id: controlId(root),
      kind: isRange && inputs.length >= 2 ? "date-range" : "date",
      root,
      input: inputs[0],
      rangeInputs: isRange ? inputs.slice(0, 2) : undefined,
      datePrecision: datePrecisionOf(root, inputs[0]),
    });
    claim(root);
  });

  scope.querySelectorAll<HTMLElement>(SELECT_ROOTS).forEach((root) => {
    if (claimed.has(root) || isOwnUi(root) || !isVisible(root)) return;
    if (root.parentElement?.closest(SELECT_ROOTS)) return;
    if (root.closest(DATE_ROOTS) || root.closest(CASCADER_ROOTS)) return;
    const input = root.querySelector<HTMLInputElement>("input:not([type=hidden])") ?? undefined;
    controls.push({ id: controlId(root), kind: "custom-select", root, input });
    claim(root);
  });

  scope.querySelectorAll<HTMLElement>(RADIO_GROUP_ROOTS).forEach((root) => {
    if (claimed.has(root) || isOwnUi(root) || !isVisible(root)) return;
    const members = Array.from(root.querySelectorAll<HTMLInputElement>("input[type=radio], input[type=checkbox]"));
    const choiceItems = Array.from(root.querySelectorAll<HTMLElement>(BUTTON_RADIO_ITEMS)).filter(isVisible);
    if (!members.length && !choiceItems.length) return;
    controls.push({ id: controlId(root), kind: "radio-group", root, members, choiceItems: choiceItems.length ? choiceItems : undefined });
    claim(root);
  });

  // Native radios grouped by name.
  const radioGroups = new Map<string, HTMLInputElement[]>();
  scope.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach((radio) => {
    if (claimed.has(radio) || isOwnUi(radio)) return;
    const visible = isVisible(radio) || isVisible(radio.closest("label")) || isVisible(radio.parentElement);
    if (!visible) return;
    const key = radio.name || `__${controlId(radio.parentElement ?? radio)}`;
    radioGroups.set(key, [...(radioGroups.get(key) ?? []), radio]);
  });
  radioGroups.forEach((members) => {
    const root = commonAncestor(members) as HTMLElement;
    controls.push({ id: controlId(root), kind: "radio-group", root, members });
    members.forEach((member) => claimed.add(member));
  });

  scope.querySelectorAll<HTMLElement>("input, select, textarea, [contenteditable=true], [contenteditable='']").forEach((element) => {
    if (claimed.has(element) || isOwnUi(element)) return;
    if (element instanceof HTMLInputElement) {
      const type = (element.type || "text").toLowerCase();
      if (type === "file") {
        // Upload widgets usually hide the real input; keep it if its container is visible.
        const host = element.closest("label, .el-upload, .ant-upload, .ivu-upload, [class*=upload]") ?? element.parentElement;
        if (isVisible(element) || isVisible(host)) controls.push({ id: controlId(element), kind: "file", root: (host as HTMLElement) ?? element, input: element });
        return;
      }
      if (SKIP_INPUT_TYPES.has(type) || type === "radio") return;
      if (element.readOnly && element.closest(SELECT_ROOTS)) return;
      if (!isVisible(element)) return;
      if (type === "checkbox") {
        controls.push({ id: controlId(element), kind: "checkbox", root: element, input: element, members: [element] });
        return;
      }
      const kind = type === "date" || type === "month" || type === "datetime-local" ? "date" : "text";
      controls.push({
        id: controlId(element),
        kind,
        root: element,
        input: element,
        datePrecision: type === "month" ? "month" : type === "date" ? "day" : inside(element, "[lay-key]") || element.hasAttribute("lay-key") ? datePrecisionOf(element, element) : undefined,
      });
      return;
    }
    if (element instanceof HTMLSelectElement) {
      if (!isVisible(element)) return;
      controls.push({ id: controlId(element), kind: "native-select", root: element, input: element });
      return;
    }
    if (element instanceof HTMLTextAreaElement) {
      if (!isVisible(element) || element.readOnly) return;
      controls.push({ id: controlId(element), kind: "textarea", root: element, input: element });
      return;
    }
    if (isVisible(element) && !element.closest("[contenteditable=true] [contenteditable=true]")) {
      controls.push({ id: controlId(element), kind: "contenteditable", root: element });
    }
  });

  // Hidden native selects backing a plugin UI (layui/select2/chosen) were skipped above; the plugin root is used instead.
  controls.forEach((control) => {
    if (control.kind === "custom-select" && !control.input) {
      const native = control.root.parentElement?.querySelector("select");
      if (native) control.input = native;
    }
  });

  return controls.sort((a, b) => (a.root.compareDocumentPosition(b.root) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

export function commonAncestor(elements: Element[]): Element {
  if (!elements.length) return document.body;
  let candidate: Element | null = elements[0].parentElement;
  while (candidate && !elements.every((element) => candidate!.contains(element))) candidate = candidate.parentElement;
  return candidate ?? document.body;
}

export function looksLikeApplicationForm(doc: Document = document): boolean {
  const fields = doc.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea, .el-select, .ant-select");
  let visible = 0;
  for (const field of Array.from(fields)) {
    if (isVisible(field)) visible += 1;
    if (visible >= 4) return true;
  }
  return false;
}
