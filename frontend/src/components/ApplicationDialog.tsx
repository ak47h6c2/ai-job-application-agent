import { useState } from "react";
import { APPLICATION_STATUSES, type ApplicationInput, type ApplicationRecord, type ApplicationStatus } from "../api";
import { useI18n } from "../i18n";
import { AutoTextarea } from "./FieldInput";
import { Dialog } from "./ui";

export function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface ApplicationDialogProps {
  record: ApplicationRecord | null;
  onSave: (input: ApplicationInput) => Promise<boolean>;
  onClose: () => void;
}

export function ApplicationDialog({ record, onSave, onClose }: ApplicationDialogProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<ApplicationInput>(() =>
    record
      ? { key: record.key, company: record.company, title: record.title, url: record.url, status: record.status, applied_at: record.applied_at, note: record.note }
      : { company: "", title: "", url: "", status: "applied", applied_at: today(), note: "" },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: ApplicationInput) => setForm((current) => ({ ...current, ...patch }));

  const submit = async () => {
    if (!form.company?.trim() && !form.title?.trim()) {
      setError(t("apps.required"));
      return;
    }
    setBusy(true);
    const ok = await onSave({ ...form, company: form.company?.trim(), title: form.title?.trim(), url: form.url?.trim() });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Dialog
      open
      title={record ? t("apps.dialogEdit") : t("apps.dialogAdd")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" form="application-form" className="btn btn-primary" disabled={busy}>
            {t("save")}
          </button>
        </>
      }
    >
      <form
        id="application-form"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Labeled label={t("apps.company")}>
          <input className="input" value={form.company ?? ""} onChange={(event) => set({ company: event.target.value })} />
        </Labeled>
        <Labeled label={t("apps.role")}>
          <input className="input" value={form.title ?? ""} onChange={(event) => set({ title: event.target.value })} />
        </Labeled>
        <Labeled label={t("apps.url")} wide>
          <input className="input" inputMode="url" placeholder="https://" value={form.url ?? ""} onChange={(event) => set({ url: event.target.value })} />
        </Labeled>
        <Labeled label={t("apps.colStatus")}>
          <select className="input" value={form.status} onChange={(event) => set({ status: event.target.value as ApplicationStatus })}>
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label={t("apps.colApplied")}>
          <input type="date" className="input" value={form.applied_at ?? ""} onChange={(event) => set({ applied_at: event.target.value })} />
        </Labeled>
        <Labeled label={t("apps.note")} wide>
          <AutoTextarea id="application-note" minRows={2} value={form.note ?? ""} onChange={(note) => set({ note })} />
        </Labeled>
        {error && <p className="text-[13px] text-danger sm:col-span-2">{error}</p>}
      </form>
    </Dialog>
  );
}

function Labeled({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
