// Test-only bundle: exposes the engine on window for Playwright fixture tests.
import { normalizeProfile, type Lang } from "../../../shared/profileSchema";
import { fillPage, plan } from "../engine/engine";

declare global {
  interface Window {
    JobAutofill: unknown;
  }
}

window.JobAutofill = {
  async fill(profile: unknown, options: { lang?: Lang | "auto"; overwrite?: boolean; files?: Record<string, string> } = {}) {
    const files = options.files ?? {};
    return fillPage({
      profile: normalizeProfile(profile),
      lang: options.lang ?? "auto",
      overwrite: options.overwrite,
      memory: new Map(),
      getFile: async (kind) => (files[kind] ? new File([files[kind]], `${kind}.pdf`, { type: "application/pdf" }) : null),
    });
  },
  plan(profile: unknown) {
    return plan(document, { profile: normalizeProfile(profile) }).planned.map((item) => ({
      id: item.control.id,
      kind: item.control.kind,
      label: item.info.label,
      section: item.context.section,
      target: item.target?.scope === "field" ? `${item.target.section}.${item.target.key}` : item.target?.scope,
      score: item.target?.score,
      entry: item.entry,
      part: item.part,
    }));
  },
};
