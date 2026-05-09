# Changelog / 更新日志

## 2026-05-10

### English

- Reworked the GitHub README into a portfolio-style project page with background, usage instructions, version highlights, architecture diagram, and safety boundaries.
- Added a manual job-post workflow in the Web UI for LinkedIn, Seek, company sites, and other non-email job sources.
- Added `POST /api/manual-jobs`, which matches a pasted job description against the uploaded resume index and generates application materials with the same human approval gate.
- Manual job drafts still detect the employer communication language, so Australia-facing roles generate English cover letters and recruiter messages even when the UI is Chinese.

### 中文

- 重写 GitHub README，让首页更像作品展示页：包含项目背景、使用方法、版本摘要、架构图和安全边界。
- Web UI 新增“手动岗位”入口，可以把 LinkedIn、Seek、公司官网、Boss、猎聘等平台上的岗位 JD 粘贴进来生成申请材料。
- 新增 `POST /api/manual-jobs` 接口，会用已上传简历和粘贴的岗位描述做匹配，并生成简历修改建议、求职信和招聘方消息。
- 手动岗位同样会判断招聘方沟通语言：澳洲/英文岗位默认生成英文求职信和英文消息，中文岗位才生成中文消息。

## 2026-05-09

### English

- Hardened resume upload state handling with a timeout, cancel action, clearer parsing status, and unique backend temp files for repeated uploads.
- Cover letters and recruiter messages now use the detected job communication language, so Australia-facing roles get English drafts even when the UI and resume are Chinese.
- Added visible draft-language chips in the Web UI.
- Refreshed the Web UI visual system with a darker navigation rail, guided hero area, tinted panels, hover motion, and clearer active states.
- Chinese mode now generates Chinese resume advice, cover letters, recruiter messages, run steps, and Markdown headings.
- Resume upload feedback now shows detected resume sections and keywords, so users can see what the PDF parser understood.
- Added cross-language matching so English job titles can match Chinese resume evidence such as software development, testing, databases, and projects.
- Added clear empty states when no jobs meet the selected match threshold.
- Renamed score controls and job badges from generic “score” wording to clearer resume-job “match” wording.
- Reworked Chinese UI copy to use natural job-search language instead of literal translations.
- Added Chinese resume section support for local resume indexing, including skills, education, internship, and project sections.
- Added a clear upload error when a PDF has no readable text, such as a scanned image resume.
- Redesigned the Web UI around a shorter three-step flow: upload resume, choose mail range, start scan.
- Added browser-based resume PDF upload and local resume index generation.
- Added a browser-based mail scan workbench for starting safe Agent runs from the Web UI.
- Added quick scan ranges: today, yesterday, last 3 days, last 7 days, and custom start date.
- Added recent run history so previous Agent reports can be opened from the dashboard.
- Added copy actions for cover letter and recruiter message drafts.
- Improved loading states, responsive layout, bilingual labels, and dashboard visual hierarchy.
- Added a local `POST /api/runs` API endpoint for creating new private Agent run reports.

Safety note: the Agent still stops at the human approval gate. It does not send emails or submit applications automatically.

### 中文

- 优化简历上传状态：新增超时处理、取消按钮、解析中提示，并让后端连续上传时使用独立临时文件，避免卡在“上传中”。
- 求职信和招聘方消息现在会按岗位沟通语言生成：澳洲/英文岗位默认英文，中国岗位才默认中文。
- Web UI 新增“草稿语言”标识，避免用户误以为中文界面一定生成中文求职信。
- 重新调整 Web UI 视觉系统：深色导航、强化顶部引导、半透明信息面板、悬停动效和更明确的选中状态。
- 中文模式现在会用中文生成简历修改建议、求职信、招聘方消息、流程说明和 Markdown 标题。
- 上传简历后会直接显示已识别的简历模块和关键词，让用户知道 PDF 到底有没有被读懂。
- 新增中英文关键词匹配，英文岗位也能匹配中文简历里的软件开发、测试、数据库、项目经历等证据。
- 当没有职位达到最低匹配度时，页面会明确提示如何调整，而不是留空。
- 把“最低分”等容易误解的说法改成“最低匹配度”，职位卡片也显示为“匹配度”。
- 重写中文界面文案，尽量使用求职场景里的自然说法，减少翻译腔。
- 简历索引支持中文标题，例如“专业技能”“教育经历”“实习经历”“项目经历”。
- 如果 PDF 简历读不到文字，会在页面上给出明确提示，避免上传后像是没有反应。
- 重新设计 Web UI，改成更短的三步流程：上传简历、选择邮件范围、开始扫描。
- 新增浏览器上传 PDF 简历，并在本地生成简历证据索引。
- 新增网页端邮件扫描工作台，可以直接从 Web UI 启动安全 Agent 工作流。
- 新增快捷扫描范围：今天、昨天起、近 3 天、近 7 天、自定义开始日期。
- 新增最近运行记录，可以从控制台打开历史 Agent 报告。
- 新增求职信和招聘方消息的一键复制功能。
- 优化加载状态、响应式布局、中英双语标签和整体视觉层级。
- 新增本地 `POST /api/runs` API，用于生成新的私有 Agent 运行报告。

安全说明：Agent 仍然会停在人工确认关卡，不会自动发送邮件，也不会自动提交求职申请。
