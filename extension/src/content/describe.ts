import { emptyProfile, type ProfileData } from "../../../shared/profileSchema";
import { textOf } from "../engine/dom";
import { plan } from "../engine/engine";
import { findHeadings } from "../engine/sections";

const LIBRARY_PREFIXES = ["el-", "ant-", "ivu-", "layui-", "arco-", "t-", "van-", "n-", "semi-", "select2", "chosen", "mx-", "vxe-", "a-"];

function classSummary(element: Element): string {
  return (element.className?.toString?.() ?? "").split(/\s+/).filter(Boolean).slice(0, 4).join(" ").slice(0, 120);
}

/**
 * Structure of the form on this frame, for adapting the engine to a new site.
 * Contains labels, widget types and option texts — never the values typed into fields.
 */
export function describeFrame(profile: ProfileData | null) {
  const { planned } = plan(document, { profile: profile ?? emptyProfile() });
  const libraries = new Map<string, number>();
  document.querySelectorAll("[class]").forEach((element) => {
    for (const name of (element.className?.toString?.() ?? "").split(/\s+/)) {
      const prefix = LIBRARY_PREFIXES.find((candidate) => name.startsWith(candidate));
      if (prefix) libraries.set(prefix, (libraries.get(prefix) ?? 0) + 1);
    }
  });
  const addButtons = Array.from(document.querySelectorAll("button, a, [role=button], span"))
    .map((element) => textOf(element, 30))
    .filter((text) => /^(\+|＋)|添加|新增|add/i.test(text) && text.length <= 24);
  return {
    url: `${location.origin}${location.pathname}${location.hash}`,
    title: document.title.slice(0, 120),
    libraries: Object.fromEntries(libraries),
    headings: findHeadings(document.body).map((heading) => ({ text: textOf(heading.element, 40), section: heading.section, nav: heading.nav })),
    addButtons: Array.from(new Set(addButtons)).slice(0, 30),
    controls: planned.map((item) => {
      const input = item.control.input as HTMLInputElement | undefined;
      const options =
        input instanceof HTMLSelectElement
          ? Array.from(input.options).map((option) => (option.textContent ?? "").trim()).slice(0, 40)
          : item.control.members?.map((member) => textOf(member.closest("label") ?? member.parentElement, 30)).slice(0, 20);
      return {
        kind: item.control.kind,
        label: item.info.label,
        placeholder: item.info.placeholder,
        identifiers: item.info.identifiers.slice(0, 80),
        tag: item.control.root.tagName.toLowerCase(),
        classes: classSummary(item.control.root),
        containerClasses: item.info.container ? classSummary(item.info.container) : "",
        inputType: input?.type,
        readOnly: input?.readOnly || undefined,
        section: item.context.section,
        recognizedAs: item.target?.scope === "field" ? `${item.target.section}.${item.target.key}` : item.target?.scope ?? null,
        score: item.target ? Math.round(item.target.score) : undefined,
        entry: item.entry,
        regionPart: item.regionPart,
        options,
      };
    }),
  };
}
