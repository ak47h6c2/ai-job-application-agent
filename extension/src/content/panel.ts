import { SCHEMA, readValue, type Lang } from "../../../shared/profileSchema";
import { capturePayload, type Proposal } from "../engine/capture";
import { compatibleField, isDistinctQuestion } from "../engine/classify";
import { send, type CaptureResult, type DraftResult, type FillContext, type FrameReport, type JobInfo, type LearnedAnswer, type TaggedField } from "../messages";
import { PANEL_CSS } from "./panelStyles";
import { rememberKey } from "./frame";

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key === "className") element.className = String(value);
    else if (key in element && typeof value !== "string") (element as unknown as Record<string, unknown>)[key] = value;
    else element.setAttribute(key, String(value));
  }
  for (const child of children) if (child) element.append(child);
  return element;
}

const STATUS_TEXT: Record<string, string> = {
  "no-matching-option": "下拉里没有匹配的选项",
  "ambiguous-option": "有几个相近的选项，资料库无法区分，请手动选择",
  "entry-detail": "按这段经历的其他资料选择，请核对",
  "alternate-value": "列表里没有原值，已按资料库里的对应名称选择，请核对",
  "range-option": "按数值区间选了最接近的一档，请核对",
  "dropdown-did-not-open": "下拉框没打开",
  "autocomplete-free-text": "已填入文字，未找到对应建议，请核对网站是否接受",
  "value-not-accepted": "网站未接受输入，请从建议中手动选择",
  "cascader-path-not-found": "地区没找到",
  "needs-deeper-level": "还需选到区县",
  "date-not-accepted": "日期格式不被接受",
  "present-toggle-not-found": "没找到「至今」选项",
  "missing-in-profile": "资料库里没填",
  "section-mismatch": "识别结果与本页类目不符，已拦截",
  "missing-family-member": "资料库里没有对应关系的家庭成员",
  "empty-file": "附件内容为空，请重新上传资料库附件",
  "missing-region-level": "资料里的地区少一级（比如缺区县）",
  "chose-other": "列表里没有，已选「其他」，请补充填写",
  "not-a-number": "这里只能填数字",
  "answer-not-written": "问答库里这题还没写答案",
  "ai-draft": "AI 草稿，请核对",
  "joined-entries": "已填入资料库里的全部条目，请按网站要求保留需要的",
  "political-status-mismatch": "和你的政治面貌不符，留空",
  "chose-overseas": "列表里没有这个境外地点，已选「海外」，请核对",
  "overseas-study": "境外院校，已选海外留学类选项，请核对",
  "other-language": "用了另一种语言的资料",
  truncated: "超出字数，已在句末截断；可点「AI 缩写」按字数重写",
  sensitive: "敏感信息，默认不填",
  "has-value": "已有内容，未覆盖",
  "entry-not-in-profile": "资料库中没有唯一对应的经历，请核对学校/公司、日期，或补充资料",
};

function guessJob(): JobInfo {
  const raw = document.title.replace(/\s+/g, " ").trim();
  const parts = raw.split(/\s*[|｜\-–—_·]\s*/).filter(Boolean);
  const site = document.querySelector<HTMLMetaElement>("meta[property='og:site_name']")?.content ?? "";
  const companyPart = parts.find((part) => /(公司|集团|银行|科技|有限|大学|研究院|医院|Group|Ltd|Inc|Pty|Bank|University)/i.test(part));
  const company = (site || companyPart || parts[parts.length - 1] || location.hostname)
    .replace(/(校园招聘|社会招聘|招聘官网|招聘网站|官方招聘|招聘|careers?|jobs?)$/i, "")
    .trim();
  const title = parts.find((part) => part !== companyPart && part !== site && !/(网申|招聘|首页|登录|申请表|apply|application|careers)/i.test(part)) ?? parts[0] ?? "";
  return { title: title.slice(0, 160), company: company.slice(0, 160), url: location.href.slice(0, 500) };
}

const JD_HEADING = /^(?:岗位职责|岗位描述|岗位要求|岗位详情|职位描述|职位职责|职位要求|职位详情|任职要求|任职资格|job description|responsibilities|requirements|qualifications|about the role)/i;
const FORM_CONTROL = "input:not([type=hidden]), textarea, select, [contenteditable=true], [contenteditable='']";

