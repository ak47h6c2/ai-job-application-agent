import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Languages,
  Mail,
  Play,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserCheck
} from "lucide-react";
import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";
const RESUME_UPLOAD_TIMEOUT_MS = 45000;
const JOB_URL_READ_TIMEOUT_MS = 18000;
const LOGIN_BROWSER_OPEN_TIMEOUT_MS = 30000;
const LOGIN_BROWSER_READ_TIMEOUT_MS = 20000;

type Language = "en" | "zh";
type LoadState = "loading" | "ready" | "empty" | "error";
type AsyncStatus = "idle" | "running" | "success" | "error";
type JobInputMode = "auto" | "browser" | "manual";
type NavSection = "overview" | "setup" | "manual" | "jobs" | "drafts" | "history";

const NAV_SECTIONS: NavSection[] = ["overview", "setup", "manual", "jobs", "drafts", "history"];
const OBSERVED_SECTION_IDS = [...NAV_SECTIONS, "job-detail"];

function navSectionFromId(value: string): NavSection | undefined {
  if ((NAV_SECTIONS as string[]).includes(value)) return value as NavSection;
  if (value === "job-detail") return "jobs";
  return undefined;
}

const JOB_IMPORT_BOOKMARKLET_SOURCE = `
(async () => {
  const clean = (value) => (value || "").replace(/\\s+/g, " ").trim();
  const read = (selector) => {
    const element = document.querySelector(selector);
    return clean((element && (element.innerText || element.textContent)) || "");
  };
  const meta = (name) => {
    const element = document.querySelector('meta[property="' + name + '"],meta[name="' + name + '"]');
    return clean((element && element.content) || "");
  };
  const first = (selectors) => {
    for (const selector of selectors) {
      const value = read(selector);
      if (value) return value;
    }
    return "";
  };
  const title = first([
    "h1",
    '[data-automation="job-detail-title"]',
    ".jobs-unified-top-card__job-title",
    ".job-details-jobs-unified-top-card__job-title"
  ]) || meta("og:title") || document.title;
  const company = first([
    '[data-automation="advertiser-name"]',
    ".jobs-unified-top-card__company-name",
    ".job-details-jobs-unified-top-card__company-name",
    '[class*="company"]'
  ]) || meta("og:site_name") || location.hostname.replace(/^www\\./, "");
  const locationText = first([
    '[data-automation="job-detail-location"]',
    ".jobs-unified-top-card__bullet",
    ".job-details-jobs-unified-top-card__primary-description-container",
    '[class*="location"]'
  ]);
  const description = first([
    '[data-automation="jobAdDetails"]',
    ".jobs-description__content",
    "#jobDescriptionText",
    '[class*="job-description"]',
    "main"
  ]) || clean(document.body.innerText).slice(0, 12000);
  const payload = {
    title,
    company,
    location: locationText,
    url: location.href,
    description,
    source: location.hostname
  };
  const fallbackText = [title, company, locationText, location.href, "", description].filter(Boolean).join("\\n");
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(fallbackText).catch(() => {});
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "http://127.0.0.1:8000/api/imported-jobs/form";
  form.target = "_blank";
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "payload";
  input.value = JSON.stringify(payload);
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  setTimeout(() => form.remove(), 500);
})();
`.trim();

const JOB_IMPORT_BOOKMARKLET_HREF = `javascript:${encodeURIComponent(JOB_IMPORT_BOOKMARKLET_SOURCE)}`;

