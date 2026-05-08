from __future__ import annotations

import argparse
import json
from pathlib import Path

from backend.app.parsers.job_email_parser import parse_job_email
from backend.app.sample_profile import DEFAULT_PROFILE
from backend.app.services.matcher import rank_job_leads


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_EMAIL_DIR = PROJECT_ROOT / "data" / "sample_emails"


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
    limit = args.limit or len(ranked)
    for index, scored in enumerate(ranked[:limit], start=1):
        lead = scored.lead
        print(f"{index}. {lead.title} | {lead.company} | {lead.location}")
        print(f"   score: {scored.score}/100")
        if scored.reasons:
            print(f"   why: {', '.join(scored.reasons)}")
        if lead.url:
            print(f"   url: {lead.url}")
        print()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI Job Application Agent prototype CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_samples = subparsers.add_parser("parse-samples", help="Parse sample job emails as JSON")
    parse_samples.set_defaults(func=command_parse_samples)

    rank_samples = subparsers.add_parser("rank-samples", help="Rank sample job leads against the default profile")
    rank_samples.add_argument("--limit", type=int, default=10, help="Maximum jobs to print")
    rank_samples.set_defaults(func=command_rank_samples)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
