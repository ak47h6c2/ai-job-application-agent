import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Languages,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

const translations = {
  en: {
    loading: "Loading latest agent run",
    emptyTitle: "No dashboard data available",
    emptyBody:
      "Start the API after running the agent workflow at least once. The UI reads private run reports from data/private/agent_runs.",
    appName: "Job Agent",
    runLabel: "Run",
    overview: "Overview",
    jobLeads: "Job leads",
    drafts: "Drafts",
    approvalTitle: "Approval gate active",
    approvalBody: "External sends and applications are blocked until reviewed manually.",
    productName: "AI Job Application Agent",
    dashboardTitle: "Application review dashboard",
    heroSubtitle:
      "Find job-related emails, match them against the resume, generate application drafts, and stop before any external application action.",
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
    chinese: "中文"
  },
  zh: {
    loading: "正在加载最新 Agent 运行结果",
    emptyTitle: "暂无可展示的控制台数据",
    emptyBody:
      "请先运行一次 Agent 工作流，再启动 API。这个界面会读取 data/private/agent_runs 下的本地私有运行报告。",
    appName: "求职 Agent",
    runLabel: "运行",
    overview: "总览",
    jobLeads: "职位线索",
    drafts: "申请草稿",
    approvalTitle: "人工确认已开启",
    approvalBody: "所有外部发送和正式投递都会先被拦截，必须人工检查后再处理。",
    productName: "AI 求职申请 Agent",
    dashboardTitle: "申请审核控制台",
    heroSubtitle:
      "从求职邮件中提取职位，结合简历做匹配，生成申请草稿，并在任何外部投递动作前停下来等待人工确认。",
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
    chinese: "中文"
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

type Language = keyof typeof translations;

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

type LoadState = "loading" | "ready" | "empty" | "error";

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

function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const t = translations[language];

  useEffect(() => {
    window.localStorage.setItem("job-agent-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    async function loadRun() {
      try {
        const response = await fetch(`${API_BASE}/api/runs/latest`);
        if (response.status === 404) {
          setState("empty");
          return;
        }
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = (await response.json()) as AgentRun;
        setRun(data);
        setState("ready");
      } catch {
        setState("error");
      }
    }
    loadRun();
  }, []);

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

  if (state === "loading") {
    return (
      <main className="min-h-screen bg-canvas text-ink">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
          <div className="flex items-center gap-3 rounded-md border border-line bg-panel px-5 py-4 shadow-soft">
            <Clock3 className="h-5 w-5 animate-spin text-accent" />
            <span className="text-sm font-medium">{t.loading}</span>
          </div>
        </div>
      </main>
    );
  }

  if (state === "error" || state === "empty" || !run) {
    return (
      <main className="min-h-screen bg-canvas text-ink">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
          <section className="rounded-md border border-line bg-panel p-8 shadow-soft">
            <AlertTriangle className="mb-4 h-7 w-7 text-warning" />
            <h1 className="text-2xl font-semibold">{t.emptyTitle}</h1>
            <p className="mt-3 text-sm leading-6 text-muted">{t.emptyBody}</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-5 py-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-md border border-line bg-panel p-4 shadow-soft lg:sticky lg:top-6 lg:h-[calc(100vh-48px)]">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t.appName}</p>
              <p className="text-xs text-muted">
                {t.runLabel} {run.id}
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
                <Metric label={t.jobs} value={run.selected_jobs.length.toString()} />
                <Metric label={t.drafts} value={run.drafts.length.toString()} />
                <Metric label={t.steps} value={run.steps.length.toString()} />
              </div>
            </div>
          </header>

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
                    {language === "zh"
                      ? `${run.selected_jobs.length}${t.shortlisted}`
                      : `${run.selected_jobs.length} ${t.shortlisted}`}
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
                  <TextBlock title={t.coverLetter} text={selectedDraft.cover_letter} />
                  <TextBlock title={t.recruiterMessage} text={selectedDraft.recruiter_message} />
                  <DraftSection title={t.notes} items={selectedDraft.application_notes} />
                </section>
              )}
            </section>
          </section>
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

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="whitespace-pre-wrap rounded-md border border-line bg-slate-50 p-3 text-sm leading-6 text-ink">
        {text}
      </div>
    </section>
  );
}

export default App;
