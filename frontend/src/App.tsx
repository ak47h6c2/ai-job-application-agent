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
  UserCheck
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

type Language = "en" | "zh";

const translations = {
  en: {
    loading: "Loading latest agent run",
    emptyTitle: "No dashboard data available",
    emptyBody: "Run a scan from the workbench to generate the first local report.",
    appName: "Job Agent",
    noRun: "No run yet",
    runLabel: "Run",
    overview: "Overview",
    jobLeads: "Job leads",
    drafts: "Drafts",
    history: "History",
    approvalTitle: "Approval gate active",
    approvalBody: "External sends and applications are blocked until reviewed manually.",
    productName: "AI Job Application Agent",
    dashboardTitle: "Application workbench",
    heroSubtitle:
      "Scan QQ Mail, match job leads against the resume, generate application drafts, and stop before any external action.",
    jobs: "Jobs",
    steps: "Steps",
    timeline: "Agent timeline",
    safeMode: "Safe mode",
    actionsEnabled: "Actions enabled",
    selectedJobs: "Selected jobs",
    shortlisted: "shortlisted",
    open: "Open",
    resumeEvidence: "Resume evidence",
    noEvidence: "No strong resume evidence found for this role.",
    missingKeywords: "Missing keywords",
    noKeywordGap: "no obvious keyword gap",
    points: "pts",
    applicationDraft: "Application draft",
    reviewRequired: "review required",
    resumeFocus: "Resume focus",
    coverLetter: "Cover letter",
    recruiterMessage: "Recruiter message",
    notes: "Notes",
    language: "Language",
    english: "EN",
    chinese: "中文",
    scanPanel: "Mail scan",
    scanPanelSubtitle: "Choose a starting date and run the safe agent workflow.",
    sinceDate: "Read mail since",
    today: "Today",
    yesterday: "Yesterday",
    last3Days: "Last 3 days",
    last7Days: "Last 7 days",
    topDrafts: "Drafts",
    minScore: "Min score",
    startScan: "Start scan",
    scanning: "Scanning...",
    refresh: "Refresh",
    scanSuccess: "New agent run generated.",
    scanError: "Scan failed.",
    latestRun: "Latest run",
    recentRuns: "Recent runs",
    useRun: "Open run",
    modified: "Updated",
    copied: "Copied",
    copy: "Copy",
    runCount: "runs",
    apiError: "API is not available. Check that the FastAPI server is running.",
    currentRange: "Current scan reads mail since",
    output: "Output",
    controlTitle: "Controls",
    selected: "selected"
  },
  zh: {
    loading: "正在加载最新 Agent 运行结果",
    emptyTitle: "暂无可展示的控制台数据",
    emptyBody: "从上方工作台启动一次扫描后，这里会显示本地私有运行报告。",
    appName: "求职 Agent",
    noRun: "暂无运行",
    runLabel: "运行",
    overview: "总览",
    jobLeads: "职位线索",
    drafts: "申请草稿",
    history: "历史记录",
    approvalTitle: "人工确认已开启",
    approvalBody: "所有外部发送和正式投递都会先被拦截，必须人工检查后再处理。",
    productName: "AI 求职申请 Agent",
    dashboardTitle: "申请工作台",
    heroSubtitle:
      "扫描 QQ 邮箱，结合简历匹配职位线索，生成申请草稿，并在任何外部动作前停下来等待人工确认。",
    jobs: "职位",
    steps: "步骤",
    timeline: "Agent 流程",
    safeMode: "安全模式",
    actionsEnabled: "允许外部动作",
    selectedJobs: "入选职位",
    shortlisted: "个入选",
    open: "打开",
    resumeEvidence: "简历证据",
    noEvidence: "这个职位暂时没有匹配到足够强的简历证据。",
    missingKeywords: "缺失关键词",
    noKeywordGap: "暂无明显关键词缺口",
    points: "分",
    applicationDraft: "申请草稿",
    reviewRequired: "需要审核",
    resumeFocus: "简历重点",
    coverLetter: "求职信",
    recruiterMessage: "招聘方消息",
    notes: "备注",
    language: "语言",
    english: "EN",
    chinese: "中文",
    scanPanel: "邮件扫描",
    scanPanelSubtitle: "选择开始日期，然后运行安全的 Agent 工作流。",
    sinceDate: "读取此日期后的邮件",
    today: "今天",
    yesterday: "昨天起",
    last3Days: "近 3 天",
    last7Days: "近 7 天",
    topDrafts: "草稿数",
    minScore: "最低分",
    startScan: "开始扫描",
    scanning: "扫描中...",
    refresh: "刷新",
    scanSuccess: "新的 Agent 运行结果已生成。",
    scanError: "扫描失败。",
    latestRun: "最新运行",
    recentRuns: "最近运行",
    useRun: "打开运行",
    modified: "更新于",
    copied: "已复制",
    copy: "复制",
    runCount: "次运行",
    apiError: "API 暂不可用，请确认 FastAPI 服务正在运行。",
    currentRange: "当前会读取此日期后的邮件",
    output: "输出",
    controlTitle: "控制区",
    selected: "已选中"
  }
} as const;

