import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Plus, Search } from "lucide-react";
import { APPLICATION_STATUSES, api, errorMessage, type ApplicationInput, type ApplicationRecord, type ApplicationStatus } from "../api";
import { ApplicationDialog } from "../components/ApplicationDialog";
import { ApplicationRow, ROW_GRID, STATUS_DOT } from "../components/ApplicationRow";
import { useToast } from "../components/Toast";
import { Spinner, cx } from "../components/ui";
import { useI18n } from "../i18n";

type Filter = ApplicationStatus | "all";

export function ApplicationsPage({ online }: { online: boolean | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const [records, setRecords] = useState<ApplicationRecord[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ApplicationRecord | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setRecords((await api.listApplications()).records);
    } catch {
      // Offline banner covers this.
    }
  }, []);

  useEffect(() => {
    if (online) void load();
  }, [online, load]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, saved: 0, applied: 0, assessment: 0, interview: 0, offer: 0, rejected: 0 };
    for (const record of records ?? []) {
      result.all += 1;
      result[record.status] += 1;
    }
    return result;
  }, [records]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (records ?? []).filter(
      (record) =>
        (filter === "all" || record.status === filter) &&
        (!needle || `${record.company} ${record.title} ${record.note}`.toLowerCase().includes(needle)),
    );
  }, [records, filter, query]);

  const save = async (input: ApplicationInput): Promise<boolean> => {
    try {
      const { record } = await api.saveApplication(input);
      setRecords((current) => [record, ...(current ?? []).filter((item) => item.key !== record.key && item.key !== input.key)]);
      return true;
    } catch (error) {
      toast(t("apps.saveFailed", { msg: errorMessage(error) }), { tone: "error" });
      return false;
    }
  };

  const patch = async (record: ApplicationRecord, change: ApplicationInput) => {
    setRecords((current) => (current ?? []).map((item) => (item.key === record.key ? { ...item, ...change } : item)));
    try {
      const { record: saved } = await api.saveApplication({ key: record.key, title: record.title, company: record.company, url: record.url, status: record.status, ...change });
      setRecords((current) => (current ?? []).map((item) => (item.key === record.key ? saved : item)));
    } catch (error) {
      toast(t("apps.saveFailed", { msg: errorMessage(error) }), { tone: "error" });
      void load();
    }
  };

  const remove = async (record: ApplicationRecord) => {
    try {
      const result = await api.deleteApplication(record.key);
      setRecords(result.records);
      const { updated_at: _ignored, ...restore } = record;
      void _ignored;
      toast(t("apps.deleted", { name: record.company || record.title }), {
        action: { label: t("undo"), onClick: () => void save(restore) },
      });
    } catch (error) {
      toast(errorMessage(error), { tone: "error" });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4 pb-16 pt-4 md:pt-6">
      <div className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold tracking-tight">{t("apps.title")}</h1>
        <div className="flex-1" />
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus size={16} />
          {t("apps.add")}
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          {(["all", ...APPLICATION_STATUSES] as Filter[]).map((key) => (
            <button key={key} type="button" className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {key !== "all" && <span className={cx("h-1.5 w-1.5 rounded-full", STATUS_DOT[key])} />}
              {key === "all" ? t("apps.all") : t(`status.${key}`)}
              <span className="tabular-nums text-subtle">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:ml-auto lg:w-64">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input type="search" className="input pl-9" placeholder={t("apps.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {records === null ? (
          <div className="flex justify-center py-16 text-muted">{online === false ? null : <Spinner />}</div>
        ) : records.length === 0 ? (
          <EmptyState text={t("apps.empty")} />
        ) : visible.length === 0 ? (
          <EmptyState text={t("apps.noMatch")} />
        ) : (
          <>
            <div className={cx("hidden border-b border-line bg-sunken/60 px-5 py-2 text-[12.5px] font-medium text-muted", ROW_GRID)}>
              <span>{t("apps.colJob")}</span>
              <span>{t("apps.colStatus")}</span>
              <span>{t("apps.colApplied")}</span>
              <span>{t("apps.colNext")}</span>
              <span />
            </div>
            <div className="divide-y divide-line">
              {visible.map((record) => (
                <ApplicationRow
                  key={record.key}
                  record={record}
                  onPatch={(change) => void patch(record, change)}
                  onEdit={() => setEditing(record)}
                  onDelete={() => void remove(record)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {editing && <ApplicationDialog record={editing === "new" ? null : editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-muted">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-subtle">
        <Inbox size={20} />
      </div>
      <p className="max-w-xs text-[13.5px]">{text}</p>
    </div>
  );
}
