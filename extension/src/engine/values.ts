import { PRESENT, enumLabel, readValue, resolveBasic, type Entry, type FieldDef, type Lang, type ProfileData } from "../../../shared/profileSchema";
import type { WorkVariant } from "./sections";
import { BASIC_SECTION } from "./sections";

export interface DateValue {
  year: string;
  month: string;
  day: string;
  present: boolean;
}

export type Desired = (
  | { kind: "text"; text: string; fallback: boolean }
  | { kind: "enum"; enumKey: string; value: string; text: string; fallback: boolean }
  | { kind: "date"; date: DateValue; text: string; fallback: boolean }
  | { kind: "region"; parts: string[]; text: string; fallback: boolean }
) & {
  /** The stored value as typed in the profile (keeps list separators like 、). */
  raw?: string;
};

const LIST_SEPARATORS = /\s*[、,，;；\n|]+\s*/;

/** Items of a list value ("北京、上海" -> ["北京", "上海"]) for multi-select widgets. */
export function splitMulti(desired: Desired): Desired[] {
  if (desired.kind === "enum" || desired.kind === "date") return [desired];
  const items = (desired.raw ?? desired.text).split(LIST_SEPARATORS).map((item) => item.trim()).filter(Boolean);
  if (items.length <= 1) return [desired];
  return items.map((text) => ({ kind: "text", text, fallback: desired.fallback, raw: text }));
}

export function parseDate(raw: string): DateValue | null {
  const value = raw.trim();
  if (!value) return null;
  if (value === PRESENT || /^(至今|现在|present|now|current)$/i.test(value)) return { year: "", month: "", day: "", present: true };
  const match = /^(\d{4})(?:[-/.年](\d{1,2}))?(?:[-/.月](\d{1,2}))?/.exec(value);
  if (!match) return null;
  return { year: match[1], month: (match[2] ?? "").padStart(match[2] ? 2 : 0, "0"), day: (match[3] ?? "").padStart(match[3] ? 2 : 0, "0"), present: false };
}

export function splitRegion(text: string): string[] {
  return text
    .split(/\s*[/／>,，、|]\s*|\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function entriesFor(profile: ProfileData, section: string, variant: WorkVariant): Entry[] {
  const entries = profile.sections[section] ?? [];
  if (section !== "work" || variant === "all") return entries;
  const typed = entries.filter((entry) => typeof entry.type === "string" && entry.type);
  if (!typed.length) return entries;
  return variant === "internship" ? entries.filter((entry) => entry.type === "internship") : entries.filter((entry) => entry.type !== "internship");
}

export function desiredFor(field: FieldDef, raw: { value: string; fallback: boolean }, lang: Lang): Desired | null {
  const value = raw.value.trim();
  if (!value) return null;
  return { ...desiredOf(field, value, raw.fallback, lang), raw: value };
}

function desiredOf(field: FieldDef, value: string, fallback: boolean, lang: Lang): Desired {
  const raw = { fallback };
  if (field.type === "enum" && field.enum) {
    return { kind: "enum", enumKey: field.enum, value, text: enumLabel(field.enum, value, lang), fallback: raw.fallback };
  }
  if (field.type === "date" || field.type === "month") {
    const date = parseDate(value);
    if (!date) return { kind: "text", text: value, fallback: raw.fallback };
    return { kind: "date", date, text: date.present ? (lang === "zh" ? "至今" : "Present") : value, fallback: raw.fallback };
  }
  if (field.type === "region") {
    const parts = splitRegion(value);
    return { kind: "region", parts, text: lang === "zh" ? parts.join("") : parts.join(", "), fallback: raw.fallback };
  }
  return { kind: "text", text: value, fallback: raw.fallback };
}

/** Number for <input type=number>: "15k-20k" -> 15000, "3.8/4.0" -> 3.8, "AUD 75,000" -> 75000. */
export function numericValue(text: string): string | null {
  const match = /(\d[\d,]*(?:\.\d+)?)\s*(k|K|千|w|W|万)?/.exec(text);
  if (!match) return null;
  let value = Number(match[1].replace(/,/g, ""));
  if (match[2] && /k|千/i.test(match[2])) value *= 1000;
  if (match[2] && /w|万/i.test(match[2])) value *= 10000;
  return Number.isFinite(value) ? String(value) : null;
}

export function resolveDesired(
  profile: ProfileData,
  lang: Lang,
  section: string,
  field: FieldDef,
  entryIndex: number,
  variant: WorkVariant,
): Desired | null {
  if (field.sensitive && !profile.settings?.fillSensitive) return null;
  if (section === BASIC_SECTION) return desiredFor(field, resolveBasic(profile, field.key, lang), lang);
  const entry = entriesFor(profile, section, variant)[entryIndex];
  if (!entry) return null;
  return desiredFor(field, readValue(entry[field.key], lang), lang);
}

export type DatePattern = { order: "ymd"; sep: string; precision: "year" | "month" | "day"; cjk: boolean };

/** Infers the date text format a widget expects from its placeholder or current value. */
export function datePattern(hint: string, fallbackPrecision: "year" | "month" | "day"): DatePattern {
  const text = hint.toLowerCase();
  const cjk = /年/.test(text) && /\d|y/.test(text);
  const sepMatch = /(?:yyyy|\d{4})\s*([-/.])/.exec(text);
  const sep = sepMatch ? sepMatch[1] : "-";
  let precision = fallbackPrecision;
  if (/(?:yyyy|\d{4})[-/.年]\s*(?:mm|m|\d{1,2})[-/.月]\s*(?:dd|d|\d{1,2})/.test(text)) precision = "day";
  else if (/(?:yyyy|\d{4})[-/.年]\s*(?:mm|m|\d{1,2})/.test(text)) precision = "month";
  else if (/^(?:yyyy|\d{4})年?$/.test(text.trim())) precision = "year";
  return { order: "ymd", sep, precision, cjk };
}

export function formatDate(date: DateValue, pattern: DatePattern): string {
  const month = date.month || "01";
  const day = date.day || "01";
  if (pattern.cjk) {
    if (pattern.precision === "year") return `${date.year}年`;
    if (pattern.precision === "month") return `${date.year}年${month}月`;
    return `${date.year}年${month}月${day}日`;
  }
  if (pattern.precision === "year") return date.year;
  if (pattern.precision === "month") return `${date.year}${pattern.sep}${month}`;
  return `${date.year}${pattern.sep}${month}${pattern.sep}${day}`;
}

/** Yes/no reading of a richer enum, for questions like "Are you legally entitled to work in Australia?". */
export function impliedYesNo(desired: Desired): Desired | null {
  if (desired.kind !== "enum" || desired.enumKey === "yesno") return null;
  if (desired.enumKey === "workRights") {
    const value = desired.value === "need_sponsorship" ? "no" : "yes";
    return { kind: "enum", enumKey: "yesno", value, text: value === "yes" ? "Yes" : "No", fallback: desired.fallback };
  }
  return null;
}
