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

Run tests:

```powershell
python -m unittest discover -s tests
```

## What This Project Demonstrates

- Structured extraction from messy job-alert emails.
- Early agent-tool thinking: email is treated as an external tool/source.
- Resume-to-job matching logic that will later become RAG-based.
- Human-centered workflow design for job applications.

## Safety Rules

- Do not commit `.env`, email authorization codes, API keys, or personal raw mailbox exports.
- Do not fully automate job applications without a human confirmation step.
- Keep sample data synthetic or sanitized before pushing to GitHub.
