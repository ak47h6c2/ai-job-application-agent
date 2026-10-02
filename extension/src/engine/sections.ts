import { SCHEMA } from "../../../shared/profileSchema";
import { docPosition, isVisible } from "./dom";
import { compact, normalizeLabel } from "./text";

export const BASIC_SECTION = "basic";

const BASIC_HEADINGS = [
  "基本信息", "个人信息", "个人资料", "个人基本信息", "基础信息", "联系方式", "联系信息", "求职意向", "应聘信息", "个人概况", "其他信息", "附加信息",
  "personal information", "personal details", "contact information", "contact details", "basic information", "my information", "about you", "additional information",
];

export type WorkVariant = "all" | "internship" | "fulltime";

export interface Heading {
  element: Element;
  section: string;
  variant: WorkVariant;
  nav: boolean;
  active: boolean;
}

interface HeadingPattern {
  section: string;
  text: string;
  internship: boolean;
}

let patterns: HeadingPattern[] | null = null;

function headingPatterns(): HeadingPattern[] {
  if (patterns) return patterns;
  const list: HeadingPattern[] = BASIC_HEADINGS.map((text) => ({ section: BASIC_SECTION, text: compact(normalizeLabel(text)), internship: false }));
  for (const section of SCHEMA.sections) {
    const internship = new Set((section.internshipHeadings ?? []).map((text) => compact(normalizeLabel(text))));
    for (const heading of section.headings) {
      const text = compact(normalizeLabel(heading));
      list.push({ section: section.key, text, internship: internship.has(text) });
    }
  }
  // Longest first so "实习/工作经历" wins over "工作经历".
  patterns = list.sort((a, b) => b.text.length - a.text.length);
  return patterns;
}

const ADD_PREFIX = /^(\+|＋|添加|新增|增加|继续添加|add|new|编辑|edit|删除|delete)/i;

export function matchHeadingText(raw: string): HeadingPattern | null {
  const normalized = normalizeLabel(raw);
  if (!normalized || normalized.length > 28 || ADD_PREFIX.test(normalized)) return null;
  const text = compact(normalized)
    .replace(/[(（][^)）]*[)）]$/, "")
    .replace(/\d+$/, "");
  for (const pattern of headingPatterns()) {
    if (text === pattern.text) return pattern;
    // Allow short decorations: "教育经历1", "Education (optional)".
    if (text.startsWith(pattern.text) && text.length - pattern.text.length <= 3 && !/[一-鿿]{3,}$/.test(text.slice(pattern.text.length))) return pattern;
  }
  return null;
}

const CONTROL_SELECTOR = "input:not([type=hidden]), select, textarea";
const ACTIVE_CLASS = /(^|[\s_-])(active|current|selected|is-active|is-current|checked|on)([\s_-]|$)/i;

function isActive(element: Element): boolean {
  let node: Element | null = element;
  for (let depth = 0; depth < 3 && node; depth += 1) {
    if (node.getAttribute("aria-selected") === "true" || node.getAttribute("aria-current")) return true;
    if (ACTIVE_CLASS.test(node.className?.toString?.() ?? "")) return true;
    node = node.parentElement;
  }
  return false;
}

export function findHeadings(scope: ParentNode = document.body): Heading[] {
  const headings: Heading[] = [];
  const seen = new Set<Element>();
  const root = scope instanceof Document ? scope.body : (scope as Element);
  if (!root) return headings;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = node.textContent?.trim() ?? "";
    if (raw.length < 2 || raw.length > 30) continue;
    const element = node.parentElement;
    if (!element || seen.has(element)) continue;
    if (element.closest("[data-jaf-ui], option, select, textarea, button, label, .el-form-item__label, .ant-form-item-label, [class*=dropdown], [class*=popper]")) continue;
    // Use the whole element text when the heading is split across inline nodes ("教育经历" + "*").
    const full = (element.textContent ?? "").trim();
    const pattern = matchHeadingText(full.length <= 30 ? full : raw);
    if (!pattern || !isVisible(element)) continue;
    seen.add(element);
    headings.push({ element, section: pattern.section, variant: pattern.internship ? "internship" : "all", nav: false, active: false });
  }

  // Navigation / stepper clusters list many sections side by side with no fields in between.
  for (const heading of headings) {
    let container: Element | null = heading.element.parentElement;
    for (let depth = 0; depth < 4 && container; depth += 1) {
      const members = headings.filter((other) => container!.contains(other.element));
      if (members.length >= 3 && !container.querySelector(CONTROL_SELECTOR)) {
        members.forEach((member) => {
          member.nav = true;
          member.active = isActive(member.element);
        });
        break;
      }
      container = container.parentElement;
    }
  }

  const work = headings.filter((heading) => heading.section === "work" && !heading.nav);
  if (work.some((heading) => heading.variant === "internship")) {
    work.filter((heading) => heading.variant === "all").forEach((heading) => (heading.variant = "fulltime"));
  }
  return headings.sort((a, b) => docPosition(a.element, b.element));
}

export interface SectionContext {
  section: string | null;
  variant: WorkVariant;
  heading: Element | null;
}

export function sectionFor(element: Element, headings: Heading[]): SectionContext {
  let found: Heading | null = null;
  for (const heading of headings) {
    if (heading.nav) continue;
    if (heading.element.contains(element)) continue;
    if (docPosition(heading.element, element) < 0) found = heading;
    else break;
  }
  if (!found) found = headings.find((heading) => heading.nav && heading.active) ?? null;
  return found ? { section: found.section, variant: found.variant, heading: found.element } : { section: null, variant: "all", heading: null };
}

export function hasRepeatableHeadings(headings: Heading[]): boolean {
  return headings.some((heading) => heading.section !== BASIC_SECTION);
}