/** Text under job-description headings only; never the application form or values typed into it. */
export function jobDescription(): string {
  const blocks: HTMLElement[] = [];
  for (const element of Array.from(document.body?.querySelectorAll<HTMLElement>("*") ?? [])) {
    if (element.children.length > 2 || element.closest("[data-jaf-ui], script, style")) continue;
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().replace(/[:：]$/, "");
    if (!text || text.length > 24 || !JD_HEADING.test(text)) continue;
    // Grow from the heading to its paragraph block, stopping before anything that holds form controls.
    let block = element.parentElement;
    while (block && block !== document.body && block.innerText.trim().length <= text.length + 4 && !block.querySelector(FORM_CONTROL)) block = block.parentElement;
    if (!block || block === document.body || block.querySelector(FORM_CONTROL) || blocks.some((other) => other.contains(block!))) continue;
    blocks.splice(0, blocks.length, ...blocks.filter((other) => !block!.contains(other)), block);
  }
  return blocks
    .map((block) => block.innerText.replace(/\s+/g, " ").trim())
    .join("\n")
    // Defensive: a description never needs contact details or identity numbers.
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b\d{17}[\dXx]\b|\b1[3-9]\d{9}\b/g, "")
    .slice(0, 4000);
}

/** Browser messaging errors in plain words. */
function connectionError(detail: string): string | null {
  if (/extension context invalidated|receiving end does not exist|could not establish connection/i.test(detail)) return "插件已更新，当前网页连接已失效。请刷新当前网页，再打开网申助手。";
  if (/message channel closed|message port closed/i.test(detail)) return "插件后台处理超时被浏览器重启（网页在后台时浏览器会限速）。请把网页放在前台，再点一次填写。";
  return null;
}

function extensionVersion(): string {
  return typeof chrome.runtime?.getManifest === "function" ? chrome.runtime.getManifest().version : "";
}

function captureLabels(proposal: Proposal): { title: string; entry?: string } {
  const section = SCHEMA.sections.find(item => item.key === proposal.section);
  if (!section) return { title: proposal.title };
  const lang: Lang = proposal.title.startsWith(section.en) ? "en" : "zh";
  const field = proposal.index !== null && proposal.values.length === 1
    ? section.fields.find(item => item.key === proposal.values[0].key) : undefined;
  const action = proposal.blocked ? (lang === "zh" ? "待核对" : "Needs review")
    : proposal.index === null ? (lang === "zh" ? "新增经历" : "New entry") : (lang === "zh" ? "更新经历" : "Update entry");
  // Pending suggestions from older versions still have the combined title.
  const parts = proposal.title.split(" · ");
  let entry = proposal.entryTitle ?? (parts.length > 1 ? parts.slice(1).join(" · ") : proposal.title);
  const suffix = field ? ` · ${field[lang]}` : "";
  if (!proposal.entryTitle && suffix && entry.endsWith(suffix)) entry = entry.slice(0, -suffix.length);
  return { title: `${section[lang]} · ${field?.[lang] ?? action}`, entry: entry || undefined };
}

function targetOptions(ctx: FillContext | null): HTMLOptGroupElement[] {
  const groups: HTMLOptGroupElement[] = [];
  for (const group of SCHEMA.basicGroups) {
    const optgroup = h("optgroup", { label: group.zh });
    group.fields.forEach((field) => optgroup.append(h("option", { value: `basic.${field.key}` }, field.zh)));
    groups.push(optgroup);
  }
  for (const section of SCHEMA.sections) {
    const optgroup = h("optgroup", { label: section.zh });
    section.fields.forEach((field) => optgroup.append(h("option", { value: `${section.key}.${field.key}` }, `${section.zh} · ${field.zh}`)));
    groups.push(optgroup);
  }
  const answers = ctx?.profile?.answers ?? [];
  if (answers.length) {
    const optgroup = h("optgroup", { label: "常用问答" });
    answers.slice(0, 200).forEach((answer) => optgroup.append(h("option", { value: `answer.${answer.id}` }, answer.question.slice(0, 40))));
    groups.push(optgroup);
  }
  return groups;
}

export class Panel {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private launcher: HTMLElement | null = null;
  private open = false;
  private busy = false;
  private scanned = false;
  private overwrite = false;
  private lang: Lang | "auto" = "auto";
  private ctx: FillContext | null = null;
  private reports: FrameReport[] = [];
  private learned = new Map<string, LearnedAnswer>();
  private submitted = false;
  private recorded = false;
  private job: JobInfo = guessJob();
  private message = "";
  private drafting = new Set<string>();
  private pendingDrafts = new Map<string, { label: string; answer: string }>();
  private mapping = false;
  private editFrame: number | null = null;
  private captured: Proposal[] = [];
  private capturing = false;

