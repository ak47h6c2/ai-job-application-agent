import type { AttachmentMeta, Lang, ProfileData } from "../../shared/profileSchema";
import type { CapturePayload, Proposal } from "./engine/capture";
import type { FieldReport, FillReport } from "./engine/engine";

export interface ExtensionSettings {
  apiBase: string;
  webUi: string;
  showLauncher: boolean;
  langMode: Lang | "auto";
  hiddenHosts: string[];
  /** Read what the user typed when they click 保存 / 下一步 / 提交, and offer to add it to the profile. */
  autoCapture: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBase: "http://127.0.0.1:8000",
  webUi: "http://127.0.0.1:5173",
  showLauncher: true,
  langMode: "auto",
  hiddenHosts: [],
  autoCapture: true,
};

export interface FillContext {
  profile: ProfileData | null;
  attachments: AttachmentMeta[];
  online: boolean;
  ai: boolean;
  settings: ExtensionSettings;
  memory: Record<string, string>;
  cachedAt?: string;
  /** A rebuilt unpacked extension that Chrome has not reloaded yet. */
  newVersion?: string;
  /** The backend answered but could not provide the profile. */
  error?: string;
}

export interface FrameReport extends FillReport {
  frameId: number;
}

export interface TaggedField extends FieldReport {
  frameId: number;
}

export interface DraftField {
  id: string;
  label: string;
  kind: FieldReport["kind"];
  mappingKey?: string;
}

export interface DraftSnapshot {
  field?: DraftField;
  value?: string;
  maxLength?: number;
  minLength?: number;
  error?: string;
}

export interface DraftResult {
  answer?: string;
  applied?: boolean;
  id?: string;
  error?: string;
}

export interface JobInfo {
  title: string;
  company: string;
  url: string;
  description?: string;
}

export interface CaptureResult {
  schemaVersion: number;
  lang: Lang;
  proposals: Proposal[];
}

export interface LearnedAnswer {
  question: string;
  answer: string;
  lang: Lang;
}

export type Request =
  | { type: "get-context"; host: string }
  | { type: "get-file"; kind: string; lang: Lang }
  | { type: "fill-all"; lang: Lang | "auto"; overwrite: boolean }
  | { type: "inspect-all"; lang: Lang | "auto" }
  | { type: "fill-one"; frameId: number; id: string; target: string; lang: Lang; remember: boolean; label: string; automatic?: boolean }
  | { type: "focus-field"; frameId: number; id: string }
  | { type: "clear-marks" }
  | { type: "describe-all" }
  | { type: "click-edit"; frameId: number }
  | { type: "save-answers"; answers: LearnedAnswer[] }
  | { type: "record-application"; job: JobInfo; note?: string }
  | { type: "ai-answer"; frameId: number; field: DraftField; question: string; lang: Lang; job: JobInfo; maxLength?: number; minLength?: number }
  | { type: "ai-map"; fields: { index: number; label: string; type: string; section?: string | null; heading?: string; options?: string[] }[]; lang: Lang }
  | { type: "learned"; answer: LearnedAnswer; key: string }
  | { type: "submitted" }
  | { type: "open-panel"; fill?: boolean }
  | { type: "health" }
  | { type: "get-settings" }
  | { type: "save-settings"; settings: Partial<ExtensionSettings> }
  | { type: "refresh-profile" }
  | { type: "capture-all" }
  | { type: "captured"; result: CaptureResult }
  | { type: "get-captured" }
  | { type: "clear-captured" }
  | { type: "save-capture"; payload: CapturePayload }
  | { type: "save-site-setting"; key: string; value: string | null };

/** Messages the background sends into frames. */
export type FrameCommand =
  | { type: "fill-frame"; lang: Lang | "auto"; overwrite: boolean }
  | { type: "inspect-frame"; lang: Lang | "auto" }
  | { type: "fill-one-frame"; id: string; target: string; lang: Lang; automatic?: boolean; mappingKey?: string }
  | { type: "focus-frame-field"; id: string }
  | { type: "prepare-frame-draft"; field: DraftField }
  | { type: "set-frame-text"; field: DraftField; text: string; expectedValue: string }
  | { type: "clear-frame-marks" }
  | { type: "describe-frame" }
  | { type: "click-edit" }
  | { type: "learned"; answer: LearnedAnswer; key: string }
  | { type: "submitted" }
  | { type: "capture-frame" }
  | { type: "captured"; result: CaptureResult }
  | { type: "open-panel"; fill?: boolean };

export function send<T = unknown>(message: Request): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}
