import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import { enumLabel, PRESENT, readValue, type Entry, type FieldValue, type Lang, type SectionDef } from "../../../shared/profileSchema";
import { useI18n } from "../i18n";
import { FieldInput } from "./FieldInput";
import { cx } from "./ui";

const SUMMARY_KEYS: Record<string, string[]> = {
  education: ["school", "major", "degree"],
  work: ["company", "title"],
  projects: ["name", "role"],
  campus: ["organization", "role"],
  awards: ["name", "level"],
  languages: ["language", "level", "score"],
  certificates: ["name", "issuer"],
  family: ["relation", "name", "company"],
};

function formatMonth(value: string, presentLabel: string): string {
  if (value === PRESENT) return presentLabel;
  return value.replace(/^(\d{4})-(\d{2}).*$/, "$1.$2");
}

export function entrySummary(section: SectionDef, entry: Entry, contentLang: Lang, presentLabel: string): { title: string; dates: string } {
  const keys = SUMMARY_KEYS[section.key] ?? section.fields.slice(0, 2).map((field) => field.key);
  const parts = keys
    .map((key) => {
      const field = section.fields.find((item) => item.key === key);
      const value = readValue(entry[key], contentLang).value;
      if (!field || !value) return "";
      return field.type === "enum" ? enumLabel(field.enum, value, contentLang) : value;
    })
    .filter(Boolean);
  const start = readValue(entry.startDate, contentLang).value;
  const end = readValue(entry.endDate, contentLang).value;
  const single = readValue(entry.date, contentLang).value;
  let dates = "";
  if (start || end) dates = `${start ? formatMonth(start, presentLabel) : "?"}–${end ? formatMonth(end, presentLabel) : "?"}`;
  else if (single) dates = formatMonth(single, presentLabel);
  return { title: parts.join(" · "), dates };
}

interface EntryRowProps {
  section: SectionDef;
  entry: Entry;
  index: number;
  count: number;
  open: boolean;
  contentLang: Lang;
  onToggle: () => void;
  onChange: (key: string, value: FieldValue) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}

export function EntryRow({ section, entry, index, count, open, contentLang, onToggle, onChange, onMove, onDelete }: EntryRowProps) {
  const { t } = useI18n();
  const summary = entrySummary(section, entry, contentLang, t("field.present"));

  return (
    <div className={cx(open && "bg-sunken/40")}>
      <div className="flex items-center gap-1 pr-2 sm:pr-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 py-3 pl-4 text-left sm:pl-5"
        >
          <ChevronDown size={15} className={cx("shrink-0 text-subtle transition-transform", !open && "-rotate-90")} />
          <span className={cx("min-w-0 flex-1 truncate", summary.title ? "text-ink" : "text-subtle")}>
            {summary.title || t("entry.untitled")}
          </span>
          {summary.dates && <span className="hidden shrink-0 text-[13px] tabular-nums text-muted sm:inline">{summary.dates}</span>}
        </button>
        <button type="button" className="btn btn-ghost btn-icon" aria-label={t("entry.moveUp")} title={t("entry.moveUp")} disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={t("entry.moveDown")}
          title={t("entry.moveDown")}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={15} />
        </button>
        <button type="button" className="btn btn-danger btn-icon" aria-label={t("delete")} title={t("delete")} onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>
      {summary.dates && !open && <div className="-mt-2 pb-2.5 pl-[42px] text-[12.5px] tabular-nums text-muted sm:hidden">{summary.dates}</div>}
      {open && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 px-4 pb-5 pt-1 sm:grid-cols-2 sm:px-5">
          {section.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={entry[field.key]}
              contentLang={contentLang}
              allowPresent={field.key === "endDate"}
              onChange={(next) => onChange(field.key, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