const translations = {
  en: {
    appName: "Job Agent",
    productName: "AI Job Application Agent",
    headline: "Application workbench",
    subline: "Upload a resume, choose one path, then review drafts.",
    pathPickerTitle: "What do you want to do now?",
    pathPickerBody: "Pick one entry and the page moves to that workspace.",
    pathMailTitle: "Scan email jobs",
    pathMailBody: "Find roles from QQ Mail",
    pathJobTitle: "One job post",
    pathJobBody: "Paste a link or JD",
    pathDraftTitle: "Review drafts",
    pathDraftBody: "Check generated materials",
    pathOpen: "Go",
    mailPathTitle: "Scan emails for jobs",
    mailPathBody: "Find recent job leads from email, rank them, then draft for the best matches.",
    singleJobPathTitle: "Create draft from one JD",
    singleJobPathBody: "Use a public link, logged-in page, or pasted JD when you already know the role.",
    language: "Language",
    english: "EN",
    chinese: "中文",
    overview: "Overview",
    controls: "Controls",
    manualJob: "Job source",
    history: "History",
    jobLeads: "Job leads",
    drafts: "Drafts",
    navStart: "Start",
    navOneJob: "One job",
    navShortlist: "Shortlist",
    navDrafts: "Application package",
    navHistory: "History",
    safeTitle: "Human approval on",
    safeBody: "No email or application is sent automatically.",
    resumeStep: "Resume",
    resumeStepTitle: "Upload resume PDF",
    resumeReady: "Resume index ready",
    resumeMissing: "Upload a PDF before generating materials",
    resumeRequiredHint: "Upload a resume first to unlock scanning and draft generation.",
    resumePrivate: "Stored locally as a private evidence index.",
    resumeSectionsLabel: "Detected sections",
    resumeKeywordsLabel: "Detected keywords",
    uploadNextStep: "Next: scan email or paste a job post.",
    uploadResume: "Upload PDF",
    uploading: "Uploading...",
    uploadWorking: "Uploading and parsing the resume. This usually takes a few seconds.",
    uploadTimeout: "Resume upload timed out. Check that the backend is running, or try a text-based PDF.",
    uploadCanceled: "Resume upload canceled.",
    cancelUpload: "Cancel",
    uploadSuccess: "Resume uploaded and indexed.",
    uploadError: "Resume upload failed.",
    uploadTextError: "This PDF does not contain enough readable resume text. If it is a scanned image resume, export it as a text-based PDF first.",
    mailStep: "Mail",
    mailStepTitle: "Choose scan range",
    today: "Today",
    yesterday: "Yesterday",
    last3Days: "Last 3 days",
    last7Days: "Last 7 days",
    customDate: "Custom date",
    agentStep: "Agent",
    agentStepTitle: "Shortlist and draft",
    startScan: "Analyze jobs",
    scanning: "Analyzing...",
    refresh: "Reload",
    scanSuccess: "New job analysis generated.",
    scanError: "Scan failed.",
    manualTitle: "Add a job post",
    manualSubtitle: "Use this when you already have the job link or JD. It creates drafts from the current fields only.",
    autoMode: "Auto read",
    browserMode: "Logged-in import",
    manualMode: "Manual paste",
    autoFetch: "Read job link",
    autoFetching: "Reading...",
    autoSuccess: "Job details loaded. Check the fields, then create drafts.",
    autoMissing: "Paste a job link first.",
    autoError: "Could not read this link automatically. Some sites require login or block automated reading. Use manual paste mode.",
    autoHint: "Best for public company career pages and job boards. LinkedIn may require manual paste.",
    browserImportTitle: "Open a dedicated login browser",
    browserImportBody: "No extension needed. The app opens a browser window, you log in there once, and the login state is stored locally for future reads.",
    browserStep1Title: "Open the job link",
    browserStep1Body: "Click the button below. The app opens the job page in a dedicated browser window.",
    browserStep2Title: "Log in if needed",
    browserStep2Body: "If LinkedIn, Seek, Boss, or Liepin asks for login, log in inside that browser and stay on the job detail page.",
    browserStep3Title: "Read current page",
    browserStep3Body: "Come back here and read the current browser page. If your resume is ready, drafts will be created automatically.",
    openLoginBrowser: "Open login browser",
    openingLoginBrowser: "Opening...",
    readLoginBrowser: "Read current job page",
    readingLoginBrowser: "Reading...",
    loginBrowserOpenSuccess: "Login browser opened. Log in there if needed, open the job detail page, then return here and read the current page.",
    loginBrowserReadSuccess: "Read the logged-in browser page and created drafts.",
    loginBrowserInstallMissing: "Playwright is not installed. Run .\\start-webui.ps1 -Install, then restart the app.",
    loginBrowserStillLogin: "The dedicated browser is still on a login or verification page. Log in, open the job detail page, then read again.",
    loginBrowserOpeningHint: "Opening the dedicated browser. This can take up to 30 seconds.",
    loginBrowserReadingHint: "Reading the current dedicated browser page. Make sure it is on a real job detail page.",
    loginBrowserOpenFirst: "Open the dedicated browser with a job link first, then read the current page.",
    requestTimeout: "This step took too long and was stopped. Check the dedicated browser window, then try again.",
    loginBrowserPageNotReady: "The job page is open, but the JD has not loaded yet. Wait until the job description is visible, then read again.",
    leadSnippetTitle: "Email lead only",
    leadSnippetBody: "This is what the email mentioned, not the full JD. Read the job page or paste the real JD before generating materials.",
    bookmarkletLabel: "Drag me to bookmarks",
    copyBookmarklet: "Copy script backup",
    bookmarkletCopied: "Bookmarklet copied",
    loadImported: "I imported it, load job",
    loadingImported: "Loading import...",
    importedSuccess: "Imported job loaded. Check the fields, then create drafts.",
    importedEmpty: "No imported job found yet. Open a job page and click the bookmarklet first.",
    credentialSafety: "Passwords stay on the official job site. This app only receives the job text you choose to import.",
    useSelectedJobLink: "Fill from selected lead",
    applySelected: "Read job details",
    applyingSelected: "Reading job details...",
    openOriginalJob: "Open job page",
    reviewApplicationPackage: "Review application package",
    jobLinkRequiredHint: "This lead has no job link. Paste the full JD in One job.",
    quickApplySuccess: "Job details read and drafts refreshed.",
    quickApplyFallback: "This site needs login or blocks automatic reading. I opened it in the dedicated login browser. Log in there, stay on the job detail page, then return here and read the current page.",
    quickApplyMissing: "This email lead does not include a job link. Paste the JD below to generate materials.",
    selectedJobActionHint: "From an email lead: read the job page first. Drafts refresh after the full JD is available.",
    manualJobTitle: "Job title",
    manualCompany: "Company",
    manualLocation: "Location",
    manualUrl: "Job link",
    manualDescription: "Job description / JD",
    manualDescriptionPlaceholder: "Paste responsibilities, requirements, and any useful job-post text here.",
    manualGenerate: "Create draft from this JD",
    manualGenerating: "Creating draft...",
    manualSuccess: "Drafts created from this job post.",
    manualMissing: "Fill in the title, company, and job description first.",
    manualReadyTitle: "Before generating",
    manualReadyResume: "Resume uploaded",
    manualReadyTitleField: "Job title filled",
    manualReadyCompany: "Company filled",
    manualReadyDescription: "JD has enough detail",
    manualReadyHint: "Complete these checks to unlock draft generation.",
    readSince: "Read mail since",
    topDrafts: "Drafts to prepare",
    topDraftsHint: "How many roles should get drafts.",
    minScore: "Match threshold",
    minScoreHint: "Lower it to include more roles.",
    jobs: "Jobs",
    steps: "Steps",
    recentRuns: "Recent runs",
    runsCount: "runs",
    showAllRuns: "Show all history",
    showLessRuns: "Show less",
    currentResult: "Current result",
    currentResultBody: "This is the active report. Start with the job list, then read details and review drafts.",
    resultJobs: "Shortlisted jobs",
    resultDrafts: "Drafts ready",
    resultSteps: "Completed steps",
    nextStep: "Next step",
    nextStepPick: "Pick a job",
    nextStepRead: "Read details",
    nextStepReview: "Review draft",
    historyHint: "Older reports are kept below for comparison or reopening.",
    updated: "Updated",
    selected: "selected",
    run: "Run",
    loading: "Loading latest run",
    noRun: "No run yet",
    emptyTitle: "No dashboard data yet",
    emptyBody: "Upload a resume and start a scan to generate the first report.",
    noJobsTitle: "No matched jobs in this run",
    noJobsBody: "Expand the mail range or lower the minimum match threshold, then analyze again.",
    noDraftTitle: "No drafts yet",
    noDraftBody: "Drafts appear after a matched job has enough JD detail.",
    apiError: "API is not available. Check that the FastAPI server is running.",
    timeline: "Workflow",
    selectedJobs: "Shortlist",
    selectedJobsHint: "Click a job to show its details and matching materials.",
    selectedJobDetail: "Selected job details",
    selectedJobDetailBody: "Confirm the full JD here before reviewing or copying drafts.",
    viewJobDetail: "View details",
    shortlistCount: "shortlisted",
    open: "Open",
    resumeEvidence: "Evidence",
    missingKeywords: "Keyword gaps",
    noKeywordGap: "No obvious gaps",
    noEvidence: "No strong resume evidence found.",
    applicationDraft: "Draft",
    draftReviewHint: "Review in order: resume edits first, then copy the message that matches the employer language.",
    reviewRequired: "review required",
    resumeFocus: "Resume focus",
    coverLetter: "Cover letter",
    recruiterMessage: "Recruiter message",
    draftLanguage: "Draft language",
    draftLanguageEnglish: "English",
    draftLanguageChinese: "Chinese",
    notes: "Notes",
    copyPackage: "Copy package",
    copy: "Copy",
    copied: "Copied",
    points: "pts",
    safeMode: "Safe mode",
    viewResults: "Review results",
    setup: "Setup"
  },
  zh: {
    appName: "求职助手",
    productName: "AI 求职申请助手",
    headline: "求职申请工作台",
    subline: "上传简历后，选择邮件扫描或单个 JD 路径，最后检查草稿。",
    pathPickerTitle: "你现在要做什么？",
    pathPickerBody: "点一个入口，页面会直接跳到对应操作区。",
    pathMailTitle: "扫描邮箱",
    pathMailBody: "从 QQ 邮箱找岗位线索",
    pathJobTitle: "单个岗位",
    pathJobBody: "粘贴链接或 JD",
    pathDraftTitle: "看申请草稿",
    pathDraftBody: "检查已生成材料",
    pathOpen: "进入",
    mailPathTitle: "扫描邮箱找岗位",
    mailPathBody: "从近期邮件里找岗位线索，排序后给匹配度高的岗位生成草稿。",
    singleJobPathTitle: "单个 JD 生成草稿",
    singleJobPathBody: "已经知道目标岗位时，用公开链接、登录页面或手动粘贴 JD 生成草稿。",
    language: "语言",
    english: "EN",
    chinese: "中文",
    overview: "总览",
    controls: "控制区",
    manualJob: "岗位来源",
    history: "历史记录",
    jobLeads: "职位线索",
    drafts: "申请草稿",
    navStart: "开始",
    navOneJob: "单个岗位",
    navShortlist: "推荐职位",
    navDrafts: "申请包",
    navHistory: "历史记录",
    safeTitle: "人工确认",
    safeBody: "这里只生成建议和草稿，不会自动发送或投递。",
    resumeStep: "简历",
    resumeStepTitle: "上传 PDF 简历",
    resumeReady: "简历已准备好",
    resumeMissing: "请先上传一份 PDF 简历",
    resumeRequiredHint: "先上传简历，才能扫描邮箱或生成申请材料。",
    resumePrivate: "简历只用于本地分析，不会提交到 GitHub。",
    resumeSectionsLabel: "已识别模块",
    resumeKeywordsLabel: "已识别关键词",
    uploadNextStep: "下一步：扫描邮件，或粘贴岗位 JD。",
    uploadResume: "选择简历 PDF",
    uploading: "上传中...",
    uploadWorking: "正在上传并解析简历，通常需要几秒钟。",
    uploadTimeout: "简历上传超时。请确认后端服务正常，或者换成可复制文字的 PDF 后重试。",
    uploadCanceled: "已取消上传。",
    cancelUpload: "取消",
    uploadSuccess: "简历已上传，可以开始分析职位邮件。",
    uploadError: "简历上传失败。",
    uploadTextError: "这份 PDF 读不到足够的简历文字。如果是扫描版图片简历，请先导出为可复制文字的 PDF 后再上传。",
    mailStep: "邮件范围",
    mailStepTitle: "选择要看的邮件",
    today: "今天",
    yesterday: "昨天起",
    last3Days: "近 3 天",
    last7Days: "近 7 天",
    customDate: "自定义日期",
    agentStep: "生成",
    agentStepTitle: "筛选职位并生成草稿",
    startScan: "开始分析",
    scanning: "分析中...",
    refresh: "更新结果",
    scanSuccess: "分析完成，已生成新的求职材料。",
    scanError: "分析失败。",
    manualTitle: "添加岗位 JD",
    manualSubtitle: "已经有岗位链接或完整 JD 时用这里；这里只根据当前字段生成草稿。",
    autoMode: "自动读取",
    browserMode: "登录后导入",
    manualMode: "手动粘贴",
    autoFetch: "读取岗位链接",
    autoFetching: "读取中...",
    autoSuccess: "岗位信息已读取，请检查字段后生成草稿。",
    autoMissing: "请先粘贴岗位链接。",
    autoError: "这个链接暂时无法自动读取。部分网站需要登录或会阻止抓取，请切换到手动粘贴。",
    autoHint: "公司官网和公开招聘页通常更容易读取；LinkedIn 可能需要手动粘贴。",
    browserImportTitle: "打开专用登录浏览器",
    browserImportBody: "不需要安装扩展。系统会打开一个浏览器窗口，你在里面登录一次，登录状态会保存在本地，之后同平台可以继续复用。",
    browserStep1Title: "打开岗位链接",
    browserStep1Body: "点击下面按钮，系统会把岗位页打开到专用浏览器里。",
    browserStep2Title: "如果需要，就在里面登录",
    browserStep2Body: "LinkedIn、Seek、Boss、猎聘要求登录时，只在这个浏览器窗口里登录，并停留在岗位详情页。",
    browserStep3Title: "回到这里读取当前页面",
    browserStep3Body: "点读取后会抓取专用浏览器当前页面。简历已准备好时，会直接生成草稿。",
    openLoginBrowser: "打开登录浏览器",
    openingLoginBrowser: "打开中...",
    readLoginBrowser: "读取当前岗位页",
    readingLoginBrowser: "读取中...",
    loginBrowserOpenSuccess: "登录浏览器已打开。如果页面要求登录，请在里面登录并打开岗位详情页，然后回到这里读取当前页面。",
    loginBrowserReadSuccess: "已读取登录浏览器里的岗位页面，并生成草稿。",
    loginBrowserInstallMissing: "Playwright 尚未安装。请执行 .\\start-webui.ps1 -Install 后重启项目。",
    loginBrowserStillLogin: "专用浏览器现在还停在登录或验证页面。请先在那个窗口完成登录，并打开岗位详情页，然后再回来读取。",
    loginBrowserOpeningHint: "正在打开专用浏览器，最多等待 30 秒。打开后如果需要登录，就在新窗口里完成登录。",
    loginBrowserReadingHint: "正在读取专用浏览器当前页面，最多等待 20 秒。请确认那个窗口停在岗位详情页。",
    loginBrowserOpenFirst: "请先粘贴岗位链接并点击“打开登录浏览器”，等岗位页出现在专用浏览器里后，再回来读取当前页面。",
    requestTimeout: "这一步等待时间过长，已自动停止。请确认专用浏览器是否打开，并停在岗位详情页，然后再点一次。",
    loginBrowserPageNotReady: "岗位页已经打开，但 JD 还没加载出来。请等专用浏览器里出现完整岗位描述后，再回来读取。",
    leadSnippetTitle: "邮件里提到的岗位线索",
    leadSnippetBody: "这只是邮件摘要，不是完整 JD。用它确认岗位是否正确；真正生成材料前需要读取岗位页面，或手动粘贴完整 JD。",
    bookmarkletLabel: "拖我到书签栏",
    copyBookmarklet: "复制脚本备用",
    bookmarkletCopied: "书签脚本已复制",
    loadImported: "我已导入，读取岗位",
    loadingImported: "读取中...",
    importedSuccess: "已读取最近导入的岗位，请检查字段后生成草稿。",
    importedEmpty: "还没有导入岗位。请先打开岗位页面并点击书签。",
    credentialSafety: "账号密码只输入在招聘平台官网。本项目只接收你主动导入的岗位文字。",
    useSelectedJobLink: "填入这个岗位链接",
    applySelected: "读取岗位详情",
    applyingSelected: "读取岗位中...",
    openOriginalJob: "打开岗位网页",
    reviewApplicationPackage: "查看申请包",
    jobLinkRequiredHint: "这条线索没有岗位链接，请到“单个岗位”粘贴完整 JD。",
    quickApplySuccess: "已读取岗位详情并更新草稿。",
    quickApplyFallback: "这个网站需要登录或阻止自动读取。我已经用专用登录浏览器打开它。请在那个窗口登录并停留在岗位详情页，然后回到这里读取当前页面。",
    quickApplyMissing: "这封邮件里没有岗位链接。请把 JD 粘贴到下方后生成材料。",
    selectedJobActionHint: "从邮件线索进入：先读取完整岗位详情，系统会用完整 JD 更新草稿。",
    manualJobTitle: "岗位名称",
    manualCompany: "公司",
    manualLocation: "地点",
    manualUrl: "岗位链接",
    manualDescription: "岗位描述 / JD",
    manualDescriptionPlaceholder: "把岗位职责、任职要求、技术栈和其他有用信息粘贴到这里。",
    manualGenerate: "按当前 JD 生成草稿",
    manualGenerating: "生成草稿中...",
    manualSuccess: "已根据当前岗位生成草稿。",
    manualMissing: "请先填写岗位名称、公司和岗位描述。",
    manualReadyTitle: "生成前检查",
    manualReadyResume: "已上传简历",
    manualReadyTitleField: "已填写岗位名称",
    manualReadyCompany: "已填写公司",
    manualReadyDescription: "岗位描述内容足够",
    manualReadyHint: "完成这些检查后，才可以生成草稿。",
    readSince: "读取邮件日期",
    topDrafts: "准备几份草稿",
    topDraftsHint: "控制本次最多给几个岗位生成材料。",
    minScore: "匹配度门槛",
    minScoreHint: "调低会看到更多岗位，调高会更严格。",
    jobs: "职位",
    steps: "流程",
    recentRuns: "历史结果",
    runsCount: "条记录",
    showAllRuns: "展开全部历史",
    showLessRuns: "收起历史",
    currentResult: "当前结果",
    currentResultBody: "这是当前正在查看的报告。先看推荐岗位，再读取岗位详情，最后检查草稿。",
    resultJobs: "推荐岗位",
    resultDrafts: "已生成草稿",
    resultSteps: "已完成步骤",
    nextStep: "下一步",
    nextStepPick: "选择岗位",
    nextStepRead: "读取详情",
    nextStepReview: "检查草稿",
    historyHint: "历史结果放在下面，需要对比或打开旧报告时再看。",
    updated: "更新于",
    selected: "当前",
    run: "结果",
    loading: "正在加载最新结果",
    noRun: "暂无结果",
    emptyTitle: "还没有分析结果",
    emptyBody: "先上传简历，再点开始分析。",
    noJobsTitle: "这次没有筛出合适职位",
    noJobsBody: "可以扩大邮件范围，或者把最低匹配度调低后重新分析。",
    noDraftTitle: "还没有草稿",
    noDraftBody: "有岗位达到匹配度，并且有足够 JD 信息后，这里会生成简历修改点、求职信和招聘方消息。",
    apiError: "本地服务未连接，请确认后端正在运行。",
    timeline: "处理进度",
    selectedJobs: "推荐职位",
    selectedJobsHint: "点击岗位查看详情和对应材料。",
    selectedJobDetail: "当前岗位详情",
    selectedJobDetailBody: "先确认这里是完整 JD，再去检查和复制草稿。",
    viewJobDetail: "查看详情",
    shortlistCount: "个推荐",
    open: "打开",
    resumeEvidence: "简历依据",
    missingKeywords: "可补关键词",
    noKeywordGap: "暂无明显缺口",
    noEvidence: "暂未找到强匹配的简历内容。",
    applicationDraft: "申请草稿",
    draftReviewHint: "按顺序检查：先改简历，再复制符合招聘方语言的草稿。",
    reviewRequired: "待你确认",
    resumeFocus: "简历修改重点",
    coverLetter: "求职信草稿",
    recruiterMessage: "招聘方消息",
    draftLanguage: "草稿语言",
    draftLanguageEnglish: "英文",
    draftLanguageChinese: "中文",
    notes: "投递提醒",
    copyPackage: "复制整套材料",
    copy: "复制",
    copied: "已复制",
    points: "分",
    safeMode: "只读安全模式",
    viewResults: "查看材料",
    setup: "开始"
  }
} as const;

