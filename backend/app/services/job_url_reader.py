from __future__ import annotations

import html
import ipaddress
import json
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MAX_JOB_PAGE_BYTES = 1_500_000
HTTP_TIMEOUT_SECONDS = 12


class JobUrlReadError(RuntimeError):
    pass


@dataclass(frozen=True)
class JobUrlPreview:
    title: str
    company: str
    location: str
    description: str
    url: str
    source: str = "url"

    def to_dict(self) -> dict[str, str]:
        return {
            "title": self.title,
            "company": self.company,
            "location": self.location,
            "description": self.description,
            "url": self.url,
            "source": self.source,
        }


class JobPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.meta: dict[str, str] = {}
        self.text_parts: list[str] = []
        self.json_ld_scripts: list[str] = []
        self._tag_stack: list[str] = []
        self._capture_title = False
        self._capture_json_ld = False
        self._json_ld_buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr_map = {key.lower(): value or "" for key, value in attrs}
        self._tag_stack.append(tag)

        if tag == "title":
            self._capture_title = True
        if tag == "script" and "ld+json" in attr_map.get("type", "").lower():
            self._capture_json_ld = True
            self._json_ld_buffer = []
        if tag == "meta":
            key = (
                attr_map.get("property")
                or attr_map.get("name")
                or attr_map.get("itemprop")
                or ""
            ).lower()
            content = attr_map.get("content", "").strip()
            if key and content:
                self.meta[key] = html.unescape(content)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self._capture_title = False
        if tag == "script" and self._capture_json_ld:
            script = "".join(self._json_ld_buffer).strip()
            if script:
                self.json_ld_scripts.append(script)
            self._capture_json_ld = False
            self._json_ld_buffer = []
        if self._tag_stack:
            self._tag_stack.pop()

    def handle_data(self, data: str) -> None:
        text = normalize_text(data)
        if not text:
            return
        if self._capture_json_ld:
            self._json_ld_buffer.append(data)
            return
        if self._capture_title:
            self.title_parts.append(text)
            return
        if any(tag in {"script", "style", "noscript", "svg", "header", "footer", "nav", "form", "button"} for tag in self._tag_stack):
            return
        if len(text) >= 3:
            self.text_parts.append(text)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def strip_html(value: str) -> str:
    return normalize_text(re.sub(r"<[^>]+>", " ", value))


def validate_public_http_url(url: str) -> str:
    clean_url = url.strip()
    parsed = urlparse(clean_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Invalid job URL. Use a public http or https link.")
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "localhost.localdomain"}:
        raise ValueError("Invalid job URL. Local links are not supported.")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return clean_url
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
        raise ValueError("Invalid job URL. Private network links are not supported.")
    return clean_url


