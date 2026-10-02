import type { AttachmentMeta, ProfileData } from "../../shared/profileSchema";

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (item && typeof item === "object" && "msg" in item ? String((item as { msg: unknown }).msg) : String(item)))
      .join("; ");
  }
  return "";
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    throw new ApiError(aborted ? "Request timed out" : "Cannot reach the local backend", 0);
  } finally {
    window.clearTimeout(timer);
  }
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? detailMessage((data as { detail: unknown }).detail) : "";
    throw new ApiError(detail || `HTTP ${response.status}`, response.status);
  }
  return data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export type ApplicationStatus = "saved" | "applied" | "assessment" | "interview" | "offer" | "rejected";
export const APPLICATION_STATUSES: ApplicationStatus[] = ["saved", "applied", "assessment", "interview", "offer", "rejected"];

export interface ApplicationRecord {
  key: string;
  title: string;
  company: string;
  url: string;
  source: string;
  applied_at: string;
  status: ApplicationStatus;
  note: string;
  next_action_at: string;
  updated_at: string;
}

export type ApplicationInput = Partial<Omit<ApplicationRecord, "updated_at">>;

export type AIProvider = "openai" | "anthropic";

export interface AISettings {
  provider: AIProvider;
  base_url: string;
  model: string;
  has_key: boolean;
  key_hint: string;
  configured: boolean;
}

export interface Health {
  status: string;
  version: string;
  ai: boolean;
}

export interface ResumeParseResult {
  profile: ProfileData;
  method: "ai" | "rules";
  warning: string;
  text_chars: number;
}

export const api = {
  health: () => request<Health>("/api/health", {}, 4000),

  getProfile: () => request<{ profile: ProfileData }>("/api/profile"),
  saveProfile: (profile: ProfileData) => request<{ profile: ProfileData }>("/api/profile", json("PUT", { profile })),

  listAttachments: () => request<{ attachments: AttachmentMeta[] }>("/api/attachments"),
  uploadAttachment: (file: File, kind: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    return request<{ attachment: AttachmentMeta }>("/api/attachments", { method: "POST", body: form }, 60000);
  },
  attachmentUrl: (id: string) => `${API_BASE}/api/attachments/${encodeURIComponent(id)}/file`,
  deleteAttachment: (id: string) => request<{ deleted: boolean }>(`/api/attachments/${encodeURIComponent(id)}`, { method: "DELETE" }),

  parseResume: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ResumeParseResult>("/api/resume/parse", { method: "POST", body: form }, 300000);
  },

  getSettings: () => request<{ ai: AISettings; data_dir: string }>("/api/settings"),
  saveSettings: (body: { provider: AIProvider; base_url: string; model: string; api_key?: string }) =>
    request<{ ai: AISettings }>("/api/settings", json("PUT", body)),
  testAI: () => request<{ ok: boolean; reply: string }>("/api/ai/test", { method: "POST" }, 90000),
  translate: (target: "en" | "zh", profile: ProfileData) =>
    request<{ profile: ProfileData; translated: number }>("/api/ai/translate", json("POST", { target, profile }), 300000),

  listApplications: () => request<{ records: ApplicationRecord[] }>("/api/applications"),
  saveApplication: (record: ApplicationInput) => request<{ record: ApplicationRecord }>("/api/applications", json("POST", record)),
  deleteApplication: (key: string) =>
    request<{ deleted: boolean; records: ApplicationRecord[] }>("/api/applications/delete", json("POST", { key })),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
