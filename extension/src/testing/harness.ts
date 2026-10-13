// Test-only bundle: exposes the engine on window for Playwright fixture tests.
import { normalizeProfile, type Lang } from "../../../shared/profileSchema";
import { capturePage, capturePayload, diffCapture } from "../engine/capture";
import { fillPage, fillWithTarget, plan } from "../engine/engine";
import { Panel, jobDescription } from "../content/panel";
import { clickEdit, findEditButtons } from "../content/frame";
import { legacyMemory } from "../engine/memory";
import { contextualMemoryKey } from "../engine/classify";

declare global {
  interface Window {
    JobAutofill: unknown;
  }
}

window.JobAutofill = {
  openPanel() {
    return new Panel().toggle(true);
  },
  async fill(profile: unknown, options: { lang?: Lang | "auto"; overwrite?: boolean; files?: Record<string, string>; memory?: Record<string, string> } = {}) {
    const files = options.files ?? {};
    return fillPage({
      profile: normalizeProfile(profile),
      lang: options.lang ?? "auto",
      overwrite: options.overwrite,
      memory: new Map(Object.entries(options.memory ?? {})),
      getFile: async (kind) => (files[kind] ? new File([files[kind]], `${kind}.pdf`, { type: "application/pdf" }) : null),
    });
  },
  fillOne(profile: unknown, id: string, target: string, options: { automatic?: boolean; mappingKey?: string } = {}) {
    return fillWithTarget({ profile: normalizeProfile(profile), lang: "zh" }, id, target, "zh", options.automatic, options.mappingKey);
  },
  /** Reads the page and diffs it against `profile` (what 保存 / the panel button would propose). */
  capture(profile: unknown, options: { clicked?: string; lang?: Lang | "auto"; memory?: Record<string, string> } = {}) {
    const data = normalizeProfile(profile);
    const clicked = options.clicked ? document.querySelector(options.clicked) : null;
    const capture = capturePage(data, { clicked, lang: options.lang, memory: new Map(Object.entries(options.memory ?? {})) });
    return { capture, proposals: diffCapture(data, capture) };
  },
  /** The POST /api/profile/capture body for every proposal (ticked or not). */
  payload(profile: unknown) {
    const data = normalizeProfile(profile);
    const proposals = diffCapture(data, capturePage(data, {}));
    return capturePayload(proposals.map((proposal) => ({ ...proposal, checked: true })));
  },
  jobDescription,
  editButtons: () => findEditButtons().length,
  clickEdit,
  plan(profile: unknown, options: { memory?: Record<string, string>; legacyMemory?: boolean } = {}) {
    const memory = options.legacyMemory ? legacyMemory(options.memory ?? {}) : options.memory ?? {};
    return plan(document, { profile: normalizeProfile(profile), memory: new Map(Object.entries(memory)) }).planned.map((item) => ({
      id: item.control.id,
      kind: item.control.kind,
      label: item.info.label,
      placeholder: item.info.placeholder,
      section: item.context.section,
      target: item.target?.scope === "field" ? `${item.target.section}.${item.target.key}` : item.target?.scope,
      score: item.target?.score,
      entry: item.entry,
      part: item.part,
      mappingKey: contextualMemoryKey(item.info.label || item.info.placeholder, item.context),
    }));
  },
};
