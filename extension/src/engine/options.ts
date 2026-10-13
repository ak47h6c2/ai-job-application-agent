import { SCHEMA } from "../../../shared/profileSchema";
import type { Desired } from "./values";
import { compact, normalizeLabel, similarity, stripRegionSuffix, studyDurationYears, toHalfWidth } from "./text";

export const OPTION_MATCH_THRESHOLD = 60;

function normOption(text: string): string {
  return compact(toHalfWidth(text).toLowerCase().trim());
}

function scoreAgainst(option: string, candidate: string): number {
  if (!option || !candidate) return 0;
  if (option === candidate) return 100;
  if (option.includes(candidate) && candidate.length >= 2) return 70 + (25 * candidate.length) / option.length;
  if (candidate.includes(option) && option.length >= 2) return 62 + (25 * option.length) / candidate.length;
  return 0;
}

function classifyEnum(optionText: string, enumKey: string): { value: string; score: number } {
  const option = normOption(optionText);
  const values = SCHEMA.enums[enumKey] ?? [];
  let best = { value: "", score: 0 };
  for (const entry of values) {
    const candidates = [...entry.synonyms, entry.zh, entry.en].map(normOption);
    const score = Math.max(...candidates.map((candidate) => scoreAgainst(option, candidate)));
    if (score > best.score) best = { value: entry.value, score };
  }
  return best;
}

function enumScore(optionText: string, enumKey: string, value: string): number {
  // Classify the option to whichever enum value it matches best; only accept if that is our value.
  const best = classifyEnum(optionText, enumKey);
  return best.value === value ? best.score : 0;
}

/** Enum value an option label stands for ("中共党员" -> "party_member"), or null. */
export function enumValueOf(enumKey: string, text: string): string | null {
  const best = classifyEnum(text, enumKey);
  return best.score >= OPTION_MATCH_THRESHOLD ? best.value : null;
}

/** A money-style range ("10000~15000元/月", "8000-12000", "5000以下", "20000以上", "1.5万", "15k"), or null. */
export function numericRange(text: string): [number, number] | null {
  const value = toHalfWidth(text).replace(/,/g, "").toLowerCase();
  const numbers = Array.from(value.matchAll(/(\d+(?:\.\d+)?)\s*(万|w|k|千)?/g)).map((match) => Number(match[1]) * (match[2] === "万" || match[2] === "w" ? 10000 : match[2] === "k" || match[2] === "千" ? 1000 : 1));
  if (!numbers.length || numbers.length > 2 || /(?<!\d)(?:19|20)\d{2}[-/.年](?:0?[1-9]|1[0-2])(?!\d)/.test(value)) return null;
  if (numbers.length === 2) return [Math.min(...numbers), Math.max(...numbers)];
  if (/以下|以内|及以下|below|under|less|</.test(value)) return [0, numbers[0]];
  if (/以上|及以上|above|over|more|\+|>/.test(value)) return [numbers[0], Infinity];
  return [numbers[0], numbers[0]];
}

/** Share of the wanted range that an option's range covers, for bracketed lists such as salary bands. */
function rangeScore(option: string, wanted: string): number {
  if (!/[~\-—至到]|以上|以下|元|k|万|薪/i.test(wanted)) return 0;
  const a = numericRange(option), b = numericRange(wanted);
  if (!a || !b) return 0;
  const width = b[1] - b[0];
  const overlap = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
  const share = width > 0 && Number.isFinite(width) ? overlap / width : overlap >= 0 ? 1 : 0;
  // Below 90 so that a bracket choice is always marked for review.
  return share > 0 ? 60 + 25 * Math.min(share, 1) : 0;
}

/** True when an option was chosen as the bracket around a value rather than by its wording. */
export function isRangeChoice(optionText: string, wanted: string): boolean {
  return !scoreAgainst(normOption(optionText), normOption(wanted)) && (rangeScore(optionText, wanted) > 0 || (gradeBracketScore(optionText, wanted) ?? 0) > 0);
}

