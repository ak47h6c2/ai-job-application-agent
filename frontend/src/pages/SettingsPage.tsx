import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, CircleAlert, Copy, Eye, EyeOff, FolderOpen, Puzzle, Sparkles } from "lucide-react";
import { api, errorMessage, type AIProvider, type AISettings } from "../api";
import { useToast } from "../components/Toast";
import { Segmented, Spinner, cx } from "../components/ui";
import { useI18n } from "../i18n";

interface Preset {
  id: string;
  label: string;
  provider: AIProvider;
  base_url: string;
  model: string;
}

const PRESETS: Preset[] = [
  { id: "deepseek", label: "DeepSeek", provider: "openai", base_url: "https://api.deepseek.com", model: "deepseek-chat" },
  { id: "qwen", label: "通义千问", provider: "openai", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "kimi", label: "Kimi", provider: "openai", base_url: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { id: "glm", label: "智谱 GLM", provider: "openai", base_url: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "openai", label: "OpenAI", provider: "openai", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "claude", label: "Claude", provider: "anthropic", base_url: "", model: "claude-sonnet-5-5" },
];

interface Form {
  provider: AIProvider;
  base_url: string;
  model: string;
  api_key: string;
}

function presetFor(form: Form): string {
  const host = (url: string) => url.replace(/\/+$/, "").toLowerCase();
  const match = PRESETS.find((preset) => preset.provider === form.provider && host(preset.base_url) === host(form.base_url));
  return match?.id ?? "custom";
}

export function SettingsPage({ online, onAiChanged }: { online: boolean | null; onAiChanged: () => void }) {
  const { t, tn } = useI18n();
  const toast = useToast();
  const [ai, setAi] = useState<AISettings | null>(null);
  const [dataDir, setDataDir] = useState("");
  const [form, setForm] = useState<Form>({ provider: "openai", base_url: "", model: "", api_key: "" });
  const [preset, setPreset] = useState("custom");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "fail"; message?: string }>({ state: "idle" });

  const apply = useCallback((settings: AISettings) => {
    setAi(settings);
    const next = { provider: settings.provider, base_url: settings.base_url, model: settings.model, api_key: "" };
    setForm(next);
    setPreset(settings.model || settings.base_url ? presetFor(next) : "");
  }, []);

  useEffect(() => {
    if (!online) return;
    api
      .getSettings()
      .then((data) => {
        apply(data.ai);
        setDataDir(data.data_dir);
      })
      .catch(() => undefined);
  }, [online, apply]);

  const choosePreset = (id: string) => {
    setPreset(id);
    const found = PRESETS.find((item) => item.id === id);
    if (found) setForm((current) => ({ ...current, provider: found.provider, base_url: found.base_url, model: found.model }));
    setTest({ state: "idle" });
  };

  const dirty = Boolean(ai && (form.api_key || form.provider !== ai.provider || form.base_url !== ai.base_url || form.model !== ai.model));

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const body = { provider: form.provider, base_url: form.base_url.trim(), model: form.model.trim(), ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}) };
      const result = await api.saveSettings(body);
      apply(result.ai);
      onAiChanged();
      toast(t("ai.saved"), { tone: "success" });
      return true;
    } catch (error) {
      toast(errorMessage(error), { tone: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (dirty && !(await save())) return;
    setTest({ state: "running" });
    try {
      await api.testAI();
      setTest({ state: "ok" });
    } catch (error) {
      setTest({ state: "fail", message: errorMessage(error) });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 pb-16 pt-4 md:pt-6">
      <h1 className="text-[20px] font-semibold tracking-tight">{t("settings.title")}</h1>

      <Card
        icon={<Sparkles size={17} />}
        title={t("ai.title")}
        badge={<span className="badge bg-sunken text-muted">{t("ai.optional")}</span>}
        status={
          ai && (
            <span className={cx("inline-flex items-center gap-1.5 text-[12.5px]", ai.configured ? "text-success" : "text-subtle")}>
              <span className={cx("h-1.5 w-1.5 rounded-full", ai.configured ? "bg-success" : "bg-line-strong")} />
              {ai.configured ? t("ai.configured") : t("ai.notConfigured")}
            </span>
          )
        }
      >
        <p className="text-[13px] text-muted">{t("ai.desc")}</p>

        <div className="mt-4 flex flex-col gap-1.5">
          <span className="field-label">{t("ai.preset")}</span>
          <div className="flex flex-wrap gap-1.5">
            {[...PRESETS.map((item) => ({ id: item.id, label: item.label })), { id: "custom", label: t("ai.custom") }].map((item) => (
              <button key={item.id} type="button" className="chip" aria-pressed={preset === item.id} onClick={() => choosePreset(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {preset === "custom" && (
            <Field label={t("ai.protocol")} wide>
              <Segmented<AIProvider>
                value={form.provider}
                onChange={(provider) => provider && setForm({ ...form, provider })}
                options={[
                  { value: "openai", label: t("ai.protocolOpenai") },
                  { value: "anthropic", label: t("ai.protocolAnthropic") },
                ]}
              />
            </Field>
          )}
          <Field label={t("ai.baseUrl")}>
            <input
              className="input"
              spellCheck={false}
              placeholder={form.provider === "anthropic" ? t("ai.baseUrlAnthropic") : "https://…/v1"}
              value={form.base_url}
              onChange={(event) => {
                setForm({ ...form, base_url: event.target.value });
                setPreset("custom");
              }}
            />
          </Field>
          <Field label={t("ai.model")}>
            <input className="input" spellCheck={false} value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <Field label={t("ai.key")} wide>
            <div className="relative">
              <input
                className="input pr-10 font-mono text-[13px]"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder={ai?.has_key ? t("ai.keyStored", { hint: ai.key_hint || "••••" }) : t("ai.keyNew")}
                value={form.api_key}
                onChange={(event) => setForm({ ...form, api_key: event.target.value })}
              />
              <button
                type="button"
                className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:bg-sunken hover:text-ink"
                aria-label={showKey ? "Hide" : "Show"}
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" disabled={!ai || saving || !dirty} onClick={() => void save()}>
            {saving && <Spinner size={14} />}
            {t("save")}
          </button>
          <button type="button" className="btn btn-secondary" disabled={!ai || test.state === "running" || (!ai.configured && !dirty)} onClick={() => void runTest()}>
            {test.state === "running" && <Spinner size={14} />}
            {test.state === "running" ? t("ai.testing") : t("ai.test")}
          </button>
          {dirty && test.state === "idle" && <span className="text-[12.5px] text-subtle">{t("ai.unsaved")}</span>}
          {test.state === "ok" && (
            <span className="inline-flex items-center gap-1 text-[13px] text-success">
              <Check size={14} />
              {t("ai.testOk")}
            </span>
          )}
          {test.state === "fail" && (
            <span className="inline-flex min-w-0 items-start gap-1 text-[13px] text-danger">
              <CircleAlert size={14} className="mt-[3px] shrink-0" />
              <span className="min-w-0 break-words">{t("ai.testFail", { msg: test.message ?? "" })}</span>
            </span>
          )}
        </div>
      </Card>

      <Card icon={<Puzzle size={17} />} title={t("ext.title")}>
        <ol className="flex flex-col gap-3">
          <Step n={1}>{tn("ext.step1", { dir: <code className="kbd-code">extension/</code>, cmd: <CopyCode text="npm run build" /> })}</Step>
          <Step n={2}>{tn("ext.step2", { chrome: <CopyCode text="chrome://extensions" />, edge: <CopyCode text="edge://extensions" /> })}</Step>
          <Step n={3}>{tn("ext.step3", { dist: <code className="kbd-code">extension/dist</code> })}</Step>
        </ol>
      </Card>

      <Card icon={<FolderOpen size={17} />} title={t("data.title")}>
        <p className="text-[13px] text-muted">{t("data.desc")}</p>
        {dataDir && (
          <div className="mt-3">
            <CopyCode text={dataDir} block />
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ icon, title, badge, status, children }: { icon: ReactNode; title: string; badge?: ReactNode; status?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">{icon}</span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {badge}
        <div className="flex-1" />
        {status}
      </div>
      {children}
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1.5", wide && "sm:col-span-2")}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-[12px] font-semibold text-muted">{n}</span>
      <span className="min-w-0 pt-0.5 leading-7">{children}</span>
    </li>
  );
}

function CopyCode({ text, block }: { text: string; block?: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; the text is still selectable.
    }
  };
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1 rounded-md bg-sunken py-0.5 pl-1.5 pr-0.5 align-middle", block && "w-full py-1.5 pl-3")}>
      <code className={cx("min-w-0 select-all font-mono text-[12.5px] text-ink", block ? "flex-1 break-all" : "truncate")}>{text}</code>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-subtle hover:bg-line hover:text-ink"
        aria-label={copied ? t("copied") : t("copy")}
        title={copied ? t("copied") : t("copy")}
      >
        {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      </button>
    </span>
  );
}
