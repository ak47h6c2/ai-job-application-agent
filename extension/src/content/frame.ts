import { type Lang } from "../../../shared/profileSchema";
import { isVisible, setNativeValue, textOf } from "../engine/dom";
import { fillPage, fillWithTarget, rememberKey, type FieldReport, type FillReport } from "../engine/engine";
import { send, type FillContext } from "../messages";

/** True while the engine itself is changing values, so learning ignores those events. */
let programmatic = false;
let filledOnce = false;
const learning = new WeakSet<Element>();

const MARK_STYLE_ID = "jaf-mark-style";
const MARK_CSS = `
[data-jaf-state="filled"] { box-shadow: 0 0 0 2px rgba(16,185,129,.45) !important; border-radius: 4px; }
[data-jaf-state="uncertain"] { box-shadow: 0 0 0 2px rgba(245,158,11,.75) !important; border-radius: 4px; }
[data-jaf-state="failed"] { box-shadow: 0 0 0 2px rgba(239,68,68,.75) !important; border-radius: 4px; }
[data-jaf-flash] { outline: 3px solid #6366f1 !important; outline-offset: 2px; transition: outline-color .3s; }
`;

function injectMarks(): void {
  if (document.getElementById(MARK_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = MARK_STYLE_ID;
  style.textContent = MARK_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

export function clearMarks(): void {
  document.querySelectorAll("[data-jaf-state]").forEach((element) => element.removeAttribute("data-jaf-state"));
  document.getElementById(MARK_STYLE_ID)?.remove();
}

async function loadContext(): Promise<FillContext> {
  return send<FillContext>({ type: "get-context", host: location.host });
}

function fileFetcher() {
  return async (kind: string, lang: Lang): Promise<File | null> => {
    const file = await send<{ name: string; type: string; data: string } | null>({ type: "get-file", kind, lang });
    if (!file) return null;
    const bytes = Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0));
    return new File([bytes], file.name, { type: file.type });
  };
}

function elementById(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-jaf-id="${CSS.escape(id)}"]`);
}

function currentValue(root: HTMLElement): string {
  if (root instanceof HTMLSelectElement) return (root.selectedOptions[0]?.textContent ?? "").trim();
  if (root instanceof HTMLInputElement || root instanceof HTMLTextAreaElement) return root.type === "file" ? "" : root.value.trim();
  const checked = root.querySelector<HTMLInputElement>("input[type=radio]:checked, input[type=checkbox]:checked");
  if (checked) return textOf(checked.closest("label") ?? checked.parentElement, 80);
  const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>("input:not([type=hidden]), textarea");
  return (input?.value || textOf(root, 200)).trim();
}

/** After a fill, watch fields we could not fill; what the user types there can be saved as answers. */
function watchForAnswers(items: FieldReport[], lang: Lang): void {
  for (const item of items) {
    const watchable = ["unmatched", "question", "failed", "empty"].includes(item.status) || item.target?.startsWith("answer.");
    if (!watchable || !item.label || item.label.length < 2) continue;
    const root = elementById(item.id);
    if (!root || learning.has(root) || item.kind === "file") continue;
    learning.add(root);
    const report = () => {
      if (programmatic) return;
      const answer = currentValue(root);
      if (!answer || answer.length > 3000) return;
      void send({ type: "learned", key: item.id, answer: { question: item.label, answer, lang } });
    };
    root.addEventListener("change", report, true);
    root.addEventListener("focusout", report, true);
  }
}

export async function fillFrame(lang: Lang | "auto", overwrite: boolean): Promise<FillReport> {
  const context = await loadContext();
  if (!context.profile) return { lang: lang === "auto" ? "zh" : lang, items: [], added: [], notes: ["no-profile"] };
  injectMarks();
  programmatic = true;
  try {
    const report = await fillPage({
      profile: context.profile,
      lang,
      overwrite,
      memory: new Map(Object.entries(context.memory ?? {})),
      getFile: fileFetcher(),
    });
    filledOnce = true;
    watchForAnswers(report.items, report.lang);
    return report;
  } finally {
    programmatic = false;
  }
}

export async function fillOne(id: string, target: string, lang: Lang): Promise<FieldReport | null> {
  const context = await loadContext();
  if (!context.profile) return null;
  injectMarks();
  programmatic = true;
  try {
    if (target === "skip") {
      elementById(id)?.removeAttribute("data-jaf-state");
      return null;
    }
    return await fillWithTarget({ profile: context.profile, lang, memory: new Map(), getFile: fileFetcher() }, id, target, lang);
  } finally {
    programmatic = false;
  }
}

export function focusField(id: string): void {
  const element = elementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.setAttribute("data-jaf-flash", "");
  const input = element.matches("input, textarea, select") ? element : element.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select");
  window.setTimeout(() => input?.focus({ preventScroll: true }), 300);
  window.setTimeout(() => element.removeAttribute("data-jaf-flash"), 1600);
}

export function setText(id: string, text: string): boolean {
  const element = elementById(id);
  const input = element?.matches("input, textarea") ? (element as HTMLInputElement) : element?.querySelector<HTMLInputElement | HTMLTextAreaElement>("textarea, input");
  if (!input) return false;
  programmatic = true;
  try {
    setNativeValue(input, text);
  } finally {
    programmatic = false;
  }
  element?.setAttribute("data-jaf-state", "uncertain");
  return true;
}

const SUBMIT_TEXT = /^(提交|投递|确认投递|立即投递|提交申请|确认提交|申请职位|立即申请|投递简历|提交简历|确认并提交|submit|apply|apply now|submit application|send application)$/i;

export function watchSubmit(): void {
  document.addEventListener(
    "click",
    (event) => {
      if (!filledOnce) return;
      const target = (event.target as Element | null)?.closest("button, a, input[type=submit], input[type=button], [role=button]");
      if (!target || target.closest("[data-jaf-ui]") || !isVisible(target)) return;
      const text = ((target as HTMLInputElement).value || textOf(target, 30)).replace(/\s+/g, "");
      if (SUBMIT_TEXT.test(text)) void send({ type: "submitted" });
    },
    true,
  );
}

export { rememberKey };