def fetch_job_page(url: str) -> str:
    request = Request(
        validate_public_http_url(url),
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    try:
        with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type and "application/xhtml" not in content_type:
                raise JobUrlReadError("The link did not return an HTML job page.")
            raw = response.read(MAX_JOB_PAGE_BYTES + 1)
    except HTTPError as exc:
        raise JobUrlReadError(f"Could not automatically read this job page. HTTP {exc.code}.") from exc
    except URLError as exc:
        raise JobUrlReadError("Could not automatically read this job page. The site may block automated access.") from exc
    if len(raw) > MAX_JOB_PAGE_BYTES:
        raise JobUrlReadError("The job page is too large to read automatically.")
    return raw.decode("utf-8", errors="replace")


def iter_json_values(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        items = [value]
        graph = value.get("@graph")
        if isinstance(graph, list):
            items.extend(item for item in graph if isinstance(item, dict))
        return items
    if isinstance(value, list):
        result: list[dict[str, Any]] = []
        for item in value:
            result.extend(iter_json_values(item))
        return result
    return []


def find_jobposting(parser: JobPageParser) -> dict[str, Any] | None:
    for script in parser.json_ld_scripts:
        try:
            payload = json.loads(script)
        except json.JSONDecodeError:
            continue
        for item in iter_json_values(payload):
            item_type = item.get("@type")
            if isinstance(item_type, list):
                types = {str(value).lower() for value in item_type}
            else:
                types = {str(item_type).lower()}
            if "jobposting" in types:
                return item
    return None


def value_to_text(value: Any) -> str:
    if isinstance(value, str):
        return strip_html(value)
    if isinstance(value, dict):
        name = value.get("name") or value.get("text")
        if isinstance(name, str):
            return strip_html(name)
    return ""


def organization_name(value: Any) -> str:
    if isinstance(value, dict):
        return value_to_text(value.get("name")) or value_to_text(value.get("legalName"))
    if isinstance(value, list) and value:
        return organization_name(value[0])
    return value_to_text(value)


def location_name(value: Any) -> str:
    if isinstance(value, list):
        return "; ".join(filter(None, (location_name(item) for item in value[:3])))
    if not isinstance(value, dict):
        return value_to_text(value)
    address = value.get("address")
    if isinstance(address, dict):
        parts = [
            value_to_text(address.get("addressLocality")),
            value_to_text(address.get("addressRegion")),
            value_to_text(address.get("addressCountry")),
        ]
        return ", ".join(part for part in parts if part)
    return value_to_text(value.get("name"))


def compact_description(parts: list[str], *, limit: int = 6000) -> str:
    seen: set[str] = set()
    compacted: list[str] = []
    for part in parts:
        text = normalize_text(part)
        if len(text) < 20:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        compacted.append(text)
        if sum(len(item) for item in compacted) >= limit:
            break
    return "\n".join(compacted)[:limit].strip()


def looks_like_blocked_or_login_page(
    *,
    url: str,
    title: str,
    description: str,
    has_jobposting: bool,
) -> bool:
    host = urlparse(url).netloc.lower()
    combined = f"{title} {description}".lower()
    login_markers = (
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
    )
    if has_jobposting:
        return False
    if "linkedin." in host and any(marker in combined for marker in login_markers):
        return True
    if len(description) < 400 and any(marker in combined for marker in login_markers):
        return True
    return False


def preview_from_html(page_html: str, url: str) -> JobUrlPreview:
    parser = JobPageParser()
    parser.feed(page_html)
    jobposting = find_jobposting(parser) or {}
    meta = parser.meta

    title = (
        value_to_text(jobposting.get("title"))
        or meta.get("og:title", "")
        or meta.get("twitter:title", "")
        or " ".join(parser.title_parts)
    )
    company = (
        organization_name(jobposting.get("hiringOrganization"))
        or meta.get("og:site_name", "")
        or urlparse(url).netloc.replace("www.", "")
    )
    location = (
        location_name(jobposting.get("jobLocation"))
        or location_name(jobposting.get("applicantLocationRequirements"))
        or ""
    )
    description = (
        value_to_text(jobposting.get("description"))
        or compact_description([meta.get("description", ""), meta.get("og:description", ""), *parser.text_parts])
    )
    if looks_like_blocked_or_login_page(
        url=url,
        title=title,
        description=description,
        has_jobposting=bool(jobposting),
    ):
        raise JobUrlReadError("This site returned a login, captcha, or access-blocked page instead of the job post.")

    preview = JobUrlPreview(
        title=normalize_text(title)[:160],
        company=normalize_text(company)[:160],
        location=normalize_text(location)[:160],
        description=description[:12000],
        url=url,
    )
    if len(preview.title) < 2 or len(preview.company) < 1 or len(preview.description) < 20:
        raise JobUrlReadError("Could not extract enough job information from this page.")
    return preview


def read_job_posting_from_url(url: str) -> JobUrlPreview:
    clean_url = validate_public_http_url(url)
    return preview_from_html(fetch_job_page(clean_url), clean_url)
