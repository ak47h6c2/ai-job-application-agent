import { CAPTURE_SCHEMA_VERSION, normalizeProfile, type AttachmentMeta, type ProfileData } from "../../shared/profileSchema";
import type { Proposal } from "./engine/capture";
import { legacyMemory } from "./engine/memory";
import { DEFAULT_SETTINGS, type CaptureResult, type DraftResult, type DraftSnapshot, type ExtensionSettings, type FillContext, type FrameCommand, type FrameReport, type Request } from "./messages";

const PROFILE_TTL_MS = 20_000;
let cache: { profile: ProfileData | null; attachments: AttachmentMeta[]; ai: boolean; at: number } | null = null;

class BackendConnectionError extends Error {
  readonly code = "backend-unreachable";
  constructor() {
    super("无法连接本地后台，请重新运行 start-webui.bat，启动后重试。");
  }
}

class BackendTimeoutError extends Error {
  constructor() {
    super("本地后台响应超时，请检查后台运行状态后重试。");
  }
}

/** FastAPI error detail: a message, or a list of validation errors. */
function detailMessage(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return undefined;
  return detail
    .map((item) => {
      if (!item || typeof item !== "object" || !("msg" in item)) return String(item);
      const { loc, msg } = item as { loc?: unknown[]; msg: unknown };
      return `${Array.isArray(loc) ? `${loc.slice(1).join(".")}: ` : ""}${String(msg)}`;
    })
    .join("；");
}

/** In an unpacked install, the version of a newer build sitting in the folder that Chrome has not reloaded yet. */
async function pendingVersion(): Promise<string | undefined> {
  const running = chrome.runtime.getManifest();
  if ("update_url" in running) return undefined;
  try {
    const { version } = (await (await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })).json()) as { version?: string };
    return version && version !== running.version ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * An unpacked (developer-mode) install reloads itself once a rebuilt dist folder is present, so nobody has to
 * press reload in chrome://extensions after every build. onInstalled then refreshes the scripts in open pages.
 */
let reloadScheduled = false;
async function reloadIfRebuilt(): Promise<void> {
  if (reloadScheduled || !(await pendingVersion())) return;
  reloadScheduled = true;
  setTimeout(() => chrome.runtime.reload(), 300);
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "update") return;
  // Pages opened before the update keep a dead copy of the old script; give them the new one without a reload.
  void chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id !== undefined) void chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] }).catch(() => undefined);
    }
  });
});

async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
}

async function api<T>(path: string, init: RequestInit = {}, timeout = 4000): Promise<T> {
  const { apiBase } = await getSettings();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${apiBase.replace(/\/$/, "")}${path}`, {
      ...init,
      signal: controller.signal,
      headers: init.body ? { "content-type": "application/json", ...(init.headers ?? {}) } : init.headers,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detailMessage((detail as { detail?: unknown }).detail) ?? `HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TypeError) {
      cache = null;
      throw new BackendConnectionError();
    }
    if (error instanceof Error && error.name === "AbortError") throw new BackendTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadContext(force = false): Promise<{ profile: ProfileData | null; attachments: AttachmentMeta[]; ai: boolean; online: boolean; cachedAt?: string; error?: string }> {
  if (!force && cache && Date.now() - cache.at < PROFILE_TTL_MS) return { ...cache, online: true };
  try {
    const [profile, attachments, health] = await Promise.all([
      api<{ profile: unknown }>("/api/profile"),
      api<{ attachments: AttachmentMeta[] }>("/api/attachments"),
      api<{ ai: boolean }>("/api/health"),
    ]);
    cache = { profile: normalizeProfile(profile.profile), attachments: attachments.attachments, ai: health.ai, at: Date.now() };
    await chrome.storage.local.set({ offlineCache: { profile: cache.profile, attachments: cache.attachments, savedAt: new Date().toISOString() } });
    return { ...cache, online: true };
  } catch (error) {
    // A backend that answers with an error (e.g. an unreadable profile file) must say so; filling from the
    // last profile seen is only for a backend that is not running.
    if (!(error instanceof BackendConnectionError || error instanceof BackendTimeoutError)) {
      return { profile: null, attachments: [], ai: false, online: true, error: (error as Error).message };
    }
    // Backend not running: fall back to the last profile we saw so filling still works.
    const stored = await chrome.storage.local.get("offlineCache");
    const offline = stored.offlineCache as { profile: ProfileData; attachments: AttachmentMeta[]; savedAt: string } | undefined;
    return { profile: offline ? normalizeProfile(offline.profile) : null, attachments: [], ai: false, online: false, cachedAt: offline?.savedAt };
  }
}

