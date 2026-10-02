import { createContext, createElement, Fragment, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "../../shared/profileSchema";
import { storage } from "./storage";

const zh = {
  appName: "求职资料库",
  "nav.profile": "资料库",
  "nav.applications": "投递记录",
  "nav.settings": "设置",
  "backend.online": "本地服务已连接",
  "backend.offline": "本地服务未连接",
  "backend.checking": "正在连接…",
  "offline.title": "本地服务未启动",
  "offline.body": "双击运行 {bat}，或在项目目录执行 {cmd}",
  retry: "重试",
  cancel: "取消",
  save: "保存",
  delete: "删除",
  edit: "编辑",
  undo: "撤销",
  copy: "复制",
  copied: "已复制",
  loading: "加载中…",

  "content.zh": "中文资料",
  "content.en": "English",
  "content.label": "资料语言",
  "resume.import": "上传简历识别",
  "resume.parsing": "识别中…",
  "resume.applied": "已导入简历内容",
  "translate.toEn": "AI 翻译成英文",
  "translate.toZh": "AI 翻译成中文",
  "translate.running": "翻译中…",
  "translate.needsAI": "需先在「设置」中配置 AI",
  "translate.done": "已翻译 {n} 项",
  "translate.none": "没有需要翻译的内容",
  completeness: "完整度",
  "save.saved": "已保存",
  "save.saving": "保存中…",
  "save.error": "保存失败",
  "load.failed": "读取资料失败",

  "field.auto": "自动：{v}",
  "field.select": "请选择",
  "field.present": "至今",
  "field.fillSensitive": "允许插件自动填写",
  "section.add": "添加",
  "entry.untitled": "未填写",
  "entry.moveUp": "上移",
  "entry.moveDown": "下移",
  "entry.deleted": "已删除一条{section}",
  "group.expand": "展开",

  "answers.title": "常用问答",
  "answers.hint": "插件会记住你在网申页面填写的回答",
  "answers.question": "问题",
  "answers.answer": "回答",
  "answers.add": "添加问答",
  "answers.learned": "自动学习",
  "answers.empty": "还没有问答",
  "answers.deleted": "已删除问答",

  "attachments.title": "附件",
  "attachments.hint": "插件会把这些文件自动上传到网申的附件栏",
  "attachments.upload": "上传",
  "attachments.replace": "替换",
  "attachments.add": "添加",
  "attachments.open": "打开",
  "attachments.none": "未上传",
  "attachments.uploading": "上传中…",
  "attachments.uploaded": "已上传 {name}",
  "attachments.deleted": "已删除 {name}",

  "dialog.resumeTitle": "简历识别结果",
  "dialog.methodAi": "AI 识别",
  "dialog.methodRules": "规则识别",
  "dialog.basic": "基本信息",
  "dialog.items": "{n} 项",
  "dialog.entries": "{n} 条",
  "dialog.nothing": "没有识别到可补充的新内容",
  "dialog.note": "只填充空白内容，已有资料不会被覆盖。",
  "dialog.aiFallback": "AI 识别失败，已改用规则识别：",
  "dialog.saveAttachment": "同时保存为「{kind}」附件",
  "dialog.apply": "应用到资料库",

  "apps.title": "投递记录",
  "apps.search": "搜索公司或职位",
  "apps.add": "添加记录",
  "apps.all": "全部",
  "apps.colJob": "公司 / 职位",
  "apps.colStatus": "状态",
  "apps.colApplied": "投递日期",
  "apps.colNext": "下次跟进",
  "apps.empty": "插件会在你提交网申后自动记录到这里",
  "apps.noMatch": "没有匹配的记录",
  "apps.dialogAdd": "添加投递记录",
  "apps.dialogEdit": "编辑投递记录",
  "apps.company": "公司",
  "apps.role": "职位",
  "apps.url": "链接",
  "apps.note": "备注",
  "apps.notePlaceholder": "备注…",
  "apps.required": "请填写公司或职位",
  "apps.deleted": "已删除 {name}",
  "apps.openLink": "打开链接",
  "apps.saveFailed": "保存失败：{msg}",
  "status.saved": "待投递",
  "status.applied": "已投递",
  "status.assessment": "笔试/测评",
  "status.interview": "面试中",
  "status.offer": "Offer",
  "status.rejected": "未通过",

  "settings.title": "设置",
  "ai.title": "AI 模型",
  "ai.optional": "可选",
  "ai.desc": "不配置也能自动填表；配置后可识别简历、翻译资料、起草开放题。",
  "ai.preset": "服务商",
  "ai.custom": "自定义",
  "ai.protocol": "接口类型",
  "ai.protocolOpenai": "OpenAI 兼容",
  "ai.protocolAnthropic": "Anthropic",
  "ai.baseUrl": "接口地址",
  "ai.baseUrlAnthropic": "留空使用官方地址",
  "ai.model": "模型",
  "ai.key": "API Key",
  "ai.keyStored": "已保存 {hint}，留空则不修改",
  "ai.keyNew": "粘贴 API Key",
  "ai.saved": "AI 设置已保存",
  "ai.test": "测试连接",
  "ai.testing": "测试中…",
  "ai.testOk": "连接成功",
  "ai.testFail": "连接失败：{msg}",
  "ai.configured": "已配置",
  "ai.notConfigured": "未配置",
  "ai.unsaved": "有未保存的修改",
  "ext.title": "浏览器插件",
  "ext.step1": "在 {dir} 目录运行 {cmd}（启动脚本会自动构建）",
  "ext.step2": "打开 {chrome} 或 {edge}，开启「开发者模式」",
  "ext.step3": "点击「加载已解压的扩展程序」，选择 {dist} 文件夹",
  "data.title": "本地数据",
  "data.desc": "资料、附件和投递记录只保存在这台电脑上",
} as const;

export type MessageKey = keyof typeof zh;

const en: Record<MessageKey, string> = {
  appName: "Job Profile",
  "nav.profile": "Profile",
  "nav.applications": "Applications",
  "nav.settings": "Settings",
  "backend.online": "Backend connected",
  "backend.offline": "Backend offline",
  "backend.checking": "Connecting…",
  "offline.title": "The local backend is not running",
  "offline.body": "Double-click {bat}, or run {cmd} in the project folder",
  retry: "Retry",
  cancel: "Cancel",
  save: "Save",
  delete: "Delete",
  edit: "Edit",
  undo: "Undo",
  copy: "Copy",
  copied: "Copied",
  loading: "Loading…",

  "content.zh": "Chinese",
  "content.en": "English",
  "content.label": "Profile language",
  "resume.import": "Import resume",
  "resume.parsing": "Reading…",
  "resume.applied": "Resume imported",
  "translate.toEn": "AI translate to English",
  "translate.toZh": "AI translate to Chinese",
  "translate.running": "Translating…",
  "translate.needsAI": "Set up AI in Settings first",
  "translate.done": "Translated {n} fields",
  "translate.none": "Nothing to translate",
  completeness: "Complete",
  "save.saved": "Saved",
  "save.saving": "Saving…",
  "save.error": "Save failed",
  "load.failed": "Could not load your profile",

  "field.auto": "Auto: {v}",
  "field.select": "Select",
  "field.present": "Present",
  "field.fillSensitive": "Let the extension fill this",
  "section.add": "Add",
  "entry.untitled": "Untitled",
  "entry.moveUp": "Move up",
  "entry.moveDown": "Move down",
  "entry.deleted": "Deleted one {section} entry",
  "group.expand": "Expand",

  "answers.title": "Saved answers",
  "answers.hint": "The extension remembers answers you type on application forms",
  "answers.question": "Question",
  "answers.answer": "Answer",
  "answers.add": "Add answer",
  "answers.learned": "Learned",
  "answers.empty": "No answers yet",
  "answers.deleted": "Answer deleted",

  "attachments.title": "Attachments",
  "attachments.hint": "The extension uploads these to file fields automatically",
  "attachments.upload": "Upload",
  "attachments.replace": "Replace",
  "attachments.add": "Add",
  "attachments.open": "Open",
  "attachments.none": "Not uploaded",
  "attachments.uploading": "Uploading…",
  "attachments.uploaded": "Uploaded {name}",
  "attachments.deleted": "Deleted {name}",

  "dialog.resumeTitle": "Resume import",
  "dialog.methodAi": "Read by AI",
  "dialog.methodRules": "Read by rules",
  "dialog.basic": "Basic info",
  "dialog.items": "{n} fields",
  "dialog.entries": "{n}",
  "dialog.nothing": "Nothing new was found",
  "dialog.note": "Only empty fields are filled. Existing values are kept.",
  "dialog.aiFallback": "AI failed, used rules instead:",
  "dialog.saveAttachment": "Also save as “{kind}”",
  "dialog.apply": "Apply to profile",

  "apps.title": "Applications",
  "apps.search": "Search company or role",
  "apps.add": "Add",
  "apps.all": "All",
  "apps.colJob": "Company / Role",
  "apps.colStatus": "Status",
  "apps.colApplied": "Applied",
  "apps.colNext": "Follow-up",
  "apps.empty": "The extension records applications here after you submit them",
  "apps.noMatch": "No matching records",
  "apps.dialogAdd": "New application",
  "apps.dialogEdit": "Edit application",
  "apps.company": "Company",
  "apps.role": "Role",
  "apps.url": "Link",
  "apps.note": "Note",
  "apps.notePlaceholder": "Note…",
  "apps.required": "Enter a company or role",
  "apps.deleted": "Deleted {name}",
  "apps.openLink": "Open link",
  "apps.saveFailed": "Save failed: {msg}",
  "status.saved": "Saved",
  "status.applied": "Applied",
  "status.assessment": "Assessment",
  "status.interview": "Interview",
  "status.offer": "Offer",
  "status.rejected": "Rejected",

  "settings.title": "Settings",
  "ai.title": "AI model",
  "ai.optional": "Optional",
  "ai.desc": "Autofill works without AI. Add a model to read resumes, translate, and draft answers.",
  "ai.preset": "Provider",
  "ai.custom": "Custom",
  "ai.protocol": "API type",
  "ai.protocolOpenai": "OpenAI-compatible",
  "ai.protocolAnthropic": "Anthropic",
  "ai.baseUrl": "Base URL",
  "ai.baseUrlAnthropic": "Leave blank for the official endpoint",
  "ai.model": "Model",
  "ai.key": "API key",
  "ai.keyStored": "Saved {hint} — leave blank to keep",
  "ai.keyNew": "Paste your API key",
  "ai.saved": "AI settings saved",
  "ai.test": "Test connection",
  "ai.testing": "Testing…",
  "ai.testOk": "Connected",
  "ai.testFail": "Failed: {msg}",
  "ai.configured": "Configured",
  "ai.notConfigured": "Not configured",
  "ai.unsaved": "Unsaved changes",
  "ext.title": "Browser extension",
  "ext.step1": "Run {cmd} in the {dir} folder (the start script does this for you)",
  "ext.step2": "Open {chrome} or {edge} and turn on Developer mode",
  "ext.step3": "Click “Load unpacked” and choose the {dist} folder",
  "data.title": "Local data",
  "data.desc": "Your profile, files and records stay on this computer",
};

const MESSAGES: Record<Lang, Record<MessageKey, string>> = { zh, en };

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Like t(), but placeholders may be React nodes (e.g. <code>). */
function interpolateNodes(template: string, vars: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/\{(\w+)\}/g);
  return parts.map((part, index) => createElement(Fragment, { key: index }, index % 2 === 1 ? vars[part] ?? part : part));
}

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  tn: (key: MessageKey, vars: Record<string, ReactNode>) => ReactNode;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (storage.get("ui-lang") === "en" ? "en" : "zh"));
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    storage.set("ui-lang", next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  }, []);
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => interpolate(MESSAGES[lang][key], vars),
      tn: (key, vars) => interpolateNodes(MESSAGES[lang][key], vars),
    }),
    [lang, setLang],
  );
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
