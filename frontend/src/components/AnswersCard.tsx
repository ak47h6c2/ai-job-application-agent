import { useId, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import type { Answer, ProfileData } from "../../../shared/profileSchema";
import { useI18n } from "../i18n";
import { AutoTextarea } from "./FieldInput";
import { Collapsible } from "./GroupCard";
import { useToast } from "./Toast";
import { Count } from "./ui";

function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } catch {
    return Math.random().toString(36).slice(2, 18);
  }
}

interface AnswersCardProps {
  profile: ProfileData;
  update: (recipe: (current: ProfileData) => ProfileData) => void;
}

export function AnswersCard({ profile, update }: AnswersCardProps) {
  const { t } = useI18n();
  const toast = useToast();
  const answers = profile.answers;
  const [openSignal, setOpenSignal] = useState(0);

  const setAnswers = (recipe: (list: Answer[]) => Answer[]) => update((current) => ({ ...current, answers: recipe(current.answers) }));

  const edit = (id: string, patch: Partial<Answer>) =>
    setAnswers((list) => list.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)));

  const add = () => {
    setAnswers((list) => [{ id: newId(), question: "", answer: "", lang: "any", source: "manual", updatedAt: new Date().toISOString() }, ...list]);
    setOpenSignal((value) => value + 1);
  };

  const remove = (index: number) => {
    const removed = answers[index];
    setAnswers((list) => list.filter((_, i) => i !== index));
    if (!removed.question && !removed.answer) return;
    toast(t("answers.deleted"), {
      action: { label: t("undo"), onClick: () => setAnswers((list) => [...list.slice(0, index), removed, ...list.slice(index)]) },
    });
  };

  return (
    <Collapsible
      storageKey="answers"
      defaultOpen={false}
      openSignal={openSignal}
      title={t("answers.title")}
      meta={answers.length > 0 ? <Count value={answers.length} /> : undefined}
      actions={
        <button type="button" className="btn btn-sm btn-ghost text-accent-strong hover:text-accent-strong" onClick={add}>
          <Plus size={15} />
          {t("section.add")}
        </button>
      }
    >
      <p className="mb-3 text-[13px] text-muted">{t("answers.hint")}</p>
      {answers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line py-6 text-center text-[13px] text-subtle">{t("answers.empty")}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {answers.map((item, index) => (
            <AnswerItem key={item.id} item={item} onEdit={(patch) => edit(item.id, patch)} onDelete={() => remove(index)} />
          ))}
        </div>
      )}
    </Collapsible>
  );
}

function AnswerItem({ item, onEdit, onDelete }: { item: Answer; onEdit: (patch: Partial<Answer>) => void; onDelete: () => void }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-2">
        <input
          aria-label={t("answers.question")}
          placeholder={t("answers.question")}
          className="input h-8 border-transparent px-2 font-medium hover:border-line"
          value={item.question}
          onChange={(event) => onEdit({ question: event.target.value })}
        />
        {item.source === "learned" && (
          <span className="badge shrink-0 gap-1 bg-accent-soft text-accent-strong">
            <Sparkles size={11} />
            {t("answers.learned")}
          </span>
        )}
        <button type="button" className="btn btn-danger btn-icon" aria-label={t("delete")} title={t("delete")} onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>
      <AutoTextarea
        id={id}
        minRows={2}
        placeholder={t("answers.answer")}
        className="mt-2"
        value={item.answer}
        onChange={(answer) => onEdit({ answer })}
      />
    </div>
  );
}
