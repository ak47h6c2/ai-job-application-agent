import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Image, Plus, Trash2, Upload } from "lucide-react";
import { SCHEMA, type AttachmentKindDef, type AttachmentMeta } from "../../../shared/profileSchema";
import { api, errorMessage } from "../api";
import { useI18n } from "../i18n";
import { Collapsible } from "./GroupCard";
import { useToast } from "./Toast";
import { Count, Spinner, cx, formatBytes } from "./ui";

const ACCEPT_DOCS = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.md,.zip";
const ACCEPT_IMAGES = ".jpg,.jpeg,.png";

interface AttachmentsCardProps {
  attachments: AttachmentMeta[];
  onChanged: () => Promise<void>;
}

export function AttachmentsCard({ attachments, onChanged }: AttachmentsCardProps) {
  const { t } = useI18n();
  const filledKinds = SCHEMA.attachmentKinds.filter((kind) => attachments.some((item) => item.kind === kind.key)).length;
  return (
    <Collapsible
      storageKey="attachments"
      defaultOpen
      title={t("attachments.title")}
      meta={<Count value={filledKinds} total={SCHEMA.attachmentKinds.length} />}
    >
      <p className="mb-2 text-[13px] text-muted">{t("attachments.hint")}</p>
      <div className="divide-y divide-line">
        {SCHEMA.attachmentKinds.map((kind) => (
          <KindRow key={kind.key} kind={kind} files={attachments.filter((item) => item.kind === kind.key)} onChanged={onChanged} />
        ))}
      </div>
    </Collapsible>
  );
}

function KindRow({ kind, files, onChanged }: { kind: AttachmentKindDef; files: AttachmentMeta[]; onChanged: () => Promise<void> }) {
  const { lang, t } = useI18n();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const multiple = kind.key === "other";
  const sorted = [...files].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const shown = multiple ? sorted : sorted.slice(0, 1);
  const Icon = kind.key === "photo" ? Image : FileText;

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await api.uploadAttachment(file, kind.key);
      // Single-file kinds: the new upload replaces older ones.
      if (!multiple) await Promise.all(files.map((item) => api.deleteAttachment(item.id).catch(() => undefined)));
      await onChanged();
      toast(t("attachments.uploaded", { name: file.name }), { tone: "success" });
    } catch (error) {
      toast(errorMessage(error), { tone: "error" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex items-start gap-3 py-3">
      <div className={cx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", files.length ? "bg-accent-soft text-accent-strong" : "bg-sunken text-subtle")}>
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-9 items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{kind[lang]}</div>
            {shown.length === 0 && <div className="text-[12.5px] text-subtle">{t("attachments.none")}</div>}
            {!multiple && shown[0] && <FileLine file={shown[0]} onChanged={onChanged} />}
          </div>
          <input
            ref={input}
            type="file"
            className="hidden"
            accept={kind.key === "photo" ? ACCEPT_IMAGES : ACCEPT_DOCS}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Spinner size={14} /> : multiple && files.length ? <Plus size={14} /> : <Upload size={14} />}
            {busy
              ? t("attachments.uploading")
              : multiple && files.length
                ? t("attachments.add")
                : files.length
                  ? t("attachments.replace")
                  : t("attachments.upload")}
          </button>
        </div>
        {multiple && shown.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {shown.map((file) => (
              <FileLine key={file.id} file={file} onChanged={onChanged} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FileLine({ file, onChanged }: { file: AttachmentMeta; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  const remove = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await api.deleteAttachment(file.id);
      await onChanged();
      toast(t("attachments.deleted", { name: file.name }));
    } catch (error) {
      toast(errorMessage(error), { tone: "error" });
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1 text-[12.5px] text-muted">
      <span className="min-w-0 truncate" title={file.name}>
        {file.name}
      </span>
      <span className="shrink-0 text-subtle">· {formatBytes(file.size)}</span>
      <a
        href={api.attachmentUrl(file.id)}
        target="_blank"
        rel="noreferrer"
        className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-subtle hover:bg-sunken hover:text-ink"
        aria-label={t("attachments.open")}
        title={t("attachments.open")}
      >
        <ExternalLink size={13} />
      </a>
      <button
        type="button"
        disabled={busy}
        onClick={() => void remove()}
        className={cx(
          "inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-md text-subtle hover:bg-danger-soft hover:text-danger",
          confirming ? "bg-danger-soft px-2 text-danger" : "w-6",
        )}
        aria-label={t("delete")}
        title={t("delete")}
      >
        <Trash2 size={13} />
        {confirming && <span>{t("delete")}?</span>}
      </button>
    </div>
  );
}
