# Architecture Notes

## Goal

Build a human-approved agent workflow for job search:

1. Collect job leads from email alerts.
2. Extract structured job data.
3. Compare each job against the user's resume profile.
4. Generate application material drafts.
5. Ask for human approval before any sending or application action.

## Milestones

### Milestone 1: Local parser prototype

- Input: sample job-alert email text.
- Output: ranked job leads.
- No external APIs.
- No private mailbox data committed.

### Milestone 2: Real email ingestion

- Connect QQ Mail as a tool.
- Fetch job-related emails.
- Store extracted leads locally.

### Milestone 3: Resume RAG

- Parse resume PDF.
- Build a small resume knowledge base.
- Retrieve relevant resume evidence for a target job.

### Milestone 4: Application assistant

- Draft cover letters.
- Draft recruiter messages.
- Suggest resume bullet edits.
- Require human confirmation before any external action.

### Milestone 5: Web dashboard

- Track job leads, status, generated drafts, and next actions.
