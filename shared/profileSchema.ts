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
  /** Another way to state the same fact, used when a site's options do not contain the main value
   * (国内对应专业 "计算机科学与技术" for an overseas major). */
  alternateOf?: string;
  match: string[];
  exact?: string[];
  not?: string[];
}

export interface GroupDef {
  key: string;
  zh: string;
  en: string;
  fields: FieldDef[];
  description?: LocalizedValue;
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

/** Section-boundary rules, also read by the backend's AI field mapping. */
export interface ClassificationRules {
  /** Labels that name no entry by themselves ("名称", "类型"); they need a recognized section. */
  genericLabels: string[];
  /** Basic groups and fields describing the user, never a family member or another entry. */
  personalGroups: string[];
  personalFields: string[];
  /** Whole-topic questions (regex sources) answered only by the saved answer with the same question. */
  topicQuestions: string[];
  /** A "内容" box takes the field named by its heading. */
  contentLabels: string[];
  contentHeadings: { heading: string; key: string }[];
  /** "section.field" filled with every entry's value under a basic-info heading ("资格证书": all certificates). */
  listFields: string[];
  /** Words that let a basic-info label name one entry of a section ("最近工作单位"). */
  entryWords: string[];
}

export interface ProfileSchema {
  version: number;
  captureVersion: number;
  classification: ClassificationRules;
  enums: Record<string, EnumOption[]>;
  basicGroups: GroupDef[];
  sections: SectionDef[];
  attachmentKinds: AttachmentKindDef[];
}

export const SCHEMA = rawSchema as ProfileSchema;
export const CAPTURE_SCHEMA_VERSION = SCHEMA.captureVersion;

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

export type AddressUse = "current" | "mailing" | "home";
export const ADDRESS_FIELDS = {
  current: { address: "address", region: "addressRegion", postcode: "postcode" },
  mailing: { address: "mailingAddress", region: "mailingAddressRegion", postcode: "mailingPostcode" },
  home: { address: "homeAddress", region: "homeAddressRegion", postcode: "homePostcode" },
} as const;

/** The address purpose is independent of the language used to render its text. */
export function preferredAddressUse(profile: ProfileData): AddressUse {
  const use = readValue(profile.basic.preferredAddressUse, "zh").value;
  return use === "current" || use === "home" ? use : "mailing";
}

export function addressRegionKey(key: string): string | undefined {
  return Object.values(ADDRESS_FIELDS).find((fields) => fields.address === key)?.region;
}

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

/** Birth date and gender encoded in an 18-digit mainland ID number (checksum verified). */
export function idCardInfo(idNumber: string): { birthDate: string; gender: "male" | "female" } | null {
  const id = idNumber.trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(id)) return null;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(id[index]), 0);
  if ("10X98765432"[sum % 11] !== id[17]) return null;
  const year = id.slice(6, 10);
  const month = id.slice(10, 12);
  const day = id.slice(12, 14);
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return { birthDate: `${year}-${month}-${day}`, gender: Number(id[16]) % 2 === 1 ? "male" : "female" };
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
  const fromId = idCardInfo(readValue(profile.basic.idNumber, "zh").value);
  if (key === "birthDate" && fromId) return { value: fromId.birthDate, fallback: false };
  if (key === "gender" && fromId) return { value: fromId.gender, fallback: false };
  if (key === "age") {
    const birth = readValue(profile.basic.birthDate, lang).value || fromId?.birthDate || "";
    return { value: ageFrom(birth), fallback: false };
  }
  if (key === "phoneCode") {
    const phone = readValue(profile.basic.phone, lang).value.replace(/[\s-]/g, "");
    if (/^(\+?86)?1[3-9]\d{9}$/.test(phone)) return { value: "+86", fallback: false };
    if (/^(\+?61|0)4\d{8}$/.test(phone)) return { value: "+61", fallback: false };
    return stored;
  }
  const education = profile.sections.education ?? [];
  if (key === "highestDegree" && education.length) {
    const best = [...education].sort((a, b) => degreeRank(b.degree) - degreeRank(a.degree))[0];
    return readValue(best.degree, lang);
  }
  if (key === "firstDegree" && education.length) {
    // 第一学历: the first degree after high school (usually 本科).
    const ranked = education.filter((entry) => degreeRank(entry.degree) >= 2).sort((a, b) => degreeRank(a.degree) - degreeRank(b.degree));
    if (ranked.length) return readValue(ranked[0].degree, lang);
  }
  if (key === "englishLevel") {
    const english = (profile.sections.languages ?? []).find((entry) => /英语|english/i.test(`${readValue(entry.language, "zh").value} ${readValue(entry.language, "en").value}`));
    if (english) {
      const level = [readValue(english.level, lang).value, readValue(english.score, lang).value].filter(Boolean).join(" ");
      if (level) return { value: level, fallback: false };
    }
    return stored;
  }
  if (key === "graduationDate" && education.length) {
    // Still studying in the latest programme ("至今"): its graduation date is unknown, not the previous one's.
    const latest = [...education].sort((a, b) => readValue(a.startDate, lang).value.localeCompare(readValue(b.startDate, lang).value)).pop();
    if (latest && readValue(latest.endDate, lang).value === PRESENT) return { value: "", fallback: false };
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