async function getMemory(host: string): Promise<Record<string, string>> {
  const previousKey = `memory:${host}`;
  const key = `memory:address-purpose-v2:${host}`;
  const stored = await chrome.storage.local.get([previousKey, key]);
  return { ...legacyMemory((stored[previousKey] as Record<string, string>) ?? {}), ...((stored[key] as Record<string, string>) ?? {}) };
}

async function remember(host: string, label: string, target: string): Promise<void> {
  const key = `memory:address-purpose-v2:${host}`;
  const memory = await getMemory(host);
  memory[label] = target;
  await chrome.storage.local.set({ [key]: memory });
}

/** A per-site switch kept with the site's field memory (e.g. "setting::date-shift"); null removes it. */
async function saveSiteSetting(host: string, key: string, value: string | null): Promise<Record<string, string>> {
  const storageKey = `memory:address-purpose-v2:${host}`;
  const memory = await getMemory(host);
  if (value === null) delete memory[`setting::${key}`];
  else memory[`setting::${key}`] = value;
  await chrome.storage.local.set({ [storageKey]: memory });
  return memory;
}

async function getFile(kind: string): Promise<{ name: string; type: string; data: string } | null> {
  const context = await loadContext();
  const fallbacks: Record<string, string[]> = { resume_zh: ["resume_zh", "resume_en"], resume_en: ["resume_en", "resume_zh"] };
  const order = fallbacks[kind] ?? [kind];
  const attachment = order.map((candidate) => [...context.attachments].reverse().find((item) => item.kind === candidate)).find(Boolean);
  if (!attachment) return null;
  const file = await api<{ name: string; type: string; data: string; size: number }>(`/api/attachments/${attachment.id}/content`);
  if (!file.data || file.size !== attachment.size) return null;
  return file;
}

function sendToFrame<T>(tabId: number, frameId: number, command: FrameCommand): Promise<T | null> {
  return (chrome.tabs.sendMessage(tabId, command, { frameId }) as Promise<T>).catch(() => null);
}

async function fillAllFrames(tabId: number, command: Extract<FrameCommand, { type: "fill-frame" | "inspect-frame" }>): Promise<FrameReport[]> {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [{ frameId: 0 }];
  const ordered = [...frames].sort((a, b) => a.frameId - b.frameId);
  const reports: FrameReport[] = [];
  for (const frame of ordered) {
    const report = await sendToFrame<FrameReport>(tabId, frame.frameId, command);
    const editable = report?.notes?.some((note) => note.startsWith("edit-buttons:"));
    if (report && (report.items?.length || editable)) reports.push({ ...report, frameId: frame.frameId });
  }
  return reports;
}

function mergeProposals(base: Proposal[], incoming: Proposal[]): Proposal[] {
  const merged = new Map(base.map((proposal) => [proposal.id, proposal]));
  incoming.forEach((proposal) => merged.set(proposal.id, proposal));
  return Array.from(merged.values()).slice(-300);
}

// Values read on 保存 / 下一步 are kept per tab, so they survive the page navigating away.
// Old suggestions used a combined address field. Keep them out of the new review panel.
const captureKey = (tabId: number) => `capture:address-purpose-v2:${tabId}`;
const sessionStore = chrome.storage.session ?? chrome.storage.local;

async function getCaptured(tabId: number): Promise<CaptureResult | null> {
  const stored = await sessionStore.get(captureKey(tabId));
  const result = stored[captureKey(tabId)] as CaptureResult | undefined;
  return result?.schemaVersion === CAPTURE_SCHEMA_VERSION ? result : null;
}

