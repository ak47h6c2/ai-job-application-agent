# AI Job Application Agent

An AI-assisted job application workflow that parses job-alert emails, matches roles against a resume profile, and prepares application materials with human approval.

This project is intentionally built in small stages so it can become both a useful personal job-search tool and a portfolio project for AI agent / LLM application roles.

## Current Milestone

Milestone 1 is a local Python prototype:

- Parse job-alert email text into structured job leads.
- Score each job lead against a simple resume profile.
- Print ranked results from the command line.
- Keep secrets and real email content out of GitHub.

Later milestones will add:

- QQ Mail ingestion through tools.
- Resume PDF parsing and RAG.
- Cover letter and application-answer generation.
- Human approval before any send or application action.
- A web dashboard.

## Project Structure

```text
backend/
  app/
    cli.py
    parsers/
    services/
    sample_profile.py
data/
  sample_emails/
docs/
tests/
```

## Quick Start

Run the sample parser:

```powershell
python -m backend.app.cli rank-samples
```

Scan QQ Mail for job leads and save the private result locally:

```powershell
python -m backend.app.cli scan-qq-mail --since 2026-05-08
```

The scan output is written to `data/private/`, which is ignored by Git.

Build a private resume evidence index from a PDF:

```powershell
python -m backend.app.cli build-resume-index --resume-pdf "C:\path\to\resume.pdf"
```

After the index exists, QQ Mail scans also show resume evidence and missing keywords:

```powershell
python -m backend.app.cli scan-qq-mail --since 2026-05-08 --show 5
```

Run the safe agent workflow:

```powershell
python -m backend.app.cli run-agent --since 2026-05-08 --top 3
```

The agent writes a private run report and Markdown drafts under `data/private/agent_runs/`.
It never sends emails or submits applications.

Optional applicant fields for private draft generation:

```powershell
$env:APPLICANT_NAME="Your Name"
$env:APPLICANT_SUMMARY="a Master of IT student with experience in Python, SQL, C, testing, and engineering validation"
```

Start the Web UI:

```powershell
python -m backend.app.api
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

The dashboard supports Chinese and English UI labels from the language switcher in the sidebar.
Use the mail scan workbench to choose today, yesterday, the last 3 days, the last 7 days, or a custom start date, then run the safe agent workflow from the browser.

Run tests:

```powershell
python -m unittest discover -s tests
```

## What This Project Demonstrates

- Structured extraction from messy job-alert emails.
- Early agent-tool thinking: email is treated as an external tool/source.
- QQ Mail ingestion through a local MCP tool boundary.
- Local resume RAG: PDF resume text is chunked into evidence and retrieved for each job.
- Safe agent workflow: shortlist jobs, generate application drafts, and stop at a human approval gate.
- Web UI dashboard for reviewing agent runs, shortlisted jobs, resume evidence, and drafts.
- Human-centered workflow design for job applications.

## Safety Rules

- Do not commit `.env`, email authorization codes, API keys, or personal raw mailbox exports.
- Do not fully automate job applications without a human confirmation step.
- Keep sample data synthetic or sanitized before pushing to GitHub.
