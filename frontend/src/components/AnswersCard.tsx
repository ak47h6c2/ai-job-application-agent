import { useId, useMemo, useState } from "react";
import { BookOpen, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import commonQuestions from "../../../shared/common-questions.json";
import type { Answer, Lang, ProfileData } from "../../../shared/profileSchema";
import { api } from "../api";
import { useI18n } from "../i18n";
import { AutoTextarea } from "./FieldInput";
import { Collapsible } from "./GroupCard";
import { useToast } from "./Toast";
import { Count } from "./ui";

interface CommonQuestion {
  id: string;
  category: string;
  zh: string;
  en: string;
}

const CATEGORIES = commonQuestions.categories as { key: string; zh: string; en: string }[];
const QUESTIONS = commonQuestions.questions as CommonQuestion[];

function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } catch {
    return Math.random().toString(36).slice(2, 18);
  }
}

const normalize = (text: string) => text.replace(/[\s?？。.,，:：()（）]/g, "").toLowerCase();

interface AnswersCardProps {
  profile: ProfileData;
  update: (recipe: (current: ProfileData) => ProfileData) => void;
  aiReady: boolean;
  contentLang: Lang;
}

export function AnswersCard({ profile, update, aiReady, contentLang }: AnswersCardProps) {
  const { t } = useI18n();
  const toast = useToast();
  const answers = profile.answers;
  const [openSignal, setOpenSignal] = useState(0);
  const [picking, setPicking] = useState(false);
  const [drafting, setDrafting] = useState<Set<string>>(new Set());

  const setAnswers = (recipe: (list: Answer[]) => Answer[]) => update((current) => ({ ...current, answers: recipe(current.answers) }));

  const edit = (id: string, patch: Partial<Answer>) =>
    setAnswers((list) => list.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)));

  const add = () => {
    setAnswers((list) => [{ id: newId(), question: "", answer: "", lang: "any", source: "manual", updatedAt: new Date().toISOString() }, ...list]);
    setOpenSignal((value) => value + 1);
  };

  const addCommon = (picked: CommonQuestion[]) => {
    const now = new Date().toISOString();
    const fresh = picked.map((question) => ({ id: newId(), question: question[contentLang], answer: "", lang: contentLang, source: "manual" as const, updatedAt: now }));
    setAnswers((list) => [...fresh, ...list]);
    setPicking(false);
    setOpenSignal((value) => value + 1);
    toast(t("answers.commonAdded", { n: fresh.length }), { tone: "success" });
  };

  const remove = (index: number) => {
    const removed = answers[index];
    setAnswers((list) => list.filter((_, i) => i !== index));
    if (!removed.question && !removed.answer) return;
    toast(t("answers.deleted"), {
      action: { label: t("undo"), onClick: () => setAnswers((list) => [...list.slice(0, index), removed, ...list.slice(index)]) },
    });
  };

  const draftOne = async (item: Answer): Promise<boolean> => {
    if (!item.question.trim()) return false;
    setDrafting((current) => new Set(current).add(item.id));
    try {
      const lang: Lang = item.lang === "en" || item.lang === "zh" ? item.lang : /[一-鿿]/.test(item.question) ? "zh" : "en";
      const { answer } = await api.aiAnswer(item.question, lang);
      edit(item.id, { answer });
      return true;
    } catch (error) {
      toast(t("answers.draftFailed", { msg: (error as Error).message }), { tone: "error" });
      return false;
    } finally {
      setDrafting((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  const empty = answers.filter((item) => item.question.trim() && !item.answer.trim());
  const draftAll = async () => {
    let done = 0;
    for (const item of empty) {
      if (await draftOne(item)) done += 1;
      else break;
    }
    if (done) toast(t("answers.draftDone", { n: done }), { tone: "success" });
  };

  return (
    <Collapsible
      storageKey="answers"
      defaultOpen={false}
      openSignal={openSignal}
      title={t("answers.title")}
      meta={answers.length > 0 ? <Count value={answers.length} /> : undefined}
      actions={
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-sm btn-ghost text-accent-strong hover:text-accent-strong" onClick={() => setPicking(true)}>
            <BookOpen size={15} />
            {t("answers.common")}
          </button>
          <button type="button" className="btn btn-sm btn-ghost text-accent-strong hover:text-accent-strong" onClick={add}>
            <Plus size={15} />
            {t("section.add")}
          </button>
        </div>
      }
    >
      <p className="mb-3 text-[13px] text-muted">{t("answers.hint")}</p>
      {aiReady && empty.length > 0 && (
        <button type="button" className="btn btn-secondary btn-sm mb-3" disabled={drafting.size > 0} onClick={() => void draftAll()}>
          <Wand2 size={14} />
          {drafting.size > 0 ? t("answers.drafting") : t("answers.draftAll", { n: empty.length })}
        </button>
      )}
      {answers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line py-6 text-center text-[13px] text-subtle">{t("answers.empty")}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {answers.map((item, index) => (
            <AnswerItem
              key={item.id}
              item={item}
              aiReady={aiReady}
              drafting={drafting.has(item.id)}
              onDraft={() => void draftOne(item)}
              onEdit={(patch) => edit(item.id, patch)}
              onDelete={() => remove(index)}
            />
          ))}
        </div>
      )}
      {picking && <CommonQuestionsDialog answers={answers} lang={contentLang} onClose={() => setPicking(false)} onAdd={addCommon} />}
    </Collapsible>
  );
}

