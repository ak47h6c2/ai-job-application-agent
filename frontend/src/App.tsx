import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Languages,
  Mail,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserCheck
} from "lucide-react";
import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

type Language = "en" | "zh";
type LoadState = "loading" | "ready" | "empty" | "error";
type AsyncStatus = "idle" | "running" | "success" | "error";

const translations = {
  en: {
    appName: "Job Agent",
    productName: "AI Job Application Agent",
    headline: "Application workbench",
    subline: "Upload resume, scan job emails, review drafts.",
    language: "Language",
    english: "EN",
    chinese: "中文",
    overview: "Overview",
    controls: "Controls",
    history: "History",
    jobLeads: "Job leads",
    drafts: "Drafts",
    safeTitle: "Human approval on",
    safeBody: "No email or application is sent automatically.",
    resumeStep: "Resume",
    resumeStepTitle: "Upload resume PDF",
    resumeReady: "Resume index ready",
    resumeMissing: "Upload a PDF before scanning",
    resumePrivate: "Stored locally as a private evidence index.",
    uploadResume: "Upload PDF",
    uploading: "Uploading...",
    uploadSuccess: "Resume uploaded and indexed.",
    uploadError: "Resume upload failed.",
    mailStep: "Mail",
    mailStepTitle: "Choose scan range",
    today: "Today",
    yesterday: "Yesterday",
    last3Days: "Last 3 days",
    last7Days: "Last 7 days",
    customDate: "Custom date",
    agentStep: "Agent",
    agentStepTitle: "Generate drafts",
    startScan: "Start scan",
    scanning: "Scanning...",
    refresh: "Refresh",
    scanSuccess: "New agent run generated.",
    scanError: "Scan failed.",
    readSince: "Read mail since",
    topDrafts: "Drafts",
    minScore: "Min score",
    jobs: "Jobs",
    steps: "Steps",
    recentRuns: "Recent runs",
    updated: "Updated",
    selected: "selected",
    run: "Run",
    loading: "Loading latest run",
    noRun: "No run yet",
    emptyTitle: "No dashboard data yet",
    emptyBody: "Upload a resume and start a scan to generate the first report.",
    apiError: "API is not available. Check that the FastAPI server is running.",
    timeline: "Workflow",
    selectedJobs: "Shortlist",
    shortlistCount: "shortlisted",
    open: "Open",
    resumeEvidence: "Evidence",
    missingKeywords: "Keyword gaps",
    noKeywordGap: "No obvious gaps",
    noEvidence: "No strong resume evidence found.",
    applicationDraft: "Draft",
    reviewRequired: "review required",
    resumeFocus: "Resume focus",
    coverLetter: "Cover letter",
    recruiterMessage: "Recruiter message",
    notes: "Notes",
    copy: "Copy",
    copied: "Copied",
    points: "pts",
    safeMode: "Safe mode",
    viewResults: "Review results",
    setup: "Setup"
  },
  zh: {
    appName: "求职 Agent",
    productName: "AI 求职申请 Agent",
    headline: "申请工作台",
    subline: "上传简历，扫描职位邮件，审核申请草稿。",
    language: "语言",
    english: "EN",
    chinese: "中文",
    overview: "总览",
    controls: "控制区",
    history: "历史记录",
    jobLeads: "职位线索",
    drafts: "申请草稿",
    safeTitle: "人工确认开启",
    safeBody: "不会自动发送邮件，也不会自动投递。",
    resumeStep: "简历",
    resumeStepTitle: "上传简历 PDF",
    resumeReady: "简历索引已就绪",
    resumeMissing: "扫描前先上传 PDF 简历",
    resumePrivate: "只在本地生成私有简历证据索引。",
    uploadResume: "上传 PDF",
    uploading: "上传中...",
    uploadSuccess: "简历已上传并完成索引。",
    uploadError: "简历上传失败。",
    mailStep: "邮件",
    mailStepTitle: "选择扫描范围",
    today: "今天",
    yesterday: "昨天起",
    last3Days: "近 3 天",
    last7Days: "近 7 天",
    customDate: "自定义日期",
    agentStep: "Agent",
    agentStepTitle: "生成草稿",
    startScan: "开始扫描",
    scanning: "扫描中...",
    refresh: "刷新",
    scanSuccess: "新的 Agent 运行结果已生成。",
    scanError: "扫描失败。",
    readSince: "读取此日期后的邮件",
    topDrafts: "草稿数",
    minScore: "最低分",
    jobs: "职位",
    steps: "步骤",
    recentRuns: "最近运行",
    updated: "更新于",
    selected: "已选中",
    run: "运行",
    loading: "正在加载最新运行",
    noRun: "暂无运行",
    emptyTitle: "暂无控制台数据",
    emptyBody: "先上传简历并启动一次扫描，这里会生成第一份报告。",
    apiError: "API 暂不可用，请确认 FastAPI 服务正在运行。",
    timeline: "工作流",
    selectedJobs: "候选职位",
    shortlistCount: "个入选",
    open: "打开",
    resumeEvidence: "证据",
    missingKeywords: "关键词缺口",
    noKeywordGap: "暂无明显缺口",
    noEvidence: "暂未找到强匹配简历证据。",
    applicationDraft: "草稿",
    reviewRequired: "需要审核",
    resumeFocus: "简历重点",
    coverLetter: "求职信",
    recruiterMessage: "招聘方消息",
    notes: "备注",
    copy: "复制",
    copied: "已复制",
    points: "分",
    safeMode: "安全模式",
    viewResults: "查看结果",
    setup: "配置"
  }
} as const;

