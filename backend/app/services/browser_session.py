from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from backend.app.services.job_url_reader import (
    looks_like_blocked_or_login_page,
    looks_like_job_description,
    trim_job_description_text,
    validate_public_http_url,
)


class BrowserSessionError(RuntimeError):
    pass


_lock = asyncio.Lock()
_playwright: Any | None = None
_context: Any | None = None
_page: Any | None = None
PAGE_TITLE_TIMEOUT_SECONDS = 3
PAGE_READ_TIMEOUT_SECONDS = 8
EXPECTED_TOKEN_STOPWORDS = {
    "and",
    "the",
    "for",
    "with",
    "job",
    "jobs",
    "role",
    "view",
    "apply",
    "career",
    "careers",
    "internship",
    "intern",
    "graduate",
    "junior",
    "senior",
    "australia",
    "sydney",
    "melbourne",
    "nsw",
    "vic",
    "pty",
    "ltd",
    "limited",
    "service",
    "services",
    "technology",
    "technologies",
    "group",
    "company",
    "web",
}
LINKEDIN_JOB_DETAIL_MARKERS = (
    "about the job",
    "description",
    "key job responsibilities",
    "basic qualifications",
    "preferred qualifications",
    "qualifications",
    "关于职位",
    "职位描述",
    "职位详情",
    "岗位职责",
    "工作职责",
    "任职资格",
)
LINKEDIN_SHELL_MARKERS = (
    "LinkedIn Corporation",
    "选择语言",
    "公司简介",
    "订阅相似职位",
    "更多职位",
    "Similar jobs",
    "See more similar jobs",
)


EXTRACT_JOB_SCRIPT = """
() => {
  const clean = (value) => (value || "").replace(/\\s+/g, " ").trim();
  const read = (selector) => {
    const element = document.querySelector(selector);
    return clean((element && (element.innerText || element.textContent)) || "");
  };
  const meta = (name) => {
    const element = document.querySelector(`meta[property="${name}"],meta[name="${name}"]`);
    return clean((element && element.content) || "");
  };
  const first = (selectors) => {
    for (const selector of selectors) {
      const value = read(selector);
      if (value) return value;
    }
    return "";
  };
  const title =
    first([
      "h1",
      '[data-automation="job-detail-title"]',
      ".jobs-unified-top-card__job-title",
      ".job-details-jobs-unified-top-card__job-title"
    ]) ||
    meta("og:title") ||
    document.title;
  const company =
    first([
      '[data-automation="advertiser-name"]',
      ".jobs-unified-top-card__company-name",
      ".job-details-jobs-unified-top-card__company-name",
      '[class*="company"]'
    ]) ||
    meta("og:site_name") ||
    location.hostname.replace(/^www\\./, "");
  const locationText = first([
    '[data-automation="job-detail-location"]',
    ".jobs-unified-top-card__bullet",
    ".job-details-jobs-unified-top-card__primary-description-container",
    '[class*="location"]'
  ]);
  const description =
    first([
      '[data-automation="jobAdDetails"]',
      ".jobs-description__content",
      "#jobDescriptionText",
      '[class*="job-description"]',
      "main"
    ]) || clean(document.body.innerText).slice(0, 12000);
  const hasJobPosting = Array.from(document.querySelectorAll('script[type*="ld+json"]')).some((script) => {
    return /"@type"\\s*:\\s*"?JobPosting/i.test(script.textContent || "");
  });

  return {
    title,
    company,
    location: locationText,
    url: location.href,
    description,
    source: location.hostname,
    hasJobPosting
  };
}
"""


def browser_profile_dir(private_data_dir: Path) -> Path:
    return private_data_dir / "browser_profile"


def is_target_closed_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "targetclosederror" in exc.__class__.__name__.lower() or "has been closed" in message


def looks_like_login_or_blocked_browser_page(payload: dict[str, Any]) -> bool:
    url = str(payload.get("url") or "")
    title = str(payload.get("title") or "")
    description = str(payload.get("description") or "")
    parsed = urlparse(url)
    path = parsed.path.lower()
    combined = f"{title} {description}".lower()
    login_url_parts = (
        "/login",
        "/signin",
        "/sign-in",
        "/auth",
        "/uas/login",
        "/checkpoint",
        "/captcha",
        "/security",
    )
    login_text_markers = (
        "sign in",
        "sign-in",
        "login",
        "log in",
        "authwall",
        "captcha",
        "access denied",
        "unusual traffic",
        "verify you are human",
        "登录",
        "登陆",
        "验证码",
        "访问受限",
        "安全验证",
        "请验证",
        "请输入密码",
    )
    has_jobposting = bool(payload.get("hasJobPosting"))
    if has_jobposting:
        return False
    if any(part in path for part in login_url_parts):
        return True
    if looks_like_blocked_or_login_page(
        url=url,
        title=title,
        description=description,
        has_jobposting=False,
    ):
        return True
    if len(description) < 900 and any(marker in combined for marker in login_text_markers):
        return True
    return False


