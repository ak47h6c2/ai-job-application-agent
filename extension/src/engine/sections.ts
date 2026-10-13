import { SCHEMA } from "../../../shared/profileSchema";
import { docPosition, isVisible } from "./dom";
import { compact, normalizeLabel } from "./text";

export const BASIC_SECTION = "basic";

const BASIC_HEADINGS = [
  "奖励活动", "技能/爱好", "计算机技能", "专业技能", "职业规划", "申请岗位情况",
  "基本信息", "个人信息", "个人资料", "个人基本信息", "基础个人信息", "基础信息", "联系方式", "联系信息", "求职意向", "工作意向", "应聘意向", "应聘信息", "个人概况", "其他信息", "附加信息", "自我评价", "自我描述", "个人评价", "补充信息", "声明", "诚信承诺",
  "personal information", "personal details", "contact information", "contact details", "basic information", "my information", "about you", "additional information",
  "现居地址", "现居住地址", "通讯地址", "通信地址", "家庭地址", "家庭住址", "residential address", "current address", "mailing address", "home address",
];

/** Blocks that hold other people's details and match no profile section; fields there must not get the user's data. */
export const OTHER_SECTION = "other";
export const UNKNOWN_SECTION = "unknown";
const OTHER_HEADINGS = ["证明人信息", "推荐人信息", "推荐人", "证明人", "references", "referees", "referee details", "reference details", "professional references"];

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
  fulltime?: boolean;
}

let patterns: HeadingPattern[] | null = null;

function headingPatterns(): HeadingPattern[] {
  if (patterns) return patterns;
  const list: HeadingPattern[] = BASIC_HEADINGS.map((text) => ({ section: BASIC_SECTION, text: compact(normalizeLabel(text)), internship: false }));
  OTHER_HEADINGS.forEach((text) => list.push({ section: OTHER_SECTION, text: compact(normalizeLabel(text)), internship: false }));
  for (const section of SCHEMA.sections) {
    const internship = new Set((section.internshipHeadings ?? []).map((text) => compact(normalizeLabel(text))));
    for (const heading of section.headings) {
      const text = compact(normalizeLabel(heading));
      list.push({ section: section.key, text, internship: internship.has(text), fulltime: section.key === "work" && /全职|正式工作|full.?time/.test(text) });
    }
  }
  // Longest first so "实习/工作经历" wins over "工作经历".
  patterns = list.sort((a, b) => b.text.length - a.text.length);
  return patterns;
}

const ADD_PREFIX = /^(\+|＋|添加|新增|增加|继续添加|add|new|编辑|edit|删除|delete)/i;
const DIALOG_TITLE = ".el-dialog__title, .ant-modal-title, .ivu-modal-header-inner, .arco-modal-title, .t-dialog__header, .layui-layer-title, [role=dialog] :is(h1,h2,h3,h4,h5,h6)";
/** A dialog title names its section with a verb: "编辑教育经历", "Add Work Experience". */
const DIALOG_VERB = /^\s*(?:添加|新增|增加|编辑|修改|完善|填写|add|edit|new|update)\s*/i;

/** Completion badges that resume menus append to section names: "教育经历（待完善）". */
const STATUS_SUFFIX = /\s*[(（]?\s*(?:待完善|未完善|已完善|待填写|未填写|已填写|未完成|已完成|完善中|incomplete|complete|completed)\s*[)）]?\s*$/i;

