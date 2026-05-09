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
import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";
const RESUME_UPLOAD_TIMEOUT_MS = 45000;

type Language = "en" | "zh";
type LoadState = "loading" | "ready" | "empty" | "error";
type AsyncStatus = "idle" | "running" | "success" | "error";

const translations = {
  en: {
    appName: "Job Agent",
    productName: "AI Job Application Agent",
    headline: "Application workbench",
    subline: "Upload resume, scan emails or paste jobs, review drafts.",
    language: "Language",
    english: "EN",
    chinese: "中文",
    overview: "Overview",
    controls: "Controls",
    manualJob: "Manual job",
    history: "History",
    jobLeads: "Job leads",
    drafts: "Drafts",
    safeTitle: "Human approval on",
    safeBody: "No email or application is sent automatically.",
    resumeStep: "Resume",
    resumeStepTitle: "Upload resume PDF",
    resumeReady: "Resume index ready",
    resumeMissing: "Upload a PDF before generating materials",
    resumePrivate: "Stored locally as a private evidence index.",
    resumeSectionsLabel: "Detected sections",
    resumeKeywordsLabel: "Detected keywords",
    uploadNextStep: "Next: scan email or paste a job post.",
    uploadResume: "Upload PDF",
    uploading: "Uploading...",
    uploadWorking: "Uploading and parsing the resume. This usually takes a few seconds.",
    uploadTimeout: "Resume upload timed out. Check that the backend is running, or try a text-based PDF.",
    uploadCanceled: "Resume upload canceled.",
    cancelUpload: "Cancel",
    uploadSuccess: "Resume uploaded and indexed.",
    uploadError: "Resume upload failed.",
    uploadTextError: "This PDF does not contain enough readable resume text. If it is a scanned image resume, export it as a text-based PDF first.",
    mailStep: "Mail",
    mailStepTitle: "Choose scan range",
    today: "Today",
    yesterday: "Yesterday",
    last3Days: "Last 3 days",
    last7Days: "Last 7 days",
    customDate: "Custom date",
    agentStep: "Agent",
    agentStepTitle: "Shortlist and draft",
    startScan: "Analyze jobs",
    scanning: "Analyzing...",
    refresh: "Reload",
    scanSuccess: "New job analysis generated.",
    scanError: "Scan failed.",
    manualTitle: "Paste a job post",
    manualSubtitle: "Use this when the role comes from LinkedIn, Seek, a company site, or another platform.",
    manualJobTitle: "Job title",
    manualCompany: "Company",
    manualLocation: "Location",
    manualUrl: "Job link",
    manualDescription: "Job description",
    manualDescriptionPlaceholder: "Paste responsibilities, requirements, and any useful job-post text here.",
    manualGenerate: "Generate materials",
    manualGenerating: "Generating...",
    manualSuccess: "Application materials generated from the pasted job post.",
    manualMissing: "Fill in the title, company, and job description first.",
    readSince: "Read mail since",
    topDrafts: "Max drafts",
    minScore: "Min match",
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
    noJobsTitle: "No matched jobs in this run",
    noJobsBody: "Expand the mail range or lower the minimum match threshold, then analyze again.",
    noDraftTitle: "No drafts generated",
    noDraftBody: "Drafts appear after at least one job meets the match threshold.",
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
    draftLanguage: "Draft language",
    draftLanguageEnglish: "English",
    draftLanguageChinese: "Chinese",
    notes: "Notes",
    copy: "Copy",
    copied: "Copied",
    points: "pts",
    safeMode: "Safe mode",
    viewResults: "Review results",
    setup: "Setup"
  },
  zh: {
    appName: "求职助手",
    productName: "AI 求职申请助手",
    headline: "求职申请工作台",
    subline: "先上传简历，再扫描邮件或粘贴 JD，最后审核生成的申请材料。",
    language: "语言",
    english: "EN",
    chinese: "中文",
    overview: "总览",
    controls: "控制区",
    manualJob: "手动岗位",
    history: "历史记录",
    jobLeads: "职位线索",
    drafts: "申请草稿",
    safeTitle: "人工确认",
    safeBody: "这里只生成建议和草稿，不会自动发送或投递。",
    resumeStep: "简历",
    resumeStepTitle: "上传 PDF 简历",
    resumeReady: "简历已准备好",
    resumeMissing: "请先上传一份 PDF 简历",
    resumePrivate: "简历只用于本地分析，不会提交到 GitHub。",
    resumeSectionsLabel: "已识别模块",
    resumeKeywordsLabel: "已识别关键词",
    uploadNextStep: "下一步：扫描邮件，或粘贴岗位 JD。",
    uploadResume: "选择简历 PDF",
    uploading: "上传中...",
    uploadWorking: "正在上传并解析简历，通常需要几秒钟。",
    uploadTimeout: "简历上传超时。请确认后端服务正常，或者换成可复制文字的 PDF 后重试。",
    uploadCanceled: "已取消上传。",
    cancelUpload: "取消",
    uploadSuccess: "简历已上传，可以开始分析职位邮件。",
    uploadError: "简历上传失败。",
    uploadTextError: "这份 PDF 读不到足够的简历文字。如果是扫描版图片简历，请先导出为可复制文字的 PDF 后再上传。",
    mailStep: "邮件范围",
    mailStepTitle: "选择要看的邮件",
    today: "今天",
    yesterday: "昨天起",
    last3Days: "近 3 天",
    last7Days: "近 7 天",
    customDate: "自定义日期",
    agentStep: "生成",
    agentStepTitle: "筛选职位并生成草稿",
    startScan: "开始分析",
    scanning: "分析中...",
    refresh: "更新结果",
    scanSuccess: "分析完成，已生成新的求职材料。",
    scanError: "分析失败。",
    manualTitle: "粘贴岗位 JD",
    manualSubtitle: "适合 LinkedIn、Seek、公司官网、Boss、猎聘等非邮件来源的岗位。",
    manualJobTitle: "岗位名称",
    manualCompany: "公司",
    manualLocation: "地点",
    manualUrl: "岗位链接",
    manualDescription: "岗位描述",
    manualDescriptionPlaceholder: "把岗位职责、任职要求、技术栈和其他有用信息粘贴到这里。",
    manualGenerate: "生成申请材料",
    manualGenerating: "生成中...",
    manualSuccess: "已根据粘贴的岗位生成申请材料。",
    manualMissing: "请先填写岗位名称、公司和岗位描述。",
    readSince: "读取邮件日期",
    topDrafts: "最多生成",
    minScore: "最低匹配度",
    jobs: "职位",
    steps: "流程",
    recentRuns: "历史结果",
    updated: "更新于",
    selected: "当前",
    run: "结果",
    loading: "正在加载最新结果",
    noRun: "暂无结果",
    emptyTitle: "还没有分析结果",
    emptyBody: "先上传简历，再点开始分析。",
    noJobsTitle: "这次没有筛出合适职位",
    noJobsBody: "可以扩大邮件范围，或者把最低匹配度调低后重新分析。",
    noDraftTitle: "还没有生成申请材料",
    noDraftBody: "当有职位达到最低匹配度后，这里会生成简历修改点、求职信和招聘方消息。",
    apiError: "本地服务未连接，请确认后端正在运行。",
    timeline: "处理进度",
    selectedJobs: "推荐职位",
    shortlistCount: "个推荐",
    open: "打开",
    resumeEvidence: "简历依据",
    missingKeywords: "可补关键词",
    noKeywordGap: "暂无明显缺口",
    noEvidence: "暂未找到强匹配的简历内容。",
    applicationDraft: "申请材料",
    reviewRequired: "待你确认",
    resumeFocus: "简历修改重点",
    coverLetter: "求职信草稿",
    recruiterMessage: "招聘方消息",
    draftLanguage: "草稿语言",
    draftLanguageEnglish: "英文",
    draftLanguageChinese: "中文",
    notes: "投递提醒",
    copy: "复制",
    copied: "已复制",
    points: "分",
    safeMode: "只读安全模式",
    viewResults: "查看材料",
    setup: "开始"
  }
} as const;