def compact_text(value: Any) -> str:
    return " ".join(str(value or "").replace("\x00", "").split())


def expected_match_tokens(value: Any) -> set[str]:
    text = compact_text(value).lower()
    tokens = re.findall(r"[a-z0-9+#.]{3,}|[\u4e00-\u9fff]{2,}", text)
    return {token for token in tokens if token not in EXPECTED_TOKEN_STOPWORDS}


def browser_payload_matches_expected(payload: dict[str, Any], expected: dict[str, Any] | None = None) -> bool:
    if not expected:
        return True

    expected_title_tokens = expected_match_tokens(expected.get("title") or expected.get("expected_title"))
    expected_company_tokens = expected_match_tokens(expected.get("company") or expected.get("expected_company"))
    if not expected_title_tokens and not expected_company_tokens:
        return True

    actual_text = " ".join(
        compact_text(payload.get(key))
        for key in ("title", "company", "location", "url", "description", "source")
    ).lower()
    title_hits = sum(1 for token in expected_title_tokens if token in actual_text)
    company_hits = sum(1 for token in expected_company_tokens if token in actual_text)

    if expected_company_tokens:
        return company_hits >= 1
    if expected_title_tokens and title_hits >= min(2, len(expected_title_tokens)):
        return True
    if len(expected_title_tokens) == 1 and title_hits == 1 and not expected_company_tokens:
        return True
    return False


def trim_text_between_markers(text: str, start_markers: tuple[str, ...], end_markers: tuple[str, ...]) -> str:
    lower_text = text.lower()
    start_candidates: list[tuple[int, str]] = []
    for marker in start_markers:
        index = lower_text.find(marker.lower())
        if index >= 0:
            start_candidates.append((index, marker))
    if not start_candidates:
        return text

    start_index, marker = min(start_candidates, key=lambda item: item[0])
    if marker.lower() in {"about the job", "关于职位"}:
        start_index += len(marker)
    trimmed = text[start_index:].strip()
    lower_trimmed = trimmed.lower()

    end_candidates = [
        lower_trimmed.find(marker.lower())
        for marker in end_markers
        if lower_trimmed.find(marker.lower()) > 80
    ]
    if end_candidates:
        trimmed = trimmed[: min(end_candidates)].strip()
    return trimmed or text


def clean_browser_job_payload(payload: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(payload)
    url = str(cleaned.get("url") or "")
    host = urlparse(url).netloc.lower()
    title = compact_text(cleaned.get("title"))
    company = compact_text(cleaned.get("company"))
    location = compact_text(cleaned.get("location"))
    description = compact_text(cleaned.get("description"))
    original_description = description

    if "linkedin." in host:
        lower_original_description = original_description.lower()
        has_job_detail_marker = any(marker.lower() in lower_original_description for marker in LINKEDIN_JOB_DETAIL_MARKERS)
        has_shell_marker = any(marker.lower() in lower_original_description for marker in LINKEDIN_SHELL_MARKERS)
        title_parts = [part.strip() for part in title.split("|") if part.strip()]
        if title_parts:
            title = title_parts[0]
            if len(title_parts) > 1 and (not company or company in {"linkedin.com", "www.linkedin.com", "linkedin"}):
                company = title_parts[1]
        if not location:
            location_match = re.search(r"(?:Australia|澳洲)\s+([^·]+?)\s+·", original_description)
            if location_match:
                location = location_match.group(1).strip()
        if not has_job_detail_marker and has_shell_marker:
            cleaned["_readiness_error"] = (
                "The dedicated browser has not loaded the job description yet. "
                "Wait until the JD is visible in that browser, then read again."
            )
        description = trim_text_between_markers(
            description,
            start_markers=("About the job", "关于职位", "Description"),
            end_markers=(
                "Company - ",
                "Company ID:",
                "公司简介",
                "About the company",
                "订阅相似职位",
                "更多职位",
                "Similar jobs",
                "See more similar jobs",
                "在招人？",
                "LinkedIn Corporation",
                "选择语言",
            ),
        )
    description = trim_job_description_text(description)

    cleaned["title"] = title
    cleaned["company"] = company
    cleaned["location"] = location
    cleaned["description"] = description
    return cleaned


def validate_browser_job_payload(payload: dict[str, Any], expected: dict[str, Any] | None = None) -> dict[str, str]:
    payload = clean_browser_job_payload(payload)
    if looks_like_login_or_blocked_browser_page(payload):
        raise BrowserSessionError(
            "The dedicated browser is still on a login or verification page. "
            "Log in, open the job detail page, then read again."
        )
    readiness_error = str(payload.get("_readiness_error") or "")
    if readiness_error:
        raise BrowserSessionError(readiness_error)
    description = str(payload.get("description") or "").strip()
    if len(description) < 20:
        raise BrowserSessionError("Open a specific job detail page before importing.")
    title = str(payload.get("title") or "").strip()
    company = str(payload.get("company") or "").strip()
    if len(title) < 2 or len(company) < 1:
        raise BrowserSessionError("Could not read enough job information from the current browser page.")
    if not browser_payload_matches_expected(payload, expected):
        raise BrowserSessionError(
            "The current browser page does not match the job you opened. "
            "Return to the correct job detail page, then read again."
        )
    if not looks_like_job_description(
        title=title,
        description=description,
        has_jobposting=bool(payload.get("hasJobPosting")),
    ):
        raise BrowserSessionError(
            "The current page text does not look like a full job description. "
            "It may be navigation, search-result, login, or recommendation text instead of the JD."
        )
    return {key: str(value or "") for key, value in payload.items() if key != "hasJobPosting" and not key.startswith("_")}


async def reset_browser_context() -> None:
    global _context, _page, _playwright

    page = _page
    context = _context
    playwright = _playwright
    _page = None
    _context = None
    _playwright = None
    if page is not None:
        try:
            if not page.is_closed():
                await page.close()
        except Exception:
            pass
    if context is not None:
        try:
            await context.close()
        except Exception:
            pass
    if playwright is not None:
        try:
            await playwright.stop()
        except Exception:
            pass


async def ensure_browser_context(private_data_dir: Path) -> Any:
    global _context, _playwright

    if _context is not None:
        return _context

    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise BrowserSessionError(
            "Playwright is not installed. Run .\\start-webui.ps1 -Install, then restart the app."
        ) from exc

    profile_dir = browser_profile_dir(private_data_dir)
    profile_dir.mkdir(parents=True, exist_ok=True)

    try:
        _playwright = await async_playwright().start()
        _context = await _playwright.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,
            viewport={"width": 1360, "height": 900},
            args=[
                "--start-maximized",
                "--no-first-run",
                "--disable-session-crashed-bubble",
                "--disable-restore-session-state",
            ],
        )
    except Exception as exc:
        await reset_browser_context()
        raise BrowserSessionError(f"Could not start the dedicated login browser: {exc}") from exc
    return _context