async function addCaptured(tabId: number, result: CaptureResult): Promise<CaptureResult> {
  const previous = await getCaptured(tabId);
  const merged: CaptureResult = { schemaVersion: CAPTURE_SCHEMA_VERSION, lang: result.lang, proposals: mergeProposals(previous?.proposals ?? [], result.proposals) };
  await sessionStore.set({ [captureKey(tabId)]: merged });
  return merged;
}

async function clearCaptured(tabId: number): Promise<void> {
  await sessionStore.remove(captureKey(tabId));
}

async function handle(message: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;
  switch (message.type) {
    case "get-context": {
      const [context, settings, memory, newVersion] = await Promise.all([loadContext(), getSettings(), getMemory(message.host), pendingVersion()]);
      void reloadIfRebuilt();
      const result: FillContext = { ...context, settings, memory, newVersion };
      return result;
    }
    case "refresh-profile":
      return loadContext(true);
    case "get-file":
      return getFile(message.kind);
    case "fill-all":
      if (tabId === undefined) return [];
      await loadContext(true);
      return fillAllFrames(tabId, { type: "fill-frame", lang: message.lang, overwrite: message.overwrite });
    case "inspect-all":
      if (tabId === undefined) return [];
      await loadContext(true);
      return fillAllFrames(tabId, { type: "inspect-frame", lang: message.lang });
    case "fill-one": {
      if (tabId === undefined) return null;
      await loadContext(true);
      const report = await sendToFrame<import("./engine/engine").FieldReport>(tabId, message.frameId, { type: "fill-one-frame", id: message.id, target: message.target, lang: message.lang, automatic: message.automatic, mappingKey: message.label });
      if (message.remember && !message.automatic && sender.tab?.url && (report || message.target === "skip")) await remember(new URL(sender.tab.url).host, `manual::${message.label}`, message.target);
      return report;
    }
    case "focus-field":
      if (tabId !== undefined) await sendToFrame(tabId, message.frameId, { type: "focus-frame-field", id: message.id });
      return true;
    case "click-edit":
      if (tabId === undefined) return null;
      return sendToFrame(tabId, message.frameId, { type: "click-edit" });
    case "describe-all": {
      if (tabId === undefined) return [];
      const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [{ frameId: 0 }];
      const described = await Promise.all(frames.map(async (frame) => ({ frameId: frame.frameId, ...((await sendToFrame<object>(tabId, frame.frameId, { type: "describe-frame" })) ?? {}) })));
      return described.filter((frame) => "controls" in frame);
    }
    case "clear-marks":
      if (tabId !== undefined) {
        const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
        await Promise.all(frames.map((frame) => sendToFrame(tabId, frame.frameId, { type: "clear-frame-marks" })));
      }
      return true;
    case "save-answers": {
      const result = await api<{ answers: unknown[] }>("/api/profile/answers", {
        method: "POST",
        body: JSON.stringify({ answers: message.answers.map((answer) => ({ ...answer, source: "learned" })) }),
      });
      cache = null;
      return result;
    }
    case "record-application":
      return api("/api/applications", {
        method: "POST",
        body: JSON.stringify({ ...message.job, status: "applied", source: "extension", applied_at: new Date().toISOString().slice(0, 10), note: message.note ?? "" }),
      });
    case "ai-answer": {
      if (tabId === undefined) throw new Error("找不到当前网页，请重新打开网申助手。");
      const snapshot = await sendToFrame<DraftSnapshot>(tabId, message.frameId, { type: "prepare-frame-draft", field: message.field });
      if (!snapshot?.field || snapshot.value === undefined) throw new Error(snapshot?.error ?? "网页连接已失效，请重新打开网申助手。");
      const limit = snapshot.maxLength ?? message.maxLength;
      const minimum = snapshot.minLength ?? message.minLength;
      const result = await api<{ answer: string }>(
        "/api/ai/answer",
        {
          method: "POST",
          body: JSON.stringify({
            question: message.question,
            lang: message.lang,
            job: message.job,
            max_length: limit && limit >= 20 ? Math.min(limit, 5000) : undefined,
            min_length: minimum && minimum >= 20 && (!limit || minimum < limit) ? Math.min(minimum, 5000) : undefined,
          }),
        },
        240_000,
      );
      const answer = result.answer?.trim();
      if (!answer) throw new Error("AI 返回了空内容，请重试。");
      const applied = await sendToFrame<DraftResult>(tabId, message.frameId, { type: "set-frame-text", field: snapshot.field, text: answer, expectedValue: snapshot.value });
      return { answer, ...applied, applied: applied?.applied === true, error: applied?.error ?? (applied ? undefined : "页面连接已失效，草稿已保留，请核对后手动填写。") };
    }
    case "ai-map":
      return api<{ mappings: { index: number; key: string | null }[] }>(
        "/api/ai/map-fields",
        { method: "POST", body: JSON.stringify({ fields: message.fields, lang: message.lang }) },
        240_000,
      );
    case "capture-all": {
      if (tabId === undefined) return null;
      const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [{ frameId: 0 }];
      const results = await Promise.all(frames.map((frame) => sendToFrame<CaptureResult>(tabId, frame.frameId, { type: "capture-frame" })));
      const found = results.filter((result): result is CaptureResult => result?.schemaVersion === CAPTURE_SCHEMA_VERSION && Boolean(result.proposals));
      if (!found.length) return { schemaVersion: CAPTURE_SCHEMA_VERSION, lang: "zh", proposals: [] };
      return addCaptured(tabId, { schemaVersion: CAPTURE_SCHEMA_VERSION, lang: found[0].lang, proposals: found.flatMap((result) => result.proposals) });
    }
    case "captured": {
      if (tabId === undefined || message.result.schemaVersion !== CAPTURE_SCHEMA_VERSION || !message.result.proposals.length) return true;
      const merged = await addCaptured(tabId, message.result);
      await sendToFrame(tabId, 0, { type: "captured", result: merged });
      return true;
    }
    case "get-captured":
      return tabId === undefined ? null : getCaptured(tabId);
    case "clear-captured":
      if (tabId !== undefined) await clearCaptured(tabId);
      return true;
    case "save-capture": {
      const result = await api<{ applied: number; skipped: number }>("/api/profile/capture", { method: "POST", body: JSON.stringify(message.payload) }, 10_000);
      cache = null;
      if (tabId !== undefined) await clearCaptured(tabId);
      return result;
    }
    case "learned":
    case "submitted":
      // Forward from any frame to the top frame, where the panel lives.
      if (tabId !== undefined) await sendToFrame(tabId, 0, message);
      return true;
    case "health":
      try {
        return { online: true, ...(await api<{ ai: boolean; version: string }>("/api/health", {}, 2000)) };
      } catch {
        return { online: false };
      }
    case "get-settings":
      // Every page load asks for settings: a good moment to pick up a rebuilt extension.
      void reloadIfRebuilt();
      return getSettings();
    case "save-site-setting":
      if (!sender.tab?.url || !/^[a-z-]{1,40}$/.test(message.key)) return null;
      return saveSiteSetting(new URL(sender.tab.url).host, message.key, message.value);
    case "save-settings": {
      const settings = { ...(await getSettings()), ...message.settings };
      await chrome.storage.local.set({ settings });
      cache = null;
      return settings;
    }
    case "open-panel":
      if (tabId !== undefined) await sendToFrame(tabId, 0, message);
      return true;
    default:
      return null;
  }
}

chrome.tabs.onRemoved.addListener((tabId) => void clearCaptured(tabId));

chrome.runtime.onMessage.addListener((message: Request, sender, sendResponse) => {
  handle(message, sender)
    .then(sendResponse)
    .catch((error: Error) => sendResponse({ error: error.message, ...(error instanceof BackendConnectionError ? { code: error.code } : {}) }));
  return true;
});

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "fill-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await sendToFrame(tab.id, 0, { type: "open-panel", fill: true });
});
