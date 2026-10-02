// Shared between the Web UI (profile editor) and the browser extension (autofill engine).
// The JSON file is also read by the Python backend, so keep field keys in sync there.
import rawSchema from "./profile-schema.json";

export type Lang = "zh" | "en";
export type FieldType = "text" | "longtext" | "date" | "month" | "enum" | "email" | "phone" | "url" | "number" | "region";

export interface EnumOption {
  value: string;
  zh: string;
  en: string;
  rank?: number;
  synonyms: string[];
}

export interface FieldDef {
  key: string;
  zh: string;
  en: string;
  type: FieldType;
  localized?: boolean;
  enum?: string;
  sensitive?: boolean;
  derived?: boolean;
  match: string[];
  exact?: string[];
  not?: string[];
}

export interface GroupDef {
  key: string;
  zh: string;
  en: string;
  fields: FieldDef[];
}

export interface SectionDef extends GroupDef {
  headings: string[];
  internshipHeadings?: string[];
}

export interface AttachmentKindDef {
  key: string;
  zh: string;
  en: string;
  match: string[];
}

export interface ProfileSchema {
  version: number;
  enums: Record<string, EnumOption[]>;
  basicGroups: GroupDef[];
  sections: SectionDef[];
  attachmentKinds: AttachmentKindDef[];
}

export const SCHEMA = rawSchema as ProfileSchema;

export type LocalizedValue = { zh?: string; en?: string };
export type FieldValue = string | LocalizedValue;
export type Entry = Record<string, FieldValue>;

export interface Answer {
  id: string;
  question: string;
  answer: string;
  lang?: Lang | "any";
  source?: "manual" | "learned";
  updatedAt?: string;
}

export interface ProfileData {
  version: 1;
  basic: Entry;
  sections: Record<string, Entry[]>;
  answers: Answer[];
  settings: {
    fillSensitive: boolean;
  };
  updatedAt?: string;
}

export interface AttachmentMeta {
  id: string;
  kind: string;
  name: string;
  size: number;
  contentType: string;
  uploadedAt: string;
}

export const PRESENT = "present";

export function emptyProfile(): ProfileData {
  return {
    version: 1,
    basic: {},
    sections: Object.fromEntries(SCHEMA.sections.map((section) => [section.key, []])),
    answers: [],
    settings: { fillSensitive: false },
  };
}

export function normalizeProfile(input: unknown): ProfileData {
  const base = emptyProfile();
  if (!input || typeof input !== "object") return base;
  const data = input as Partial<ProfileData>;
  return {
    version: 1,
    basic: { ...(data.basic ?? {}) },
    sections: { ...base.sections, ...(data.sections ?? {}) },
    answers: Array.isArray(data.answers) ? data.answers : [],
    settings: { ...base.settings, ...(data.settings ?? {}) },
    updatedAt: data.updatedAt,
  };
}

const BASIC_FIELDS = new Map<string, FieldDef>(
  SCHEMA.basicGroups.flatMap((group) => group.fields.map((field) => [field.key, field] as const)),
);
const SECTIONS = new Map<string, SectionDef>(SCHEMA.sections.map((section) => [section.key, section]));

export function basicField(key: string): FieldDef | undefined {
  return BASIC_FIELDS.get(key);
}

export function sectionDef(key: string): SectionDef | undefined {
  return SECTIONS.get(key);
}

export function sectionField(sectionKey: string, fieldKey: string): FieldDef | undefined {
  return SECTIONS.get(sectionKey)?.fields.find((field) => field.key === fieldKey);
}

export function enumOptions(enumKey: string | undefined): EnumOption[] {
  return enumKey ? SCHEMA.enums[enumKey] ?? [] : [];
}

export function enumLabel(enumKey: string | undefined, value: string, lang: Lang): string {
  const option = enumOptions(enumKey).find((item) => item.value === value);
  return option ? option[lang] : value;
}

/** Reads a stored value in the requested language; falls back to the other language. */
export function readValue(value: FieldValue | undefined, lang: Lang): { value: string; fallback: boolean } {
  if (value === undefined || value === null) return { value: "", fallback: false };
  if (typeof value === "string") return { value, fallback: false };
  const own = (value[lang] ?? "").trim();
  if (own) return { value: own, fallback: false };
  const other = (value[lang === "zh" ? "en" : "zh"] ?? "").trim();
  return { value: other, fallback: Boolean(other) };
}

