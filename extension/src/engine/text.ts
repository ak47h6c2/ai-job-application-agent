const FULL_WIDTH = /[！-～]/g;

export function toHalfWidth(text: string): string {
  return text.replace(FULL_WIDTH, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");
}

const PROMPT_WORDS =
  /^(请输入|请选择|请填写|请上传|请录入|输入|选择|填写|please\s+(enter|select|choose|input|provide|type)|enter\s+your|select\s+your|enter|select|choose|type)\s*/i;
const REQUIRED_MARKS = /[*＊]|\(必填\)|（必填）|\(选填\)|（选填）|必填项?|选填|\(required\)|\(optional\)|required|optional/gi;

/** Normalizes a form label for matching: lower case, half width, no required marks or prompt words. */
export function normalizeLabel(raw: string): string {
  let text = toHalfWidth(raw || "").toLowerCase();
  text = text.replace(REQUIRED_MARKS, " ");
  text = text.replace(/[\r\n\t]+/g, " ");
  text = text.replace(/^[\s\d.、:：)）-]+(?=\D)/, "");
  text = text.replace(PROMPT_WORDS, "");
  text = text.replace(/[:：?？。.,，;；!！]+\s*$/g, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/** Label without trailing parenthetical hints, e.g. "主修课程(不超过200字)" -> "主修课程". */
export function labelCore(normalized: string): string {
  const core = normalized.replace(/\s*[(（[【].*?[)）\]】]\s*/g, " ").replace(/\s+/g, " ").trim();
  return core || normalized;
}

export function hasCJK(text: string): boolean {
  return /[一-鿿]/.test(text);
}

export function compact(text: string): string {
  return text.replace(/[\s\-_/·•,，、()（）[\]【】]+/g, "");
}

function bigrams(text: string): Map<string, number> {
  const grams = new Map<string, number>();
  const value = compact(text);
  if (value.length < 2) {
    if (value) grams.set(value, 1);
    return grams;
  }
  for (let index = 0; index < value.length - 1; index += 1) {
    const gram = value.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** Dice coefficient on character bigrams (0..1). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (compact(a) === compact(b)) return 1;
  const left = bigrams(a);
  const right = bigrams(b);
  let overlap = 0;
  let total = 0;
  left.forEach((count, gram) => {
    total += count;
    overlap += Math.min(count, right.get(gram) ?? 0);
  });
  right.forEach((count) => {
    total += count;
  });
  return total ? (2 * overlap) / total : 0;
}

const ASCII_WORD = /^[a-z0-9 .'/&+-]+$/;

/** True when `needle` occurs in `haystack`; ASCII needles must match on word boundaries. */
export function containsTerm(haystack: string, needle: string): boolean {
  if (!needle) return false;
  if (!ASCII_WORD.test(needle)) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystack);
}

/** Splits identifiers like "schoolName" or "edu_start_date" into words. */
export function identifierWords(identifier: string): string {
  return identifier
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.[\]]+/g, " ")
    .replace(/\d+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const REGION_SUFFIX = /(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|省|市|区|县|盟|旗)$/;

export function stripRegionSuffix(text: string): string {
  return text.replace(REGION_SUFFIX, "");
}