const stepLabels: Record<Language, Record<string, string>> = {
  en: {
    manual_job_input: "manual job",
    scan_email: "scan email",
    analyze_resume_fit: "resume match",
    shortlist_jobs: "shortlist",
    generate_drafts: "drafts",
    human_approval_gate: "approval"
  },
  zh: {
    manual_job_input: "手动岗位",
    scan_email: "扫描邮件",
    analyze_resume_fit: "简历匹配",
    shortlist_jobs: "筛选职位",
    generate_drafts: "生成草稿",
    human_approval_gate: "人工确认"
  }
};

const reasonLabels: Record<Language, Record<string, string>> = {
  en: {
    "target title match": "target role",
    "software role keywords": "software keywords",
    "preferred location": "location fit",
    "resume skill overlap": "resume overlap",
    "ai/cloud stretch keyword": "AI/cloud keywords",
    "positive job-alert signal": "job source signal"
  },
  zh: {
    "target title match": "目标职位匹配",
    "software role keywords": "软件岗位关键词",
    "preferred location": "地点匹配",
    "resume skill overlap": "简历技能重合",
    "ai/cloud stretch keyword": "AI/云方向关键词",
    "positive job-alert signal": "岗位来源信号"
  }
};

type Step = {
  name: string;
  status: string;
  summary: string;
};

type Lead = {
  title: string;
  company: string;
  location: string;
  source?: string;
  url: string;
  signals: string[];
  raw_excerpt?: string;
};

type ScoredLead = {
  lead: Lead;
  score: number;
  reasons: string[];
};

type EvidenceMatch = {
  evidence: {
    section: string;
    text: string;
    keywords: string[];
  };
  score: number;
  matched_terms: string[];
};

type Analysis = {
  scored_lead: ScoredLead;
  evidence_matches: EvidenceMatch[];
  missing_keywords: string[];
};

type Draft = {
  job_title: string;
  company: string;
  resume_focus: string[];
  cover_letter: string;
  recruiter_message: string;
  application_notes: string[];
  communication_language: Language;
  approval_required: boolean;
};

type AgentRun = {
  id: string;
  goal: string;
  steps: Step[];
  selected_jobs: Analysis[];
  drafts: Draft[];
  output_dir: string;
  external_actions_blocked: boolean;
};

type RunSummary = {
  id: string;
  selected_job_count: number;
  draft_count: number;
  modified_at: number;
};

type ResumeStatus = {
  exists: boolean;
  chunk_count: number;
  modified_at: number | null;
  sections?: string[];
  keywords?: string[];
};

type ManualJobForm = {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
};

type JobUrlPreview = ManualJobForm & {
  ok?: boolean;
  detail?: string;
  source: string;
};

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(daysAgo: number) {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo);
  return formatLocalDate(value);
}

function getInitialLanguage(): Language {
  const saved = window.localStorage.getItem("job-agent-language");
  return saved === "en" || saved === "zh" ? saved : "zh";
}

function getInitialSinceDate() {
  const saved = window.localStorage.getItem("job-agent-since-date");
  return saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : dateOffset(0);
}

function getSavedNumber(key: string, fallback: number, min: number, max: number) {
  const saved = Number(window.localStorage.getItem(key));
  return Number.isFinite(saved) ? Math.min(max, Math.max(min, saved)) : fallback;
}

