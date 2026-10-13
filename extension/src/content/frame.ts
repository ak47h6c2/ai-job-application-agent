import { CAPTURE_SCHEMA_VERSION, emptyProfile, type Lang, type ProfileData } from "../../../shared/profileSchema";
import { capturePage, diffCapture, type PageCapture } from "../engine/capture";
import { isVisible, realClick, setNativeValue, textOf, waitForIdle } from "../engine/dom";
import { fillPage, fillWithTarget, inspectPage, rememberKey, textLimit, textMinimum, type FieldReport, type FillReport } from "../engine/engine";
import { discoverControls, type Control } from "../engine/discover";
import { truncateText } from "../engine/fillers";
import { contextualMemoryKey, memoryKey } from "../engine/classify";
import { readLabel } from "../engine/label";
import { findHeadings, sectionFor } from "../engine/sections";
import { send, type CaptureResult, type DraftField, type DraftResult, type DraftSnapshot, type FillContext } from "../messages";

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

/** Last context seen in this frame; capture on click has to read the page before it changes. */
let lastContext: FillContext | null = null;

async function loadContext(): Promise<FillContext> {
  lastContext = await send<FillContext>({ type: "get-context", host: location.host });
  return lastContext;
}

function memoryOf(context: FillContext | null): Map<string, string> {
  return new Map(Object.entries(context?.memory ?? {}));
}

function fileFetcher() {
  return async (kind: string, lang: Lang): Promise<File | null> => {
    const file = await send<{ name: string; type: string; data: string; size: number } | null>({ type: "get-file", kind, lang });
    if (!file?.data) return null;
    const bytes = Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0));
    if (bytes.byteLength !== file.size) return null;
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
    if (!report.items.length) {
      const editButtons = findEditButtons().length;
      if (editButtons) report.notes.push(`edit-buttons:${editButtons}`);
    }
    return report;
  } finally {
    programmatic = false;
  }
}

export async function inspectFrame(lang: Lang | "auto"): Promise<FillReport> {
  const context = await loadContext();
  if (!context.profile) return { lang: lang === "auto" ? "zh" : lang, items: [], added: [], notes: ["no-profile"] };
  const report = inspectPage({ profile: context.profile, lang, memory: memoryOf(context) });
  watchForAnswers(report.items, report.lang);
  return report;
}

const EDIT_TEXT = /^(编辑|修改|完善|去完善|立即完善|去填写|填写|添加|新增|\+添加|\+新增|简历维护|维护简历|编辑简历|修改简历|完善简历|edit|add|addnew)$/i;
/** Pencil-only buttons: an icon labelled "edit" or an edit icon class (Semi, Element, Ant Design). */
const EDIT_ICON = "[aria-label='edit' i], [aria-label='编辑'], [title='编辑'], [title='修改'], [title='edit' i], [class*=icon-edit], .anticon-edit";

/** "编辑 / 去完善 / 添加" buttons on pages that show the resume read-only until you open a section. */
export function findEditButtons(): HTMLElement[] {
  const seen = new Set<Element>();
  const clickable = (element: Element) => (element.closest("button, a, [role=button]") as HTMLElement | null) ?? (element as HTMLElement);
  const keep = (target: HTMLElement) => {
    if (seen.has(target) || target.closest("[data-jaf-ui]") || !isVisible(target)) return false;
    seen.add(target);
    return true;
  };
  const byText = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role=button], span, div, i"))
    .filter((element) => {
      const text = (element.textContent ?? "").replace(/[\s:：]+/g, "");
      if (!text || text.length > 6 || !EDIT_TEXT.test(text)) return false;
      // Keep the innermost clickable element only.
      return !Array.from(element.children).some((child) => EDIT_TEXT.test((child.textContent ?? "").replace(/[\s:：]+/g, "")));
    })
    .map(clickable)
    .filter(keep);
  // A pencil button with at most a short caption ("简历维护"); never one that deletes or cancels.
  const byIcon = Array.from(document.querySelectorAll(EDIT_ICON)).map(clickable).filter((target) => {
    const text = (target.textContent ?? "").replace(/\s+/g, "");
    return text.length <= 8 && !/删除|移除|取消|delete|remove|cancel/i.test(text) && keep(target);
  });
  return [...byText, ...byIcon];
}

/** Clicks the first visible edit button (preferring one in view), so the form opens for filling. */
export async function clickEdit(): Promise<string | null> {
  const buttons = findEditButtons();
  const inView = buttons.find((button) => {
    const rect = button.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  });
  const button = inView ?? buttons[0];
  if (!button) return null;
  realClick(button);
  await waitForIdle(document.body, 400, 3000);
  return textOf(button, 20);
}