function CommonQuestionsDialog({ answers, lang, onClose, onAdd }: { answers: Answer[]; lang: Lang; onClose: () => void; onAdd: (picked: CommonQuestion[]) => void }) {
  const { t } = useI18n();
  const existing = useMemo(() => new Set(answers.map((item) => normalize(item.question))), [answers]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(QUESTIONS.filter((question) => question.category !== "australia" || lang === "en").filter((question) => !existing.has(normalize(question[lang]))).map((question) => question.id)),
  );
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={t("answers.commonTitle")} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="border-b border-line px-5 py-4 text-[15px] font-semibold text-ink">{t("answers.commonTitle")}</div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {CATEGORIES.map((category) => (
            <div key={category.key} className="mb-4">
              <div className="mb-1.5 text-[12.5px] font-semibold text-muted">{category[lang]}</div>
              {QUESTIONS.filter((question) => question.category === category.key).map((question) => {
                const already = existing.has(normalize(question[lang]));
                return (
                  <label key={question.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-[14px] hover:bg-sunken ${already ? "opacity-50" : ""}`}>
                    <input type="checkbox" className="mt-1" disabled={already} checked={selected.has(question.id) && !already} onChange={() => toggle(question.id)} />
                    <span className="flex-1 text-ink">{question[lang]}</span>
                    {already && <span className="shrink-0 text-[12px] text-subtle">{t("answers.commonHas")}</span>}
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={selected.size === 0}
            onClick={() => onAdd(QUESTIONS.filter((question) => selected.has(question.id) && !existing.has(normalize(question[lang]))))}
          >
            {t("answers.commonAdd", { n: selected.size })}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AnswerItemProps {
  item: Answer;
  aiReady: boolean;
  drafting: boolean;
  onDraft: () => void;
  onEdit: (patch: Partial<Answer>) => void;
  onDelete: () => void;
}

function AnswerItem({ item, aiReady, drafting, onDraft, onEdit, onDelete }: AnswerItemProps) {
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
        {!item.answer.trim() && item.question.trim() && <span className="badge shrink-0 bg-warning-soft text-warning">{t("answers.needsAnswer")}</span>}
        {aiReady && item.question.trim() && (
          <button type="button" className="btn btn-sm btn-ghost shrink-0 text-accent-strong" disabled={drafting} onClick={onDraft}>
            <Wand2 size={14} />
            {drafting ? t("answers.drafting") : item.answer.trim() ? t("answers.redraft") : t("answers.draft")}
          </button>
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
