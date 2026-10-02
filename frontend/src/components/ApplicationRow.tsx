import { useEffect, useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { APPLICATION_STATUSES, type ApplicationInput, type ApplicationRecord, type ApplicationStatus } from "../api";
import { useI18n } from "../i18n";
import { today } from "./ApplicationDialog";
import { cx } from "./ui";

export const STATUS_DOT: Record<ApplicationStatus, string> = {
  saved: "bg-slate-400",
  applied: "bg-sky-500",
  assessment: "bg-amber-500",
  interview: "bg-violet-500",
  offer: "bg-emerald-500",
  rejected: "bg-rose-400",
};

export const ROW_GRID = "md:grid md:grid-cols-[minmax(0,1fr)_140px_136px_136px_68px] md:items-center md:gap-3";

interface ApplicationRowProps {
  record: ApplicationRecord;
  onPatch: (patch: ApplicationInput) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ApplicationRow({ record, onPatch, onEdit, onDelete }: ApplicationRowProps) {
  const { t } = useI18n();
  const [note, setNote] = useState(record.note);
  useEffect(() => setNote(record.note), [record.note]);
  const overdue = Boolean(record.next_action_at && record.next_action_at <= today() && record.status !== "rejected" && record.status !== "offer");

  return (
    <div className={cx("relative flex flex-col gap-2.5 px-4 py-3 sm:px-5", ROW_GRID)}>
      <div className="min-w-0 pr-16 md:pr-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{record.company || "—"}</span>
          {record.url && (
            <a
              href={record.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-subtle hover:bg-sunken hover:text-accent-strong"
              aria-label={t("apps.openLink")}
              title={record.url}
            >
              <ExternalLink size={13} />
            </a>
          )}
          {record.source && <span className="badge shrink-0 bg-sunken text-subtle">{record.source}</span>}
        </div>
        <div className="truncate text-[13px] text-muted">{record.title || "—"}</div>
        <input
          aria-label={t("apps.note")}
          placeholder={t("apps.notePlaceholder")}
          className="-ml-2 mt-0.5 h-7 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] text-muted outline-none placeholder:text-subtle/80 hover:border-line focus:border-accent focus:bg-surface focus:text-ink focus:ring-2 focus:ring-accent/20"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => note !== record.note && onPatch({ note })}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 md:contents">
        <Cell label={t("apps.colStatus")} className="col-span-2 md:col-span-1" hideLabel>
          <div className="relative w-[calc(50%-4px)] md:w-auto">
            <span className={cx("pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full", STATUS_DOT[record.status])} />
            <select
              aria-label={t("apps.colStatus")}
              className="input h-8 pl-6 text-[13px]"
              value={record.status}
              onChange={(event) => onPatch({ status: event.target.value as ApplicationStatus })}
            >
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
          </div>
        </Cell>
        <Cell label={t("apps.colApplied")}>
          <input
            type="date"
            aria-label={t("apps.colApplied")}
            className={cx("input h-8 px-2 text-[13px]", !record.applied_at && "text-subtle")}
            value={record.applied_at}
            onChange={(event) => onPatch({ applied_at: event.target.value })}
          />
        </Cell>
        <Cell label={t("apps.colNext")}>
          <input
            type="date"
            aria-label={t("apps.colNext")}
            className={cx("input h-8 px-2 text-[13px]", !record.next_action_at && "text-subtle", overdue && "border-warning/50 bg-warning-soft text-warning")}
            value={record.next_action_at}
            onChange={(event) => onPatch({ next_action_at: event.target.value })}
          />
        </Cell>
      </div>

      <div className="absolute right-2 top-2 flex justify-end gap-0.5 sm:right-3 md:static">
        <button type="button" className="btn btn-ghost btn-icon" aria-label={t("edit")} title={t("edit")} onClick={onEdit}>
          <Pencil size={14} />
        </button>
        <button type="button" className="btn btn-danger btn-icon" aria-label={t("delete")} title={t("delete")} onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function Cell({ label, className, hideLabel, children }: { label: string; className?: string; hideLabel?: boolean; children: React.ReactNode }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      {!hideLabel && <span className="text-[11.5px] text-subtle md:hidden">{label}</span>}
      {children}
    </div>
  );
}
