import { SCHEMA, type Answer, type FieldDef } from "../../../shared/profileSchema";
import type { Control } from "./discover";
import type { LabelInfo } from "./label";
import { BASIC_SECTION, type SectionContext } from "./sections";
import { containsTerm, identifierWords, labelCore, normalizeLabel, similarity } from "./text";

export type Target =
  | { scope: "field"; section: string; key: string; field: FieldDef; score: number; via: string }
  | { scope: "answer"; answer: Answer; score: number; via: string }
  | { scope: "attachment"; kind: string; score: number; via: string };

interface Candidate {
  section: string;
  field: FieldDef;
  match: string[];
  exact: string[];
  not: string[];
}

let candidates: Candidate[] | null = null;

function norm(list: string[] | undefined): string[] {
  return (list ?? []).map((item) => normalizeLabel(item)).filter(Boolean);
}

export function allCandidates(): Candidate[] {
  if (candidates) return candidates;
  candidates = [
    ...SCHEMA.basicGroups.flatMap((group) => group.fields.map((field) => ({ section: BASIC_SECTION, field }))),
    ...SCHEMA.sections.flatMap((section) => section.fields.map((field) => ({ section: section.key, field }))),
  ].map(({ section, field }) => ({ section, field, match: norm(field.match), exact: norm(field.exact), not: norm(field.not) }));
  return candidates;
}

export function findCandidate(section: string, key: string): Candidate | undefined {
  return allCandidates().find((candidate) => candidate.section === section && candidate.field.key === key);
}

const SHORT_ASCII = /^[a-z0-9 ]{1,3}$/;

/** 0-100 score for how well a normalized label names a field. */
export function scoreLabel(label: string, candidate: Candidate): number {
  if (!label) return 0;
  const core = labelCore(label);
  if (candidate.exact.includes(core) || candidate.exact.includes(label)) return 100;
  if (candidate.not.some((word) => containsTerm(label, word))) return 0;
  let best = 0;
  for (const synonym of candidate.match) {
    if (core === synonym || label === synonym) return 100;
    let score = 0;
    if (containsTerm(core, synonym) || containsTerm(label, synonym)) {
      const host = containsTerm(core, synonym) ? core : label;
      if (SHORT_ASCII.test(synonym) && host.length > synonym.length + 12) continue;
      score = 58 + (37 * synonym.length) / host.length;
    } else if (core.length >= 2 && !SHORT_ASCII.test(core) && containsTerm(synonym, core)) {
      score = 48 + (30 * core.length) / synonym.length;
    }
    best = Math.max(best, score);
  }
  return Math.min(best, 99);
}

function typeAdjustment(control: Control, field: FieldDef): number {
  const input = control.input as HTMLInputElement | undefined;
  const inputType = (input?.type ?? "").toLowerCase();
  const isDateField = field.type === "date" || field.type === "month";
  switch (control.kind) {
    case "date":
    case "date-range":
      return isDateField ? 15 : -40;
    case "cascader":
      return field.type === "region" ? 25 : field.type === "enum" ? 0 : -10;
    case "native-select":
    case "custom-select":
    case "radio-group":
    case "checkbox-group":
      if (field.type === "longtext") return -30;
      return field.type === "enum" ? 10 : 0;
    case "checkbox":
      return field.enum === "yesno" ? 0 : -100;
    case "textarea":
    case "contenteditable":
      if (isDateField || field.type === "enum") return -30;
      return field.type === "longtext" ? 10 : 0;
    default:
      if (inputType === "email") return field.type === "email" ? 30 : -15;
      if (inputType === "tel") return field.type === "phone" ? 15 : -5;
      if (inputType === "number") return field.type === "number" || field.key === "gpa" ? 5 : -5;
      if (inputType === "url") return field.type === "url" ? 20 : -10;
      if (field.type === "longtext") return -5;
      return 0;
  }
}

function sectionAdjustment(context: SectionContext, candidateSection: string, pageHasSections: boolean, forced: boolean): number {
  const ctx = context.section;
  if (ctx && ctx !== BASIC_SECTION) {
    if (candidateSection === ctx) return forced ? 30 : 20;
    return candidateSection === BASIC_SECTION ? (forced ? -40 : -25) : -35;
  }
  if (candidateSection === BASIC_SECTION) return 0;
  return ctx === BASIC_SECTION || pageHasSections ? -25 : -10;
}

const AUTOCOMPLETE: Record<string, [string, string]> = {
  email: [BASIC_SECTION, "email"],
  tel: [BASIC_SECTION, "phone"],
  "tel-national": [BASIC_SECTION, "phone"],
  "given-name": [BASIC_SECTION, "firstName"],
  "family-name": [BASIC_SECTION, "lastName"],
  name: [BASIC_SECTION, "name"],
  bday: [BASIC_SECTION, "birthDate"],
  "postal-code": [BASIC_SECTION, "postcode"],
  "street-address": [BASIC_SECTION, "address"],
  "address-line1": [BASIC_SECTION, "address"],
  "address-level2": [BASIC_SECTION, "currentCity"],
  sex: [BASIC_SECTION, "gender"],
  url: [BASIC_SECTION, "website"],
  organization: ["work", "company"],
  "organization-title": ["work", "title"],
};

