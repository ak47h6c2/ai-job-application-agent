import { PRESENT, enumLabel, enumOptions, readValue, resolveBasic, type Entry, type FieldDef, type Lang, type ProfileData } from "../../../shared/profileSchema";
import type { WorkVariant } from "./sections";
import { BASIC_SECTION } from "./sections";
import { compact } from "./text";

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

/** A stored date and a displayed one name the same month: "2019-09" ~ "2019年9月" ~ "2019.09" ~ "2019". */
export function sameDateText(stored: string, shown: string): boolean {
  const key = (raw: string) => {
    const date = parseDate(raw);
    return date ? date.present ? "present" : `${date.year}${date.month}` : compact(raw);
  };
  const a = key(stored), b = key(shown);
  return Boolean(a && b && (a.startsWith(b) || b.startsWith(a)));
}

export function splitRegion(text: string): string[] {
  return text
    .split(/\s*[/／>,，、|]\s*|\s+-\s+|(?<=[\u4e00-\u9fff])\s*[-－—]\s*(?=[\u4e00-\u9fff])/)
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

export type FamilyRole = "father" | "mother";

/** An explicit parent label must select that relationship, never just the next array entry. */
export function familyRole(text: string): FamilyRole | undefined {
  const father = /父亲|爸爸|^父$|\bfather\b|\bdad\b/i.test(text.trim());
  const mother = /母亲|妈妈|^母$|\bmother\b|\bmum\b|\bmom\b/i.test(text.trim());
  return father === mother ? undefined : father ? "father" : "mother";
}

export function familyEntryIndex(profile: ProfileData, role: FamilyRole): number {
  return (profile.sections.family ?? []).findIndex((entry) => familyRole(readValue(entry.relation, "zh").value) === role || familyRole(readValue(entry.relation, "en").value) === role);
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

/** Site setting: days added to every date typed on a site that stores dates one day early. */
export const DATE_SHIFT_KEY = "setting::date-shift";

/** "2000-04-12" moved by `days` (calendar arithmetic, no time zone involved). */
export function shiftIsoDate(value: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || !days) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

/**
 * A date to type on a site that converts the picked local midnight to another time zone and so stores the day
 * before (rencaishichang.chd.com.cn from a computer in Sydney): typing one day later stores the intended day.
 */
export function shiftDesired(desired: Desired, days: number): Desired {
  if (!days || desired.kind !== "date" || desired.date.present || !desired.date.year) return desired;
  const { year, month, day } = desired.date;
  const shifted = shiftIsoDate(`${year}-${(month || "01").padStart(2, "0")}-${(day || "01").padStart(2, "0")}`, days);
  const [y, m, d] = shifted.split("-");
  return { ...desired, date: { year: y, month: m, day: d, present: false }, text: shifted };
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
  const entries = entriesFor(profile, section, variant);
  const entry = entries[entryIndex];
  if (!entry) return null;
  if (section === "education" && field.key === "highestFullTime") {
    return desiredFor(field, { value: entryIndex === highestFullTimeIndex(entries) ? "yes" : "no", fallback: false }, lang);
  }
  return desiredFor(field, readValue(entry[field.key], lang), lang);
}

/** The education record of the highest degree among those not marked part-time ("最高全日制"). */
export function highestFullTimeIndex(entries: Entry[]): number {
  let best = -1;
  let bestRank = -1;
  entries.forEach((entry, index) => {
    if (readValue(entry.studyMode, "zh").value === "part_time") return;
    const rank = enumOptions("degree").find((option) => option.value === readValue(entry.degree, "zh").value)?.rank ?? -1;
    if (rank > bestRank) {
      best = index;
      bestRank = rank;
    }
  });
  return best;
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
  // "全日制: 是 / 否" asks the study mode as a yes/no question.
  if (desired.enumKey === "studyMode") {
    const value = desired.value === "full_time" ? "yes" : "no";
    return { kind: "enum", enumKey: "yesno", value, text: value === "yes" ? "是" : "否", fallback: desired.fallback };
  }
  // "是否双学位": no second degree is 否, a second degree is 是; a minor is neither, so it is not guessed.
  if (desired.enumKey === "minorType" && desired.value !== "minor") {
    const value = desired.value === "none" ? "no" : "yes";
    return { kind: "enum", enumKey: "yesno", value, text: value === "yes" ? "是" : "否", fallback: desired.fallback };
  }
  return null;
}
