# AI Job Application Agent / AI 求职申请 Agent

> A bilingual, human-approved job application agent for the China-Australia job market.
> 面向中澳求职市场的双语求职 Agent：读取职位邮件、匹配简历、生成申请草稿，并在任何外部动作前等待人工确认。

## Quick Links / 快速入口

- [Latest Changelog / 最新更新日志](./CHANGELOG.md)
- [Architecture Notes / 架构说明](./docs/architecture.md)
- [Backend API](./backend/app/api.py)
- [React Web UI](./frontend/src/App.tsx)

## English Overview

This project is an AI-assisted job application workflow designed for candidates applying across Australia and China-facing roles. It connects job-alert emails, resume evidence retrieval, and draft generation into a safe local workflow.

The agent can:

- Scan QQ Mail for job-related emails by date range.
- Parse job-alert emails into structured job leads.
- Match job leads against a resume profile and local resume evidence.
- Retrieve resume evidence with a lightweight local RAG flow.
- Surface missing keywords such as cloud, AWS, agent, RAG, or LLM.
- Generate cover letter drafts, recruiter messages, and resume focus notes.
- Stop at a human approval gate before any email sending or job application action.
- Present results in a bilingual Chinese-English Web UI.

### Current Web UI

The dashboard is now an application workbench:

- Choose a scan range: today, yesterday, last 3 days, last 7 days, or custom date.
- Start the safe agent workflow from the browser.
- Review recent agent runs.
- Compare shortlisted jobs and match scores.
- Inspect resume evidence and missing keywords.
- Copy cover letter and recruiter message drafts.
- Switch interface labels between Chinese and English.

### Why This Matters

For Australian roles, the project emphasizes English application materials, evidence-backed resume tailoring, and safe human review.
For China-facing AI/LLM roles, it demonstrates practical agent architecture, tool use, RAG-style retrieval, email ingestion, and bilingual product thinking.

## 中文说明

这是一个面向中澳求职场景的 AI 求职申请 Agent。它不是自动海投工具，而是一个“人类确认优先”的求职工作流：先从邮箱里找职位，再结合简历做匹配，最后生成申请材料草稿，所有外部发送和投递动作都必须人工确认。

这个项目可以展示：

- 从 QQ 邮箱读取求职相关邮件。
- 把招聘邮件解析成结构化职位线索。
- 将职位要求和简历能力做匹配评分。
- 用本地简历证据做轻量 RAG 检索。
- 找出简历里可能缺失的关键词，例如 cloud、AWS、agent、RAG、LLM。
- 生成求职信、招聘方消息、简历修改重点。
- 在任何发邮件或正式投递之前停下来等待人工审核。
- 用中英双语 Web UI 展示完整工作流。

### 当前 Web UI 功能

现在的界面已经从“结果看板”升级成“申请工作台”：

- 可以选择扫描范围：今天、昨天起、近 3 天、近 7 天、自定义日期。
- 可以直接从网页启动安全 Agent 工作流。
- 可以查看最近运行记录。
- 可以查看入选职位、匹配分数、推荐原因。
- 可以查看简历证据和缺失关键词。
- 可以复制求职信和招聘方消息草稿。
- 可以在中文和英文界面之间切换。

### 面向中澳求职市场的定位

澳洲求职侧重点：

- 英文求职信和 recruiter message。
- 简历证据和岗位要求匹配。
- 本地隐私保护，不上传原始邮箱数据。
- 人工确认后再投递。

国内大模型/AI 求职侧重点：

- Agent 工作流设计。
- Tool use / 外部工具调用。
- RAG / 简历证据检索。
- 邮件解析和结构化抽取。
- 双语产品和工程展示。

## Project Structure / 项目结构

```text
backend/
  app/
    api.py                 # FastAPI local API for the Web UI
    cli.py                 # Command-line workflows
    parsers/               # Job email parsing
    rag/                   # Resume evidence indexing and retrieval
    services/              # Matching, ingestion, drafting, agent workflow
data/
  sample_emails/           # Synthetic examples only
docs/
frontend/
  src/App.tsx              # Bilingual React dashboard
tests/
```

Private files are written under `data/private/`, which is ignored by Git.

私有邮件扫描结果、简历索引和 Agent 运行报告都会写入 `data/private/`，该目录不会提交到 GitHub。

## Quick Start / 快速开始

Run tests:

```powershell
python -m unittest discover -s tests
```

Build a private resume evidence index:

```powershell
python -m backend.app.cli build-resume-index --resume-pdf "C:\path\to\resume.pdf"
```

Start the backend API:

```powershell
python -m backend.app.api
```

Start the Web UI in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

You can also run the safe agent workflow from the command line:

```powershell
python -m backend.app.cli run-agent --since 2026-05-08 --top 3
```

## Safety Rules / 安全规则

- Do not commit `.env`, email authorization codes, API keys, personal raw mailbox exports, or private resume outputs.
- Do not fully automate job applications without a human confirmation step.
- Keep sample data synthetic or sanitized before pushing to GitHub.
- The current agent generates local drafts only. It does not send emails or submit applications automatically.

- 不提交 `.env`、邮箱授权码、API key、原始邮箱导出或私人简历结果。
- 不做无人确认的自动投递。
- GitHub 示例数据必须是合成数据或脱敏数据。
- 当前 Agent 只生成本地草稿，不会自动发邮件或自动投递。
