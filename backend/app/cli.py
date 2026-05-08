from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

from backend.app.parsers.job_email_parser import parse_job_email
from backend.app.rag.resume_index import build_and_save_resume_index, load_resume_index
from backend.app.sample_profile import DEFAULT_PROFILE
from backend.app.services.application_analysis import analyze_ranked_leads
from backend.app.services.email_ingestion import scan_qq_mail_for_jobs
from backend.app.services.matcher import rank_job_leads


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_EMAIL_DIR = PROJECT_ROOT / "data" / "sample_emails"
PRIVATE_DATA_DIR = PROJECT_ROOT / "data" / "private"
DEFAULT_RESUME_INDEX_PATH = PRIVATE_DATA_DIR / "resume_index.json"


def load_sample_emails() -> list[tuple[str, str]]:
    samples: list[tuple[str, str]] = []
    for path in sorted(SAMPLE_EMAIL_DIR.glob("*.txt")):
        samples.append((path.name, path.read_text(encoding="utf-8")))
    return samples


def command_parse_samples(_args: argparse.Namespace) -> int:
    leads = []
    for source_name, text in load_sample_emails():
        leads.extend(parse_job_email(text, source=source_name))
    print(json.dumps([lead.to_dict() for lead in leads], indent=2))
    return 0


def command_rank_samples(args: argparse.Namespace) -> int:
    leads = []
    for source_name, text in load_sample_emails():
        leads.extend(parse_job_email(text, source=source_name))

    ranked = rank_job_leads(leads, DEFAULT_PROFILE)
    resume_index = load_resume_index(Path(args.resume_index)) if args.resume_index else None
    print_ranked_results(ranked[: args.limit], resume_index=resume_index)
    return 0


def print_ranked_results(ranked, *, resume_index=None, evidence_limit: int = 2) -> None:
    analyses = analyze_ranked_leads(ranked, resume_index, top_k=evidence_limit) if resume_index else []
    analysis_by_title = {
        analysis.scored_lead.lead.title: analysis
        for analysis in analyses
    }

    for index, scored in enumerate(ranked, start=1):
        lead = scored.lead
        print(f"{index}. {lead.title} | {lead.company} | {lead.location}")
        print(f"   score: {scored.score}/100")
        if scored.reasons:
            print(f"   why: {', '.join(scored.reasons)}")
        if lead.url:
            print(f"   url: {lead.url}")

        analysis = analysis_by_title.get(lead.title)
        if analysis:
            if analysis.evidence_matches:
                print("   resume evidence:")
                for match in analysis.evidence_matches[:evidence_limit]:
                    text = match.evidence.text
                    snippet = text[:180] + ("..." if len(text) > 180 else "")
                    print(f"   - {match.evidence.section}: {snippet}")
            if analysis.missing_keywords:
                print(f"   missing keywords: {', '.join(analysis.missing_keywords[:8])}")
        print()


def command_build_resume_index(args: argparse.Namespace) -> int:
    resume_pdf = Path(args.resume_pdf)
    output_path = Path(args.output) if args.output else DEFAULT_RESUME_INDEX_PATH
    index = build_and_save_resume_index(resume_pdf, output_path)
    print(f"Built resume evidence index: {len(index)} chunks")
    print(f"Saved private index: {output_path}")
    return 0


def command_scan_qq_mail(args: argparse.Namespace) -> int:
    since = args.since or date.today().isoformat()
    output_path = Path(args.output) if args.output else PRIVATE_DATA_DIR / f"qq_mail_jobs_{since}.json"
    resume_index_path = Path(args.resume_index) if args.resume_index else DEFAULT_RESUME_INDEX_PATH
    resume_index = load_resume_index(resume_index_path) if resume_index_path.exists() else None
    result = scan_qq_mail_for_jobs(
        since=since,
        folder=args.folder,
        limit=args.limit,
        candidate_limit=args.candidate_limit,
        max_chars=args.max_chars,
        resume_index=resume_index,
        output_path=output_path,
    )

    print(f"Scanned messages: {len(result.scanned_messages)}")
    print(f"Job-related messages: {len(result.job_messages)}")
    print(f"Extracted job leads: {len(result.leads)}")
    print(f"Saved private result: {output_path}")
    if resume_index:
        print(f"Resume evidence index: {resume_index_path}")
    print()

    ranked = result.ranked[: args.show]
    if not ranked:
        print("No ranked job leads found.")
        return 0

    print("Top matches:")
    print_ranked_results(ranked, resume_index=resume_index, evidence_limit=args.evidence)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI Job Application Agent prototype CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_samples = subparsers.add_parser("parse-samples", help="Parse sample job emails as JSON")
    parse_samples.set_defaults(func=command_parse_samples)

    rank_samples = subparsers.add_parser("rank-samples", help="Rank sample job leads against the default profile")
    rank_samples.add_argument("--limit", type=int, default=10, help="Maximum jobs to print")
    rank_samples.add_argument("--resume-index", default=None, help="Optional private resume index JSON path")
    rank_samples.set_defaults(func=command_rank_samples)

    resume_index = subparsers.add_parser("build-resume-index", help="Build a private resume evidence index from a PDF")
    resume_index.add_argument("--resume-pdf", required=True, help="Path to your resume PDF")
    resume_index.add_argument("--output", default=None, help="Private output path; defaults to data/private/resume_index.json")
    resume_index.set_defaults(func=command_build_resume_index)

    scan_qq = subparsers.add_parser("scan-qq-mail", help="Scan QQ Mail for job leads and save private results")
    scan_qq.add_argument("--since", default=None, help="IMAP since date in YYYY-MM-DD format; defaults to today")
    scan_qq.add_argument("--folder", default="INBOX", help="QQ Mail folder to scan")
    scan_qq.add_argument("--limit", type=int, default=50, help="Maximum message summaries to scan")
    scan_qq.add_argument("--candidate-limit", type=int, default=250, help="Maximum recent messages to consider")
    scan_qq.add_argument("--max-chars", type=int, default=12000, help="Maximum characters to read per email")
    scan_qq.add_argument("--show", type=int, default=10, help="Number of ranked results to print")
    scan_qq.add_argument("--evidence", type=int, default=2, help="Resume evidence snippets to print per job")
    scan_qq.add_argument("--resume-index", default=None, help="Resume index JSON path; defaults to data/private/resume_index.json")
    scan_qq.add_argument("--output", default=None, help="Private JSON output path")
    scan_qq.set_defaults(func=command_scan_qq_mail)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
