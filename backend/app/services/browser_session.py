from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from backend.app.services.job_url_reader import validate_public_http_url


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

  return {
    title,
    company,
    location: locationText,
    url: location.href,
    description,
    source: location.hostname
  };
}
"""


def browser_profile_dir(private_data_dir: Path) -> Path:
    return private_data_dir / "browser_profile"


async def ensure_browser_context(private_data_dir: Path) -> Any:
    global _context, _playwright

    if _context is not None:
        try:
            _context.pages
            return _context
        except Exception:
            _context = None

    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise BrowserSessionError(
            "Playwright is not installed. Run .\\start-webui.ps1 -Install, then restart the app."
        ) from exc

    profile_dir = browser_profile_dir(private_data_dir)
    profile_dir.mkdir(parents=True, exist_ok=True)

    _playwright = await async_playwright().start()
    _context = await _playwright.chromium.launch_persistent_context(
        user_data_dir=str(profile_dir),
        headless=False,
        viewport={"width": 1360, "height": 900},
        args=["--start-maximized"],
    )
    return _context


async def open_login_browser(url: str, private_data_dir: Path) -> dict[str, str]:
    global _page

    clean_url = validate_public_http_url(url)
    async with _lock:
        context = await ensure_browser_context(private_data_dir)
        page = _page if _page and not _page.is_closed() else (context.pages[-1] if context.pages else await context.new_page())
        _page = page
        try:
            await page.goto(clean_url, wait_until="domcontentloaded", timeout=20_000)
        except Exception:
            # Login redirects and heavy job boards can time out while still opening correctly.
            pass
        return {"url": page.url, "title": await page.title()}


async def import_current_browser_job(private_data_dir: Path) -> dict[str, str]:
    global _page

    async with _lock:
        context = await ensure_browser_context(private_data_dir)
        page = _page if _page and not _page.is_closed() else (context.pages[-1] if context.pages else None)
        if page is None:
            raise BrowserSessionError("Open the login browser with a job link first.")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5_000)
        except Exception:
            pass
        payload = await page.evaluate(EXTRACT_JOB_SCRIPT)
        if not isinstance(payload, dict):
            raise BrowserSessionError("Could not read the current browser page.")
        description = str(payload.get("description") or "").strip()
        if len(description) < 20:
            raise BrowserSessionError("Open a specific job detail page before importing.")
        return {key: str(value or "") for key, value in payload.items()}
