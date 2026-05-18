# AI Job Application Agent User Manual / 使用手册

This manual explains how to use the Web UI safely and effectively.

本手册说明如何安全、清晰地使用这个 Web UI 完成求职材料准备。

## 1. What This Tool Does / 这个工具能做什么

**中文**

这个项目是一个本地优先的 AI 求职申请助手。它不会自动投递，也不会自动发送邮件。它的核心作用是：

- 读取你的简历 PDF，建立本地简历证据索引。
- 从 QQ 邮箱里的求职邮件中找岗位线索。
- 自动尝试读取邮件里的岗位链接，尽量拿到真实 JD。
- 将岗位要求和简历内容做匹配，给出推荐岗位、可补关键词和简历/项目补强建议。
- 生成求职信草稿、招聘方消息和简历修改重点，最后由你人工确认。
- 把准备过的岗位记录到本地投递看板。

**English**

This project is a local-first AI job application assistant. It does not auto-apply and does not send emails automatically. It helps you:

- Read your resume PDF and build a local resume evidence index.
- Find job leads from QQ Mail job-related emails.
- Try to read job links from emails and retrieve the real JD when possible.
- Match job requirements against resume evidence.
- Generate cover letter drafts, recruiter messages, and resume improvement notes for human review.
- Track prepared applications locally.

## 2. Main Screen / 主界面

![Overview](assets/manual/01-overview.png)

**截图注释 / Screenshot notes**

- 左侧导航用于切换流程：总览、开始、单个岗位、推荐职位、申请包、投递记录、历史记录。
- 顶部目标区告诉你当前流程是否已经准备好简历、岗位信息和草稿。
- 右侧主内容区是实际操作区，页面可以正常上下滚动。
- The left navigation moves between Overview, Setup, One Job, Jobs, Drafts, Applications, and History.
- The goal panel shows whether resume, job source, and drafts are ready.
- The main content area is where you work; the page supports normal scrolling.

## 3. Setup: Resume And Mail Scan / 开始：简历和邮箱扫描

![Setup](assets/manual/02-setup-resume-mail.png)

**中文**

1. 在“开始”区域先上传或更换简历 PDF。
2. 如果页面显示“简历已准备好”，说明系统已经识别出简历内容，可以用于匹配。
3. 选择邮件读取日期，例如今天、昨天起、近 3 天或近 7 天。
4. 设置本次最多准备几份草稿。
5. 点击“扫描邮件、读取链接并生成草稿”。

注意：QQ 邮箱授权码只用于本地读取你的邮箱。不要把授权码发给招聘方，也不要写进 GitHub。

**English**

1. Upload or replace your resume PDF in the Setup area.
2. If the UI shows the resume is ready, the system has extracted resume evidence for matching.
3. Choose the mail scan date range: today, since yesterday, last 3 days, or last 7 days.
4. Choose how many drafts to prepare.
5. Click the scan button to read mail, hydrate links, and generate drafts.

Note: your QQ Mail authorization code is only for local mailbox access. Do not send it to employers and do not commit it to GitHub.

## 4. One Job Mode / 单个岗位模式

![One job](assets/manual/03-manual-job.png)

**中文**

当你已经有一个明确岗位时，用“单个岗位”更直接：

- 自动读取：适合公开岗位链接。
- 登录浏览器导入：适合 LinkedIn、Seek、公司官网等需要登录的网站。先在专用浏览器里登录，再回到 Web UI 读取当前岗位页。
- 手动粘贴：最稳定。把岗位名称、公司、地点、链接和完整 JD 粘贴进去。

建议：如果自动读取出来像搜索结果、推荐职位列表或公司职位总览，不要直接生成材料。打开具体岗位详情页，或改用手动粘贴完整 JD。

**English**

Use One Job mode when you already have a specific role:

- Auto read: works best for public job links.
- Logged-in browser import: useful for LinkedIn, Seek, company career sites, and other pages that require login.
- Manual paste: the most reliable option. Paste the title, company, location, link, and full JD.

