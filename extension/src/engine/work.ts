import { readValue, type Entry, type FieldValue } from "../../../shared/profileSchema";
import { compact, toHalfWidth } from "./text";
import { sameDateText } from "./values";

/** Optional corporate "(中国)" qualifier, while preserving city/branch distinctions. */
export function workCompanyKey(value: string): string {
  return compact(toHalfWidth(value).toLowerCase().replace(/\(\s*(?:中国|china)\s*\)/gi, ""));
}

export function sameWorkCompany(value: FieldValue | undefined, company: string): boolean {
  const key = workCompanyKey(company);
  return Boolean(key) && ["zh", "en"].some(lang => workCompanyKey(readValue(value, lang as "zh" | "en").value) === key);
}

export function workPeriodMatches(entry: Entry, start?: string, end?: string): boolean {
  return (!start || !entry.startDate || sameDateText(readValue(entry.startDate, "zh").value, start))
    && (!end || !entry.endDate || sameDateText(readValue(entry.endDate, "zh").value, end));
}