export interface ClassifyOptions {
  context: SectionContext;
  pageHasSections: boolean;
  forcedSection?: string;
  memory?: Map<string, string>;
  answers: Answer[];
}

export function memoryKey(label: string): string {
  return labelCore(normalizeLabel(label)).slice(0, 80);
}

function fieldTarget(section: string, key: string, score: number, via: string): Target | null {
  const candidate = findCandidate(section, key);
  return candidate ? { scope: "field", section, key, field: candidate.field, score, via } : null;
}

export function classify(control: Control, info: LabelInfo, options: ClassifyOptions): Target | null {
  if (control.kind === "file") return classifyAttachment(control, info);

  const label = normalizeLabel(info.label);
  const remembered = options.memory?.get(memoryKey(info.label || info.placeholder));
  if (remembered) {
    if (remembered === "skip") return null;
    const [section, key] = remembered.split(".");
    if (section === "answer") {
      const answer = options.answers.find((item) => item.id === key);
      if (answer) return { scope: "answer", answer, score: 100, via: "memory" };
    } else {
      const target = fieldTarget(section, key, 100, "memory");
      if (target) return target;
    }
  }

  const context = options.forcedSection ? { ...options.context, section: options.forcedSection } : options.context;
  const placeholder = normalizeLabel(info.placeholder);
  const identifiers = identifierWords(info.identifiers);
  let best: Target | null = null;

  for (const candidate of allCandidates()) {
    let score = scoreLabel(label, candidate);
    let via = "label";
    if (score < 60 && placeholder) {
      const fromPlaceholder = scoreLabel(placeholder, candidate) * 0.9;
      if (fromPlaceholder > score) {
        score = fromPlaceholder;
        via = "placeholder";
      }
    }
    if (score < 60 && identifiers) {
      const fromIdentifier = scoreLabel(identifiers, candidate) * 0.8;
      if (fromIdentifier > score) {
        score = fromIdentifier;
        via = "identifier";
      }
    }
    if (score <= 0) continue;
    score += typeAdjustment(control, candidate.field) + sectionAdjustment(context, candidate.section, options.pageHasSections, Boolean(options.forcedSection));
    if (!best || score > best.score) best = { scope: "field", section: candidate.section, key: candidate.field.key, field: candidate.field, score, via };
  }

  const auto = AUTOCOMPLETE[info.autocomplete];
  if (auto && (!best || best.score < 90)) best = fieldTarget(auto[0], auto[1], 90, "autocomplete") ?? best;

  if (!best || best.score < 60) {
    const answer = matchAnswer(info.label || info.placeholder, options.answers);
    if (answer && (!best || answer.score >= best.score)) return answer;
  }
  return best && best.score >= 45 ? best : null;
}

export function matchAnswer(rawLabel: string, answers: Answer[]): Target | null {
  const label = labelCore(normalizeLabel(rawLabel));
  if (label.length < 2) return null;
  let best: Target | null = null;
  for (const answer of answers) {
    const question = labelCore(normalizeLabel(answer.question));
    if (!question) continue;
    let score = 0;
    if (question === label) score = 100;
    else if (Math.min(question.length, label.length) >= 4 && (question.includes(label) || label.includes(question))) score = 78;
    else score = similarity(question, label) >= 0.75 ? 70 + similarity(question, label) * 20 : 0;
    if (score && (!best || score > best.score)) best = { scope: "answer", answer, score, via: "answers" };
  }
  return best;
}

function classifyAttachment(control: Control, info: LabelInfo): Target | null {
  const input = control.input as HTMLInputElement;
  const accept = (input.accept || "").toLowerCase();
  const text = normalizeLabel(`${info.label} ${info.placeholder} ${info.container?.textContent?.slice(0, 200) ?? ""} ${identifierWords(info.identifiers)}`);
  let best: Target | null = null;
  for (const kind of SCHEMA.attachmentKinds) {
    let score = 0;
    for (const word of kind.match.map((item) => normalizeLabel(item))) {
      if (containsTerm(text, word)) score = Math.max(score, 60 + word.length * 3);
    }
    if (kind.key === "photo" && /image/.test(accept) && !/pdf/.test(accept)) score += 30;
    if (kind.key === "photo" && /pdf|doc/.test(accept)) score -= 40;
    if (score > 0 && (!best || score > best.score)) best = { scope: "attachment", kind: kind.key, score, via: "label" };
  }
  if (!best && /pdf|doc/.test(accept)) best = { scope: "attachment", kind: "resume_zh", score: 50, via: "accept" };
  return best;
}