Recommendation: if the imported text looks like search results, recommended jobs, or a company job list, do not generate materials from it. Open one specific job detail page or paste the full JD manually.

## 5. Recommended Jobs / 推荐职位

![Jobs](assets/manual/04-jobs-results.png)

**中文**

“推荐职位”区域用于查看系统筛选出的岗位。这里重点看：

- 匹配度：岗位要求和简历证据的接近程度。
- 推荐原因：为什么这个岗位值得处理。
- 可补关键词：简历或项目里还不够明显的关键词。
- 简历与项目补强：把缺失关键词转成可执行的项目功能或简历 bullet point。

匹配度不是录取概率，只是“这份简历和这个 JD 的内容接近程度”。

**English**

The Jobs area shows shortlisted roles. Focus on:

- Match level: how close the resume evidence is to the JD.
- Recommendation reason: why this role is worth reviewing.
- Keyword gaps: terms that are not strong enough in the resume/project evidence.
- Resume and project improvement plan: actionable portfolio or resume bullet upgrades.

The match level is not an admission or hiring probability. It is a content match between your resume and the JD.

## 6. Draft Review / 申请包与草稿检查

![Drafts](assets/manual/05-drafts-review.png)

**中文**

生成后的材料会集中在“申请包”：

1. 先看“简历修改重点”，决定是否要改简历。
2. 再看求职信草稿。澳洲或英文岗位通常会生成英文草稿；中国公司或中文 JD 通常生成中文草稿。
3. 最后看招聘方消息，用于邮件、LinkedIn 私信或招聘平台消息。
4. 所有草稿都需要你人工确认后再复制使用。

**English**

Generated materials are grouped in Drafts:

1. Review resume edit notes first.
2. Review the cover letter draft. Australian or English-language roles usually produce English drafts; Chinese JDs usually produce Chinese drafts.
3. Review the recruiter message for email, LinkedIn, or job platform outreach.
4. Always review manually before copying or sending.

## 7. Application Board / 投递记录

![Applications](assets/manual/06-application-board.png)

**中文**

“投递记录”用于跟踪岗位状态。你可以把岗位标记为：

- 待检查
- 材料已生成
- 已投递
- 等回复
- 面试中
- 已拒绝

这个看板只保存在本地，用于帮你避免重复投递和忘记跟进。

**English**

The Application Board tracks application status locally. You can mark roles as:

- Needs review
- Materials ready
- Applied
- Waiting
- Interviewing
- Rejected

This board is local-only and helps avoid duplicate applications and missed follow-ups.

## 8. Mail Review Queue / 邮件复查队列

**中文**

如果扫描结果显示某些来源“建议复查”或“部分需复查”，说明系统看到了求职相关邮件，但没有足够信息解析成结构化岗位。此时：

1. 打开“复查队列”。
2. 点击“读取邮件”。
3. 看邮件摘要和识别出的链接。
4. 如果内容有价值，点击“带到单个岗位”。
5. 在“单个岗位”里补全 JD 后再生成材料。

**English**

If a source is marked as needs review or partial, the system found job-related mail but could not parse a structured job lead. In that case:

1. Open the Review Queue.
2. Click Read mail.
3. Check the preview and detected links.
4. If it is useful, move it to One Job.
5. Complete the JD in One Job before generating materials.

## 9. Safe Usage Rules / 安全使用原则

**中文**

- 不要把邮箱授权码、密码或个人敏感信息提交到 GitHub。
- 不要直接发送 AI 草稿，先人工检查语气、事实和岗位名称。
- 不要把岗位列表页当作 JD。必须使用单个岗位详情页。
- 生成材料只是第一版，不代表已经可以直接投递。

**English**

- Do not commit mailbox authorization codes, passwords, or sensitive personal data to GitHub.
- Do not send AI drafts without checking tone, facts, and role details.
- Do not use job list pages as JDs. Use one specific job detail page.
- Generated materials are first drafts, not final applications.