function getInitialJobInputMode(): JobInputMode {
  const saved = window.localStorage.getItem("job-agent-job-input-mode");
  return saved === "auto" || saved === "browser" || saved === "manual" ? saved : "auto";
}

function scoreTone(score: number) {
  if (score >= 80) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (score >= 65) return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function firstLines(text: string, limit = 170) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function formatModified(value: number | null, language: Language) {
  if (!value) return "";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-AU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value * 1000));
}

function displayRunId(id: string, language: Language) {
  if (id === "latest_test") return id;
  const manualMatch = id.match(/^manual-(\d{4}-\d{2}-\d{2})_(\d{8})T(\d{2})(\d{2})(\d{2})Z$/);
  const mailMatch = id.match(/^(\d{4}-\d{2}-\d{2})_(\d{8})T(\d{2})(\d{2})(\d{2})Z$/);
  const match = manualMatch ?? mailMatch;
  if (!match) return id;
  const label = manualMatch ? (language === "zh" ? "手动岗位" : "Manual JD") : language === "zh" ? "邮箱扫描" : "Email scan";
  return `${label} · ${match[1]} ${match[3]}:${match[4]} UTC`;
}

function reasonName(reason: string, language: Language) {
  return reasonLabels[language][reason.toLowerCase()] ?? reason;
}

function joinList(items: string[] | undefined, language: Language) {
  return (items ?? []).filter(Boolean).join(language === "zh" ? "、" : ", ");
}

function matchScoreLabel(score: number, language: Language) {
  return language === "zh" ? `匹配度 ${score}` : `Match ${score}`;
}

