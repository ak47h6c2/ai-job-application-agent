import { useState } from "react";
import { Plus } from "lucide-react";
import type { Entry, Lang, ProfileData, SectionDef } from "../../../shared/profileSchema";
import { useI18n } from "../i18n";
import { EntryRow } from "./EntryRow";
import { useToast } from "./Toast";
import { Count } from "./ui";

interface SectionCardProps {
  section: SectionDef;
  profile: ProfileData;
  contentLang: Lang;
  update: (recipe: (current: ProfileData) => ProfileData) => void;
}

export function SectionCard({ section, profile, contentLang, update }: SectionCardProps) {
  const { lang, t } = useI18n();
  const toast = useToast();
  const entries = profile.sections[section.key] ?? [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const setEntries = (recipe: (list: Entry[]) => Entry[]) =>
    update((current) => ({
      ...current,
      sections: { ...current.sections, [section.key]: recipe(current.sections[section.key] ?? []) },
    }));

  const add = () => {
    setEntries((list) => [...list, {}]);
    setOpenIndex(entries.length);
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    setEntries((list) => {
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    if (openIndex === index) setOpenIndex(target);
    else if (openIndex === target) setOpenIndex(index);
  };

  const remove = (index: number) => {
    const removed = entries[index];
    setEntries((list) => list.filter((_, i) => i !== index));
    setOpenIndex(null);
    const isEmpty = Object.values(removed).every((value) => !value || (typeof value === "object" && !value.zh && !value.en));
    if (isEmpty) return;
    toast(t("entry.deleted", { section: section[lang] }), {
      action: {
        label: t("undo"),
        onClick: () => setEntries((list) => [...list.slice(0, index), removed, ...list.slice(index)]),
      },
    });
  };

  return (
    <section className="card">
      <div className="flex items-center gap-2.5 py-2.5 pl-4 pr-3 sm:pl-5">
        <h2 className="truncate text-[15px] font-semibold">{section[lang]}</h2>
        {entries.length > 0 && <Count value={entries.length} />}
        <div className="flex-1" />
        <button type="button" className="btn btn-sm btn-ghost text-accent-strong hover:text-accent-strong" onClick={add}>
          <Plus size={15} />
          {t("section.add")}
        </button>
      </div>
      {entries.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          {entries.map((entry, index) => (
            <EntryRow
              key={index}
              section={section}
              entry={entry}
              index={index}
              count={entries.length}
              open={openIndex === index}
              contentLang={contentLang}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
              onChange={(key, value) => setEntries((list) => list.map((item, i) => (i === index ? { ...item, [key]: value } : item)))}
              onMove={(delta) => move(index, delta)}
              onDelete={() => remove(index)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
