import { SCHEMA, readValue, type Lang } from "../../../shared/profileSchema";
import { send, type FillContext, type FrameReport, type JobInfo, type LearnedAnswer, type TaggedField } from "../messages";
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
  "dropdown-did-not-open": "下拉框没打开",
  "cascader-path-not-found": "地区没找到",
  "needs-deeper-level": "还需选到区县",
  "date-not-accepted": "日期格式不被接受",
  "present-toggle-not-found": "没找到「至今」选项",
  "missing-in-profile": "资料库里没填",
  "missing-region-level": "资料里的地区少一级（比如缺区县）",
  "chose-other": "列表里没有，已选「其他」，请补充填写",
  "not-a-number": "这里只能填数字",
  "answer-not-written": "问答库里这题还没写答案",
  "other-language": "用了另一种语言的资料",
  truncated: "超出字数，已截断",
  sensitive: "敏感信息，默认不填",
  "has-value": "已有内容，未覆盖",
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

function pageText(): string {
  return (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 6000);
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
  private mapping = false;
  private editFrame: number | null = null;

  private ensureHost(): ShadowRoot {
    if (this.shadow) return this.shadow;
    this.host = h("div", { "data-jaf-ui": "" });
    this.host.style.cssText = "all: initial; position: fixed; z-index: 2147483646; right: 16px; bottom: 16px;";
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.shadow.append(h("style", {}, PANEL_CSS));
    document.documentElement.append(this.host);
    return this.shadow;
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
      // Always start from the latest profile and AI settings (they may have just been edited in the Web UI).
      await send({ type: "refresh-profile" }).catch(() => undefined);
      this.ctx = await send<FillContext>({ type: "get-context", host: location.host });
      if (this.ctx.settings) this.lang = this.lang === "auto" ? this.ctx.settings.langMode : this.lang;
      this.render();
      if (autoFill) await this.fill();
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
      this.reports = await send<FrameReport[]>({ type: "fill-all", lang: this.lang, overwrite: this.overwrite });
      const readOnly = this.reports.find((report) => !report.items.length && report.notes.some((note) => note.startsWith("edit-buttons:")));
      this.editFrame = this.items().length === 0 && readOnly ? readOnly.frameId : null;
      if (this.editFrame !== null) this.message = "这一页是展示模式，没有输入框。先打开页面上的「编辑 / 添加」，表单出现后再填写。";
      else if (!this.items().length) this.message = "这个页面上没有找到可以填写的栏位。";
      else if (this.reports.every((report) => report.notes.includes("no-profile"))) this.message = "还没有资料：先在资料库里填写或上传简历。";
    } catch (error) {
      this.message = `填写失败：${(error as Error).message}`;
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async fillOne(item: TaggedField, target: string): Promise<void> {
    const report = await send<TaggedField | null>({ type: "fill-one", frameId: item.frameId, id: item.id, target, lang: this.pageLang(), remember: true, label: rememberKey(item.label) });
    for (const frame of this.reports) {
      const index = frame.items.findIndex((other) => other.id === item.id && frame.frameId === item.frameId);
      if (index < 0) continue;
      if (target === "skip") frame.items.splice(index, 1);
      else if (report) frame.items[index] = report;
    }
    this.render();
  }

  private async draft(item: TaggedField): Promise<void> {
    this.drafting.add(item.id);
    this.render();
    try {
      const result = await send<{ answer?: string; error?: string }>({
        type: "ai-answer",
        frameId: item.frameId,
        id: item.id,
        question: item.label,
        lang: this.pageLang(),
        job: { ...this.job, description: pageText() },
        maxLength: item.maxLength,
      });
      if (result.error) this.message = `AI 起草失败：${result.error}`;
      else item.status = "uncertain";
    } finally {
      this.drafting.delete(item.id);
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

  /** Lets the AI map fields the rules could not recognize, then fills (and remembers) them. */
  private async aiMap(items: TaggedField[]): Promise<void> {
    this.mapping = true;
    this.render();
    try {
      const fields = items.map((item, index) => ({ index, label: item.label, type: item.kind }));
      const result = await send<{ mappings?: { index: number; key: string | null }[]; error?: string }>({ type: "ai-map", fields, lang: this.pageLang() });
      if (result.error) {
        this.message = `AI 识别失败：${result.error}`;
        return;
      }
      let filled = 0;
      for (const mapping of result.mappings ?? []) {
        const item = items[mapping.index];
        if (!item || !mapping.key || mapping.key === "answer") continue;
        await this.fillOne(item, mapping.key);
        filled += 1;
      }
      this.message = filled ? `AI 识别并填写了 ${filled} 个栏位，请检查。` : "AI 也没能识别剩下的栏位。";
    } finally {
      this.mapping = false;
      this.render();
    }
  }

  /** Drafts every open question on the page one after another. */
  private async draftAll(items: TaggedField[]): Promise<void> {
    for (const item of items) {
      if (this.message.startsWith("AI 起草失败")) break;
      await this.draft(item);
    }
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
    const ai = Boolean(this.ctx?.ai);
    const mapSelect = (item: TaggedField) => {
      const select = h("select", { className: "map", title: "选一个资料字段填入，本站下次自动记住" }, h("option", { value: "" }, "填入…"), ...targetOptions(this.ctx), h("option", { value: "skip" }, "本站跳过此栏"));
      select.addEventListener("change", () => select.value && void this.fillOne(item, select.value));
      return select;
    };
    const notes = this.reports.flatMap((report) => report.notes.filter((note) => note !== "no-profile"));
    return [
      this.summary(items),
      ...notes.map((note) => h("div", { className: "note" }, note)),
      this.group("需要你检查", check.map((item) => this.row(item))),
      this.group(
        "开放题",
        [
          ...(ai && questions.length > 1
            ? [h("button", { className: "mini wide", disabled: this.drafting.size > 0, onClick: () => void this.draftAll(questions) }, this.drafting.size > 0 ? "起草中…" : `AI 全部起草（${questions.length}）`)]
            : []),
          ...questions.map((item) =>
          this.row(
            item,
            ai
              ? h("button", { className: "mini", disabled: this.drafting.has(item.id), onClick: () => void this.draft(item) }, this.drafting.has(item.id) ? "起草中…" : "AI 起草")
              : undefined,
          ),
          ),
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
      h("button", { className: "link small", title: "导出栏位名称和组件类型，不含你填写的内容", onClick: () => void this.exportStructure() }, "导出页面结构（用于适配新网站）"),
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
    shadow.querySelector(".panel")?.remove();
    const langSelect = h("select", { className: "lang", title: "填写语言" }, h("option", { value: "auto" }, "自动语言"), h("option", { value: "zh" }, "中文资料"), h("option", { value: "en" }, "English"));
    langSelect.value = this.lang;
    langSelect.addEventListener("change", () => (this.lang = langSelect.value as Lang | "auto"));
    const overwrite = h("input", { type: "checkbox", checked: this.overwrite });
    overwrite.addEventListener("change", () => (this.overwrite = overwrite.checked));
    const panel = h(
      "div",
      { className: "panel" },
      h("header", {}, h("div", { className: "title" }, h("span", { className: "logo" }, "填"), "网申助手"), langSelect, h("button", { className: "close", title: "关闭", onClick: () => void this.toggle(false) }, "×")),
      h(
        "div",
        { className: "body" },
        this.profileLine(),
        h("button", { className: "primary big", disabled: this.busy || !this.ctx?.profile, onClick: () => void this.fill() }, this.busy ? "正在填写…" : this.items().length ? "再填一次" : "一键填写本页"),
        h("label", { className: "check" }, overwrite, "覆盖已有内容"),
        this.message && h("div", { className: "message" }, this.message),
        this.editFrame !== null && h("button", { className: "secondary", disabled: this.busy, onClick: () => void this.editAndFill() }, "帮我点「编辑」并填写"),
        ...this.results(),
      ),
      this.footer(),
    );
    shadow.append(panel);
  }
}