  private ensureHost(): ShadowRoot {
    if (this.shadow) return this.shadow;
    this.host = h("div", { "data-jaf-ui": "" });
    this.host.style.cssText = "all: initial; position: fixed; z-index: 2147483646; right: 16px; bottom: 16px;";
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.shadow.append(h("style", {}, PANEL_CSS));
    document.documentElement.append(this.host);
    return this.shadow;
  }

  /** The launcher or the panel is on the page. */
  get shown(): boolean {
    return Boolean(this.launcher) || this.open;
  }

  showLauncher(): void {
    if (this.launcher || this.open) return;
    const shadow = this.ensureHost();
    this.launcher = h(
      "button",
      { className: "launcher", title: "网申助手：一键填写 (Alt+Shift+F)", onClick: () => this.toggle(true) },
      h("span", { className: "launcher-mark" }, "填"),
    );
    shadow.append(this.launcher);
  }

  hideLauncher(): void {
    this.launcher?.remove();
    this.launcher = null;
  }

  async toggle(open = !this.open, autoFill = false): Promise<void> {
    this.open = open;
    if (open) {
      this.hideLauncher();
      this.job = { ...guessJob(), ...(this.recorded ? this.job : {}) };
      this.ctx = null;
      this.message = "正在连接插件并读取资料…";
      this.render();
      try {
        // Always start from the latest profile and AI settings.
        await send({ type: "refresh-profile" });
        const context = await send<FillContext & { error?: string }>({ type: "get-context", host: location.host });
        if (!context?.settings) throw new Error(context?.error ?? "没有收到插件后台的响应");
        if (!this.open) return;
        this.ctx = context;
        this.lang = this.lang === "auto" ? context.settings.langMode : this.lang;
        this.message = "";
        this.render();
        if (autoFill) await this.fill();
      } catch (error) {
        const detail = (error as Error).message;
        this.message = /extension context invalidated|receiving end does not exist|could not establish connection/i.test(detail)
          ? "插件已更新，当前页面的连接已失效。请刷新当前网页，再打开网申助手。"
          : `连接插件失败：${detail}。请刷新当前网页后重试。`;
        this.render();
      }
    } else {
      this.shadow?.querySelector(".panel")?.remove();
      void send({ type: "clear-marks" });
      this.reports = [];
      if (this.ctx?.settings.showLauncher !== false) this.showLauncher();
    }
  }

  onLearned(key: string, answer: LearnedAnswer): void {
    this.learned.set(key, answer);
    if (this.open) this.render();
  }

  onSubmitted(): void {
    if (this.recorded) return;
    this.submitted = true;
    if (!this.open) void this.toggle(true);
    else this.render();
  }

  /** Values read from the page (on 保存 / 下一步, or the panel button) that are new to the profile. */
  onCaptured(result: CaptureResult): void {
    this.captured = result.proposals;
    if (!this.captured.length) return;
    if (!this.open) void this.toggle(true);
    else this.render();
  }

  private async captureNow(): Promise<void> {
    this.capturing = true;
    this.message = "";
    this.render();
    try {
      const result = await send<(CaptureResult & { error?: string }) | null>({ type: "capture-all" });
      if (result?.error) throw new Error(result.error);
      this.captured = result?.proposals ?? [];
      if (!this.captured.length) this.message = "本页没有资料库里缺少的新内容。";
    } catch (error) {
      this.message = `读取失败：${(error as Error).message}`;
    } finally {
      this.capturing = false;
      this.render();
    }
  }

