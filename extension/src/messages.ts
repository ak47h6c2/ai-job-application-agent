import type { AttachmentMeta, Lang, ProfileData } from "../../shared/profileSchema";
import type { FieldReport, FillReport } from "./engine/engine";

export interface ExtensionSettings {
  apiBase: string;
  webUi: string;
  showLauncher: boolean;
  langMode: Lang | "auto";
  hiddenHosts: string[];
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBase: "http://127.0.0.1:8000",
  webUi: "http://127.0.0.1:5173",
  showLauncher: true,
  langMode: "auto",
  hiddenHosts: [],
};

export interface FillContext {
  profile: ProfileData | null;
  attachments: AttachmentMeta[];
  online: boolean;
  ai: boolean;
  settings: ExtensionSettings;
  memory: Record<string, string>;
  cachedAt?: string;
}

export interface FrameReport extends FillReport {
  frameId: number;
}

export interface TaggedField extends FieldReport {
  frameId: number;
}

export interface JobInfo {
  title: string;
  company: string;
  url: string;
  description?: string;
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
  | { type: "fill-one"; frameId: number; id: string; target: string; lang: Lang; remember: boolean; label: string }
  | { type: "focus-field"; frameId: number; id: string }
  | { type: "clear-marks" }
  | { type: "save-answers"; answers: LearnedAnswer[] }
  | { type: "record-application"; job: JobInfo; note?: string }
  | { type: "ai-answer"; frameId: number; id: string; question: string; lang: Lang; job: JobInfo }
  | { type: "ai-map"; fields: { index: number; label: string; type: string }[]; lang: Lang }
  | { type: "learned"; answer: LearnedAnswer; key: string }
  | { type: "submitted" }
  | { type: "open-panel"; fill?: boolean }
  | { type: "health" }
  | { type: "get-settings" }
  | { type: "save-settings"; settings: Partial<ExtensionSettings> }
  | { type: "refresh-profile" };

/** Messages the background sends into frames. */
export type FrameCommand =
  | { type: "fill-frame"; lang: Lang | "auto"; overwrite: boolean }
  | { type: "fill-one-frame"; id: string; target: string; lang: Lang }
  | { type: "focus-frame-field"; id: string }
  | { type: "set-frame-text"; id: string; text: string }
  | { type: "clear-frame-marks" }
  | { type: "learned"; answer: LearnedAnswer; key: string }
  | { type: "submitted" }
  | { type: "open-panel"; fill?: boolean };

export function send<T = unknown>(message: Request): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}