const stepLabels: Record<Language, Record<string, string>> = {
  en: {
    scan_email: "scan email",
    analyze_resume_fit: "resume match",
    shortlist_jobs: "shortlist",
    generate_drafts: "drafts",
    human_approval_gate: "approval"
  },
  zh: {
    scan_email: "扫描邮件",
    analyze_resume_fit: "简历匹配",
    shortlist_jobs: "筛选职位",
    generate_drafts: "生成草稿",
    human_approval_gate: "人工确认"
  }
};

const reasonLabels: Record<Language, Record<string, string>> = {
  en: {},
  zh: {
    "target title match": "目标职位匹配",
    "preferred location": "地点匹配",
    "resume skill overlap": "简历技能重合",
    "ai/cloud stretch keyword": "AI/云方向关键词"
  }
};

type Step = {
  name: string;
  status: string;
  summary: string;
};

type Lead = {
  title: string;
  company: string;
  location: string;
  url: string;
  signals: string[];
};

type ScoredLead = {
  lead: Lead;
  score: number;
  reasons: string[];
};

type EvidenceMatch = {
  evidence: {
    section: string;
    text: string;
    keywords: string[];
  };
  score: number;
  matched_terms: string[];
};

type Analysis = {
  scored_lead: ScoredLead;
  evidence_matches: EvidenceMatch[];
  missing_keywords: string[];
};

type Draft = {
  job_title: string;
  company: string;
  resume_focus: string[];
  cover_letter: string;
  recruiter_message: string;
  application_notes: string[];
  approval_required: boolean;
};

type AgentRun = {
  id: string;
  goal: string;
  steps: Step[];
  selected_jobs: Analysis[];
  drafts: Draft[];
  output_dir: string;
  external_actions_blocked: boolean;
};

type RunSummary = {
  id: string;
  selected_job_count: number;
  draft_count: number;
  modified_at: number;
};

type ResumeStatus = {
  exists: boolean;
  chunk_count: number;
  modified_at: number | null;
};

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(daysAgo: number) {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo);
  return formatLocalDate(value);
}

function getInitialLanguage(): Language {
  const saved = window.localStorage.getItem("job-agent-language");
  return saved === "en" || saved === "zh" ? saved : "zh";
}

function scoreTone(score: number) {
  if (score >= 80) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (score >= 65) return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function firstLines(text: string, limit = 170) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function formatModified(value: number | null, language: Language) {
  if (!value) return "";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-AU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value * 1000));
}