  private async saveCaptured(): Promise<void> {
    if (this.busy) return;
    const payload = capturePayload(this.captured);
    const count = this.captured.filter((proposal) => proposal.checked && !proposal.blocked).length;
    if (!count) return;
    this.busy = true;
    this.render();
    try {
      const result = await send<{ applied?: number; skipped?: number; error?: string; code?: string }>({ type: "save-capture", payload });
      if (result?.error) {
        if (result.code === "backend-unreachable" && this.ctx) this.ctx = { ...this.ctx, online: false };
        throw new Error(result.error);
      }
      const moved = result?.skipped ? `资料库里对应的经历已被修改、删除或调整顺序，${result.skipped} 项未写入，请重新读取本页后再存入。` : "";
      if (!result?.applied) {
        this.message = moved || "本次未写入资料，请重新读取页面后再试。";
      } else {
        const expected = payload.basic.length + payload.entries.reduce((total, entry) => total + entry.values.length, 0) + payload.answers.length;
        this.message = moved ? `已保存部分资料。${moved}` : result.applied < expected ? "已保存部分资料，请重新读取并检查其余内容。" : `已存入资料库 ${count} 项，下次网申自动填写。`;
        this.captured = [];
        await send({ type: "refresh-profile" }).catch(() => undefined);
        this.ctx = await send<FillContext>({ type: "get-context", host: location.host });
      }
    } catch (error) {
      this.message = `存入失败：${(error as Error).message}`;
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private dismissCaptured(): void {
    this.captured = [];
    void send({ type: "clear-captured" });
    this.render();
  }

  private captureCard(): Node | null {
    if (!this.captured.length) return null;
    const checked = this.captured.filter((proposal) => proposal.checked && !proposal.blocked).length;
    const rows = this.captured.map((proposal) => {
      const labels = captureLabels(proposal);
      const box = h("input", { type: "checkbox", checked: proposal.checked, disabled: proposal.blocked });
      box.addEventListener("change", () => {
        proposal.checked = box.checked;
        this.render();
      });
      return h(
        "label",
        { className: "capture-row", title: proposal.blocked ? proposal.detail : proposal.change ? "资料库里已经有不同的内容，勾选后会替换" : "资料库里还没有，勾选后存入" },
        box,
        h(
          "span",
          { className: "row-main" },
          h("span", { className: "row-label" }, labels.title),
          labels.entry && h("span", { className: "capture-entry" }, labels.entry),
          h("span", { className: "row-sub" }, proposal.detail),
          proposal.previous && h("span", { className: "was" }, `资料库里是：${proposal.previous}`),
        ),
      );
    });
    return h(
      "section",
      { className: "capture" },
      h("div", { className: "group-title" }, "从本页读到的新资料", h("span", { className: "count" }, String(this.captured.length))),
      h("div", { className: "hint" }, "资料库里没有的已勾选；和资料库不同的默认不勾，确认后再勾。"),
      h("div", { className: "capture-list" }, ...rows),
      h(
        "div",
        { className: "capture-actions" },
        h("button", { className: "primary", disabled: this.busy || !checked, onClick: () => void this.saveCaptured() }, `存入资料库（${checked} 项）`),
        h("button", { className: "link", disabled: this.busy, onClick: () => this.dismissCaptured() }, "忽略"),
      ),
    );
  }

  private items(): TaggedField[] {
    return this.reports.flatMap((report) => report.items.map((item) => ({ ...item, frameId: report.frameId })));
  }

  private pageLang(): Lang {
    return this.reports[0]?.lang ?? (this.lang === "auto" ? "zh" : this.lang);
  }

  async fill(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.message = "";
    this.render();
    try {
      const reports = await send<FrameReport[] | { error?: string }>({ type: "fill-all", lang: this.lang, overwrite: this.overwrite });
      if (!Array.isArray(reports)) throw new Error(reports?.error ?? "插件后台没有返回填写结果");
      this.reports = reports;
      this.scanned = false;
      const readOnly = this.reports.find((report) => !report.items.length && report.notes.some((note) => note.startsWith("edit-buttons:")));
      this.editFrame = this.items().length === 0 && readOnly ? readOnly.frameId : null;
      if (this.editFrame !== null) this.message = "这一页是展示模式，没有输入框。先打开页面上的「编辑 / 添加」，表单出现后再填写。";
      else if (!this.items().length) this.message = "这个页面上没有找到可以填写的栏位。";
      else if (this.reports.every((report) => report.notes.includes("no-profile"))) this.message = "还没有资料：先在资料库里填写或上传简历。";
    } catch (error) {
      this.message = connectionError((error as Error).message) ?? `填写失败：${(error as Error).message}`;
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async inspect(): Promise<void> {
    if (this.busy || this.drafting.size) return;
    this.busy = true;
    this.message = "正在识别本页栏位…";
    this.render();
    try {
      const reports = await send<FrameReport[] | { error?: string }>({ type: "inspect-all", lang: this.lang });
      if (!Array.isArray(reports)) throw new Error(reports?.error ?? "插件没有返回识别结果");
      this.reports = reports;
      this.scanned = true;
      this.editFrame = null;
      this.message = this.items().length ? "已识别本页栏位，可以点击 AI 起草。未填写其他内容或上传附件。" : "没有找到输入框，请先打开网页上的「编辑」，再识别栏位。";
    } catch (error) {
      this.message = connectionError((error as Error).message) ?? `识别失败：${(error as Error).message}`;
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async fillOne(item: TaggedField, target: string, automatic = false): Promise<boolean> {
    const report = await send<TaggedField | null>({ type: "fill-one", frameId: item.frameId, id: item.id, target, lang: this.pageLang(), remember: !automatic, automatic, label: item.mappingKey ?? rememberKey(item.label) });
    for (const frame of this.reports) {
      const index = frame.items.findIndex((other) => other.id === item.id && frame.frameId === item.frameId);
      if (index < 0) continue;
      if (target === "skip") frame.items.splice(index, 1);
      else if (report) frame.items[index] = report;
    }
    this.render();
    return Boolean(report && ["filled", "uncertain"].includes(report.status));
  }

  private async draft(item: TaggedField): Promise<boolean> {
    const key = `${item.frameId}:${item.id}`;
    if (this.drafting.has(key)) return false;
    this.drafting.add(key);
    this.message = `正在为「${item.label}」起草…`;
    this.render();
    try {
      const result = await send<DraftResult | null>({
        type: "ai-answer",
        frameId: item.frameId,
        field: { id: item.id, label: item.label, kind: item.kind, mappingKey: item.mappingKey },
        question: item.label,
        lang: this.pageLang(),
        job: { ...this.job, description: jobDescription() },
        maxLength: item.maxLength,
        minLength: item.minLength,
      });
      if (!result?.answer?.trim()) throw new Error(result?.error ?? "AI 没有返回草稿，请重试。");
      if (!result.applied) {
        this.pendingDrafts.set(key, { label: item.label, answer: result.answer });
        throw new Error(result.error ?? "草稿未填入网页，请查看下方保留的草稿。");
      }
      // items() returns display copies; update the stored report so the result persists.
      const report = this.reports.find(frame => frame.frameId === item.frameId)?.items.find(other => other.id === item.id);
      if (report) Object.assign(report, { id: result.id ?? report.id, status: "uncertain", value: result.answer, reason: "ai-draft", targetLabel: "AI 草稿" });
      this.pendingDrafts.delete(key);
      this.message = `已将「${item.label}」草稿填入网页，请核对后再保存。`;
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.message = /extension context invalidated|receiving end does not exist|could not establish connection/i.test(detail)
        ? "AI 起草失败：插件已更新，当前网页连接已失效。请保留草稿，刷新网页后重试。"
        : `AI 起草失败：${detail}`;
      return false;
    } finally {
      this.drafting.delete(key);
      this.render();
    }
  }

  /** Opens a read-only section by clicking its 编辑 button, then fills the form that appears. */
  private async editAndFill(): Promise<void> {
    if (this.editFrame === null) return;
    const clicked = await send<string | null>({ type: "click-edit", frameId: this.editFrame });
    this.editFrame = null;
    if (!clicked) {
      this.message = "没找到可以点的「编辑」按钮，请手动打开表单后再点一键填写。";
      this.render();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    await this.fill();
  }

  /** AI suggestions carry form context and must pass the same section boundary checks. */
  private async aiMap(items: TaggedField[]): Promise<void> {
    this.mapping = true;
    this.render();
    try {
      const fields = items.map((item, index) => ({ index, label: item.label, type: item.kind, section: item.contextSection, heading: item.heading, options: item.options }));
      const result = await send<{ mappings?: { index: number; key: string | null }[]; error?: string }>({ type: "ai-map", fields, lang: this.pageLang() });
      if (result.error) {
        this.message = `AI 识别失败：${result.error}`;
        return;
      }
      let filled = 0;
      for (const mapping of result.mappings ?? []) {
        const item = items[mapping.index];
        if (!item || !mapping.key || mapping.key === "answer") continue;
        // An exam-specific score must never borrow the next language entry's score.
        if (isDistinctQuestion(item.label)) continue;
        const [section, key] = mapping.key.split(".");
        if (!compatibleField(section, key, item.label, { section: item.contextSection ?? null, variant: "all", heading: null })) continue;
        if (await this.fillOne(item, mapping.key, true)) filled += 1;
      }
      this.message = filled ? `AI 识别并填写了 ${filled} 个栏位，请检查。` : "AI 也没能识别剩下的栏位。";
    } catch (error) {
      this.message = `AI 识别失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.mapping = false;
      this.render();
    }
  }

  /** Drafts every open question on the page one after another. */
  private async draftAll(items: TaggedField[]): Promise<void> {
    this.message = "";
    for (const item of items) {
      if (!await this.draft(item)) break;
    }
  }

  /** This site stores dates one day early (time zone conversion): type every date one day later here. */
  private async setDateShift(on: boolean): Promise<void> {
    const memory = await send<Record<string, string> | null>({ type: "save-site-setting", key: "date-shift", value: on ? "1" : null });
    if (memory && this.ctx) this.ctx = { ...this.ctx, memory };
    this.message = !memory ? "设置保存失败，请刷新页面后重试。" : on ? "已开启：本站填写日期时自动多填一天，网站会存成正确的日期。" : "已关闭本站的日期补偿。";
    this.render();
  }

  private async saveLearned(): Promise<void> {
    const answers = Array.from(this.learned.values());
    const result = await send<{ error?: string }>({ type: "save-answers", answers });
    this.message = result?.error ? `保存失败：${result.error}` : `已保存 ${answers.length} 条答案，下次自动填写。`;
    if (!result?.error) this.learned.clear();
    this.render();
  }

  private async record(): Promise<void> {
    const result = await send<{ error?: string }>({ type: "record-application", job: this.job });
    if (result?.error) this.message = `记录失败：${result.error}`;
    else {
      this.recorded = true;
      this.submitted = false;
      this.message = "已记入投递记录。";
    }
    this.render();
  }

  private profileLine(): Node {
    if (!this.ctx) return h("div", { className: "warn" }, "插件尚未连接，暂不能填写。");
    if (this.ctx.newVersion) {
      return h("div", { className: "warn" }, `插件正在更新到 v${this.ctx.newVersion}（当前 v${extensionVersion()}），几秒后自动生效。若面板没有反应，请刷新本页。`);
    }
    if (this.ctx.error) return h("div", { className: "warn" }, `资料读取失败：${this.ctx.error}`);
    const profile = this.ctx?.profile;
    if (!this.ctx?.online && !profile) return h("div", { className: "warn" }, "本地服务未启动，也没有缓存的资料。请先运行 start-webui。");
    if (!profile || !Object.keys(profile.basic).length) {
      return h("div", { className: "warn" }, "资料库是空的。", h("a", { href: this.ctx?.settings.webUi ?? "#", target: "_blank" }, "去填写资料"));
    }
    const name = readValue(profile.basic.name, "zh").value || readValue(profile.basic.name, "en").value;
    const counts = [`${profile.sections.education?.length ?? 0} 段教育`, `${profile.sections.work?.length ?? 0} 段经历`];
    return h(
      "div",
      { className: "profile-line" },
      h("span", { className: `dot ${this.ctx?.online ? "on" : "off"}` }),
      `${name || "未命名"} · ${counts.join(" · ")}`,
      !this.ctx?.online && h("span", { className: "muted" }, "（离线，使用缓存）"),
    );
  }

  private summary(items: TaggedField[]): Node {
    const count = (statuses: string[]) => items.filter((item) => statuses.includes(item.status)).length;
    return h(
      "div",
      { className: "chips" },
      h("span", { className: "chip ok" }, `已填 ${count(["filled"])}`),
      h("span", { className: "chip warn" }, `需检查 ${count(["uncertain", "failed"])}`),
      h("span", { className: "chip muted" }, `未填 ${count(["unmatched", "empty", "question"])}`),
    );
  }

  private draftButton(item: TaggedField, text = "AI 起草"): HTMLElement {
    const busy = this.drafting.has(`${item.frameId}:${item.id}`);
    const length = [item.minLength && `不少于 ${item.minLength} 字`, item.maxLength && `${item.maxLength} 字以内`].filter(Boolean).join("、");
    return h("button", { className: "mini", disabled: this.drafting.size > 0, title: length ? `按${length}起草` : "", onClick: () => void this.draft(item) }, busy ? "起草中…" : text);
  }

  private row(item: TaggedField, extra?: Node): HTMLElement {
    const reason = item.reason ? STATUS_TEXT[item.reason] ?? (item.reason.startsWith("missing-attachment") ? "没有上传对应附件" : "") : "";
    return h(
      "div",
      { className: `row status-${item.status}` },
      h(
        "button",
        { className: "row-main", title: "定位到这个栏位", onClick: () => void send({ type: "focus-field", frameId: item.frameId, id: item.id }) },
        h("span", { className: "row-label" }, item.label || "（无标签）"),
        h("span", { className: "row-sub" }, [item.value, reason || item.targetLabel].filter(Boolean).join(" · ")),
      ),
      extra,
    );
  }

  private group(title: string, rows: HTMLElement[], hint?: string): Node | null {
    const count = rows.filter((row) => row.classList.contains("row")).length;
    if (!count) return null;
    return h("section", { className: "group" }, h("div", { className: "group-title" }, title, h("span", { className: "count" }, String(count))), hint && h("div", { className: "hint" }, hint), ...rows);
  }

  private results(): Node[] {
    const items = this.items();
    if (!items.length) return [];
    const check = items.filter((item) => item.status === "uncertain" || item.status === "failed");
    const questions = items.filter((item) => item.status === "question");
    const unmatched = items.filter((item) => item.status === "unmatched");
    const empty = items.filter((item) => item.status === "empty");
    const filled = items.filter((item) => item.status === "filled");
    const ai = Boolean(this.ctx?.ai);
    const mapSelect = (item: TaggedField) => {
      const select = h("select", { className: "map", title: "选一个资料字段填入，本站下次自动记住" }, h("option", { value: "" }, "填入…"));
      // Hundreds of options per row: build them only when this list is opened.
      const populate = () => {
        if (select.options.length > 1) return;
        select.append(...targetOptions(this.ctx), h("option", { value: "skip" }, "本站跳过此栏"));
      };
      select.addEventListener("mousedown", populate);
      select.addEventListener("focus", populate);
      select.addEventListener("change", () => select.value && void this.fillOne(item, select.value));
      return select;
    };
    const notes = this.reports.flatMap((report) => report.notes.filter((note) => !["no-profile", "scan-only"].includes(note)));
    return [
      this.summary(items),
      ...Array.from(this.pendingDrafts.values()).map(draft => h("section", { className: "group retained-draft" },
        h("div", { className: "group-title" }, `${draft.label} · 未填入的 AI 草稿`),
        h("textarea", { readOnly: true, "aria-label": `${draft.label} AI 草稿`, style: "width:100%;min-height:100px;box-sizing:border-box;resize:vertical;" }, draft.answer))),
      ...notes.map((note) => h("div", { className: "note" }, note)),
      // Text cut to the site's limit can be rewritten to fit by AI from the profile.
      this.group("需要你检查", check.map((item) => this.row(item, ai && item.reason === "truncated" ? this.draftButton(item, "AI 缩写") : undefined))),
      this.group(
        "开放题",
        [
          ...(ai && questions.length > 1
            ? [h("button", { className: "mini wide", disabled: this.drafting.size > 0, onClick: () => void this.draftAll(questions) }, this.drafting.size > 0 ? "起草中…" : `AI 全部起草（${questions.length}）`)]
            : []),
          ...questions.map((item) => this.row(item, ai ? this.draftButton(item) : undefined)),
        ],
        ai ? undefined : "在设置里配置 AI 后可一键起草；你手写的答案会被记住。",
      ),
      this.group(
        "没识别的栏位",
        [
          ...(ai && unmatched.length
            ? [h("button", { className: "mini wide", disabled: this.mapping, onClick: () => void this.aiMap(unmatched) }, this.mapping ? "AI 识别中…" : "AI 识别剩余栏位")]
            : []),
          ...unmatched.map((item) => this.row(item, mapSelect(item))),
        ],
        "选择对应的资料字段，本网站下次会自动识别。",
      ),
      this.group("资料库里缺少", empty.map((item) => this.row(item))),
      filled.length ? h("details", { className: "group" }, h("summary", { className: "group-title" }, `已填资料（${filled.length}）`), ...filled.map(item => this.row({ ...item, value: undefined }))) : null,
    ].filter(Boolean) as Node[];
  }

  /** Downloads the form structure (labels and widget types, no values) for adapting a new site. */
  private async exportStructure(): Promise<void> {
    const frames = await send<unknown[]>({ type: "describe-all" });
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), frames }, null, 2)], { type: "application/json" });
    const link = h("a", { href: URL.createObjectURL(blob), download: `form-structure-${location.hostname}.json` });
    this.shadow?.append(link);
    link.click();
    link.remove();
    this.message = "已导出页面结构（只有栏位名称和组件类型，不含你填写的内容）。把这个文件发给开发者即可适配这个网站。";
    this.render();
  }

  private footer(): Node {
    const learnedCount = this.learned.size;
    return h(
      "div",
      { className: "footer" },
      h(
        "button",
        { className: "secondary", disabled: this.capturing || !this.ctx, title: "读取你在本页填好的内容，把资料库里没有的存进去", onClick: () => void this.captureNow() },
        this.capturing ? "读取中…" : "把本页填好的内容存入资料库",
      ),
      h("button", { className: "link small", disabled: !this.ctx, title: "导出栏位名称和组件类型，不含你填写的内容", onClick: () => void this.exportStructure() }, "导出页面结构（用于适配新网站）"),
      learnedCount > 0 && h("button", { className: "secondary", onClick: () => void this.saveLearned() }, `记住我填的 ${learnedCount} 条答案`),
      this.submitted && !this.recorded
        ? h(
            "div",
            { className: "record" },
            h("div", { className: "record-title" }, "已提交？记一笔投递"),
            h("input", { value: this.job.company, placeholder: "公司", onInput: (event: Event) => (this.job.company = (event.target as HTMLInputElement).value) }),
            h("input", { value: this.job.title, placeholder: "岗位", onInput: (event: Event) => (this.job.title = (event.target as HTMLInputElement).value) }),
            h("button", { className: "primary", onClick: () => void this.record() }, "记录投递"),
          )
        : !this.recorded && this.reports.length > 0 && h("button", { className: "link", onClick: () => { this.submitted = true; this.render(); } }, "记录这次投递"),
    );
  }

  render(): void {
    if (!this.open) return;
    const shadow = this.ensureHost();
    const previous = shadow.querySelector(".panel");
    // The panel is rebuilt on every change; keep the list where the user was.
    const scrollTop = previous?.querySelector(".body")?.scrollTop ?? 0;
    previous?.remove();
    const langSelect = h("select", { className: "lang", title: "填写语言" }, h("option", { value: "auto" }, "自动语言"), h("option", { value: "zh" }, "中文资料"), h("option", { value: "en" }, "English"));
    langSelect.value = this.lang;
    langSelect.addEventListener("change", () => (this.lang = langSelect.value as Lang | "auto"));
    const overwrite = h("input", { type: "checkbox", checked: this.overwrite });
    overwrite.addEventListener("change", () => (this.overwrite = overwrite.checked));
    const dateShift = h("input", { type: "checkbox", checked: this.ctx?.memory?.["setting::date-shift"] === "1", disabled: !this.ctx });
    dateShift.addEventListener("change", () => void this.setDateShift(dateShift.checked));
    const panel = h(
      "div",
      { className: "panel" },
      h("header", {}, h("div", { className: "title" }, h("span", { className: "logo" }, "填"), "网申助手", extensionVersion() && h("span", { className: "version", title: "插件版本" }, `v${extensionVersion()}`)), langSelect, h("button", { className: "close", title: "关闭", onClick: () => void this.toggle(false) }, "×")),
      h(
        "div",
        { className: "body" },
        this.profileLine(),
        h("button", { className: "primary big", disabled: this.busy || this.drafting.size > 0 || !this.ctx?.profile, onClick: () => void this.fill() }, this.busy ? "处理中…" : this.items().length && !this.scanned ? "再填一次" : "一键填写本页"),
        h("button", { className: "secondary", disabled: this.busy || this.drafting.size > 0 || !this.ctx?.profile, onClick: () => void this.inspect() }, "识别栏位 / AI 起草"),
        h("label", { className: "check" }, overwrite, "覆盖已有内容"),
        h("label", { className: "check", title: "有的网站按北京时间换算日期，电脑在其他时区时会存成前一天。勾选后本站填日期自动多填一天。" }, dateShift, "本站日期 +1 天（保存后日期总早一天时勾选）"),
        this.message && h("div", { className: "message" }, this.message),
        this.captureCard(),
        this.editFrame !== null && h("button", { className: "secondary", disabled: this.busy, onClick: () => void this.editAndFill() }, "帮我点「编辑」并填写"),
        ...this.results(),
      ),
      this.footer(),
    );
    shadow.append(panel);
    const body = panel.querySelector<HTMLElement>(".body");
    if (body) body.scrollTop = scrollTop;
  }
}
