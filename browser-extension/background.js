const LOCAL_API = "http://127.0.0.1:8000/api/imported-jobs";
const WEB_UI = "http://127.0.0.1:5173/?v=browser-import#manual";

function extractJobFromPage() {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
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
    location.hostname.replace(/^www\./, "");
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

async function setBadge(tabId, text, color) {
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
    return;
  }

  try {
    await setBadge(tab.id, "...", "#2563eb");
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractJobFromPage
    });
    const payload = result && result.result;
    if (!payload || !payload.description) {
      throw new Error("No job page content found.");
    }

    const response = await fetch(LOCAL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Local agent returned ${response.status}`);
    }

    await setBadge(tab.id, "OK", "#059669");
    await chrome.tabs.create({ url: WEB_UI });
  } catch (error) {
    console.error(error);
    await setBadge(tab.id, "ERR", "#dc2626");
  }
});
