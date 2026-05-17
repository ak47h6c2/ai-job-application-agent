# Changelog / 更新日志

## 2026-05-15

### English

- Added automatic job-page hydration during mailbox scans: the agent now extracts job links from emails, reads the top linked job pages when possible, and regenerates matching/drafts from the fuller JD text while marking blocked links for logged-in browser fallback.
- Reworked the Web UI into a cleaner product workbench: tighter shell layout, calmer visual hierarchy, clearer command header, and compact application rows that expand only when the user wants to edit them.
- Fixed the desktop app shell so the main work area scrolls independently while the left navigation stays in place.
- Added application-board search and sorting so users can quickly find records by company, role, status, notes, or links, then order them by latest update, follow-up date, company, or status.
- Added next follow-up date controls to the selected-job application tracker, including the same Today / 3 days / 7 days / Clear shortcuts used on the application board.
- Added application-board exports for Markdown and CSV, plus one-click copying of due follow-ups and quick follow-up date shortcuts on each record.
- Added structured follow-up dates to the application board, with a "Needs follow-up" filter and overdue/today/upcoming visual cues.
- Added two-step removal for application board records, so mistaken or duplicate local tracking items can be cleaned without touching drafts or mail data.
- Made the application board actionable: status summary chips now filter records, and each application card can update status and notes directly.
- Added an application board that summarizes locally tracked roles by status and shows the latest saved application records.
- Added browser-page mismatch protection: when reading a logged-in job page, the app now checks that the current page still matches the intended role and blocks unrelated tabs or different jobs.
- Added local application tracking: each selected role can now store a status and note, such as draft ready, applied, waiting, interview, or rejected.
- Simplified the selected-job workflow into one primary action that reads the full JD, checks quality, and creates or refreshes the application package, with clear login/manual fallback steps.
- Added JD confidence metadata from the backend and a visible JD check card in the Web UI, so generated drafts are gated on content that looks like a real job description rather than page shell text.
- Added a goal-mode workflow panel that shows the one main path: resume, job source, then draft review, with one next-step action instead of another button cluster.
- Improved resume upload feedback with an in-card status pill, selected filename, parsing summary, progress indicator, and clearer next-step guidance.
- Refreshed the Web UI visual system with a Figma-style workbench background, stronger panel hierarchy, more distinct selected states, and lightweight motion for metrics, buttons, chips, and navigation.
- Added JD-quality validation so public-link and logged-in browser reads reject navigation, search-result, login, and recommendation text instead of treating it as the job description.
- Improved the Web UI error copy when a page is readable but does not look like a complete JD.
- Clarified the mail-scan controls: the primary action now scans mail and creates a new report, while refresh only reloads saved reports.
- Added the current report's last-updated time and clearer guidance for when to scan again versus opening history.

### 中文

- 邮箱扫描新增自动读取岗位网页：系统会从邮件中提取岗位链接，优先读取匹配度靠前的岗位页面，能读到完整 JD 就用网页内容重新匹配并生成草稿；被登录或反爬拦截的链接会标记为需要登录浏览器继续读取。
- 重构 Web UI 为更清爽的求职工作台：页面壳层更紧凑，视觉层级更明确，顶部主操作更突出，投递记录默认变成可扫读的紧凑行，点击后再展开编辑。
- 修复桌面端应用壳滚动问题：右侧主工作区现在独立滚动，左侧导航保持固定。
- 投递记录看板新增搜索和排序：可以按公司、岗位、状态、备注或链接快速查找，并按最近更新、跟进日期、公司或投递状态排序。

- 当前岗位的投递进度卡新增“下次跟进日期”，并支持和投递看板一致的今天、3 天后、7 天后、清空快捷按钮。
- 投递记录看板新增 Markdown / CSV 导出、到期跟进清单一键复制，以及每条记录的快捷跟进日期按钮。
- 投递记录看板新增结构化“下次跟进日期”，支持“需要跟进”筛选，并显示逾期、今天跟进和已安排跟进状态。
- 投递记录看板新增二次确认移除：错误记录或重复记录可以直接清理，不影响已生成草稿或邮箱数据。
- 投递记录看板支持直接操作：状态汇总可用于筛选，每张记录卡片都能直接修改状态和备注。
- 新增投递记录看板：按状态汇总本地记录的岗位，并显示最近保存的投递进度。
- 新增登录浏览器页面匹配保护：读取已登录岗位页时，会检查当前页面是否仍然匹配目标岗位；如果停在无关网站、首页或其他岗位，会直接拦截。
- 新增本地投递进度管理：每个选中岗位可以保存状态和备注，例如材料已生成、已投递、等回复、面试中或已拒绝。
- 简化选中岗位后的操作链路：主按钮统一为“读取完整 JD 并生成申请材料”，并显示完整 JD、申请材料状态；遇到登录或无法读取时给出明确补救步骤。
- 新增后端 JD 可信度元数据，并在 Web UI 中显示“JD 完整度检查”卡片；生成草稿前会判断内容是否像真实岗位描述，避免把页面壳或邮件摘要当作 JD。
- 新增“目标模式”流程面板：把页面主线收敛为简历、岗位来源、草稿检查三步，并提供一个明确的下一步按钮，减少按钮堆叠。
- 优化简历上传反馈：在简历卡片内直接显示状态标签、本次文件名、解析摘要、上传进度和下一步引导。
- 按 Figma 工作流重新打磨 Web UI：加入工作台式背景、更清晰的面板层级、更明显的选中状态，以及指标、按钮、标签和导航的轻量动效。
- 新增 JD 质量校验：公开链接读取和登录浏览器读取会拒绝导航、搜索结果、登录页、推荐职位等页面壳文本，不再把它们当作岗位描述。
- 优化“页面能读到但不像完整 JD”时的前端提示，引导用户打开真正岗位详情页或手动粘贴。
- 优化邮箱扫描区的按钮逻辑：主按钮明确表示“扫描邮件并生成草稿”，刷新按钮只负责重新加载已保存结果。
- 当前报告新增更新时间，并说明它可能是刚生成的结果，也可能是从历史中打开的结果，减少误解。