const stepLabels: Record<Language, Record<string, string>> = {
  en: {
    scan_email: "scan email",
    analyze_resume_fit: "analyze resume fit",
    shortlist_jobs: "shortlist jobs",
    generate_drafts: "generate drafts",
    human_approval_gate: "human approval gate"
  },
  zh: {
    scan_email: "扫描邮件",
    analyze_resume_fit: "分析简历匹配度",
    shortlist_jobs: "筛选职位",
    generate_drafts: "生成草稿",
    human_approval_gate: "人工确认关卡"
  }
};

const statusLabels: Record<Language, Record<string, string>> = {
  en: {
    completed: "completed",
    blocked: "blocked",
    pending: "pending"
  },
  zh: {
    completed: "已完成",
    blocked: "等待确认",
    pending: "待处理"
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

type DraftFile = {
  filename: string;
  content: string;
};

type AgentRun = {
  id: string;
  goal: string;
  steps: Step[];
  selected_jobs: Analysis[];
  drafts: Draft[];
  draft_files: DraftFile[];
  output_dir: string;
  external_actions_blocked: boolean;
};

type RunSummary = {
  id: string;
  goal: string;
  steps: Step[];
  selected_job_count: number;
  draft_count: number;
  external_actions_blocked: boolean;
  modified_at: number;
};

type LoadState = "loading" | "ready" | "empty" | "error";
type RunStatus = "idle" | "running" | "success" | "error";

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

function stepIcon(status: string) {
  if (status === "blocked") return <ShieldCheck className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function firstLines(text: string, limit = 220) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function stepName(name: string, language: Language) {
  return stepLabels[language][name] ?? name.replace(/_/g, " ");
}

function statusName(status: string, language: Language) {
  return statusLabels[language][status] ?? status;
}

function reasonName(reason: string, language: Language) {
  return reasonLabels[language][reason.toLowerCase()] ?? reason;
}

function stepSummary(step: Step, language: Language, run: AgentRun) {
  if (language === "en") return step.summary;

  if (step.name === "scan_email") {
    const since = step.summary.match(/since ([0-9-]+)/)?.[1];
    return since ? `已扫描 QQ Mail 收件箱中 ${since} 之后的邮件。` : "已扫描 QQ Mail 收件箱。";
  }

  if (step.name === "analyze_resume_fit") {
    const count = step.summary.match(/Analyzed ([0-9]+)/)?.[1];
    return count ? `已结合简历证据分析 ${count} 个职位线索。` : "已结合简历证据分析职位线索。";
  }

  if (step.name === "shortlist_jobs") {
    return `已筛选出 ${run.selected_jobs.length} 个匹配度较高的职位。`;
  }

  if (step.name === "generate_drafts") {
    return `已生成 ${run.drafts.length} 份求职信和招聘方消息草稿。`;
  }

  if (step.name === "human_approval_gate") {
    return "外部投递和邮件发送已被拦截，请先人工检查草稿。";
  }

  return step.summary;
}

function formatModified(value: number, language: Language) {
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

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload.detail === "string") return payload.detail;
  return `API returned ${response.status}`;
}

function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sinceDate, setSinceDate] = useState(dateOffset(0));
  const [topDrafts, setTopDrafts] = useState(3);
  const [minScore, setMinScore] = useState(70);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runMessage, setRunMessage] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const t = translations[language];

  const loadRuns = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/runs`);
    if (!response.ok) throw new Error(await parseApiError(response));
    const data = (await response.json()) as { runs: RunSummary[] };
    setRuns(data.runs);
  }, []);

  const loadRun = useCallback(async (runId: string) => {
    const response = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}`);
    if (!response.ok) throw new Error(await parseApiError(response));
    const data = (await response.json()) as AgentRun;
    setRun(data);
    setSelectedIndex(0);
    setState("ready");
  }, []);

  const loadLatest = useCallback(async () => {
    try {
      await loadRuns();
      const response = await fetch(`${API_BASE}/api/runs/latest`);
      if (response.status === 404) {
        setState("empty");
        return;
      }
      if (!response.ok) throw new Error(await parseApiError(response));
      const data = (await response.json()) as AgentRun;
      setRun(data);
      setSelectedIndex(0);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [loadRuns]);

  useEffect(() => {
    window.localStorage.setItem("job-agent-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  async function runAgent() {
    setRunStatus("running");
    setRunMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          since: sinceDate,
          top: topDrafts,
          min_score: minScore
        })
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      const data = (await response.json()) as AgentRun;
      setRun(data);
      setSelectedIndex(0);
      setState("ready");
      await loadRuns();
      setRunStatus("success");
      setRunMessage(t.scanSuccess);
    } catch (error) {
      setRunStatus("error");
      setRunMessage(error instanceof Error ? error.message : t.scanError);
    }
  }

  async function refreshLatest() {
    setRunMessage("");
    await loadLatest();
  }

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 1400);
  }

  const selected = run?.selected_jobs[selectedIndex] ?? run?.selected_jobs[0];
  const isInitialLoading = state === "loading" && !run;
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

  const visibleRuns = runs.slice(0, 5);

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-5 py-6 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="rounded-md border border-line bg-panel p-4 shadow-soft lg:sticky lg:top-6 lg:h-[calc(100vh-48px)]">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t.appName}</p>
              <p className="text-xs text-muted">
                {run ? `${t.runLabel} ${displayRunId(run.id)}` : isInitialLoading ? t.loading : t.noRun}
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
            <a className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 font-medium text-accent" href="#overview">
              <BriefcaseBusiness className="h-4 w-4" /> {t.overview}
            </a>
            <a className="flex items-center gap-2 rounded-md px-3 py-2 text-muted hover:bg-slate-50" href="#workbench">
              <SlidersHorizontal className="h-4 w-4" /> {t.controlTitle}
            </a>
            <a className="flex items-center gap-2 rounded-md px-3 py-2 text-muted hover:bg-slate-50" href="#history">
              <History className="h-4 w-4" /> {t.history}
            </a>
            <a className="flex items-center gap-2 rounded-md px-3 py-2 text-muted hover:bg-slate-50" href="#jobs">
              <Mail className="h-4 w-4" /> {t.jobLeads}
            </a>
            <a className="flex items-center gap-2 rounded-md px-3 py-2 text-muted hover:bg-slate-50" href="#drafts">
              <FileText className="h-4 w-4" /> {t.drafts}
            </a>
          </nav>

          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" /> {t.approvalTitle}
            </div>
            <p className="mt-2 leading-5">{t.approvalBody}</p>
          </div>
        </aside>

        <section className="space-y-6">
          <header id="overview" className="rounded-md border border-line bg-panel p-6 shadow-soft">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm font-medium text-accent">{t.productName}</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">{t.dashboardTitle}</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{t.heroSubtitle}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Metric label={t.jobs} value={isInitialLoading ? "..." : (run?.selected_jobs.length ?? 0).toString()} />
                <Metric label={t.drafts} value={isInitialLoading ? "..." : (run?.drafts.length ?? 0).toString()} />
                <Metric label={t.steps} value={isInitialLoading ? "..." : (run?.steps.length ?? 0).toString()} />
              </div>
            </div>
          </header>

          <section id="workbench" className="rounded-md border border-line bg-panel p-5 shadow-soft">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-accent">
                  <CalendarDays className="h-4 w-4" />
                  {t.scanPanel}
                </div>
                <h2 className="mt-2 text-xl font-semibold">{t.scanPanelSubtitle}</h2>
                <p className="mt-2 text-sm text-muted">
                  {t.currentRange} <span className="font-semibold text-ink">{sinceDate}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={refreshLatest}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-ink hover:border-blue-200 hover:bg-blue-50"
                >
                  <RefreshCw className="h-4 w-4" /> {t.refresh}
                </button>
                <button
                  type="button"
                  onClick={runAgent}
                  disabled={runStatus === "running"}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {runStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {runStatus === "running" ? t.scanning : t.startScan}
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_120px_120px]">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-normal text-muted">{t.sinceDate}</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_150px]">
                  <RangeButton active={sinceDate === dateOffset(0)} label={t.today} onClick={() => setSinceDate(dateOffset(0))} />
                  <RangeButton active={sinceDate === dateOffset(1)} label={t.yesterday} onClick={() => setSinceDate(dateOffset(1))} />
                  <RangeButton active={sinceDate === dateOffset(2)} label={t.last3Days} onClick={() => setSinceDate(dateOffset(2))} />
                  <RangeButton active={sinceDate === dateOffset(6)} label={t.last7Days} onClick={() => setSinceDate(dateOffset(6))} />
                  <input
                    type="date"
                    value={sinceDate}
                    onChange={(event) => setSinceDate(event.target.value)}
                    className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink outline-none focus:border-accent"
                  />
                </div>
              </div>

              <NumberField label={t.topDrafts} value={topDrafts} min={1} max={10} onChange={setTopDrafts} />
              <NumberField label={t.minScore} value={minScore} min={0} max={100} onChange={setMinScore} />
            </div>

            {runMessage && (
              <div
                className={`mt-4 rounded-md border px-3 py-2 text-sm ${
                  runStatus === "error" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                {runMessage}
              </div>
            )}
          </section>

          <section id="history" className="rounded-md border border-line bg-panel p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t.recentRuns}</h2>
              <span className="text-sm text-muted">
                {runs.length} {t.runCount}
              </span>
            </div>
            {visibleRuns.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleRuns.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => void loadRun(item.id)}
                    className={`rounded-md border p-3 text-left transition ${
                      run?.id === item.id ? "border-accent bg-blue-50" : "border-line bg-white hover:border-blue-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-ink" title={item.id}>
                        {displayRunId(item.id)}
                      </span>
                      {run?.id === item.id && <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-accent">{t.selected}</span>}
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {t.modified} {formatModified(item.modified_at, language)}
                    </p>
                    <div className="mt-3 flex gap-2 text-xs text-muted">
                      <span className="rounded-md bg-slate-100 px-2 py-1">
                        {item.selected_job_count} {t.jobs}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-1">
                        {item.draft_count} {t.drafts}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-line bg-slate-50 p-4 text-sm text-muted">{t.emptyBody}</p>
            )}
          </section>

          {state === "loading" && !run && <LoadingPanel label={t.loading} />}
          {state === "error" && !run && <EmptyPanel title={t.apiError} body={t.emptyBody} />}
          {state === "empty" && !run && <EmptyPanel title={t.emptyTitle} body={t.emptyBody} />}

          {run && (
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
              <div className="space-y-6">
                <section className="rounded-md border border-line bg-panel p-5 shadow-soft">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{t.timeline}</h2>
                    <span className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-muted">
                      {run.external_actions_blocked ? t.safeMode : t.actionsEnabled}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {run.steps.map((step) => (
                      <div key={step.name} className="flex gap-3 rounded-md border border-line p-3">
                        <div
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            step.status === "blocked" ? "bg-emerald-50 text-success" : "bg-blue-50 text-accent"
                          }`}
                        >
                          {stepIcon(step.status)}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{stepName(step.name, language)}</p>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-muted">
                              {statusName(step.status, language)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-5 text-muted">{stepSummary(step, language, run)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section id="jobs" className="rounded-md border border-line bg-panel p-5 shadow-soft">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{t.selectedJobs}</h2>
                    <span className="text-sm text-muted">
                      {language === "zh" ? `${run.selected_jobs.length}${t.shortlisted}` : `${run.selected_jobs.length} ${t.shortlisted}`}
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {run.selected_jobs.map((analysis, index) => {
                      const lead = analysis.scored_lead.lead;
                      const isSelected = selectedIndex === index;
                      return (
                        <button
                          key={`${lead.company}-${lead.title}`}
                          onClick={() => setSelectedIndex(index)}
                          className={`rounded-md border p-4 text-left transition ${
                            isSelected ? "border-accent bg-blue-50" : "border-line bg-white hover:border-blue-200 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-ink">{lead.title}</p>
                              <p className="mt-1 text-sm text-muted">
                                {lead.company} - {lead.location}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold ${scoreTone(analysis.scored_lead.score)}`}>
                              {analysis.scored_lead.score}/100
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {analysis.scored_lead.reasons.slice(0, 4).map((reason, reasonIndex) => (
                              <span key={`${reason}-${reasonIndex}`} className="rounded-md bg-white px-2 py-1 text-xs text-muted ring-1 ring-line">
                                {reasonName(reason, language)}
                              </span>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>

              <section className="space-y-6">
                {selected && (
                  <section className="rounded-md border border-line bg-panel p-5 shadow-soft">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-accent">{selected.scored_lead.lead.company}</p>
                        <h2 className="mt-1 text-xl font-semibold">{selected.scored_lead.lead.title}</h2>
                        <p className="mt-1 text-sm text-muted">{selected.scored_lead.lead.location}</p>
                      </div>
                      {selected.scored_lead.lead.url && (
                        <a
                          className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-ink hover:border-blue-200 hover:bg-blue-50"
                          href={selected.scored_lead.lead.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t.open} <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>

                    <div className="mt-5">
                      <h3 className="text-sm font-semibold">{t.resumeEvidence}</h3>
                      <div className="mt-3 space-y-3">
                        {selected.evidence_matches.length ? (
                          selected.evidence_matches.slice(0, 3).map((match, matchIndex) => (
                            <div key={`${match.evidence.section}-${match.score}-${matchIndex}`} className="rounded-md border border-line bg-slate-50 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold uppercase tracking-normal text-muted">
                                  {match.evidence.section}
                                </span>
                                <span className="text-xs text-muted">
                                  {match.score} {t.points}
                                </span>
                              </div>
                              <p className="mt-2 text-sm leading-5 text-ink">{firstLines(match.evidence.text)}</p>
                            </div>
                          ))
                        ) : (
                          <p className="rounded-md border border-line bg-slate-50 p-3 text-sm text-muted">{t.noEvidence}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5">
                      <h3 className="text-sm font-semibold">{t.missingKeywords}</h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selected.missing_keywords.length ? (
                          selected.missing_keywords.slice(0, 8).map((keyword) => (
                            <span key={keyword} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                              {keyword}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                            {t.noKeywordGap}
                          </span>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {selectedDraft && (
                  <section id="drafts" className="rounded-md border border-line bg-panel p-5 shadow-soft">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-semibold">{t.applicationDraft}</h2>
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
          )}
        </section>
      </div>
    </main>
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

function NumberField({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-normal text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value))))}
        className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-accent"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20 rounded-md border border-line bg-slate-50 px-4 py-3">
      <div className="text-xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs font-medium text-muted">{label}</div>
    </div>
  );
}

function DraftSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="rounded-md border border-line bg-slate-50 px-3 py-2 text-sm leading-5 text-ink">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TextBlock({
  title,
  text,
  copyLabel,
  onCopy
}: {
  title: string;
  text: string;
  copyLabel: string;
  onCopy: () => void;
}) {
  const copied = copyLabel === translations.en.copied || copyLabel === translations.zh.copied;
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-semibold text-ink hover:border-blue-200 hover:bg-blue-50"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Clipboard className="h-3.5 w-3.5" />}
          {copyLabel}
        </button>
      </div>
      <div className="whitespace-pre-wrap rounded-md border border-line bg-slate-50 p-3 text-sm leading-6 text-ink">
        {text}
      </div>
    </section>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <section className="rounded-md border border-line bg-panel p-6 shadow-soft">
      <div className="flex items-center gap-3 text-sm font-medium">
        <Clock3 className="h-5 w-5 animate-spin text-accent" />
        {label}
      </div>
    </section>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-md border border-line bg-panel p-6 shadow-soft">
      <AlertTriangle className="mb-4 h-7 w-7 text-warning" />
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
    </section>
  );
}

export default App;
