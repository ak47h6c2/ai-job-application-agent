# Changelog / 更新日志

## 2026-05-14

### English

- Simplified the Web UI into one application workbench instead of separate setup and job-source panels.
- Moved resume status, mail range, match threshold, job-source modes, JD fields, and generation actions into a clearer two-column workflow.
- Reduced repeated buttons and long instructional blocks while keeping automatic link reading, logged-in import, manual paste, resume upload, and mail scanning behavior unchanged.
- Fixed a React duplicate-key warning when two job leads share the same company and title.

### 中文

- 将 Web UI 简化成一个求职申请工作台，不再把上传简历、扫描邮件、岗位来源和生成材料拆得太散。
- 把简历状态、邮件范围、匹配度阈值、岗位来源模式、JD 表单和生成按钮整合为左右两栏流程。
- 减少重复按钮和大段说明文字，但保留自动读取链接、登录后导入、手动粘贴、上传简历和读取邮件的原有功能。
- 修复当两个岗位线索公司和标题相同时可能出现的 React key 警告。

## 2026-05-10

### English

- Added a dedicated Playwright login browser with a persistent local profile, so blocked job links can be opened for manual login and then read from the current logged-in page without installing a browser extension.
- Fixed the dedicated login browser flow so restored personal tabs are closed, closed Playwright sessions recover cleanly, and login or verification pages are not imported as job descriptions.
- Improved the logged-in job import UX with visible timeouts, mutually exclusive open/read actions, a separate "email lead only" note, and LinkedIn JD cleanup so company pages, similar jobs, and footers are not mixed into the job description.
- Added a direct post-email workflow in the selected job panel: users can now click "Read link and generate" to fetch the job link from the email lead and generate materials; blocked links fall back to the manual JD input with a clear prompt.
- Reworked the logged-in browser import UI into a three-step card flow: drag the import button to the bookmarks bar, use it on a real job detail page, then return to the Web UI to load the imported role.
- Added Windows quick-start scripts: `start-webui.bat` for double-click launch and `start-webui.ps1` for PowerShell launch, including backend/frontend readiness checks and browser opening.
- Added a logged-in browser import mode for job descriptions: users log in on LinkedIn, Seek, Boss, Liepin, or a company career site, open a job page, and use a bookmarklet to send the current job text to the local agent.
- Added `POST /api/imported-jobs` and `POST /api/imported-jobs/form` for saving browser-imported job posts locally without storing platform credentials.
- Updated the Web UI job-source area from two modes to three modes: public-link auto read, logged-in browser import, and manual paste fallback.
- Upgraded the job-source workflow into two modes: automatic public-link reading and manual JD paste fallback.
- Added `POST /api/job-url-preview` to extract title, company, location, and description from public job pages using HTML metadata and JSON-LD JobPosting data.
- Fixed automatic job-link reading so login, captcha, or access-blocked pages are not mistaken for real job posts.
- Reworked the GitHub README into a portfolio-style project page with background, usage instructions, version highlights, architecture diagram, and safety boundaries.
- Added a manual job-post workflow in the Web UI for LinkedIn, Seek, company sites, and other non-email job sources.
- Added `POST /api/manual-jobs`, which matches a pasted job description against the uploaded resume index and generates application materials with the same human approval gate.
- Manual job drafts still detect the employer communication language, so Australia-facing roles generate English cover letters and recruiter messages even when the UI is Chinese.

### 中文

- 新增 Playwright 专用登录浏览器：自动读取失败时可以打开本地浏览器让用户登录，然后直接读取当前已登录岗位页，不需要安装扩展。
- 修复专用登录浏览器流程：自动关闭恢复出来的个人旧标签页，浏览器会话关闭后可自动恢复，并且不会再把登录页或验证页误导入成岗位 JD。
- 优化登录后导入体验：打开/读取增加明确超时提示并互斥，邮件摘要单独显示为“岗位线索”，LinkedIn 读取结果会清理公司简介、相似职位和页脚，避免混进 JD。
- 优化邮件扫描后的主流程：推荐职位详情区新增“读取链接并生成材料”，优先自动读取邮件里的岗位链接并生成材料；如果网站拦截，再引导用户打开原网页并粘贴 JD。
- 重构“登录后导入”界面：从说明文字改成三步操作卡片，明确告诉用户先拖按钮到书签栏，再去真实岗位页点击书签，最后回到 Web UI 读取岗位。
- 新增 Windows 一键启动脚本：可以双击 `start-webui.bat`，也可以在 PowerShell 执行 `.\start-webui.ps1`，脚本会检查后端/前端是否启动并自动打开浏览器。
- 新增“网页登录导入”模式：用户在 LinkedIn、Seek、Boss、猎聘或公司官网登录后，打开岗位页面，通过书签按钮把当前岗位文本发送到本地助手。
- 新增 `POST /api/imported-jobs` 和 `POST /api/imported-jobs/form`，用于保存浏览器导入的岗位信息，不保存招聘平台账号密码。
- Web UI 的岗位来源从“双模式”升级为“三模式”：公开链接自动读取、网页登录导入、手动粘贴兜底。
- 岗位来源升级为双模式：优先自动读取公开岗位链接，读不到时再手动粘贴 JD。
- 新增 `POST /api/job-url-preview`，可以从公开招聘页面的 HTML metadata 和 JSON-LD JobPosting 中提取岗位名称、公司、地点和岗位描述。
- 修复自动读取岗位链接时把登录页、验证码页或拦截页误当成真实岗位的问题。
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