/** Language tests, most specific first ("英语专业四级" is TEM-4, not CET-4). */
const EXAMS: [string, RegExp][] = [
  ["tem8", /专业八级|\btem-?8\b/i], ["tem4", /专业四级|\btem-?4\b/i], ["cet6", /六级|\bcet-?6\b/i], ["cet4", /四级|\bcet-?4\b/i],
  ["ielts", /雅思|\bielts\b/i], ["toefl", /托福|\btoefl\b/i], ["toeic", /托业|\btoeic\b/i], ["pte", /\bpte\b/i], ["gre", /\bgre\b/i], ["bec", /\bbec/i],
];

function examOf(text: string): string | null {
  return EXAMS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/**
 * A score inside a test's bracket ("6≤雅思＜7" for IELTS 6.5, "大学英语六级≥425" for CET-6 520): 92, outside: 0.
 * null when the option states no bracket or either side names no test.
 */
function examBracketScore(optionText: string, wanted: string): number | null {
  const exam = examOf(optionText);
  if (!exam || exam !== examOf(wanted)) return exam && examOf(wanted) ? 0 : null;
  const option = toHalfWidth(optionText).replace(/≦/g, "≤").replace(/≧/g, "≥");
  const score = Number(/(\d+(?:\.\d+)?)/.exec(toHalfWidth(wanted).replace(/cet-?\d|tem-?\d/gi, ""))?.[1] ?? NaN);
  let low = -Infinity;
  let high = Infinity;
  let highInclusive = false;
  for (const match of option.matchAll(/(\d+(?:\.\d+)?)\s*(?:≤|<=|<)/g)) low = Number(match[1]);
  for (const match of option.matchAll(/(?:≥|>=|>)\s*(\d+(?:\.\d+)?)/g)) low = Number(match[1]);
  for (const match of option.matchAll(/(≤|<=|<)\s*(\d+(?:\.\d+)?)/g)) {
    high = Number(match[2]);
    highInclusive = match[1] !== "<";
  }
  if (low === -Infinity && high === Infinity) return null;
  if (Number.isNaN(score)) return 0;
  return score >= low && (highInclusive ? score <= high : score < high) ? 92 : 0;
}

const GRADE_OPTION = /\d+\s*[-~～—至]\s*\d+\s*分|\d+\s*分(?:及)?以上|\d\.\d\s*[-~～—至]\s*\d\.\d/;

/**
 * A mark inside a grade band ("70-79分/2.0-2.9" for WAM 75 or GPA 2.75): 86, outside: 0. The band on the scale
 * of the wanted number (percent or a 4/5-point GPA) decides. null when the option is no grade band.
 */
function gradeBracketScore(optionText: string, wanted: string): number | null {
  const option = toHalfWidth(optionText);
  if (!GRADE_OPTION.test(option)) return null;
  const value = Number(/(\d+(?:\.\d+)?)/.exec(toHalfWidth(wanted))?.[1] ?? NaN);
  if (Number.isNaN(value)) return null;
  const gpa = value <= 5;
  for (const part of option.split(/[\/／|｜]/)) {
    const numbers = (part.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (!numbers.length || (Math.max(...numbers) <= 5) !== gpa) continue;
    const low = Math.min(...numbers);
    const high = /以上|\+/.test(part) ? Infinity : numbers.length > 1 ? Math.max(...numbers) + (gpa ? 0.099 : 0.99) : low;
    return value >= low && value <= high ? 86 : 0;
  }
  return null;
}

function textScore(optionText: string, wanted: string): number {
  const option = normOption(optionText);
  const target = normOption(wanted);
  if (!option || !target) return 0;
  if (option === target) return 100;
  const bracket = examBracketScore(optionText, wanted) ?? gradeBracketScore(optionText, wanted);
  if (bracket !== null) return bracket;
  const optionYears = studyDurationYears(option);
  const targetYears = studyDurationYears(target);
  if (optionYears !== null && targetYears !== null && /年|years?|yrs?/i.test(option + target)) return optionYears === targetYears ? 100 : 0;
  const direct = scoreAgainst(option, target);
  if (direct) return direct;
  const range = rangeScore(optionText, wanted);
  if (range) return range;
  const regionOption = stripRegionSuffix(option);
  const regionTarget = stripRegionSuffix(target);
  if (regionOption && regionOption === regionTarget) return 95;
  return similarity(option, target) * 85;
}

/** Score 0..100 for how well an option label represents the desired value. */
export function scoreOption(optionText: string, desired: Desired, part?: string): number {
  if (part !== undefined) return textScore(optionText, part);
  switch (desired.kind) {
    case "enum":
      return Math.max(enumScore(optionText, desired.enumKey, desired.value), textScore(optionText, desired.text) * 0.9);
    case "date":
      return textScore(optionText, desired.text);
    case "region": {
      const joined = desired.parts.join("");
      const last = desired.parts[desired.parts.length - 1] ?? "";
      return Math.max(textScore(optionText, joined), textScore(optionText, desired.text), textScore(optionText, last) * 0.92);
    }
    default:
      return textScore(optionText, desired.text);
  }
}

function rankOptions<T>(items: T[], textOf: (item: T) => string, desired: Desired, part?: string): { item: T; score: number; text: string }[] {
  const ranked: { item: T; score: number; text: string }[] = [];
  for (const item of items) {
    const text = textOf(item);
    if (!text || /^(请选择|请选择\.\.\.|--+|select|please select|choose)/i.test(normalizeLabel(text)) && text.length < 12) continue;
    ranked.push({ item, score: scoreOption(text, desired, part), text });
  }
  // Stable: equal scores keep the list order.
  return ranked.sort((a, b) => b.score - a.score);
}

/**
 * Options that match the profile value equally well but mean different things ("学术硕士" / "专业硕士" for a
 * master's degree). The profile cannot tell them apart, so none of them may be chosen automatically.
 */
export function ambiguousOptions<T>(items: T[], textOf: (item: T) => string, desired: Desired, part?: string): string[] | null {
  if (desired.kind === "enum" && part === undefined) {
    // Two options that are both synonyms of the value ("学术硕士", "专业硕士" for master) are subtypes the profile does not record.
    const same = items.map((item) => ({ text: textOf(item), match: classifyEnum(textOf(item), desired.enumKey) }))
      .filter(({ text, match }) => text && match.value === desired.value && match.score >= OPTION_MATCH_THRESHOLD);
    // Partial scores only reflect text length ("电子信息硕士" vs "工学硕士"); only exact synonyms outrank the rest.
    const exact = same.filter(({ match }) => match.score >= 100);
    const tied = Array.from(new Set((exact.length ? exact : same).map(({ text }) => text.trim())));
    if (tied.length > 1 && new Set(tied.map(normOption)).size > 1) return tied;
  }
  const [first, ...rest] = rankOptions(items, textOf, desired, part);
  if (!first || first.score < OPTION_MATCH_THRESHOLD || first.score >= 100) return null;
  const tied = rest.filter((other) => other.score >= first.score - 1 && normOption(other.text) !== normOption(first.text));
  return tied.length ? [first.text, ...tied.map((other) => other.text)] : null;
}

export function bestOption<T>(items: T[], textOf: (item: T) => string, desired: Desired, part?: string): { item: T; score: number } | null {
  const [first] = rankOptions(items, textOf, desired, part);
  if (!first || first.score < OPTION_MATCH_THRESHOLD || ambiguousOptions(items, textOf, desired, part)) return null;
  return { item: first.item, score: first.score };
}

/** Text to type into a searchable dropdown. */
export function searchTerms(desired: Desired, part?: string): string[] {
  if (part) return [part, stripRegionSuffix(part)].filter((value, index, all) => value && all.indexOf(value) === index);
  if (desired.kind === "enum") {
    const entry = (SCHEMA.enums[desired.enumKey] ?? []).find((item) => item.value === desired.value);
    return [desired.text, ...(entry?.synonyms.slice(0, 2) ?? [])].filter(Boolean);
  }
  if (desired.kind === "region") {
    const last = desired.parts[desired.parts.length - 1] ?? desired.text;
    // Lists that stop at the city ("吉林省白山市") are found by searching the next level up.
    const upper = desired.parts.slice(0, -1).reverse();
    return [last, stripRegionSuffix(last), ...upper, desired.text].filter((value, index, all) => value && all.indexOf(value) === index);
  }
  const text = desired.text;
  const short = text.replace(/[(（].*$/, "").trim();
  return [text, short].filter((value, index, all) => value && all.indexOf(value) === index);
}
