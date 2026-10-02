import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, FileUp, Languages } from "lucide-react";
import { SCHEMA, normalizeProfile, profileCompleteness, type AttachmentMeta, type Lang, type ProfileData } from "../../../shared/profileSchema";
import { api, errorMessage, type ResumeParseResult } from "../api";
import { AnswersCard } from "../components/AnswersCard";
import { AttachmentsCard } from "../components/AttachmentsCard";
import { GroupCard } from "../components/GroupCard";
import { ResumeImportDialog } from "../components/ResumeImportDialog";
import { SectionCard } from "../components/SectionCard";
import { useToast } from "../components/Toast";
import { Segmented, Spinner, cx } from "../components/ui";
import type { SaveState } from "../hooks/useProfile";
import { useI18n } from "../i18n";
import { storage } from "../storage";

interface ProfilePageProps {
  online: boolean | null;
  aiReady: boolean;
  profile: ProfileData | null;
  loadError: string;
  reload: () => Promise<void>;
  update: (recipe: (current: ProfileData) => ProfileData) => void;
  saveState: SaveState;
  retrySave: () => Promise<void>;
}

export function ProfilePage({ online, aiReady, profile, loadError, reload, update, saveState, retrySave }: ProfilePageProps) {
  const { lang, t } = useI18n();
  const toast = useToast();
  const [contentLang, setContentLangState] = useState<Lang>(() => (storage.get("content-lang") === "en" ? "en" : "zh"));
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [parsing, setParsing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [parseResult, setParseResult] = useState<(ResumeParseResult & { file: File }) | null>(null);
  const resumeInput = useRef<HTMLInputElement>(null);

  const setContentLang = (next: Lang) => {
    setContentLangState(next);
    storage.set("content-lang", next);
  };

  const loadAttachments = useCallback(async () => {
    try {
      setAttachments((await api.listAttachments()).attachments);
    } catch {
      // The offline banner already explains this.
    }
  }, []);

  useEffect(() => {
    if (online) void loadAttachments();
  }, [online, loadAttachments]);

  if (!profile) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted">
        {loadError && online ? (
          <>
            <CircleAlert size={20} className="text-danger" />
            <span>{t("load.failed")}</span>
            <button type="button" className="btn btn-secondary" onClick={() => void reload()}>
              {t("retry")}
            </button>
          </>
        ) : online === false ? null : (
          <>
            <Spinner />
            <span>{t("loading")}</span>
          </>
        )}
      </div>
    );
  }

  const target: Lang = contentLang === "zh" ? "en" : "zh";
  const resumeKind = SCHEMA.attachmentKinds.find((kind) => kind.key === (contentLang === "zh" ? "resume_zh" : "resume_en"))!;
  const completeness = profileCompleteness(profile);
  const percent = Math.round((completeness.filled / completeness.total) * 100);

  const parse = async (file: File) => {
    setParsing(true);
    try {
      const result = await api.parseResume(file);
      setParseResult({ ...result, profile: normalizeProfile(result.profile), file });
    } catch (error) {
      toast(errorMessage(error), { tone: "error" });
    } finally {
      setParsing(false);
      if (resumeInput.current) resumeInput.current.value = "";
    }
  };

  const applyResume = async (merged: ProfileData, saveFile: boolean) => {
    const file = parseResult?.file;
    setParseResult(null);
    update(() => merged);
    toast(t("resume.applied"), { tone: "success" });
    if (saveFile && file) {
      try {
        const old = attachments.filter((item) => item.kind === resumeKind.key);
        await api.uploadAttachment(file, resumeKind.key);
        await Promise.all(old.map((item) => api.deleteAttachment(item.id).catch(() => undefined)));
        await loadAttachments();
      } catch (error) {
        toast(errorMessage(error), { tone: "error" });
      }
    }
  };

  const translate = async () => {
    setTranslating(true);
    try {
      const result = await api.translate(target, profile);
      if (result.translated > 0) {
        const translated = normalizeProfile(result.profile);
        update((current) => ({ ...current, basic: translated.basic, sections: translated.sections }));
        setContentLang(target);
        toast(t("translate.done", { n: result.translated }), { tone: "success" });
      } else {
        toast(t("translate.none"));
      }
    } catch (error) {
      toast(errorMessage(error), { tone: "error" });
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col">
      <div className="z-20 -mx-4 bg-canvas px-4 pb-3 pt-4 md:sticky md:top-0 sm:-mx-6 sm:px-6 md:pt-6">
        <div className="flex items-center gap-3">
          <h1 className="text-[20px] font-semibold tracking-tight">{t("nav.profile")}</h1>
          <SaveStatus state={saveState} onRetry={() => void retrySave()} />
          <div className="flex-1" />
          <Completeness percent={percent} label={t("completeness")} />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Segmented<Lang>
            className="w-full sm:w-auto"
            ariaLabel={t("content.label")}
            value={contentLang}
            onChange={(next) => next && setContentLang(next)}
            options={[
              { value: "zh", label: t("content.zh") },
              { value: "en", label: t("content.en") },
            ]}
          />
          <div className="hidden flex-1 sm:block" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <input
              ref={resumeInput}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.txt,.md"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void parse(file);
              }}
            />
            <button type="button" className="btn btn-secondary px-2.5 sm:px-3" disabled={parsing} onClick={() => resumeInput.current?.click()}>
              {parsing ? <Spinner size={15} /> : <FileUp size={15} />}
              {parsing ? t("resume.parsing") : t("resume.import")}
            </button>
            <span title={aiReady ? undefined : t("translate.needsAI")} className="flex">
              <button type="button" className="btn btn-secondary w-full px-2.5 sm:px-3" disabled={!aiReady || translating} onClick={() => void translate()}>
                {translating ? <Spinner size={15} /> : <Languages size={15} />}
                {translating ? t("translate.running") : target === "en" ? t("translate.toEn") : t("translate.toZh")}
              </button>
            </span>
          </div>
        </div>
        {!aiReady && <p className="mt-1.5 text-right text-[12px] text-subtle">{t("translate.needsAI")}</p>}
      </div>

      <div className="flex flex-col gap-3 pb-16 pt-1">
        {SCHEMA.basicGroups.map((group) => (
          <GroupCard key={group.key} group={group} profile={profile} contentLang={contentLang} update={update} />
        ))}
        <div className="h-3" />
        {SCHEMA.sections.map((section) => (
          <SectionCard key={section.key} section={section} profile={profile} contentLang={contentLang} update={update} />
        ))}
        <div className="h-3" />
        <AnswersCard profile={profile} update={update} />
        <AttachmentsCard attachments={attachments} onChanged={loadAttachments} />
      </div>

      {parseResult && (
        <ResumeImportDialog
          key={parseResult.file.name + parseResult.text_chars}
          result={parseResult}
          profile={profile}
          attachmentKind={{ key: resumeKind.key, label: resumeKind[lang], exists: attachments.some((item) => item.kind === resumeKind.key) }}
          onApply={(merged, saveFile) => void applyResume(merged, saveFile)}
          onClose={() => setParseResult(null)}
        />
      )}
    </div>
  );
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const { t } = useI18n();
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-danger" role="status">
        <CircleAlert size={14} />
        {t("save.error")}
        <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>
          {t("retry")}
        </button>
      </span>
    );
  }
  const busy = state === "pending" || state === "saving";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[12.5px]", busy ? "text-muted" : "text-subtle")} role="status">
      {busy ? <Spinner size={13} /> : <CircleCheck size={14} />}
      {busy ? t("save.saving") : t("save.saved")}
    </span>
  );
}

function Completeness({ percent, label }: { percent: number; label: string }) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted" title={`${label} ${percent}%`}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="-rotate-90">
        <circle cx="10" cy="10" r={radius} fill="none" stroke="rgb(var(--line))" strokeWidth="2.5" />
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
        />
      </svg>
      <span className="hidden sm:inline">{label}</span>
      <span className="font-medium tabular-nums text-ink">{percent}%</span>
    </span>
  );
}
