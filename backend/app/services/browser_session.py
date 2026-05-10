from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from backend.app.services.job_url_reader import looks_like_blocked_or_login_page, validate_public_http_url


class BrowserSessionError(RuntimeError):
    pass


_lock = asyncio.Lock()
_playwright: Any | None = None
_context: Any | None = None
_page: Any | None = None


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


def validate_browser_job_payload(payload: dict[str, Any]) -> dict[str, str]:
    if looks_like_login_or_blocked_browser_page(payload):
        raise BrowserSessionError(
            "The dedicated browser is still on a login or verification page. "
            "Log in, open the job detail page, then read again."
        )
    description = str(payload.get("description") or "").strip()
    if len(description) < 20:
        raise BrowserSessionError("Open a specific job detail page before importing.")
    title = str(payload.get("title") or "").strip()
    company = str(payload.get("company") or "").strip()
    if len(title) < 2 or len(company) < 1:
        raise BrowserSessionError("Could not read enough job information from the current browser page.")
    return {key: str(value or "") for key, value in payload.items() if key != "hasJobPosting"}


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
                return {"url": page.url, "title": await page.title()}
            except Exception as exc:
                last_error = exc
                if is_target_closed_error(exc):
                    await reset_browser_context()
                    continue
                raise BrowserSessionError(f"Could not open the dedicated login browser: {exc}") from exc
        raise BrowserSessionError(f"Could not open the dedicated login browser: {last_error}")


async def import_current_browser_job(private_data_dir: Path) -> dict[str, str]:
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
            payload = await page.evaluate(EXTRACT_JOB_SCRIPT)
        except Exception as exc:
            if is_target_closed_error(exc):
                await reset_browser_context()
                raise BrowserSessionError("The dedicated login browser was closed. Open the job link again.") from exc
            raise
        if not isinstance(payload, dict):
            raise BrowserSessionError("Could not read the current browser page.")
        return validate_browser_job_payload(payload)
