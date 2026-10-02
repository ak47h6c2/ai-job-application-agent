import { useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import { SCHEMA, basicField, type FieldValue, type ProfileData } from "../../../shared/profileSchema";
import type { ResumeParseResult } from "../api";
import { useI18n } from "../i18n";
import { Dialog } from "./ui";

function isEmpty(value: FieldValue | undefined): boolean {
  if (value === undefined || value === null || value === "") return true;
  return typeof value === "object" && !value.zh && !value.en;
}

/** Fills only empty values of `current` from `draft` (same rule as the backend merge). */
export function mergeDraft(current: ProfileData, draft: ProfileData): { merged: ProfileData; basicKeys: string[]; sectionKeys: string[] } {
  const basic = { ...current.basic };
  const basicKeys: string[] = [];
  for (const [key, value] of Object.entries(draft.basic ?? {})) {
    if (isEmpty(value)) continue;
    const existing = basic[key];
    if (isEmpty(existing)) {
      basic[key] = value;
      basicKeys.push(key);
    } else if (typeof existing === "object" && typeof value === "object") {
      const combined = { ...value, ...Object.fromEntries(Object.entries(existing).filter(([, text]) => text)) };
      if (JSON.stringify(combined) !== JSON.stringify(existing)) {
        basic[key] = combined;
        basicKeys.push(key);
      }
    }
  }
  const sections = { ...current.sections };
  const sectionKeys: string[] = [];
  for (const [key, entries] of Object.entries(draft.sections ?? {})) {
    if (entries?.length && !(sections[key] ?? []).length) {
      sections[key] = entries;
      sectionKeys.push(key);
    }
  }
  return { merged: { ...current, basic, sections }, basicKeys, sectionKeys };
}

interface ResumeImportDialogProps {
  result: (ResumeParseResult & { file: File }) | null;
  profile: ProfileData;
  attachmentKind: { key: string; label: string; exists: boolean };
  onApply: (merged: ProfileData, saveAttachment: boolean) => void;
  onClose: () => void;
}

export function ResumeImportDialog({ result, profile, attachmentKind, onApply, onClose }: ResumeImportDialogProps) {
  const { lang, t } = useI18n();
  const [saveFile, setSaveFile] = useState(!attachmentKind.exists);
  const summary = useMemo(() => (result ? mergeDraft(profile, result.profile) : null), [result, profile]);

  if (!result || !summary) return null;
  const nothing = summary.basicKeys.length === 0 && summary.sectionKeys.length === 0;
  const labels = summary.basicKeys.map((key) => basicField(key)?.[lang] ?? key);

  return (
    <Dialog
      open
      title={t("dialog.resumeTitle")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="btn btn-primary" disabled={nothing && !saveFile} onClick={() => onApply(summary.merged, saveFile)}>
            {t("dialog.apply")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <span className="min-w-0 truncate">{result.file.name}</span>
          <span className="badge shrink-0 bg-sunken text-muted">{result.method === "ai" ? t("dialog.methodAi") : t("dialog.methodRules")}</span>
        </div>

        {result.warning && (
          <div className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">
            <CircleAlert size={15} className="mt-0.5 shrink-0" />
            <span>
              {t("dialog.aiFallback")} {result.warning}
            </span>
          </div>
        )}

        {nothing ? (
          <p className="rounded-lg bg-sunken px-3 py-4 text-center text-muted">{t("dialog.nothing")}</p>
        ) : (
          <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {labels.length > 0 && (
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t("dialog.basic")}</span>
                  <span className="text-[13px] text-muted">{t("dialog.items", { n: labels.length })}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {labels.map((label) => (
                    <span key={label} className="badge bg-accent-soft text-accent-strong">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {summary.sectionKeys.map((key) => {
              const section = SCHEMA.sections.find((item) => item.key === key);
              return (
                <div key={key} className="flex items-center justify-between px-3 py-2.5">
                  <span className="font-medium">{section?.[lang] ?? key}</span>
                  <span className="text-[13px] text-muted">{t("dialog.entries", { n: result.profile.sections[key]?.length ?? 0 })}</span>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[13px] text-muted">{t("dialog.note")}</p>

        <label className="inline-flex cursor-pointer items-center gap-2 text-[13.5px]">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={saveFile} onChange={(event) => setSaveFile(event.target.checked)} />
          {t("dialog.saveAttachment", { kind: attachmentKind.label })}
        </label>
      </div>
    </Dialog>
  );
}
