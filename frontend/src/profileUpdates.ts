import { SCHEMA, type Answer, type Entry, type FieldValue, type Lang, type ProfileData } from "../../shared/profileSchema";

/** JSON with sorted keys, so the server's key order never makes equal values look different. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

const unchanged = (current: unknown, before: unknown) => stable(current) === stable(before);

/** Apply returned translations only where the user has not changed the original text. */
export function applyTranslation(current: ProfileData, before: ProfileData, result: ProfileData, target: Lang): { profile: ProfileData; applied: number } {
  let applied = 0;
  const merge = (entry: Entry, original: Entry, translated: Entry, keys: string[]): Entry => {
    const next = { ...entry };
    for (const key of keys) {
      const value = translated[key];
      if (!value || typeof value !== "object" || !value[target] || !unchanged(entry[key], original[key])) continue;
      const old = original[key];
      if ((typeof old === "object" ? old[target] : undefined) === value[target]) continue;
      next[key] = { ...(typeof entry[key] === "object" ? entry[key] : { zh: entry[key] as string }), [target]: value[target] };
      applied += 1;
    }
    return next;
  };
  const basic = merge(current.basic, before.basic, result.basic, SCHEMA.basicGroups.flatMap(group => group.fields.filter(field => field.localized).map(field => field.key)));
  const sections = { ...current.sections };
  const source: Lang = target === "en" ? "zh" : "en";
  const sourceValue = (value: FieldValue | undefined) => typeof value === "object" ? value[source] : value;
  for (const section of SCHEMA.sections) {
    const translated = result.sections[section.key] ?? [];
    const used = new Set<number>();
    const list = [...(current.sections[section.key] ?? [])];
    for (const original of before.sections[section.key] ?? []) {
      // Immutable updates preserve identity on reorder; edited or deleted entries are skipped.
      const position = list.indexOf(original);
      if (position < 0 || !Object.values(original).some(sourceValue)) continue;
      const match = translated.findIndex((entry, index) => !used.has(index) && Object.entries(original).every(([key, value]) => unchanged(sourceValue(value), sourceValue(entry[key]))));
      if (match < 0) continue;
      used.add(match);
      list[position] = merge(list[position], original, translated[match], section.fields.filter(field => field.localized).map(field => field.key));
    }
    sections[section.key] = list;
  }
  return { profile: { ...current, basic, sections }, applied };
}

/** A delayed draft must not replace a manually edited question or answer. */
export function applyAnswerDraft(answers: Answer[], original: Answer, text: string): { answers: Answer[]; applied: boolean } {
  let applied = false;
  const next = answers.map(item => {
    if (item.id !== original.id || item.question !== original.question || item.answer !== original.answer) return item;
    applied = true;
    return { ...item, answer: text, updatedAt: new Date().toISOString() };
  });
  return { answers: next, applied };
}

/** Field-level three-way merge of one entry: the user's changed fields win, the rest comes from the server. */
function mergeFields(original: Entry, mine: Entry, theirs: Entry): Entry {
  const merged: Entry = { ...theirs };
  for (const key of new Set([...Object.keys(original), ...Object.keys(mine)])) {
    if (unchanged(mine[key], original[key])) continue;
    if (mine[key] === undefined) delete merged[key];
    else merged[key] = mine[key];
  }
  return merged;
}

/**
 * Three-way merge of one section's entries. An entry edited on only one side keeps that side's version; an
 * entry edited on both sides is merged field by field; entries added on either side are kept once.
 */
function mergeEntries(original: Entry[], mine: Entry[], theirs: Entry[]): Entry[] {
  if (unchanged(mine, original)) return theirs;
  if (unchanged(theirs, original)) return mine;
  // The server entry that continues each original entry: an unchanged copy, else an edit in the same position.
  const usedServer = new Set<number>();
  const serverFor = new Map<number, number>();
  original.forEach((entry, index) => {
    const match = theirs.findIndex((other, position) => !usedServer.has(position) && unchanged(other, entry));
    if (match >= 0) { usedServer.add(match); serverFor.set(index, match); }
  });
  original.forEach((_, index) => {
    if (!serverFor.has(index) && index < theirs.length && !usedServer.has(index)) { usedServer.add(index); serverFor.set(index, index); }
  });
  // The original entry behind each local one: the same (or an equal) object is untouched here.
  const usedOriginal = new Set<number>();
  const untouched = mine.map(entry => {
    const match = original.findIndex((other, position) => !usedOriginal.has(position) && (other === entry || unchanged(other, entry)));
    if (match >= 0) usedOriginal.add(match);
    return match;
  });
  // Without additions or deletions, an edited entry stays in its original position.
  const edited = new Map<number, number>();
  if (mine.length === original.length) {
    mine.forEach((_, index) => {
      if (untouched[index] < 0 && !usedOriginal.has(index)) { usedOriginal.add(index); edited.set(index, index); }
    });
  }
  const merged: Entry[] = [];
  mine.forEach((entry, index) => {
    if (untouched[index] >= 0) {
      const server = serverFor.get(untouched[index]);
      // Deleted on the server and not touched here: stays deleted.
      if (server !== undefined) merged.push(theirs[server]);
      return;
    }
    const from = edited.get(index);
    const server = from === undefined ? undefined : serverFor.get(from);
    merged.push(from !== undefined && server !== undefined ? mergeFields(original[from], entry, theirs[server]) : entry);
  });
  theirs.forEach((entry, position) => { if (!usedServer.has(position)) merged.push(entry); });
  return merged;
}

/**
 * Rebuilds the profile after a save conflict: what the user changed since `base` wins, everything else comes
 * from `server` (for example entries or answers the extension just saved).
 */
export function mergeConcurrent(base: ProfileData, local: ProfileData, server: ProfileData): ProfileData {
  const basic: Entry = { ...server.basic };
  for (const key of new Set([...Object.keys(base.basic), ...Object.keys(local.basic)])) {
    if (unchanged(local.basic[key], base.basic[key])) continue;
    if (local.basic[key] === undefined) delete basic[key];
    else basic[key] = local.basic[key];
  }
  const sections: Record<string, Entry[]> = { ...server.sections };
  for (const key of new Set([...Object.keys(base.sections), ...Object.keys(local.sections)])) {
    sections[key] = mergeEntries(base.sections[key] ?? [], local.sections[key] ?? [], server.sections[key] ?? []);
  }
  const baseAnswers = new Map(base.answers.map(answer => [answer.id, answer]));
  const localAnswers = new Map(local.answers.map(answer => [answer.id, answer]));
  const answers = [
    ...local.answers.filter(answer => !baseAnswers.has(answer.id) && !server.answers.some(other => other.id === answer.id)),
    ...server.answers.flatMap(answer => {
      const original = baseAnswers.get(answer.id);
      const mine = localAnswers.get(answer.id);
      if (original && !mine) return [];
      return [mine && original && !unchanged(mine, original) ? mine : answer];
    }),
  ];
  return { ...server, basic, sections, answers, settings: unchanged(local.settings, base.settings) ? server.settings : local.settings };
}
