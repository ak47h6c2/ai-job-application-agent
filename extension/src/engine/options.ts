import { SCHEMA } from "../../../shared/profileSchema";
import type { Desired } from "./values";
import { compact, normalizeLabel, similarity, stripRegionSuffix, toHalfWidth } from "./text";

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

function enumScore(optionText: string, enumKey: string, value: string): number {
  const option = normOption(optionText);
  const values = SCHEMA.enums[enumKey] ?? [];
  // Classify the option to whichever enum value it matches best; only accept if that is our value.
  let bestValue = "";
  let bestScore = 0;
  for (const entry of values) {
    const candidates = [...entry.synonyms, entry.zh, entry.en].map(normOption);
    const score = Math.max(...candidates.map((candidate) => scoreAgainst(option, candidate)));
    if (score > bestScore) {
      bestScore = score;
      bestValue = entry.value;
    }
  }
  return bestValue === value ? bestScore : 0;
}

function textScore(optionText: string, wanted: string): number {
  const option = normOption(optionText);
  const target = normOption(wanted);
  if (!option || !target) return 0;
  if (option === target) return 100;
  const direct = scoreAgainst(option, target);
  if (direct) return direct;
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

export function bestOption<T>(items: T[], textOf: (item: T) => string, desired: Desired, part?: string): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const text = textOf(item);
    if (!text || /^(请选择|请选择\.\.\.|--+|select|please select|choose)/i.test(normalizeLabel(text)) && text.length < 12) continue;
    const score = scoreOption(text, desired, part);
    if (score > (best?.score ?? 0)) best = { item, score };
  }
  return best && best.score >= OPTION_MATCH_THRESHOLD ? best : null;
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
    return [last, stripRegionSuffix(last), desired.text].filter((value, index, all) => value && all.indexOf(value) === index);
  }
  const text = desired.text;
  const short = text.replace(/[(（].*$/, "").trim();
  return [text, short].filter((value, index, all) => value && all.indexOf(value) === index);
}