export async function fillOne(id: string, target: string, lang: Lang, automatic = false, mappingKey?: string): Promise<FieldReport | null> {
  const context = await loadContext();
  if (!context.profile) return null;
  injectMarks();
  programmatic = true;
  try {
    if (target === "skip") {
      elementById(id)?.removeAttribute("data-jaf-state");
      return null;
    }
    // Site settings (the date shift) apply; remembered field mappings do not, since a target was chosen.
    const settings = new Map(Array.from(memoryOf(context)).filter(([key]) => key.startsWith("setting::")));
    return await fillWithTarget({ profile: context.profile, lang, memory: settings, getFile: fileFetcher() }, id, target, lang, automatic, mappingKey);
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

function draftControl(field: DraftField): Control | null {
  const headings = findHeadings(document.body);
  const candidates = discoverControls(document).filter(control => {
    if (control.kind !== field.kind || !["text", "textarea", "contenteditable"].includes(control.kind)) return false;
    if (control.input?.disabled || (control.input && "readOnly" in control.input && control.input.readOnly)) return false;
    const info = readLabel(control);
    const label = info.label || info.placeholder || info.identifiers;
    return memoryKey(label) === memoryKey(field.label)
      && (!field.mappingKey || contextualMemoryKey(label, sectionFor(control.root, headings)) === field.mappingKey);
  });
  // A surviving id identifies an entry; after remount, only a unique match is safe.
  return candidates.find(control => control.id === field.id) ?? (candidates.length === 1 ? candidates[0] : null);
}

function draftValue(control: Control): string {
  return control.input ? control.input.value : control.root.textContent ?? "";
}

export function prepareDraft(field: DraftField): DraftSnapshot {
  const control = draftControl(field);
  if (!control) return { error: "找不到唯一对应的输入框，请打开对应编辑区后重新读取本页。" };
  return { field: { ...field, id: control.id }, value: draftValue(control), maxLength: textLimit(control, field.label), minLength: textMinimum(field.label) };
}

export async function setText(field: DraftField, text: string, expectedValue: string): Promise<DraftResult> {
  const control = draftControl(field);
  if (!control) return { applied: false, error: "页面已变化，找不到唯一对应的输入框。草稿已保留，请核对后手动填写。" };
  if (draftValue(control) !== expectedValue) return { applied: false, error: "你在起草期间修改了这个栏位，已保留你的内容；草稿可在下方查看。" };
  const limit = textLimit(control, field.label);
  const value = limit && text.length > limit ? truncateText(text, limit) : text;
  programmatic = true;
  try {
    if (control.input instanceof HTMLInputElement || control.input instanceof HTMLTextAreaElement) setNativeValue(control.input, value);
    else {
      control.root.textContent = value;
      control.root.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      control.root.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await waitForIdle(document.body, 100, 600);
    const current = draftControl({ ...field, id: control.id });
    if (!current || draftValue(current) !== value) return { applied: false, error: "网站没有保留填写内容，草稿已保留，请核对后手动填写。" };
    injectMarks();
    current.root.setAttribute("data-jaf-state", "uncertain");
    return { applied: true, id: current.id, answer: value };
  } finally {
    programmatic = false;
  }
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

async function proposalsFor(capture: PageCapture): Promise<CaptureResult> {
  const context = await loadContext().catch(() => lastContext);
  const profile: ProfileData = context?.profile ?? emptyProfile();
  return { schemaVersion: CAPTURE_SCHEMA_VERSION, lang: capture.lang, proposals: diffCapture(profile, capture) };
}

/** Reads the values on this frame and compares them with the profile (panel button). */
export async function captureFrame(): Promise<CaptureResult> {
  const context = await loadContext().catch(() => lastContext);
  return proposalsFor(capturePage(context?.profile ?? emptyProfile(), { memory: memoryOf(context) }));
}

const SAVE_TEXT =
  /^(保存|暂存|保存草稿|保存信息|保存简历|保存并继续|保存并下一步|保存并返回|下一步|继续|确定|确认|完成|提交|提交申请|确认提交|投递|立即投递|确认投递|投递简历|提交简历|申请|立即申请|申请职位|save|savedraft|saveandcontinue|save&continue|next|continue|done|submit|submitapplication|apply|applynow|confirm|ok|review)$/i;

/** Recruitment pages (or frames embedded in one), where values typed into a form belong in the profile. */
const JOB_PAGE = /简历|招聘|网申|应聘|求职|校招|社招|职位|岗位|人才|recruit|career|job|apply|application|resume|talent|hiring|zhaopin|51job|liepin|mokahr|workday|greenhouse|lever/i;

function looksLikeJobPage(): boolean {
  const ancestors = Array.from(location.ancestorOrigins ?? []).join(" ");
  return JOB_PAGE.test(`${location.hostname} ${location.pathname} ${location.hash} ${document.title} ${ancestors}`);
}

let contextRequested = false;

/** When the user clicks 保存 / 下一步 / 提交, read what they typed before the page moves on. */
export function watchSave(enabled: () => boolean): void {
  // The profile is read only once someone starts typing into a recruitment form (or used the panel here),
  // not on every page and frame the browser opens.
  document.addEventListener(
    "focusin",
    (event) => {
      if (lastContext || contextRequested || !enabled() || !(event.target instanceof Element)) return;
      if (!event.target.closest("input, textarea, select, [contenteditable], [role=combobox], [tabindex], form") || !(filledOnce || looksLikeJobPage())) return;
      contextRequested = true;
      void loadContext().catch(() => { contextRequested = false; });
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      // Our own clicks (adding entries, confirming dialogs) are synthetic and happen while filling.
      // Only recruitment forms (or pages where the panel was used) are read; the profile may still be loading.
      if (!event.isTrusted || programmatic || !enabled() || !(lastContext || filledOnce || looksLikeJobPage())) return;
      const target = (event.target as Element | null)?.closest("button, a, input[type=submit], input[type=button], [role=button], .layui-layer-btn0");
      if (!target || target.closest("[data-jaf-ui]")) return;
      const text = ((target as HTMLInputElement).value || textOf(target, 30)).replace(/\s+/g, "");
      if (!SAVE_TEXT.test(text)) return;
      let capture: PageCapture;
      try {
        capture = capturePage(lastContext?.profile ?? emptyProfile(), { clicked: target, memory: memoryOf(lastContext) });
      } catch {
        return;
      }
      if (!capture.values.length && !capture.answers.length) return;
      void proposalsFor(capture).then((result) => {
        if (result.proposals.length) void send({ type: "captured", result });
      });
    },
    true,
  );
}

export { rememberKey };