function draftLanguageName(value: Language | undefined, language: Language) {
  if (value === "zh") return translations[language].draftLanguageChinese;
  return translations[language].draftLanguageEnglish;
}

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload.detail === "string") return payload.detail;
  return `API returned ${response.status}`;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [resume, setResume] = useState<ResumeStatus | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sinceDate, setSinceDate] = useState(getInitialSinceDate);
  const [topDrafts, setTopDrafts] = useState(() => getSavedNumber("job-agent-top-drafts", 3, 1, 10));
  const [minScore, setMinScore] = useState(() => getSavedNumber("job-agent-min-score", 70, 0, 100));
  const [runStatus, setRunStatus] = useState<AsyncStatus>("idle");
  const [uploadStatus, setUploadStatus] = useState<AsyncStatus>("idle");
  const [manualStatus, setManualStatus] = useState<AsyncStatus>("idle");
  const [jobFetchStatus, setJobFetchStatus] = useState<AsyncStatus>("idle");
  const [importStatus, setImportStatus] = useState<AsyncStatus>("idle");
  const [selectedApplyStatus, setSelectedApplyStatus] = useState<AsyncStatus>("idle");
  const [browserOpenStatus, setBrowserOpenStatus] = useState<AsyncStatus>("idle");
  const [jobInputMode, setJobInputMode] = useState<JobInputMode>(getInitialJobInputMode);
  const [manualJob, setManualJob] = useState<ManualJobForm>({
    title: "",
    company: "",
    location: "Sydney, NSW",
    url: "",
    description: ""
  });
  const [jobLeadNote, setJobLeadNote] = useState("");
  const [message, setMessage] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [showAllRuns, setShowAllRuns] = useState(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadRequestIdRef = useRef(0);
  const bookmarkletRef = useRef<HTMLAnchorElement | null>(null);
  const t = translations[language];
  const manualTitleReady = Boolean(manualJob.title.trim());
  const manualCompanyReady = Boolean(manualJob.company.trim());
  const manualDescriptionReady = manualJob.description.trim().length >= 20;
  const manualCanGenerate = Boolean(resume?.exists) && manualTitleReady && manualCompanyReady && manualDescriptionReady;

  const loadResume = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/resume-index`);
    if (!response.ok) throw new Error(await parseApiError(response));
    setResume((await response.json()) as ResumeStatus);
  }, []);

  const loadRuns = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/runs`);
    if (!response.ok) throw new Error(await parseApiError(response));
    const data = (await response.json()) as { runs: RunSummary[] };
    setRuns(data.runs);
  }, []);

  const loadRun = useCallback(async (runId: string) => {
    const response = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}`);
    if (!response.ok) throw new Error(await parseApiError(response));
    setRun((await response.json()) as AgentRun);
    setSelectedIndex(0);
    setState("ready");
  }, []);

  const loadLatest = useCallback(async () => {
    try {
      await Promise.all([loadResume(), loadRuns()]);
      const response = await fetch(`${API_BASE}/api/runs/latest`);
      if (response.status === 404) {
        setState("empty");
        return;
      }
      if (!response.ok) throw new Error(await parseApiError(response));
      setRun((await response.json()) as AgentRun);
      setSelectedIndex(0);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [loadResume, loadRuns]);

  useEffect(() => {
    window.localStorage.setItem("job-agent-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem("job-agent-since-date", sinceDate);
    window.localStorage.setItem("job-agent-top-drafts", String(topDrafts));
    window.localStorage.setItem("job-agent-min-score", String(minScore));
    window.localStorage.setItem("job-agent-job-input-mode", jobInputMode);
  }, [sinceDate, topDrafts, minScore, jobInputMode]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("v") === "browser-import") {
      setJobInputMode("browser");
      void loadImportedJob();
    }
  }, []);

  useEffect(() => {
    bookmarkletRef.current?.setAttribute("href", JOB_IMPORT_BOOKMARKLET_HREF);
  });

  useEffect(() => {
    const updateFromHash = () => {
      const section = navSectionFromId(window.location.hash.replace("#", ""));
      if (section) setActiveSection(section);
    };

    updateFromHash();
    const elements = OBSERVED_SECTION_IDS.map((id) => document.getElementById(id)).filter((element): element is HTMLElement => Boolean(element));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const section = visible ? navSectionFromId(visible.target.id) : undefined;
        if (section) setActiveSection(section);
      },
      { rootMargin: "-24% 0px -62% 0px", threshold: [0, 0.2, 0.5, 0.8] }
    );

    elements.forEach((element) => observer.observe(element));
    window.addEventListener("hashchange", updateFromHash);
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", updateFromHash);
    };
  }, [run, state]);

  const friendlyError = (rawMessage: string, fallback: string) => {
    if (rawMessage.includes("Failed to fetch")) return t.apiError;
    if (rawMessage.includes("Request timed out") || rawMessage.includes("timed out")) return t.requestTimeout;
    if (rawMessage.includes("Open the login browser with a job link first")) return t.loginBrowserOpenFirst;
    if (rawMessage.includes("login or verification page")) return t.loginBrowserStillLogin;
    if (rawMessage.includes("has not loaded the job description")) return t.loginBrowserPageNotReady;
    if (rawMessage.includes("Could not read enough resume text")) return t.uploadTextError;
    if (rawMessage.includes("Could not read resume PDF")) return t.uploadTextError;
    if (rawMessage.includes("Resume index not found")) return t.resumeMissing;
    if (rawMessage.includes("Could not automatically read this job page")) return t.autoError;
    if (rawMessage.includes("Could not extract enough job information")) return t.autoError;
    if (rawMessage.includes("login, captcha, or access-blocked")) return t.autoError;
    if (rawMessage.includes("Use manual paste mode")) return t.autoError;
    if (rawMessage.includes("Invalid job URL")) return t.autoMissing;
    return rawMessage || fallback;
  };

  const resumeUploadMessage = (status: ResumeStatus) => {
    const sections = joinList(status.sections?.slice(0, 5), language);
    if (language === "zh") {
      return sections
        ? `简历已读取：${status.chunk_count} 个模块（${sections}）。${t.uploadNextStep}`
        : `${t.uploadSuccess}${t.uploadNextStep}`;
    }
    return sections
      ? `Resume parsed: ${status.chunk_count} sections (${sections}). ${t.uploadNextStep}`
      : `${t.uploadSuccess} ${t.uploadNextStep}`;
  };

  function cancelUpload() {
    uploadRequestIdRef.current += 1;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    setUploadStatus("idle");
    setMessage(t.uploadCanceled);
  }

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (uploadStatus === "running") {
      event.target.value = "";
      return;
    }
    const requestId = uploadRequestIdRef.current + 1;
    uploadRequestIdRef.current = requestId;
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, RESUME_UPLOAD_TIMEOUT_MS);
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = controller;
    setUploadStatus("running");
    setRunStatus("idle");
    setManualStatus("idle");
    setJobFetchStatus("idle");
    setImportStatus("idle");
    setSelectedApplyStatus("idle");
    setMessage(t.uploadWorking);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_BASE}/api/resume-index`, {
        method: "POST",
        body,
        signal: controller.signal
      });
      if (requestId !== uploadRequestIdRef.current) return;
      if (!response.ok) throw new Error(await parseApiError(response));
      const status = (await response.json()) as ResumeStatus;
      setResume(status);
      setUploadStatus("success");
      setMessage(resumeUploadMessage(status));
    } catch (error) {
      if (requestId !== uploadRequestIdRef.current) return;
      const rawMessage = error instanceof Error ? error.message : t.uploadError;
      setUploadStatus("error");
      setMessage(timedOut ? t.uploadTimeout : friendlyError(rawMessage, t.uploadError));
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === uploadRequestIdRef.current) {
        uploadAbortRef.current = null;
      }
      event.target.value = "";
    }
  }

  async function runAgent() {
    if (!resume?.exists) return;
    setRunStatus("running");
    setUploadStatus("idle");
    setManualStatus("idle");
    setJobFetchStatus("idle");
    setImportStatus("idle");
    setSelectedApplyStatus("idle");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since: sinceDate, top: topDrafts, min_score: minScore, language })
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      setRun((await response.json()) as AgentRun);
      setSelectedIndex(0);
      setState("ready");
      await loadRuns();
      setRunStatus("success");
      setMessage(t.scanSuccess);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t.scanError;
      setRunStatus("error");
      setMessage(friendlyError(rawMessage, t.scanError));
    }
  }

  function updateManualJob(key: keyof ManualJobForm, value: string) {
    setManualJob((current) => ({ ...current, [key]: value }));
  }

  function jobFromLead(lead: Lead, description = ""): ManualJobForm {
    return {
      title: lead.title,
      company: lead.company,
      location: lead.location || "",
      url: lead.url || "",
      description
    };
  }

  async function readJobPreview(targetUrl: string) {
    const response = await fetchWithTimeout(
      `${API_BASE}/api/job-url-preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl })
      },
      JOB_URL_READ_TIMEOUT_MS
    );
    if (!response.ok) throw new Error(await parseApiError(response));
    const preview = (await response.json()) as JobUrlPreview;
    if (preview.ok === false) throw new Error(preview.detail || t.autoError);
    return preview;
  }

  async function requestManualJobRun(job: ManualJobForm) {
    const response = await fetch(`${API_BASE}/api/manual-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...job, language })
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    setRun((await response.json()) as AgentRun);
    setSelectedIndex(0);
    setState("ready");
    await loadRuns();
  }

  async function fetchJobUrl(urlOverride?: string) {
    const targetUrl = (urlOverride ?? manualJob.url).trim();
    if (!targetUrl) {
      setJobFetchStatus("error");
      setMessage(t.autoMissing);
      return;
    }

    setJobFetchStatus("running");
    setManualStatus("idle");
    setRunStatus("idle");
    setUploadStatus("idle");
    setImportStatus("idle");
    setSelectedApplyStatus("idle");
    setMessage("");
    try {
      const preview = await readJobPreview(targetUrl);
      setManualJob((current) => ({
        title: preview.title || current.title,
        company: preview.company || current.company,
        location: preview.location || current.location,
        url: preview.url || targetUrl,
        description: preview.description || current.description
      }));
      setJobLeadNote("");
      setJobFetchStatus("success");
      setMessage(t.autoSuccess);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t.autoError;
      setJobFetchStatus("error");
      setMessage(friendlyError(rawMessage, t.autoError));
    }
  }

  async function loadImportedJob() {
    setImportStatus("running");
    setManualStatus("idle");
    setRunStatus("idle");
    setUploadStatus("idle");
    setJobFetchStatus("idle");
    setSelectedApplyStatus("idle");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/imported-jobs/latest`);
      if (!response.ok) throw new Error(await parseApiError(response));
      const payload = (await response.json()) as { ok: boolean; detail?: string; job?: JobUrlPreview };
      if (!payload.ok || !payload.job) throw new Error(payload.detail || t.importedEmpty);
      const imported = payload.job;
      setManualJob((current) => ({
        title: imported.title || current.title,
        company: imported.company || current.company,
        location: imported.location || current.location,
        url: imported.url || current.url,
        description: imported.description || current.description
      }));
      setJobLeadNote("");
      setImportStatus("success");
      setMessage(t.importedSuccess);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t.importedEmpty;
      setImportStatus("error");
      setMessage(rawMessage.includes("No imported job found") ? t.importedEmpty : friendlyError(rawMessage, t.importedEmpty));
    }
  }

  async function openLoginBrowser(urlOverride?: string, successMessage: string = t.loginBrowserOpenSuccess) {
    const targetUrl = (urlOverride ?? manualJob.url).trim();
    if (!targetUrl) {
      setBrowserOpenStatus("error");
      setMessage(t.autoMissing);
      return false;
    }

    setBrowserOpenStatus("running");
    setManualStatus("idle");
    setRunStatus("idle");
    setUploadStatus("idle");
    setJobFetchStatus("idle");
    setImportStatus("idle");
    setSelectedApplyStatus("idle");
    setJobInputMode("browser");
    setMessage(t.loginBrowserOpeningHint);
    try {
      const response = await fetchWithTimeout(
        `${API_BASE}/api/browser-session/open`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl })
        },
        LOGIN_BROWSER_OPEN_TIMEOUT_MS
      );
      if (!response.ok) throw new Error(await parseApiError(response));
      const payload = (await response.json()) as { ok: boolean; detail?: string };
      if (!payload.ok) throw new Error(payload.detail || t.loginBrowserInstallMissing);
      setManualJob((current) => ({ ...current, url: targetUrl }));
      setBrowserOpenStatus("success");
      setMessage(successMessage);
      return true;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t.loginBrowserInstallMissing;
      setBrowserOpenStatus("error");
      setMessage(rawMessage.includes("Playwright") ? t.loginBrowserInstallMissing : friendlyError(rawMessage, t.loginBrowserInstallMissing));
      return false;
    }
  }

  async function readLoginBrowserJob() {
    setImportStatus("running");
    setBrowserOpenStatus("idle");
    setManualStatus("idle");
    setRunStatus("idle");
    setUploadStatus("idle");
    setJobFetchStatus("idle");
    setSelectedApplyStatus("idle");
    setMessage(t.loginBrowserReadingHint);
    try {
      const response = await fetchWithTimeout(
        `${API_BASE}/api/browser-session/import-current`,
        { method: "POST" },
        LOGIN_BROWSER_READ_TIMEOUT_MS
      );
      if (!response.ok) throw new Error(await parseApiError(response));
      const payload = (await response.json()) as { ok: boolean; detail?: string; job?: JobUrlPreview };
      if (!payload.ok || !payload.job) throw new Error(payload.detail || t.importedEmpty);
      const imported = payload.job;
      const job = {
        title: imported.title,
        company: imported.company,
        location: imported.location,
        url: imported.url,
        description: imported.description
      };
      setManualJob(job);
      setJobLeadNote("");
      if (resume?.exists && job.description.trim().length >= 20) {
        await requestManualJobRun(job);
        setManualStatus("success");
      }
      setImportStatus("success");
      setMessage(t.loginBrowserReadSuccess);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t.importedEmpty;
      setImportStatus("error");
      setMessage(rawMessage.includes("Playwright") ? t.loginBrowserInstallMissing : friendlyError(rawMessage, t.importedEmpty));
    }
  }

  function readSelectedJobUrl() {
    const lead = selected?.scored_lead.lead;
    if (!lead?.url) return;
    setJobInputMode("auto");
    setJobLeadNote(lead.raw_excerpt || "");
    setManualJob((current) => ({
      title: lead.title || current.title,
      company: lead.company || current.company,
      location: lead.location || current.location,
      url: lead.url,
      description: current.description
    }));
    void fetchJobUrl(lead.url);
  }

  async function applySelectedJob() {
    const lead = selected?.scored_lead.lead;
    if (!lead) return;
    if (!resume?.exists) {
      setSelectedApplyStatus("error");
      setMessage(t.resumeMissing);
      return;
    }

    const baseJob = jobFromLead(lead);
    setJobLeadNote(lead.raw_excerpt || "");
    setSelectedApplyStatus("running");
    setManualStatus("idle");
    setRunStatus("idle");
    setUploadStatus("idle");
    setJobFetchStatus("running");
    setImportStatus("idle");
    setJobInputMode("auto");
    setManualJob(baseJob);
    setMessage("");

    if (!lead.url) {
      setSelectedApplyStatus("error");
      setJobFetchStatus("error");
      setJobInputMode("manual");
      setMessage(t.quickApplyMissing);
      document.getElementById("manual")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    try {
      const preview = await readJobPreview(lead.url);
      const detailedJob = {
        title: preview.title || baseJob.title,
        company: preview.company || baseJob.company,
        location: preview.location || baseJob.location,
        url: preview.url || baseJob.url,
        description: preview.description || baseJob.description
      };
      setManualJob(detailedJob);
      setJobLeadNote("");
      await requestManualJobRun(detailedJob);
      setJobFetchStatus("success");
      setManualStatus("success");
      setSelectedApplyStatus("success");
      setMessage(t.quickApplySuccess);
    } catch (error) {
      setJobFetchStatus("error");
      setSelectedApplyStatus("error");
      setJobInputMode("browser");
      setManualJob(baseJob);
      await openLoginBrowser(lead.url, t.quickApplyFallback);
      document.getElementById("manual")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function runManualJob() {
    if (!resume?.exists) {
      setManualStatus("error");
      setMessage(t.resumeMissing);
      return;
    }
    if (!manualJob.title.trim() || !manualJob.company.trim() || manualJob.description.trim().length < 20) {
      setManualStatus("error");
      setMessage(t.manualMissing);
      return;
    }

    setManualStatus("running");
    setRunStatus("idle");
    setUploadStatus("idle");
    setJobFetchStatus("idle");
    setImportStatus("idle");
    setSelectedApplyStatus("idle");
    setBrowserOpenStatus("idle");
    setMessage("");
    try {
      await requestManualJobRun(manualJob);
      setManualStatus("success");
      setMessage(t.manualSuccess);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t.scanError;
      setManualStatus("error");
      setMessage(friendlyError(rawMessage, t.scanError));
    }
  }

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 1400);
  }

  const selected = run?.selected_jobs[selectedIndex] ?? run?.selected_jobs[0];
  const selectedDraft = useMemo(() => {
    if (!run || !selected) return undefined;
    return (
      run.drafts[selectedIndex] ??
      run.drafts.find(
        (draft) =>
          draft.job_title === selected.scored_lead.lead.title &&
          draft.company === selected.scored_lead.lead.company
      )
    );
  }, [run, selected, selectedIndex]);
  const selectedDraftPackage = useMemo(() => {
    if (!selectedDraft) return "";
    return [
      `# ${t.applicationDraft}`,
      `## ${t.resumeFocus}`,
      ...selectedDraft.resume_focus.map((item) => `- ${item}`),
      `## ${t.coverLetter}`,
      selectedDraft.cover_letter,
      `## ${t.recruiterMessage}`,
      selectedDraft.recruiter_message,
      `## ${t.notes}`,
      ...selectedDraft.application_notes.map((item) => `- ${item}`)
    ].join("\n\n");
  }, [selectedDraft, t.applicationDraft, t.resumeFocus, t.coverLetter, t.recruiterMessage, t.notes]);

  function selectJob(index: number) {
    setSelectedIndex(index);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      window.setTimeout(() => {
        document.getElementById("job-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }

  const visibleRuns = showAllRuns ? runs : runs.slice(0, 4);
  const isInitialLoading = state === "loading" && !run;

  return (
    <main className="app-backdrop min-h-screen text-ink">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-5 py-5 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="sidebar-panel rounded-md p-4 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)]">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t.appName}</p>
              <p className="text-xs text-muted">
                {run ? `${t.run} ${displayRunId(run.id, language)}` : isInitialLoading ? t.loading : t.noRun}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-white/10 bg-white/10 p-2">
            <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-muted">
              <Languages className="h-3.5 w-3.5" />
              {t.language}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <LanguageButton active={language === "zh"} label={t.chinese} onClick={() => setLanguage("zh")} />
              <LanguageButton active={language === "en"} label={t.english} onClick={() => setLanguage("en")} />
            </div>
          </div>

          <nav className="mt-5 space-y-1 text-sm">
            <NavItem href="#overview" active={activeSection === "overview"} icon={<BriefcaseBusiness className="h-4 w-4" />} label={t.overview} />
            <NavItem href="#setup" active={activeSection === "setup"} icon={<SlidersHorizontal className="h-4 w-4" />} label={t.navStart} />
            <NavItem href="#manual" active={activeSection === "manual"} icon={<Clipboard className="h-4 w-4" />} label={t.navOneJob} />
            <NavItem href="#jobs" active={activeSection === "jobs"} icon={<Mail className="h-4 w-4" />} label={t.navShortlist} />
            <NavItem href="#drafts" active={activeSection === "drafts"} icon={<FileText className="h-4 w-4" />} label={t.navDrafts} />
            <NavItem href="#history" active={activeSection === "history"} icon={<History className="h-4 w-4" />} label={t.navHistory} />
          </nav>

          <div className="mt-6 rounded-md border border-emerald-300/30 bg-emerald-400/12 p-3 text-sm text-emerald-50">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" /> {t.safeTitle}
            </div>
            <p className="mt-2 leading-5">{t.safeBody}</p>
          </div>
        </aside>

        <section className="space-y-5">
          <header id="overview" className="hero-panel fade-lift rounded-md p-5 shadow-soft">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-100">{t.productName}</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-normal text-white">{t.headline}</h1>
                <p className="mt-2 text-sm text-blue-50">{t.subline}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label={t.jobs} value={isInitialLoading ? "..." : (run?.selected_jobs.length ?? 0).toString()} />
                <Metric label={t.drafts} value={isInitialLoading ? "..." : (run?.drafts.length ?? 0).toString()} />
                <Metric label={t.steps} value={isInitialLoading ? "..." : (run?.steps.length ?? 0).toString()} />
              </div>
            </div>
          </header>

          <section className="route-panel flow-panel fade-lift rounded-md p-3" aria-label={t.pathPickerTitle}>
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-accent">{t.controls}</p>
                <h2 className="mt-1 text-base font-semibold">{t.pathPickerTitle}</h2>
              </div>
              <p className="max-w-xl text-xs leading-5 text-muted">{t.pathPickerBody}</p>
            </div>
            <div className="grid gap-2 lg:grid-cols-3">
              <PathLink step="1" href="#setup" icon={<Mail className="h-4 w-4" />} title={t.pathMailTitle} body={t.pathMailBody} />
              <PathLink step="2" href="#manual" icon={<FileText className="h-4 w-4" />} title={t.pathJobTitle} body={t.pathJobBody} />
              <PathLink step="3" href="#drafts" icon={<Clipboard className="h-4 w-4" />} title={t.pathDraftTitle} body={t.pathDraftBody} />
            </div>
          </section>

          <section id="setup" className="fade-lift space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-accent">{t.controls}</p>
                <h2 className="mt-1 text-xl font-semibold">{t.headline}</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{t.subline}</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.92fr_1.28fr]">
              <section className="workflow-card rounded-md p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">1</div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-normal text-accent">{t.mailPathTitle}</p>
                    <h3 className="mt-1 text-lg font-semibold">{t.agentStepTitle}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted">{t.mailPathBody}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-line bg-white/80 px-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold text-muted">{t.resumeStep}</p>
                      <p className="mt-1 text-sm font-semibold text-ink">{resume?.exists ? t.resumeReady : t.resumeStepTitle}</p>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        {resume?.exists
                          ? `${resume.chunk_count} ${language === "zh" ? "段简历内容" : "resume sections"} · ${formatModified(resume.modified_at, language)}`
                          : t.resumeMissing}
                      </p>
                    </div>
                  <span
                    className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ${
                      resume?.exists ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-amber-50 text-amber-800 ring-1 ring-amber-100"
                    }`}
                  >
                    {resume?.exists ? (language === "zh" ? "已准备" : "Ready") : language === "zh" ? "待上传" : "Missing"}
                  </span>
                </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label
                      aria-disabled={uploadStatus === "running"}
                      className={`inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-ink transition ${
                        uploadStatus === "running"
                          ? "cursor-not-allowed bg-white/60 opacity-80"
                          : "cursor-pointer bg-white hover:border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {uploadStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploadStatus === "running" ? t.uploading : t.uploadResume}
                      <input
                        className="hidden"
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={uploadStatus === "running"}
                        onChange={uploadResume}
                      />
                    </label>
                    {uploadStatus === "running" && (
                      <button
                        type="button"
                        onClick={cancelUpload}
                        className="inline-flex h-10 items-center rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        {t.cancelUpload}
                      </button>
                    )}
                  </div>
                  {uploadStatus === "running" && <p className="mt-2 text-xs leading-5 text-muted">{t.uploadWorking}</p>}
                  {resume?.exists && Boolean(resume.keywords?.length) && (
                    <p className="mt-2 text-xs leading-5 text-muted">
                      {t.resumeKeywordsLabel}: <span className="text-ink">{joinList(resume.keywords?.slice(0, 6), language)}</span>
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-muted">{t.readSince}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <RangeButton active={sinceDate === dateOffset(0)} label={t.today} onClick={() => setSinceDate(dateOffset(0))} />
                    <RangeButton active={sinceDate === dateOffset(1)} label={t.yesterday} onClick={() => setSinceDate(dateOffset(1))} />
                    <RangeButton active={sinceDate === dateOffset(2)} label={t.last3Days} onClick={() => setSinceDate(dateOffset(2))} />
                    <RangeButton active={sinceDate === dateOffset(6)} label={t.last7Days} onClick={() => setSinceDate(dateOffset(6))} />
                  </div>
                  <input
                    aria-label={t.customDate}
                    className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-medium outline-none focus:border-accent"
                    type="date"
                    value={sinceDate}
                    onChange={(event) => setSinceDate(event.target.value)}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <NumberField label={t.topDrafts} hint={t.topDraftsHint} value={topDrafts} min={1} max={10} onChange={setTopDrafts} />
                  <NumberField label={t.minScore} hint={t.minScoreHint} value={minScore} min={0} max={100} onChange={setMinScore} />
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void loadLatest()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white/85 px-3 text-sm font-semibold hover:border-blue-200 hover:bg-blue-50"
                  >
                    <RefreshCw className="h-4 w-4" /> {t.refresh}
                  </button>
                  <button
                    type="button"
                    onClick={runAgent}
                    disabled={runStatus === "running" || !resume?.exists}
                    className="primary-action inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {runStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {runStatus === "running" ? t.scanning : t.startScan}
                  </button>
                </div>
                {!resume?.exists && <p className="mt-2 text-xs leading-5 text-amber-700">{t.resumeRequiredHint}</p>}
              </section>

              <section id="manual" className="workflow-card rounded-md p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white">2</div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-normal text-accent">{t.singleJobPathTitle}</p>
                      <h3 className="mt-1 text-lg font-semibold">{t.manualTitle}</h3>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{t.singleJobPathBody}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 rounded-md border border-line bg-slate-50 p-1">
                    <ModeButton active={jobInputMode === "auto"} label={t.autoMode} onClick={() => setJobInputMode("auto")} />
                    <ModeButton active={jobInputMode === "browser"} label={t.browserMode} onClick={() => setJobInputMode("browser")} />
                    <ModeButton
                      active={jobInputMode === "manual"}
                      label={t.manualMode}
                      onClick={() => {
                        setJobInputMode("manual");
                        setJobLeadNote("");
                      }}
                    />
                  </div>
                </div>

                {jobInputMode === "auto" && (
                  <div className="mt-4 rounded-md border border-blue-100 bg-blue-50/70 p-3">
                    <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
                      <TextField label={t.manualUrl} value={manualJob.url} onChange={(value) => updateManualJob("url", value)} />
                      {selected?.scored_lead.lead.url && (
                        <button
                          type="button"
                          onClick={readSelectedJobUrl}
                          disabled={jobFetchStatus === "running"}
                          className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {t.useSelectedJobLink}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void fetchJobUrl()}
                        disabled={jobFetchStatus === "running"}
                        className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-md border border-blue-200 bg-white px-4 text-sm font-semibold text-accent hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {jobFetchStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {jobFetchStatus === "running" ? t.autoFetching : t.autoFetch}
                      </button>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted">{t.autoHint}</p>
                  </div>
                )}

                {jobInputMode === "browser" && (
                  <div className="mt-4 rounded-md border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-100">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {t.credentialSafety}
                        </div>
                        <h4 className="text-sm font-semibold">{t.browserImportTitle}</h4>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{t.browserImportBody}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => void openLoginBrowser()}
                          disabled={browserOpenStatus === "running" || importStatus === "running"}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {browserOpenStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                          {browserOpenStatus === "running" ? t.openingLoginBrowser : t.openLoginBrowser}
                        </button>
                        <button
                          type="button"
                          onClick={() => void readLoginBrowserJob()}
                          disabled={importStatus === "running" || browserOpenStatus === "running"}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-accent hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {importStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          {importStatus === "running" ? t.readingLoginBrowser : t.readLoginBrowser}
                        </button>
                      </div>
                    </div>
                    {(browserOpenStatus === "running" || importStatus === "running") && (
                      <div className="mt-3 rounded-md border border-blue-100 bg-white/85 px-3 py-2 text-sm font-semibold text-accent shadow-sm">
                        {message || (importStatus === "running" ? t.loginBrowserReadingHint : t.loginBrowserOpeningHint)}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <TextField label={t.manualJobTitle} value={manualJob.title} onChange={(value) => updateManualJob("title", value)} />
                  <TextField label={t.manualCompany} value={manualJob.company} onChange={(value) => updateManualJob("company", value)} />
                  <TextField label={t.manualLocation} value={manualJob.location} onChange={(value) => updateManualJob("location", value)} />
                </div>

                {(jobInputMode === "manual" || jobInputMode === "browser") && (
                  <div className="mt-3">
                    <TextField label={t.manualUrl} value={manualJob.url} onChange={(value) => updateManualJob("url", value)} />
                  </div>
                )}

                {jobLeadNote && (
                  <section className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                    <div className="font-semibold">{t.leadSnippetTitle}</div>
                    <p className="mt-1 leading-5">{t.leadSnippetBody}</p>
                    <p className="mt-2 max-h-24 overflow-auto rounded-md bg-white/70 px-3 py-2 text-xs leading-5 text-amber-950">{jobLeadNote}</p>
                  </section>
                )}

                <label className="mt-3 block">
                  <span className="mb-2 block text-sm font-semibold text-muted">{t.manualDescription}</span>
                  <textarea
                    value={manualJob.description}
                    onChange={(event) => updateManualJob("description", event.target.value)}
                    placeholder={t.manualDescriptionPlaceholder}
                    className="min-h-40 w-full resize-y rounded-md border border-line bg-white/85 px-3 py-3 text-sm leading-6 outline-none transition focus:border-accent focus:bg-white"
                  />
                </label>

                <section className="mt-3 rounded-md border border-line bg-white/75 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold">{t.manualReadyTitle}</h4>
                    <span className="text-xs text-muted">{t.manualReadyHint}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ReadinessItem ok={Boolean(resume?.exists)} label={t.manualReadyResume} />
                    <ReadinessItem ok={manualTitleReady} label={t.manualReadyTitleField} />
                    <ReadinessItem ok={manualCompanyReady} label={t.manualReadyCompany} />
                    <ReadinessItem ok={manualDescriptionReady} label={t.manualReadyDescription} />
                  </div>
                </section>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={runManualJob}
                    disabled={manualStatus === "running" || !manualCanGenerate}
                    className="primary-action inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {manualStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {manualStatus === "running" ? t.manualGenerating : t.manualGenerate}
                  </button>
                </div>
                {!resume?.exists && <p className="mt-2 text-right text-xs leading-5 text-amber-700">{t.resumeRequiredHint}</p>}
              </section>
            </div>
          </section>

          {message && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                runStatus === "error" ||
                uploadStatus === "error" ||
                manualStatus === "error" ||
                jobFetchStatus === "error" ||
                importStatus === "error" ||
                selectedApplyStatus === "error" ||
                browserOpenStatus === "error"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {message}
            </div>
          )}

          {run && (
            <section className="result-summary-panel fade-lift rounded-md p-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-accent">{t.currentResult}</p>
                  <h2 className="mt-1 text-lg font-semibold">{displayRunId(run.id, language)}</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{t.currentResultBody}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {run.steps.map((step) => (
                      <span key={step.name} className="result-step-chip">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        {stepLabels[language][step.name] ?? step.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <ResultMetric label={t.resultJobs} value={run.selected_jobs.length.toString()} />
                  <ResultMetric label={t.resultDrafts} value={run.drafts.length.toString()} />
                  <ResultMetric label={t.resultSteps} value={run.steps.length.toString()} />
                </div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <a className="next-step-link rounded-md px-3 py-2" href="#jobs">
                  <span className="next-step-number">1</span>
                  <span>
                    <span className="block text-sm font-semibold">{t.nextStepPick}</span>
                    <span className="text-xs text-muted">{t.selectedJobs}</span>
                  </span>
                </a>
                <a className="next-step-link rounded-md px-3 py-2" href="#job-detail">
                  <span className="next-step-number">2</span>
                  <span>
                    <span className="block text-sm font-semibold">{t.nextStepRead}</span>
                    <span className="text-xs text-muted">{t.applySelected}</span>
                  </span>
                </a>
                <a className="next-step-link rounded-md px-3 py-2" href="#drafts">
                  <span className="next-step-number">3</span>
                  <span>
                    <span className="block text-sm font-semibold">{t.nextStepReview}</span>
                    <span className="text-xs text-muted">{t.applicationDraft}</span>
                  </span>
                </a>
              </div>
            </section>
          )}



          {state === "loading" && !run && <StatePanel title={t.loading} body="" loading />}
          {state === "error" && !run && <StatePanel title={t.apiError} body={t.emptyBody} />}
          {state === "empty" && !run && <StatePanel title={t.emptyTitle} body={t.emptyBody} />}

          {run && (
            <>
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)]">
                <div id="jobs" className="surface-panel rounded-md p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">{t.selectedJobs}</h2>
                      <p className="mt-1 text-xs leading-5 text-muted">{t.selectedJobsHint}</p>
                    </div>
                    <span className="text-xs text-muted">
                      {run.selected_jobs.length} {language === "zh" ? t.shortlistCount : t.shortlistCount}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {run.selected_jobs.length ? (
                      run.selected_jobs.map((analysis, index) => {
                        const lead = analysis.scored_lead.lead;
                        const isSelected = selectedIndex === index;
                        return (
                          <button
                            key={`${lead.company}-${lead.title}-${index}`}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => selectJob(index)}
                            className={`w-full rounded-md border p-3 text-left transition ${
                              isSelected ? "job-card-selected border-accent bg-blue-50" : "job-card border-line bg-white/85 hover:border-blue-200"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                {isSelected && (
                                  <span className="mb-2 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold text-accent ring-1 ring-blue-100">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {t.selected}
                                  </span>
                                )}
                                <p className="text-sm font-semibold">{lead.title}</p>
                                <p className="mt-1 text-xs text-muted">{lead.company}</p>
                                <p className="mt-1 text-xs text-muted">{lead.location}</p>
                              </div>
                              <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${scoreTone(analysis.scored_lead.score)}`}>
                                {matchScoreLabel(analysis.scored_lead.score, language)}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {analysis.scored_lead.reasons.slice(0, 3).map((reason, reasonIndex) => (
                                <span key={`${reason}-${reasonIndex}`} className="rounded-md bg-white px-2 py-1 text-xs text-muted ring-1 ring-line">
                                  {reasonName(reason, language)}
                                </span>
                              ))}
                            </div>
                            <div className="mt-3 flex items-center justify-end text-xs font-semibold text-accent">
                              {t.viewJobDetail}
                              <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="font-semibold">{t.noJobsTitle}</p>
                        <p className="mt-1 leading-5">{t.noJobsBody}</p>
                      </div>
                    )}
                          </div>
                </div>

                <section className="space-y-5">
                  {selected && (
                    <section id="job-detail" className="surface-panel rounded-md p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-normal text-accent">{t.selectedJobDetail}</p>
                          <p className="text-sm font-medium text-accent">{selected.scored_lead.lead.company}</p>
                          <h2 className="mt-1 text-xl font-semibold">{selected.scored_lead.lead.title}</h2>
                          <p className="mt-1 text-sm text-muted">{selected.scored_lead.lead.location}</p>
                          <p className="mt-2 max-w-xl text-xs leading-5 text-muted">{t.selectedJobDetailBody}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                          <button
                            type="button"
                            onClick={() => void applySelectedJob()}
                            disabled={selectedApplyStatus === "running" || !resume?.exists || !selected.scored_lead.lead.url}
                            className="secondary-action inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {selectedApplyStatus === "running" ? <Clock3 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            {selectedApplyStatus === "running" ? t.applyingSelected : t.applySelected}
                          </button>
                          {selectedDraft && (
                            <a
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-accent hover:bg-blue-100"
                              href="#drafts"
                            >
                              {t.reviewApplicationPackage} <ArrowRight className="h-4 w-4" />
                            </a>
                          )}
                          {selected.scored_lead.lead.url && (
                            <a
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white/80 px-3 text-sm font-semibold hover:border-blue-200 hover:bg-blue-50"
                              href={selected.scored_lead.lead.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t.openOriginalJob} <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          {!resume?.exists && <p className="w-full text-xs leading-5 text-amber-700 lg:text-right">{t.resumeRequiredHint}</p>}
                          {resume?.exists && !selected.scored_lead.lead.url && (
                            <p className="w-full text-xs leading-5 text-amber-700 lg:text-right">{t.jobLinkRequiredHint}</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <InfoBlock title={t.resumeEvidence}>
                          {selected.evidence_matches.length ? (
                            selected.evidence_matches.slice(0, 2).map((match, index) => (
                              <div key={`${match.evidence.section}-${index}`} className="rounded-md border border-line bg-white/75 p-3">
                                <div className="flex justify-between gap-3 text-xs font-semibold text-muted">
                                  <span>{match.evidence.section}</span>
                                  <span>{match.score} {t.points}</span>
                                </div>
                                <p className="mt-2 text-sm leading-5">{firstLines(match.evidence.text)}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted">{t.noEvidence}</p>
                          )}
                        </InfoBlock>

                        <InfoBlock title={t.missingKeywords}>
                          <div className="flex flex-wrap gap-2">
                            {selected.missing_keywords.length ? (
                              selected.missing_keywords.slice(0, 10).map((keyword) => (
                                <span key={keyword} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                                  {keyword}
                                </span>
                              ))
                            ) : (
                              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                {t.noKeywordGap}
                              </span>
                            )}
                          </div>
                        </InfoBlock>
                      </div>
                    </section>
                  )}

                  {selectedDraft && (
                    <section id="drafts" className="surface-panel rounded-md p-4">
                      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h2 className="text-base font-semibold">{t.applicationDraft}</h2>
                          <p className="mt-1 text-xs leading-5 text-muted">{t.draftReviewHint}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <button
                            type="button"
                            onClick={() => void copyText("package", selectedDraftPackage)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 text-xs font-semibold text-accent hover:bg-blue-50"
                          >
                            {copiedKey === "package" ? <Check className="h-3.5 w-3.5 text-success" /> : <Clipboard className="h-3.5 w-3.5" />}
                            {copiedKey === "package" ? t.copied : t.copyPackage}
                          </button>
                          <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-accent">
                            {t.draftLanguage}: {draftLanguageName(selectedDraft.communication_language, language)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            <UserCheck className="h-3.5 w-3.5" /> {t.reviewRequired}
                          </span>
                        </div>
                      </div>

                      <DraftSection step="1" title={t.resumeFocus} items={selectedDraft.resume_focus} />
                      <TextBlock
                        step="2"
                        title={t.coverLetter}
                        text={selectedDraft.cover_letter}
                        copyLabel={copiedKey === "cover" ? t.copied : t.copy}
                        onCopy={() => void copyText("cover", selectedDraft.cover_letter)}
                      />
                      <TextBlock
                        step="3"
                        title={t.recruiterMessage}
                        text={selectedDraft.recruiter_message}
                        copyLabel={copiedKey === "recruiter" ? t.copied : t.copy}
                        onCopy={() => void copyText("recruiter", selectedDraft.recruiter_message)}
                      />
                      <DraftSection step="4" title={t.notes} items={selectedDraft.application_notes} />
                    </section>
                  )}
                  {!selectedDraft && (
                    <section id="drafts" className="surface-panel rounded-md p-4">
                      <h2 className="text-base font-semibold">{t.noDraftTitle}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted">{t.noDraftBody}</p>
                    </section>
                  )}
                </section>
              </section>
            </>
          )}

          <section id="history" className="surface-panel fade-lift rounded-md p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">{t.recentRuns}</h2>
                <p className="mt-1 text-xs leading-5 text-muted">{t.historyHint}</p>
              </div>
              <span className="text-xs font-semibold text-muted">
                {runs.length} {t.runsCount}
              </span>
            </div>
            {visibleRuns.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {visibleRuns.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => void loadRun(item.id)}
                    className={`rounded-md border p-3 text-left transition ${
                      run?.id === item.id ? "border-accent bg-blue-50" : "border-line bg-white/80 hover:border-blue-200 hover:bg-blue-50/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold" title={displayRunId(item.id, language)}>
                        {displayRunId(item.id, language)}
                      </span>
                      {run?.id === item.id && <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-accent">{t.selected}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {t.updated} {formatModified(item.modified_at, language)}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {item.selected_job_count} {t.jobs} · {item.draft_count} {t.drafts}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-line bg-white/70 p-3 text-sm text-muted">{t.emptyBody}</p>
            )}
            {runs.length > 4 && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAllRuns((value) => !value)}
                  className="inline-flex h-9 items-center rounded-md border border-line bg-white/80 px-3 text-sm font-semibold text-accent hover:border-blue-200 hover:bg-blue-50"
                >
                  {showAllRuns ? t.showLessRuns : t.showAllRuns}
                </button>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function NavItem({ href, icon, label, active = false }: { href: string; icon: ReactNode; label: string; active?: boolean }) {
  return (
    <a
      className={`flex items-center gap-2 rounded-md px-3 py-2 ${active ? "nav-link-active" : ""}`}
      href={href}
    >
      {icon}
      {label}
    </a>
  );
}

function LanguageButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md px-2 py-1.5 text-sm font-semibold transition ${
        active ? "bg-white text-accent shadow-sm ring-1 ring-line" : "text-muted hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-9 rounded-md px-3 text-sm font-semibold transition ${
        active ? "bg-white text-accent shadow-sm ring-1 ring-line" : "text-muted hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}

function PathLink({
  step,
  href,
  icon,
  title,
  body
}: {
  step: string;
  href: string;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <a href={href} className="path-link rounded-md px-3 py-2.5">
      <span className="path-step-number">{step}</span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-accent shadow-sm ring-1 ring-line">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-muted">{body}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-accent" />
    </a>
  );
}

function BrowserImportStep({ step, title, body, children }: { step: string; title: string; body: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-white/80 bg-white/80 p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white">
          {step}
        </div>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <p className="mb-3 text-sm leading-6 text-muted">{body}</p>
      {children}
    </section>
  );
}

function ActionPanel({ step, eyebrow, title, children }: { step: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className={`action-panel action-panel-${step} fade-lift rounded-md p-4`}>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-sm font-bold text-accent">{step}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-accent">{eyebrow}</p>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function RangeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 rounded-md border px-3 text-sm font-semibold transition ${
        active ? "border-accent bg-blue-50 text-accent" : "border-line bg-white text-muted hover:border-blue-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value))))}
        className="h-12 w-full rounded-md border border-line bg-white px-3 text-xl font-semibold outline-none focus:border-accent"
      />
      {hint && <span className="mt-1 block text-xs leading-5 text-muted">{hint}</span>}
    </label>
  );
}

function ReadinessItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${
      ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"
    }`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      {label}
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold text-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-md border border-line bg-white/85 px-3 text-sm outline-none transition focus:border-accent focus:bg-white"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card min-w-20 rounded-md px-4 py-3">
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-medium text-blue-50">{label}</div>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white/85 px-3 py-3">
      <div className="text-xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs font-semibold text-muted">{label}</div>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DraftSection({ step, title, items }: { step: string; title: string; items: string[] }) {
  return (
    <section className="draft-card mb-3 rounded-md p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="draft-step">{step}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="rounded-md border border-line bg-white/80 px-3 py-2 text-sm leading-5">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TextBlock({
  step,
  title,
  text,
  copyLabel,
  onCopy
}: {
  step: string;
  title: string;
  text: string;
  copyLabel: string;
  onCopy: () => void;
}) {
  const copied = copyLabel === translations.en.copied || copyLabel === translations.zh.copied;
  return (
    <section className="draft-card mb-3 rounded-md p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="draft-step">{step}</span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 text-xs font-semibold text-accent hover:bg-blue-50"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Clipboard className="h-3.5 w-3.5" />}
          {copyLabel}
        </button>
      </div>
      <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-white/80 p-3 text-sm leading-6">
        {text}
      </div>
    </section>
  );
}

function StatePanel({ title, body, loading = false }: { title: string; body: string; loading?: boolean }) {
  return (
    <section className="rounded-md border border-line bg-panel p-5 shadow-soft">
      <div className="flex items-center gap-3">
        {loading ? <Clock3 className="h-5 w-5 animate-spin text-accent" /> : <AlertTriangle className="h-5 w-5 text-warning" />}
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {body && <p className="mt-1 text-sm text-muted">{body}</p>}
        </div>
      </div>
    </section>
  );
}

export default App;