const stepLabels: Record<Language, Record<string, string>> = {
  en: {
    manual_job_input: "manual job",
    scan_email: "scan email",
    analyze_resume_fit: "resume match",
    shortlist_jobs: "shortlist",
    generate_drafts: "drafts",
    human_approval_gate: "approval"
  },
  zh: {
    manual_job_input: "手动岗位",
    scan_email: "扫描邮件",
    analyze_resume_fit: "简历匹配",
    shortlist_jobs: "筛选职位",
    generate_drafts: "生成草稿",
    human_approval_gate: "人工确认"
  }
};

const reasonLabels: Record<Language, Record<string, string>> = {
  en: {
    "target title match": "target role",
    "software role keywords": "software keywords",
    "preferred location": "location fit",
    "resume skill overlap": "resume overlap",
    "ai/cloud stretch keyword": "AI/cloud keywords",
    "positive job-alert signal": "job source signal"
  },
  zh: {
    "target title match": "目标职位匹配",
    "software role keywords": "软件岗位关键词",
    "preferred location": "地点匹配",
    "resume skill overlap": "简历技能重合",
    "ai/cloud stretch keyword": "AI/云方向关键词",
    "positive job-alert signal": "岗位来源信号"
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
  communication_language: Language;
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
  sections?: string[];
  keywords?: string[];
};

type ManualJobForm = {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
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

function joinList(items: string[] | undefined, language: Language) {
  return (items ?? []).filter(Boolean).join(language === "zh" ? "、" : ", ");
}

function matchScoreLabel(score: number, language: Language) {
  return language === "zh" ? `匹配度 ${score}` : `Match ${score}`;
}

function draftLanguageName(value: Language | undefined, language: Language) {
  if (value === "zh") return translations[language].draftLanguageChinese;
  return translations[language].draftLanguageEnglish;
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
  const [manualStatus, setManualStatus] = useState<AsyncStatus>("idle");
  const [manualJob, setManualJob] = useState<ManualJobForm>({
    title: "",
    company: "",
    location: "Sydney, NSW",
    url: "",
    description: ""
  });
  const [message, setMessage] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadRequestIdRef = useRef(0);
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

  const friendlyError = (rawMessage: string, fallback: string) => {
    if (rawMessage.includes("Could not read enough resume text")) return t.uploadTextError;
    if (rawMessage.includes("Could not read resume PDF")) return t.uploadTextError;
    if (rawMessage.includes("Resume index not found")) return t.resumeMissing;
    return rawMessage || fallback;
  };

  const resumeUploadMessage = (status: ResumeStatus) => {
    const sections = joinList(status.sections?.slice(0, 5), language);
    if (language === "zh") {
      return sections
        ? `简历已读取：${status.chunk_count} 个模块（${sections}）。${t.uploadNextStep}`
        : `${t.uploadSuccess}${t.uploadNextStep}`;
    }
    return sections
      ? `Resume parsed: ${status.chunk_count} sections (${sections}). ${t.uploadNextStep}`
      : `${t.uploadSuccess} ${t.uploadNextStep}`;
  };

  function cancelUpload() {
    uploadRequestIdRef.current += 1;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    setUploadStatus("idle");
    setMessage(t.uploadCanceled);
  }

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (uploadStatus === "running") {
      event.target.value = "";
      return;
    }
    const requestId = uploadRequestIdRef.current + 1;
    uploadRequestIdRef.current = requestId;
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, RESUME_UPLOAD_TIMEOUT_MS);
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = controller;
    setUploadStatus("running");
    setRunStatus("idle");
    setManualStatus("idle");
    setMessage(t.uploadWorking);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_BASE}/api/resume-index`, {
        method: "POST",
        body,
        signal: controller.signal
      });
      if (requestId !== uploadRequestIdRef.current) return;
      if (!response.ok) throw new Error(await parseApiError(response));
      const status = (await response.json()) as ResumeStatus;
      setResume(status);
      setUploadStatus("success");
      setMessage(resumeUploadMessage(status));
    } catch (error) {
      if (requestId !== uploadRequestIdRef.current) return;
      const rawMessage = error instanceof Error ? error.message : t.uploadError;
      setUploadStatus("error");
      setMessage(timedOut ? t.uploadTimeout : friendlyError(rawMessage, t.uploadError));
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === uploadRequestIdRef.current) {
        uploadAbortRef.current = null;
      }
      event.target.value = "";
    }
  }

  async function runAgent() {
    if (!resume?.exists) return;
    setRunStatus("running");
    setUploadStatus("idle");
    setManualStatus("idle");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since: sinceDate, top: topDrafts, min_score: minScore, language })
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      setRun((await response.json()) as AgentRun);
      setSelectedIndex(0);
      setState("ready");
      await loadRuns();
      setRunStatus("success");
      setMessage(t.scanSuccess);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t.scanError;
      setRunStatus("error");
      setMessage(friendlyError(rawMessage, t.scanError));
    }
  }

  function updateManualJob(key: keyof ManualJobForm, value: string) {
    setManualJob((current) => ({ ...current, [key]: value }));
  }

  async function runManualJob() {
    if (!resume?.exists) {
      setManualStatus("error");
      setMessage(t.resumeMissing);
      return;
    }
    if (!manualJob.title.trim() || !manualJob.company.trim() || manualJob.description.trim().length < 20) {
      setManualStatus("error");
      setMessage(t.manualMissing);
      return;
    }

    setManualStatus("running");
    setRunStatus("idle");
    setUploadStatus("idle");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/manual-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...manualJob, language })
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      setRun((await response.json()) as AgentRun);
      setSelectedIndex(0);
      setState("ready");
      await loadRuns();
      setManualStatus("success");
      setMessage(t.manualSuccess);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t.scanError;
      setManualStatus("error");
      setMessage(friendlyError(rawMessage, t.scanError));
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
    <main className="app-backdrop min-h-screen text-ink">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-5 py-5 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="sidebar-panel rounded-md p-4 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)]">
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

          <div className="mt-4 rounded-md border border-white/10 bg-white/10 p-2">
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
            <NavItem href="#manual" icon={<Clipboard className="h-4 w-4" />} label={t.manualJob} />
            <NavItem href="#history" icon={<History className="h-4 w-4" />} label={t.history} />
            <NavItem href="#jobs" icon={<Mail className="h-4 w-4" />} label={t.jobLeads} />
            <NavItem href="#drafts" icon={<FileText className="h-4 w-4" />} label={t.drafts} />
          </nav>

          <div className="mt-6 rounded-md border border-emerald-300/30 bg-emerald-400/12 p-3 text-sm text-emerald-50">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" /> {t.safeTitle}
            </div>
            <p className="mt-2 leading-5">{t.safeBody}</p>
          </div>
        </aside>

        <section className="space-y-5">
          <header id="overview" className="hero-panel fade-lift rounded-md p-5 shadow-soft">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-100">{t.productName}</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-normal text-white">{t.headline}</h1>
                <p className="mt-2 text-sm text-blue-50">{t.subline}</p>
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
                {resume?.exists
                  ? `${resume.chunk_count} ${language === "zh" ? "个模块" : "sections"} · ${formatModified(resume.modified_at, language)}`
                  : t.resumeMissing}
              </p>
              {resume?.exists && Boolean(resume.sections?.length) && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold text-muted">{t.resumeSectionsLabel}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {resume.sections?.slice(0, 5).map((section) => (
                      <span key={section} className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-semibold text-accent">
                        {section}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {resume?.exists && Boolean(resume.keywords?.length) && (
                <p className="mt-2 text-xs leading-5 text-muted">
                  {t.resumeKeywordsLabel}: <span className="text-ink">{joinList(resume.keywords?.slice(0, 6), language)}</span>
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <label
                  aria-disabled={uploadStatus === "running"}
                  className={`inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-ink transition ${
                    uploadStatus === "running"
                      ? "cursor-not-allowed bg-white/60 opacity-80"
                      : "cursor-pointer hover:border-blue-200 hover:bg-blue-50"
                  }`}
                >
                  {uploadStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadStatus === "running" ? t.uploading : t.uploadResume}
                  <input
                    className="hidden"
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={uploadStatus === "running"}
                    onChange={uploadResume}
                  />
                </label>
                {uploadStatus === "running" && (
                  <button
                    type="button"
                    onClick={cancelUpload}
                    className="inline-flex h-10 items-center rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    {t.cancelUpload}
                  </button>
                )}
              </div>
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
                  className="primary-action inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:whitespace-nowrap"
                >
                  {runStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {runStatus === "running" ? t.scanning : t.startScan}
                </button>
              </div>
            </ActionPanel>
          </section>

          <section id="manual" className="surface-panel fade-lift rounded-md p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-accent">{t.manualJob}</p>
                <h2 className="mt-1 text-lg font-semibold">{t.manualTitle}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{t.manualSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={runManualJob}
                disabled={manualStatus === "running" || !resume?.exists}
                className="primary-action inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {manualStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {manualStatus === "running" ? t.manualGenerating : t.manualGenerate}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <TextField label={t.manualJobTitle} value={manualJob.title} onChange={(value) => updateManualJob("title", value)} />
              <TextField label={t.manualCompany} value={manualJob.company} onChange={(value) => updateManualJob("company", value)} />
              <TextField label={t.manualLocation} value={manualJob.location} onChange={(value) => updateManualJob("location", value)} />
              <TextField label={t.manualUrl} value={manualJob.url} onChange={(value) => updateManualJob("url", value)} />
            </div>

            <label className="mt-3 block">
              <span className="mb-2 block text-sm font-semibold text-muted">{t.manualDescription}</span>
              <textarea
                value={manualJob.description}
                onChange={(event) => updateManualJob("description", event.target.value)}
                placeholder={t.manualDescriptionPlaceholder}
                className="min-h-40 w-full resize-y rounded-md border border-line bg-white/85 px-3 py-3 text-sm leading-6 outline-none transition focus:border-accent focus:bg-white"
              />
            </label>
          </section>

          {message && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                runStatus === "error" || uploadStatus === "error" || manualStatus === "error"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {message}
            </div>
          )}

          <section id="history" className="surface-panel fade-lift rounded-md p-4">
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
                      run?.id === item.id ? "border-accent bg-blue-50" : "border-line bg-white/80 hover:border-blue-200 hover:bg-blue-50/60"
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
              <p className="rounded-md border border-line bg-white/70 p-3 text-sm text-muted">{t.emptyBody}</p>
            )}
          </section>

          {state === "loading" && !run && <StatePanel title={t.loading} body="" loading />}
          {state === "error" && !run && <StatePanel title={t.apiError} body={t.emptyBody} />}
          {state === "empty" && !run && <StatePanel title={t.emptyTitle} body={t.emptyBody} />}

          {run && (
            <>
              <section className="surface-panel fade-lift rounded-md p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">{t.timeline}</h2>
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {t.safeMode}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-5">
                  {run.steps.map((step) => (
                    <div key={step.name} className="step-card rounded-md border border-line p-3">
                      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-accent">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <p className="text-sm font-semibold">{stepLabels[language][step.name] ?? step.name}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)]">
                <div id="jobs" className="surface-panel rounded-md p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold">{t.selectedJobs}</h2>
                    <span className="text-xs text-muted">
                      {run.selected_jobs.length} {language === "zh" ? t.shortlistCount : t.shortlistCount}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {run.selected_jobs.length ? (
                      run.selected_jobs.map((analysis, index) => {
                        const lead = analysis.scored_lead.lead;
                        const isSelected = selectedIndex === index;
                        return (
                          <button
                            key={`${lead.company}-${lead.title}`}
                            type="button"
                            onClick={() => setSelectedIndex(index)}
                            className={`w-full rounded-md border p-3 text-left transition ${
                              isSelected ? "job-card-selected border-accent bg-blue-50" : "job-card border-line bg-white/85 hover:border-blue-200"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{lead.title}</p>
                                <p className="mt-1 text-xs text-muted">{lead.company}</p>
                                <p className="mt-1 text-xs text-muted">{lead.location}</p>
                              </div>
                              <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${scoreTone(analysis.scored_lead.score)}`}>
                                {matchScoreLabel(analysis.scored_lead.score, language)}
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
                      })
                    ) : (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="font-semibold">{t.noJobsTitle}</p>
                        <p className="mt-1 leading-5">{t.noJobsBody}</p>
                      </div>
                    )}
                          </div>
                </div>

                <section className="space-y-5">
                  {selected && (
                    <section className="surface-panel rounded-md p-4">
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
                              <div key={`${match.evidence.section}-${index}`} className="rounded-md border border-line bg-white/75 p-3">
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
                    <section id="drafts" className="surface-panel rounded-md p-4">
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
                        metaLabel={`${t.draftLanguage}: ${draftLanguageName(selectedDraft.communication_language, language)}`}
                        copyLabel={copiedKey === "cover" ? t.copied : t.copy}
                        onCopy={() => void copyText("cover", selectedDraft.cover_letter)}
                      />
                      <TextBlock
                        title={t.recruiterMessage}
                        text={selectedDraft.recruiter_message}
                        metaLabel={`${t.draftLanguage}: ${draftLanguageName(selectedDraft.communication_language, language)}`}
                        copyLabel={copiedKey === "recruiter" ? t.copied : t.copy}
                        onCopy={() => void copyText("recruiter", selectedDraft.recruiter_message)}
                      />
                      <DraftSection title={t.notes} items={selectedDraft.application_notes} />
                    </section>
                  )}
                  {!selectedDraft && (
                    <section id="drafts" className="surface-panel rounded-md p-4">
                      <h2 className="text-base font-semibold">{t.noDraftTitle}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted">{t.noDraftBody}</p>
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
    <section className={`action-panel action-panel-${step} fade-lift rounded-md p-4`}>
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
      <span className="mb-2 block text-sm font-semibold text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value))))}
        className="h-12 w-full rounded-md border border-line bg-white px-3 text-xl font-semibold outline-none focus:border-accent"
      />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold text-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-md border border-line bg-white/85 px-3 text-sm outline-none transition focus:border-accent focus:bg-white"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card min-w-20 rounded-md px-4 py-3">
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-medium text-blue-50">{label}</div>
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

function TextBlock({
  title,
  text,
  copyLabel,
  metaLabel,
  onCopy
}: {
  title: string;
  text: string;
  copyLabel: string;
  metaLabel?: string;
  onCopy: () => void;
}) {
  const copied = copyLabel === translations.en.copied || copyLabel === translations.zh.copied;
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {metaLabel && <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{metaLabel}</span>}
        </div>
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