## 2026-05-14

### English

- Simplified the Web UI into one application workbench instead of separate setup and job-source panels.
- Moved resume status, mail range, match threshold, job-source modes, JD fields, and generation actions into a clearer two-column workflow.
- Reduced repeated buttons and long instructional blocks while keeping automatic link reading, logged-in import, manual paste, resume upload, and mail scanning behavior unchanged.
- Renamed the two confusing "generate materials" actions into separate "create draft from this JD" and "read job details" tasks.
- Added a three-path entry panel for scanning email jobs, creating a draft from one JD, and reviewing drafts.
- Added a current-result summary with next-step links so users land on the active report before browsing history.
- Moved run history below the active report so the main reading order stays focused on the current result.
- Added a dedicated selected-job detail anchor so the next-step links map to job list, job details, and draft review.
- Replaced internal run ids in the current result and history cards with readable Email scan / Manual JD labels.
- Compressed the top path picker into a shorter three-entry flow strip and moved resume upload into the resume card.
- Merged the separate workflow progress card into compact status chips inside the current-result summary.
- Reworked the draft review area into a numbered application package: resume edits, cover letter, recruiter message, and application notes.
- Clarified the shortlisted-job list with a click hint, selected-state badge, and per-card "View details" action.
- Improved narrow-screen job selection by scrolling from a selected job card to its detail panel.
- Reordered the sidebar navigation to follow the main workflow and clarified scan controls with helper text.
- Added dynamic sidebar highlighting, smoother anchor positioning, disabled-action helper text, and a direct job-detail link to the application package.
- Added expandable run history so older reports can be reopened without cluttering the default view.
- Persisted scan settings and job-input mode locally, added a pre-generation checklist for single JD drafts, and added one-click copy for the full application package.
- Added Markdown downloads for the current report and selected application package.
- Fixed a React duplicate-key warning when two job leads share the same company and title.

### 中文

- 将 Web UI 简化成一个求职申请工作台，不再把上传简历、扫描邮件、岗位来源和生成材料拆得太散。
- 把简历状态、邮件范围、匹配度阈值、岗位来源模式、JD 表单和生成按钮整合为左右两栏流程。
- 减少重复按钮和大段说明文字，但保留自动读取链接、登录后导入、手动粘贴、上传简历和读取邮件的原有功能。
- 将两个容易混淆的“生成申请材料”入口拆成“按当前 JD 生成草稿”和“读取岗位详情”两个任务。
- 增加“三条主路径”入口：扫描邮箱找岗位、单个 JD 生成草稿、查看申请草稿。
- 增加“当前结果”摘要和下一步入口，让用户先看本次报告，再按需打开历史记录。
- 将历史记录下移到当前报告之后，避免旧报告打断主流程。
- 增加独立的“当前岗位详情”锚点，让下一步入口分别对应推荐岗位、岗位详情和申请草稿。
- 将当前结果和历史记录里的内部编号改成“邮箱扫描 / 手动岗位”这类可读标签。
- 将顶部路径入口压缩成更短的三步流程条，并把上传简历按钮移到简历卡片里。
- 将单独的处理进度大卡片合并为当前结果摘要里的小状态标签，减少页面纵向冗余。
- 将申请草稿区改成编号式“申请包”：简历修改点、求职信、招聘方消息和投递提醒分开阅读。
- 优化推荐职位列表：增加点击提示、当前选中标记，以及每张岗位卡片的“查看详情”入口。
- 优化窄屏操作：点击推荐岗位后自动滚到对应的岗位详情区。
- 将侧边栏改成主流程顺序，并给草稿数量和匹配度门槛增加更直观的说明。
- 增加侧边栏动态高亮、锚点滚动边距、按钮不可用原因提示，以及从岗位详情直达申请包的入口。
- 历史结果支持展开全部和收起，默认保持简洁，同时旧报告也能重新打开。
- 本地保存扫描设置和岗位输入模式；单个 JD 增加生成前检查；申请包支持一键复制整套材料。
- 新增当前报告和选中申请包的 Markdown 下载。
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