export function matchHeadingText(raw: string): HeadingPattern | null {
  const normalized = normalizeLabel(raw).replace(STATUS_SUFFIX, "");
  if (!normalized || normalized.length > 28 || ADD_PREFIX.test(normalized)) return null;
  const text = compact(normalized)
    .replace(/[(（][^)）]*[)）]$/, "")
    .replace(/\d+$/, "");
  for (const pattern of headingPatterns()) {
    if (text === pattern.text) return pattern;
    // Allow short decorations: "教育经历1", "Education (optional)".
    if (text.startsWith(pattern.text) && /^[#:+＋一二三四五六七八九十]{1,3}$/.test(text.slice(pattern.text.length))) return pattern;
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
    if (element.closest("[data-jaf-ui], option, select, textarea, button, label, .el-form-item__label, .ant-form-item-label, .el-form-item__content, .ant-form-item-control, .ivu-form-item-content, .layui-input-block, .layui-input-inline, [class*=dropdown], [class*=popper]")) continue;
    // Use the whole element text when the heading is split across inline nodes ("教育经历" + "*").
    const full = (element.textContent ?? "").trim();
    const text = full.length <= 30 ? full : raw;
    const dialogTitle = element.matches(DIALOG_TITLE);
    const pattern = matchHeadingText(dialogTitle ? text.replace(DIALOG_VERB, "") : text);
    // An unrecognized form heading may still be a boundary; boundaryHeadings() decides.
    const semantic = dialogTitle || element.matches("h1,h2,h3,h4,h5,h6,[role=heading],.section-title,.form-content--title");
    if ((!pattern && !semantic) || !isVisible(element)) continue;
    seen.add(element);
    headings.push({ element, section: pattern?.section ?? UNKNOWN_SECTION, variant: pattern?.internship ? "internship" : pattern?.fulltime ? "fulltime" : "all", nav: false, active: false });
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
  return boundaryHeadings(headings.sort((a, b) => docPosition(a.element, b.element)));
}

function headingLevel(element: Element): string {
  return /^H([1-6])$/.exec(element.tagName)?.[1] ?? element.getAttribute("aria-level") ?? `${element.tagName}.${element.className}`;
}

/** The largest container of a heading that holds no other recognized section heading. */
function sectionBlock(heading: Heading, recognized: Heading[]): Element {
  let block = heading.element;
  for (let node = heading.element.parentElement; node && node !== document.body; node = node.parentElement) {
    if (recognized.some((other) => other !== heading && node!.contains(other.element))) break;
    block = node;
  }
  return block;
}

/**
 * An unrecognized heading ends the previous section so its generic fields cannot borrow that section's data.
 * It does not apply above the first recognized heading (page or job titles) or to a deeper subheading
 * inside the section, such as a saved entry's title.
 */
function boundaryHeadings(headings: Heading[]): Heading[] {
  const recognized = headings.filter((heading) => !heading.nav && heading.section !== UNKNOWN_SECTION);
  let previous: Heading | null = null;
  return headings.filter((heading) => {
    if (heading.nav) return true;
    if (heading.section !== UNKNOWN_SECTION) {
      previous = heading;
      return true;
    }
    if (!previous) return false;
    if (heading.element.matches(DIALOG_TITLE)) return true;
    const block = sectionBlock(previous, recognized);
    if (block !== previous.element && !block.contains(heading.element)) return true;
    const own = headingLevel(heading.element);
    const parent = headingLevel(previous.element);
    const deeper = /^\d$/.test(own) && /^\d$/.test(parent) ? Number(own) > Number(parent) : own !== parent;
    return !deeper;
  });
}

export interface SectionContext {
  section: string | null;
  variant: WorkVariant;
  heading: Element | null;
}

export function sectionFor(element: Element, headings: Heading[]): SectionContext {
  let found: Heading | null = null;
  // Prefer the heading inside the same form card over headings in unrelated columns.
  for (let container = element.parentElement; container && container !== document.body; container = container.parentElement) {
    const local = headings.filter(heading => !heading.nav && container!.contains(heading.element)
      && !heading.element.contains(element) && docPosition(heading.element, element) < 0);
    if (local.length) { found = local[local.length - 1]; break; }
  }
  if (!found) {
    for (const heading of headings) {
      if (heading.nav) continue;
      if (heading.element.contains(element)) continue;
      if (docPosition(heading.element, element) < 0) found = heading;
      else break;
    }
  }
  if (!found) found = headings.find((heading) => heading.nav && heading.active) ?? null;
  return found ? { section: found.section, variant: found.variant, heading: found.element } : { section: null, variant: "all", heading: null };
}

export function hasRepeatableHeadings(headings: Heading[]): boolean {
  return headings.some((heading) => heading.section !== BASIC_SECTION);
}
