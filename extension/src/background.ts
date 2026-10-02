import { normalizeProfile, type AttachmentMeta, type ProfileData } from "../../shared/profileSchema";
import { DEFAULT_SETTINGS, type ExtensionSettings, type FillContext, type FrameCommand, type FrameReport, type Request } from "./messages";

const PROFILE_TTL_MS = 20_000;
let cache: { profile: ProfileData | null; attachments: AttachmentMeta[]; ai: boolean; at: number } | null = null;

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
      throw new Error((detail as { detail?: string }).detail ?? `HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function loadContext(force = false): Promise<{ profile: ProfileData | null; attachments: AttachmentMeta[]; ai: boolean; online: boolean; cachedAt?: string }> {
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
  } catch {
    // Backend not running: fall back to the last profile we saw so filling still works.
    const stored = await chrome.storage.local.get("offlineCache");
    const offline = stored.offlineCache as { profile: ProfileData; attachments: AttachmentMeta[]; savedAt: string } | undefined;
    return { profile: offline ? normalizeProfile(offline.profile) : null, attachments: [], ai: false, online: false, cachedAt: offline?.savedAt };
  }
}

async function getMemory(host: string): Promise<Record<string, string>> {
  const key = `memory:${host}`;
  const stored = await chrome.storage.local.get(key);
  return (stored[key] as Record<string, string>) ?? {};
}

async function remember(host: string, label: string, target: string): Promise<void> {
  const key = `memory:${host}`;
  const memory = await getMemory(host);
  memory[label] = target;
  await chrome.storage.local.set({ [key]: memory });
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function getFile(kind: string): Promise<{ name: string; type: string; data: string } | null> {
  const context = await loadContext();
  const fallbacks: Record<string, string[]> = { resume_zh: ["resume_zh", "resume_en"], resume_en: ["resume_en", "resume_zh"] };
  const order = fallbacks[kind] ?? [kind];
  const attachment = order.map((candidate) => [...context.attachments].reverse().find((item) => item.kind === candidate)).find(Boolean);
  if (!attachment) return null;
  const { apiBase } = await getSettings();
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/attachments/${attachment.id}/file`);
  if (!response.ok) return null;
  return { name: attachment.name, type: attachment.contentType, data: toBase64(await response.arrayBuffer()) };
}

function sendToFrame<T>(tabId: number, frameId: number, command: FrameCommand): Promise<T | null> {
  return (chrome.tabs.sendMessage(tabId, command, { frameId }) as Promise<T>).catch(() => null);
}

async function fillAllFrames(tabId: number, lang: FrameCommand & { type: "fill-frame" }): Promise<FrameReport[]> {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [{ frameId: 0 }];
  const ordered = [...frames].sort((a, b) => a.frameId - b.frameId);
  const reports: FrameReport[] = [];
  for (const frame of ordered) {
    const report = await sendToFrame<FrameReport>(tabId, frame.frameId, lang);
    if (report && report.items?.length) reports.push({ ...report, frameId: frame.frameId });
  }
  return reports;
}

async function handle(message: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;
  switch (message.type) {
    case "get-context": {
      const [context, settings, memory] = await Promise.all([loadContext(), getSettings(), getMemory(message.host)]);
      const result: FillContext = { ...context, settings, memory };
      return result;
    }
    case "refresh-profile":
      return loadContext(true);
    case "get-file":
      return getFile(message.kind);
    case "fill-all":
      if (tabId === undefined) return [];
      return fillAllFrames(tabId, { type: "fill-frame", lang: message.lang, overwrite: message.overwrite });
    case "fill-one": {
      if (tabId === undefined) return null;
      if (message.remember && sender.tab?.url) await remember(new URL(sender.tab.url).host, message.label, message.target);
      return sendToFrame(tabId, message.frameId, { type: "fill-one-frame", id: message.id, target: message.target, lang: message.lang });
    }
    case "focus-field":
      if (tabId !== undefined) await sendToFrame(tabId, message.frameId, { type: "focus-frame-field", id: message.id });
      return true;
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
      const result = await api<{ answer: string }>(
        "/api/ai/answer",
        { method: "POST", body: JSON.stringify({ question: message.question, lang: message.lang, job: message.job }) },
        240_000,
      );
      if (tabId !== undefined) await sendToFrame(tabId, message.frameId, { type: "set-frame-text", id: message.id, text: result.answer });
      return result;
    }
    case "ai-map":
      return api<{ mappings: { index: number; key: string | null }[] }>(
        "/api/ai/map-fields",
        { method: "POST", body: JSON.stringify({ fields: message.fields, lang: message.lang }) },
        240_000,
      );
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
      return getSettings();
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

chrome.runtime.onMessage.addListener((message: Request, sender, sendResponse) => {
  handle(message, sender)
    .then(sendResponse)
    .catch((error: Error) => sendResponse({ error: error.message }));
  return true;
});

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "fill-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await sendToFrame(tab.id, 0, { type: "open-panel", fill: true });
});