export function writeValue(field: FieldDef, previous: FieldValue | undefined, lang: Lang, next: string): FieldValue {
  if (!field.localized) return next;
  const current: LocalizedValue = typeof previous === "object" && previous ? { ...previous } : { zh: typeof previous === "string" ? previous : "" };
  current[lang] = next;
  return current;
}

const COMPOUND_SURNAMES = [
  "欧阳", "司马", "诸葛", "上官", "东方", "皇甫", "尉迟", "公孙", "慕容", "长孙", "宇文", "司徒", "令狐", "夏侯", "轩辕", "端木", "西门", "南宫", "独孤", "呼延", "闻人", "澹台", "百里", "东郭", "万俟",
];

export function splitName(fullName: string): { first: string; last: string } {
  const name = fullName.trim();
  if (!name) return { first: "", last: "" };
  if (/[一-鿿]/.test(name) && !/\s/.test(name)) {
    const compound = COMPOUND_SURNAMES.find((surname) => name.startsWith(surname) && name.length > surname.length);
    const surnameLength = compound ? compound.length : 1;
    return { last: name.slice(0, surnameLength), first: name.slice(surnameLength) };
  }
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  if (name.includes(",")) {
    const [last, first] = name.split(",").map((part) => part.trim());
    return { first, last };
  }
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function ageFrom(birthDate: string, today = new Date()): string {
  const match = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(birthDate);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] ?? 1);
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age > 0 && age < 120 ? String(age) : "";
}

function degreeRank(value: FieldValue | undefined): number {
  const raw = typeof value === "string" ? value : value?.zh ?? value?.en ?? "";
  return enumOptions("degree").find((option) => option.value === raw)?.rank ?? -1;
}

/** Basic value including derived fields (first/last name, age, highest degree, graduation date). */
export function resolveBasic(profile: ProfileData, key: string, lang: Lang): { value: string; fallback: boolean } {
  const stored = readValue(profile.basic[key], lang);
  if (stored.value) return stored;

  if (key === "firstName" || key === "lastName") {
    let source = readValue(profile.basic.name, lang);
    if (lang === "en" && (!source.value || source.fallback)) {
      const pinyin = readValue(profile.basic.pinyin, lang).value || readValue(profile.basic.englishName, lang).value;
      if (pinyin) source = { value: pinyin, fallback: false };
    }
    const parts = splitName(source.value);
    return { value: key === "firstName" ? parts.first : parts.last, fallback: source.fallback };
  }
  if (key === "age") {
    return { value: ageFrom(readValue(profile.basic.birthDate, lang).value), fallback: false };
  }
  const education = profile.sections.education ?? [];
  if (key === "highestDegree" && education.length) {
    const best = [...education].sort((a, b) => degreeRank(b.degree) - degreeRank(a.degree))[0];
    return readValue(best.degree, lang);
  }
  if (key === "graduationDate" && education.length) {
    const ends = education.map((entry) => readValue(entry.endDate, lang).value).filter((value) => value && value !== PRESENT).sort();
    return { value: ends[ends.length - 1] ?? "", fallback: false };
  }
  if (key === "name" && lang === "en") {
    const pinyin = readValue(profile.basic.pinyin, lang).value;
    if (pinyin) return { value: pinyin, fallback: false };
  }
  return stored;
}

export function profileCompleteness(profile: ProfileData): { filled: number; total: number } {
  const keys = SCHEMA.basicGroups
    .filter((group) => group.key === "identity" || group.key === "contact")
    .flatMap((group) => group.fields.filter((field) => !field.derived && !field.sensitive).map((field) => field.key))
    .slice(0, 12);
  const filled = keys.filter((key) => readValue(profile.basic[key], "zh").value).length;
  const sections = ["education", "work", "projects"].filter((key) => (profile.sections[key] ?? []).length > 0).length;
  return { filled: filled + sections, total: keys.length + 3 };
}