function displayRunId(id: string) {
  if (id === "latest_test") return id;
  const match = id.match(/^(\d{4}-\d{2}-\d{2})_(\d{8})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return id;
  return `${match[1]} ${match[3]}:${match[4]} UTC`;
}

function reasonName(reason: string, language: Language) {
  return reasonLabels[language][reason.toLowerCase()] ?? reason;
}

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload.detail === "string") return payload.detail;
  return `API returned ${response.status}`;
}

function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [resume, setResume] = useState<ResumeStatus | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sinceDate, setSinceDate] = useState(dateOffset(0));
  const [topDrafts, setTopDrafts] = useState(3);
  const [minScore, setMinScore] = useState(70);
  const [runStatus, setRunStatus] = useState<AsyncStatus>("idle");
  const [uploadStatus, setUploadStatus] = useState<AsyncStatus>("idle");
  const [message, setMessage] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const t = translations[language];

  const loadResume = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/resume-index`);
    if (!response.ok) throw new Error(await parseApiError(response));
    setResume((await response.json()) as ResumeStatus);
  }, []);

  const loadRuns = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/runs`);
    if (!response.ok) throw new Error(await parseApiError(response));
    const data = (await response.json()) as { runs: RunSummary[] };
    setRuns(data.runs);
  }, []);

  const loadRun = useCallback(async (runId: string) => {
    const response = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}`);
    if (!response.ok) throw new Error(await parseApiError(response));
    setRun((await response.json()) as AgentRun);
    setSelectedIndex(0);
    setState("ready");
  }, []);

  const loadLatest = useCallback(async () => {
    try {
      await Promise.all([loadResume(), loadRuns()]);
      const response = await fetch(`${API_BASE}/api/runs/latest`);
      if (response.status === 404) {
        setState("empty");
        return;
      }
      if (!response.ok) throw new Error(await parseApiError(response));
      setRun((await response.json()) as AgentRun);
      setSelectedIndex(0);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [loadResume, loadRuns]);

  useEffect(() => {
    window.localStorage.setItem("job-agent-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadStatus("running");
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_BASE}/api/resume-index`, { method: "POST", body });
      if (!response.ok) throw new Error(await parseApiError(response));
      setResume((await response.json()) as ResumeStatus);
      setUploadStatus("success");
      setMessage(t.uploadSuccess);
    } catch (error) {
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : t.uploadError);
    } finally {
      event.target.value = "";
    }
  }

  async function runAgent() {
    if (!resume?.exists) return;
    setRunStatus("running");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since: sinceDate, top: topDrafts, min_score: minScore })
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      setRun((await response.json()) as AgentRun);
      setSelectedIndex(0);
      setState("ready");
      await loadRuns();
      setRunStatus("success");
      setMessage(t.scanSuccess);
    } catch (error) {
      setRunStatus("error");
      setMessage(error instanceof Error ? error.message : t.scanError);
    }
  }

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 1400);
  }

  const selected = run?.selected_jobs[selectedIndex] ?? run?.selected_jobs[0];
  const selectedDraft = useMemo(() => {
    if (!run || !selected) return undefined;
    return (
      run.drafts[selectedIndex] ??
      run.drafts.find(
        (draft) =>
          draft.job_title === selected.scored_lead.lead.title &&
          draft.company === selected.scored_lead.lead.company
      )
    );
  }, [run, selected, selectedIndex]);

  const visibleRuns = runs.slice(0, 4);
  const isInitialLoading = state === "loading" && !run;

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-5 py-5 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="rounded-md border border-line bg-panel p-4 shadow-soft lg:sticky lg:top-5 lg:h-[calc(100vh-40px)]">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t.appName}</p>
              <p className="text-xs text-muted">
                {run ? `${t.run} ${displayRunId(run.id)}` : isInitialLoading ? t.loading : t.noRun}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-line bg-slate-50 p-2">
            <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-muted">
              <Languages className="h-3.5 w-3.5" />
              {t.language}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <LanguageButton active={language === "zh"} label={t.chinese} onClick={() => setLanguage("zh")} />
              <LanguageButton active={language === "en"} label={t.english} onClick={() => setLanguage("en")} />
            </div>
          </div>

          <nav className="mt-5 space-y-1 text-sm">
            <NavItem href="#overview" active icon={<BriefcaseBusiness className="h-4 w-4" />} label={t.overview} />
            <NavItem href="#setup" icon={<SlidersHorizontal className="h-4 w-4" />} label={t.controls} />
            <NavItem href="#history" icon={<History className="h-4 w-4" />} label={t.history} />
            <NavItem href="#jobs" icon={<Mail className="h-4 w-4" />} label={t.jobLeads} />
            <NavItem href="#drafts" icon={<FileText className="h-4 w-4" />} label={t.drafts} />
          </nav>

          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" /> {t.safeTitle}
            </div>
            <p className="mt-2 leading-5">{t.safeBody}</p>
          </div>
        </aside>

        <section className="space-y-5">
          <header id="overview" className="rounded-md border border-line bg-panel p-5 shadow-soft">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-medium text-accent">{t.productName}</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-normal">{t.headline}</h1>
                <p className="mt-2 text-sm text-muted">{t.subline}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label={t.jobs} value={isInitialLoading ? "..." : (run?.selected_jobs.length ?? 0).toString()} />
                <Metric label={t.drafts} value={isInitialLoading ? "..." : (run?.drafts.length ?? 0).toString()} />
                <Metric label={t.steps} value={isInitialLoading ? "..." : (run?.steps.length ?? 0).toString()} />
              </div>
            </div>
          </header>

          <section id="setup" className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1.35fr_0.85fr]">
            <ActionPanel step="1" eyebrow={t.resumeStep} title={resume?.exists ? t.resumeReady : t.resumeStepTitle}>
              <p className="text-sm text-muted">
                {resume?.exists ? `${resume.chunk_count} chunks · ${formatModified(resume.modified_at, language)}` : t.resumeMissing}
              </p>
              <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-ink hover:border-blue-200 hover:bg-blue-50">
                <Upload className="h-4 w-4" />
                {uploadStatus === "running" ? t.uploading : t.uploadResume}
                <input className="hidden" type="file" accept="application/pdf,.pdf" onChange={uploadResume} />
              </label>
              <p className="mt-3 text-xs leading-5 text-muted">{t.resumePrivate}</p>
            </ActionPanel>

            <ActionPanel step="2" eyebrow={t.mailStep} title={t.mailStepTitle}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <RangeButton active={sinceDate === dateOffset(0)} label={t.today} onClick={() => setSinceDate(dateOffset(0))} />
                <RangeButton active={sinceDate === dateOffset(1)} label={t.yesterday} onClick={() => setSinceDate(dateOffset(1))} />
                <RangeButton active={sinceDate === dateOffset(2)} label={t.last3Days} onClick={() => setSinceDate(dateOffset(2))} />
                <RangeButton active={sinceDate === dateOffset(6)} label={t.last7Days} onClick={() => setSinceDate(dateOffset(6))} />
              </div>
              <input
                aria-label={t.customDate}
                className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-medium outline-none focus:border-accent"
                type="date"
                value={sinceDate}
                onChange={(event) => setSinceDate(event.target.value)}
              />
              <p className="mt-3 text-xs font-semibold text-muted">
                {t.readSince}: <span className="text-ink">{sinceDate}</span>
              </p>
            </ActionPanel>

            <ActionPanel step="3" eyebrow={t.agentStep} title={t.agentStepTitle}>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label={t.topDrafts} value={topDrafts} min={1} max={10} onChange={setTopDrafts} />
                <NumberField label={t.minScore} value={minScore} min={0} max={100} onChange={setMinScore} />
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void loadLatest()}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:border-blue-200 hover:bg-blue-50"
                >
                  <RefreshCw className="h-4 w-4" /> {t.refresh}
                </button>
                <button
                  type="button"
                  onClick={runAgent}
                  disabled={runStatus === "running" || !resume?.exists}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:whitespace-nowrap"
                >
                  {runStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {runStatus === "running" ? t.scanning : t.startScan}
                </button>
              </div>
            </ActionPanel>
          </section>

          {message && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                runStatus === "error" || uploadStatus === "error"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {message}
            </div>
          )}

          <section id="history" className="rounded-md border border-line bg-panel p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{t.recentRuns}</h2>
              <span className="text-xs text-muted">{runs.length}</span>
            </div>
            {visibleRuns.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {visibleRuns.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => void loadRun(item.id)}
                    className={`rounded-md border p-3 text-left transition ${
                      run?.id === item.id ? "border-accent bg-blue-50" : "border-line bg-white hover:border-blue-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold" title={item.id}>
                        {displayRunId(item.id)}
                      </span>
                      {run?.id === item.id && <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-accent">{t.selected}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {t.updated} {formatModified(item.modified_at, language)}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {item.selected_job_count} {t.jobs} · {item.draft_count} {t.drafts}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-line bg-slate-50 p-3 text-sm text-muted">{t.emptyBody}</p>
            )}
          </section>

          {state === "loading" && !run && <StatePanel title={t.loading} body="" loading />}
          {state === "error" && !run && <StatePanel title={t.apiError} body={t.emptyBody} />}
          {state === "empty" && !run && <StatePanel title={t.emptyTitle} body={t.emptyBody} />}

          {run && (
            <>
              <section className="rounded-md border border-line bg-panel p-4 shadow-soft">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">{t.timeline}</h2>
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {t.safeMode}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-5">
                  {run.steps.map((step) => (
                    <div key={step.name} className="rounded-md border border-line bg-slate-50 p-3">
                      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-accent">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <p className="text-sm font-semibold">{stepLabels[language][step.name] ?? step.name}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)]">
                <div id="jobs" className="rounded-md border border-line bg-panel p-4 shadow-soft">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold">{t.selectedJobs}</h2>
                    <span className="text-xs text-muted">
                      {run.selected_jobs.length} {language === "zh" ? t.shortlistCount : t.shortlistCount}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {run.selected_jobs.map((analysis, index) => {
                      const lead = analysis.scored_lead.lead;
                      const isSelected = selectedIndex === index;
                      return (
                        <button
                          key={`${lead.company}-${lead.title}`}
                          type="button"
                          onClick={() => setSelectedIndex(index)}
                          className={`w-full rounded-md border p-3 text-left transition ${
                            isSelected ? "border-accent bg-blue-50" : "border-line bg-white hover:border-blue-200 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{lead.title}</p>
                              <p className="mt-1 text-xs text-muted">{lead.company}</p>
                              <p className="mt-1 text-xs text-muted">{lead.location}</p>
                            </div>
                            <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${scoreTone(analysis.scored_lead.score)}`}>
                              {analysis.scored_lead.score}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {analysis.scored_lead.reasons.slice(0, 3).map((reason, reasonIndex) => (
                              <span key={`${reason}-${reasonIndex}`} className="rounded-md bg-white px-2 py-1 text-xs text-muted ring-1 ring-line">
                                {reasonName(reason, language)}
                              </span>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <section className="space-y-5">
                  {selected && (
                    <section className="rounded-md border border-line bg-panel p-4 shadow-soft">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-accent">{selected.scored_lead.lead.company}</p>
                          <h2 className="mt-1 text-xl font-semibold">{selected.scored_lead.lead.title}</h2>
                          <p className="mt-1 text-sm text-muted">{selected.scored_lead.lead.location}</p>
                        </div>
                        {selected.scored_lead.lead.url && (
                          <a
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:border-blue-200 hover:bg-blue-50"
                            href={selected.scored_lead.lead.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t.open} <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <InfoBlock title={t.resumeEvidence}>
                          {selected.evidence_matches.length ? (
                            selected.evidence_matches.slice(0, 2).map((match, index) => (
                              <div key={`${match.evidence.section}-${index}`} className="rounded-md border border-line bg-slate-50 p-3">
                                <div className="flex justify-between gap-3 text-xs font-semibold text-muted">
                                  <span>{match.evidence.section}</span>
                                  <span>{match.score} {t.points}</span>
                                </div>
                                <p className="mt-2 text-sm leading-5">{firstLines(match.evidence.text)}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted">{t.noEvidence}</p>
                          )}
                        </InfoBlock>

                        <InfoBlock title={t.missingKeywords}>
                          <div className="flex flex-wrap gap-2">
                            {selected.missing_keywords.length ? (
                              selected.missing_keywords.slice(0, 10).map((keyword) => (
                                <span key={keyword} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                                  {keyword}
                                </span>
                              ))
                            ) : (
                              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                {t.noKeywordGap}
                              </span>
                            )}
                          </div>
                        </InfoBlock>
                      </div>
                    </section>
                  )}

                  {selectedDraft && (
                    <section id="drafts" className="rounded-md border border-line bg-panel p-4 shadow-soft">
                      <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-base font-semibold">{t.applicationDraft}</h2>
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <UserCheck className="h-3.5 w-3.5" /> {t.reviewRequired}
                        </span>
                      </div>

                      <DraftSection title={t.resumeFocus} items={selectedDraft.resume_focus} />
                      <TextBlock
                        title={t.coverLetter}
                        text={selectedDraft.cover_letter}
                        copyLabel={copiedKey === "cover" ? t.copied : t.copy}
                        onCopy={() => void copyText("cover", selectedDraft.cover_letter)}
                      />
                      <TextBlock
                        title={t.recruiterMessage}
                        text={selectedDraft.recruiter_message}
                        copyLabel={copiedKey === "recruiter" ? t.copied : t.copy}
                        onCopy={() => void copyText("recruiter", selectedDraft.recruiter_message)}
                      />
                      <DraftSection title={t.notes} items={selectedDraft.application_notes} />
                    </section>
                  )}
                </section>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function NavItem({ href, icon, label, active = false }: { href: string; icon: ReactNode; label: string; active?: boolean }) {
  return (
    <a
      className={`flex items-center gap-2 rounded-md px-3 py-2 ${active ? "bg-blue-50 font-medium text-accent" : "text-muted hover:bg-slate-50"}`}
      href={href}
    >
      {icon}
      {label}
    </a>
  );
}

function LanguageButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md px-2 py-1.5 text-sm font-semibold transition ${
        active ? "bg-white text-accent shadow-sm ring-1 ring-line" : "text-muted hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}

function ActionPanel({ step, eyebrow, title, children }: { step: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-panel p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-sm font-bold text-accent">{step}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-accent">{eyebrow}</p>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function RangeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 rounded-md border px-3 text-sm font-semibold transition ${
        active ? "border-accent bg-blue-50 text-accent" : "border-line bg-white text-muted hover:border-blue-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-normal text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value))))}
        className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-semibold outline-none focus:border-accent"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20 rounded-md border border-line bg-slate-50 px-4 py-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="mt-1 text-xs font-medium text-muted">{label}</div>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DraftSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="rounded-md border border-line bg-slate-50 px-3 py-2 text-sm leading-5">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TextBlock({ title, text, copyLabel, onCopy }: { title: string; text: string; copyLabel: string; onCopy: () => void }) {
  const copied = copyLabel === translations.en.copied || copyLabel === translations.zh.copied;
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-semibold hover:border-blue-200 hover:bg-blue-50"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Clipboard className="h-3.5 w-3.5" />}
          {copyLabel}
        </button>
      </div>
      <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-slate-50 p-3 text-sm leading-6">
        {text}
      </div>
    </section>
  );
}

function StatePanel({ title, body, loading = false }: { title: string; body: string; loading?: boolean }) {
  return (
    <section className="rounded-md border border-line bg-panel p-5 shadow-soft">
      <div className="flex items-center gap-3">
        {loading ? <Clock3 className="h-5 w-5 animate-spin text-accent" /> : <AlertTriangle className="h-5 w-5 text-warning" />}
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {body && <p className="mt-1 text-sm text-muted">{body}</p>}
        </div>
      </div>
    </section>
  );
}

export default App;