async def open_login_browser(url: str, private_data_dir: Path) -> dict[str, str]:
    global _page

    clean_url = validate_public_http_url(url)
    async with _lock:
        last_error: Exception | None = None
        for _ in range(2):
            try:
                context = await ensure_browser_context(private_data_dir)
                page = _page if _page and not _page.is_closed() else await context.new_page()
                _page = page

                # Persistent Chromium can restore unrelated old tabs. Close them so the
                # user only sees the controlled job page, not a stale personal tab.
                for other_page in list(context.pages):
                    if other_page != page and not other_page.is_closed():
                        try:
                            await other_page.close()
                        except Exception:
                            pass

                try:
                    await page.goto(clean_url, wait_until="domcontentloaded", timeout=20_000)
                except Exception as exc:
                    if is_target_closed_error(exc):
                        raise
                    # Login redirects and heavy job boards can time out while still opening correctly.
                    pass
                try:
                    title = await asyncio.wait_for(page.title(), timeout=PAGE_TITLE_TIMEOUT_SECONDS)
                except Exception:
                    title = ""
                return {"url": page.url, "title": title}
            except Exception as exc:
                last_error = exc
                if is_target_closed_error(exc):
                    await reset_browser_context()
                    continue
                raise BrowserSessionError(f"Could not open the dedicated login browser: {exc}") from exc
        raise BrowserSessionError(f"Could not open the dedicated login browser: {last_error}")


async def import_current_browser_job(private_data_dir: Path, expected: dict[str, Any] | None = None) -> dict[str, str]:
    global _page

    async with _lock:
        await ensure_browser_context(private_data_dir)
        if _page is None or _page.is_closed():
            raise BrowserSessionError("Open the login browser with a job link first.")
        page = _page
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5_000)
        except Exception:
            pass
        try:
            payload = await asyncio.wait_for(page.evaluate(EXTRACT_JOB_SCRIPT), timeout=PAGE_READ_TIMEOUT_SECONDS)
        except asyncio.TimeoutError as exc:
            raise BrowserSessionError(
                "Reading the current browser page timed out. Make sure it is a job detail page, then try again."
            ) from exc
        except Exception as exc:
            if is_target_closed_error(exc):
                await reset_browser_context()
                raise BrowserSessionError("The dedicated login browser was closed. Open the job link again.") from exc
            raise
        if not isinstance(payload, dict):
            raise BrowserSessionError("Could not read the current browser page.")
        return validate_browser_job_payload(payload, expected=expected)
