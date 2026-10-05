export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isVisible(element: Element | null | undefined): boolean {
  if (!element || !(element instanceof Element) || !element.isConnected) return false;
  const rects = element.getClientRects();
  if (!rects.length) return false;
  // Layout size, not painted size: popups animate with transform: scaleY(0 -> 1).
  if (element instanceof HTMLElement) {
    if (element.offsetWidth < 1 || element.offsetHeight < 1) return false;
  } else {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
  }
  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

/** Visible text directly owned by an element (excludes form controls' values). */
export function textOf(element: Element | null | undefined, limit = 400): string {
  if (!element) return "";
  const html = element as HTMLElement;
  const text = typeof html.innerText === "string" && isVisible(element) ? html.innerText : element.textContent ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function ownText(element: Element): string {
  let text = "";
  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
  });
  return text.replace(/\s+/g, " ").trim();
}

export async function waitFor<T>(probe: () => T | null | undefined | false, timeout = 1500, interval = 50): Promise<T | null> {
  const started = Date.now();
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() - started >= timeout) return null;
    await sleep(interval);
  }
}

/** Resolves once the DOM has had no mutations for `quiet` ms (or after `timeout`). */
export function waitForIdle(root: Node = document.body, quiet = 250, timeout = 3000): Promise<void> {
  return new Promise((resolve) => {
    let timer = window.setTimeout(done, quiet);
    const hardStop = window.setTimeout(done, timeout);
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(done, quiet);
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    function done() {
      observer.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(hardStop);
      resolve();
    }
  });
}

function center(element: Element): { clientX: number; clientY: number } {
  const rect = element.getBoundingClientRect();
  return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
}

/** Full pointer + mouse + click sequence; works for libraries that open on mousedown (antd) or click (Element). */
export function realClick(element: Element): void {
  const html = element as HTMLElement;
  html.scrollIntoView?.({ block: "center", inline: "nearest" });
  const point = center(element);
  const base = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, ...point };
  element.dispatchEvent(new PointerEvent("pointerover", base));
  element.dispatchEvent(new MouseEvent("mouseover", base));
  element.dispatchEvent(new MouseEvent("mouseenter", { ...base, bubbles: false }));
  element.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1, pointerType: "mouse", isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
  if (typeof html.focus === "function" && html.matches("input, textarea, select, button, a, [tabindex]")) html.focus({ preventScroll: true });
  element.dispatchEvent(new PointerEvent("pointerup", { ...base, pointerType: "mouse", isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mouseup", base));
  element.dispatchEvent(new MouseEvent("click", base));
}

export function pressKey(element: Element, key: string, type: "keydown" | "keyup" | "both" = "both"): void {
  const codes: Record<string, number> = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, Tab: 9, Backspace: 8 };
  const make = (eventType: string) => {
    const event = new KeyboardEvent(eventType, { key, code: key, bubbles: true, cancelable: true, composed: true });
    Object.defineProperty(event, "keyCode", { get: () => codes[key] ?? 0 });
    Object.defineProperty(event, "which", { get: () => codes[key] ?? 0 });
    return event;
  };
  if (type !== "keyup") element.dispatchEvent(make("keydown"));
  if (type !== "keydown") element.dispatchEvent(make("keyup"));
}

const valueSetters = new Map<string, ((this: HTMLElement, value: string) => void) | undefined>();

function nativeSetter(element: HTMLElement): ((this: HTMLElement, value: string) => void) | undefined {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const name = proto.constructor.name;
  if (!valueSetters.has(name)) valueSetters.set(name, Object.getOwnPropertyDescriptor(proto, "value")?.set as never);
  return valueSetters.get(name);
}

/** Sets a value the way a user would, so React/Vue/Angular bindings all notice. */
export function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string, { blur = true } = {}): void {
  element.focus({ preventScroll: true });
  element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  const setter = nativeSetter(element);
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: value }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  if (blur) {
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));
    element.blur();
  }
}

/** Types text into a search box (dropdown filters, remote search) without committing via blur. */
export function typeInto(element: HTMLInputElement, value: string): void {
  element.focus({ preventScroll: true });
  const setter = nativeSetter(element);
  element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: value }));
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.slice(-1) || "a" }));
}

export function closestMatch(element: Element, selectors: string): Element | null {
  try {
    return element.closest(selectors);
  } catch {
    return null;
  }
}

export function queryAllDeep(root: ParentNode, selector: string): Element[] {
  const results: Element[] = [];
  const visit = (node: ParentNode) => {
    node.querySelectorAll(selector).forEach((element) => results.push(element));
    node.querySelectorAll("*").forEach((element) => {
      const shadow = (element as HTMLElement).shadowRoot;
      if (shadow) visit(shadow);
    });
  };
  visit(root);
  return results;
}

/** Click target that actually handles clicks (button, link, or the element itself). */
export function clickableOf(element: Element): Element {
  return element.closest("button, a, [role=button], [role=option], [role=tab], label") ?? element;
}

export function isDisabled(element: Element): boolean {
  if ((element as HTMLInputElement).disabled) return true;
  if (element.getAttribute("aria-disabled") === "true") return true;
  return /(^|\s)(is-disabled|disabled|ant-select-disabled|ant-select-item-option-disabled|el-select-dropdown__item\.is-disabled)(\s|$)/.test(element.className?.toString?.() ?? "");
}

export function docPosition(a: Node, b: Node): number {
  if (a === b) return 0;
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
