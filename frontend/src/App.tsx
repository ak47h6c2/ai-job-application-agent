import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

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

function App() {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);

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
    return run.drafts[selectedIndex] ?? run.drafts.find(
      (draft) =>
        draft.job_title === selected.scored_lead.lead.title &&
        draft.company === selected.scored_lead.lead.company
    );
  }, [run, selected, selectedIndex]);

  if (state === "loading") {
    return (
      <main className="min-h-screen bg-canvas text-ink">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
          <div className="flex items-center gap-3 rounded-md border border-line bg-panel px-5 py-4 shadow-soft">
            <Clock3 className="h-5 w-5 animate-spin text-accent" />
            <span className="text-sm font-medium">Loading latest agent run</span>
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
            <h1 className="text-2xl font-semibold">No dashboard data available</h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              Start the API after running the agent workflow at least once. The UI reads private run reports from
              data/private/agent_runs.
            </p>
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
              <p className="text-sm font-semibold">Job Agent</p>
              <p className="text-xs text-muted">Run {run.id}</p>
            </div>
          </div>

          <nav className="mt-5 space-y-1 text-sm">
            <a className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 font-medium text-accent" href="#overview">
              <BriefcaseBusiness className="h-4 w-4" /> Overview
            </a>
            <a className="flex items-center gap-2 rounded-md px-3 py-2 text-muted hover:bg-slate-50" href="#jobs">
              <Mail className="h-4 w-4" /> Job leads
            </a>
            <a className="flex items-center gap-2 rounded-md px-3 py-2 text-muted hover:bg-slate-50" href="#drafts">
              <FileText className="h-4 w-4" /> Drafts
            </a>
          </nav>

          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" /> Approval gate active
            </div>
            <p className="mt-2 leading-5">External sends and applications are blocked until reviewed manually.</p>
          </div>
        </aside>

        <section className="space-y-6">
          <header id="overview" className="rounded-md border border-line bg-panel p-6 shadow-soft">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm font-medium text-accent">AI Job Application Agent</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Application review dashboard</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{run.goal}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Metric label="Jobs" value={run.selected_jobs.length.toString()} />
                <Metric label="Drafts" value={run.drafts.length.toString()} />
                <Metric label="Steps" value={run.steps.length.toString()} />
              </div>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
            <div className="space-y-6">
              <section className="rounded-md border border-line bg-panel p-5 shadow-soft">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Agent timeline</h2>
                  <span className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-muted">
                    {run.external_actions_blocked ? "Safe mode" : "Actions enabled"}
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
                          <p className="text-sm font-semibold">{step.name.replace(/_/g, " ")}</p>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-muted">
                            {step.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-5 text-muted">{step.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section id="jobs" className="rounded-md border border-line bg-panel p-5 shadow-soft">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Selected jobs</h2>
                  <span className="text-sm text-muted">{run.selected_jobs.length} shortlisted</span>
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
                            <p className="mt-1 text-sm text-muted">{lead.company} - {lead.location}</p>
                          </div>
                          <span className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold ${scoreTone(analysis.scored_lead.score)}`}>
                            {analysis.scored_lead.score}/100
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {analysis.scored_lead.reasons.slice(0, 4).map((reason, reasonIndex) => (
                            <span key={`${reason}-${reasonIndex}`} className="rounded-md bg-white px-2 py-1 text-xs text-muted ring-1 ring-line">
                              {reason}
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
                        Open <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>

                  <div className="mt-5">
                    <h3 className="text-sm font-semibold">Resume evidence</h3>
                    <div className="mt-3 space-y-3">
                      {selected.evidence_matches.length ? (
                        selected.evidence_matches.slice(0, 3).map((match, matchIndex) => (
                          <div key={`${match.evidence.section}-${match.score}-${matchIndex}`} className="rounded-md border border-line bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold uppercase tracking-normal text-muted">
                                {match.evidence.section}
                              </span>
                              <span className="text-xs text-muted">{match.score} pts</span>
                            </div>
                            <p className="mt-2 text-sm leading-5 text-ink">{firstLines(match.evidence.text)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-md border border-line bg-slate-50 p-3 text-sm text-muted">
                          No strong resume evidence found for this role.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h3 className="text-sm font-semibold">Missing keywords</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selected.missing_keywords.length ? (
                        selected.missing_keywords.slice(0, 8).map((keyword) => (
                          <span key={keyword} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                            {keyword}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                          no obvious keyword gap
                        </span>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {selectedDraft && (
                <section id="drafts" className="rounded-md border border-line bg-panel p-5 shadow-soft">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Application draft</h2>
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <UserCheck className="h-3.5 w-3.5" /> review required
                    </span>
                  </div>

                  <DraftSection title="Resume focus" items={selectedDraft.resume_focus} />
                  <TextBlock title="Cover letter" text={selectedDraft.cover_letter} />
                  <TextBlock title="Recruiter message" text={selectedDraft.recruiter_message} />
                  <DraftSection title="Notes" items={selectedDraft.application_notes} />
                </section>
              )}
            </section>
          </section>
        </section>
      </div>
    </main>
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
        {items.map((item) => (
          <li key={item} className="rounded-md border border-line bg-slate-50 px-3 py-2 text-sm leading-5 text-ink">
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
