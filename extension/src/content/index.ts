import { looksLikeApplicationForm } from "../engine/discover";
import { hasSectionAddButton } from "../engine/repeat";
import { isVisible } from "../engine/dom";
import { send, type CaptureResult, type ExtensionSettings, type FillContext, type FrameCommand } from "../messages";
import { describeFrame } from "./describe";
import { captureFrame, clearMarks, clickEdit, fillFrame, fillOne, findEditButtons, focusField, inspectFrame, prepareDraft, setText, watchSave, watchSubmit } from "./frame";
import { Panel } from "./panel";

declare global {
  interface Window {
    /** True while the copy that set it can still reach the extension. */
    __jobAutofillAlive?: () => boolean;
  }
}

const alive = () => {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
};

// An extension update injects the new copy into open pages; the old copy stays with a dead connection.
if (!window.__jobAutofillAlive?.()) {
  window.__jobAutofillAlive = alive;
  // The previous copy had its button on this page; keep offering it after the update.
  const replaced = document.querySelectorAll("[data-jaf-ui]").length > 0;
  document.querySelectorAll("[data-jaf-ui]").forEach((element) => element.remove());
  const isTop = window === window.top;
  const panel = isTop ? new Panel() : null;
  if (replaced) panel?.showLauncher();

  chrome.runtime.onMessage.addListener((message: FrameCommand, _sender, sendResponse) => {
    switch (message.type) {
      case "fill-frame":
        fillFrame(message.lang, message.overwrite).then(sendResponse, (error: Error) => sendResponse({ lang: "zh", items: [], added: [], notes: [error.message] }));
        return true;
      case "inspect-frame":
        inspectFrame(message.lang).then(sendResponse, (error: Error) => sendResponse({ lang: "zh", items: [], added: [], notes: [error.message] }));
        return true;
      case "fill-one-frame":
        fillOne(message.id, message.target, message.lang, message.automatic, message.mappingKey).then(sendResponse, () => sendResponse(null));
        return true;
      case "focus-frame-field":
        focusField(message.id);
        sendResponse(true);
        return false;
      case "prepare-frame-draft":
        sendResponse(prepareDraft(message.field));
        return false;
      case "set-frame-text":
        setText(message.field, message.text, message.expectedValue).then(sendResponse, (error: Error) => sendResponse({ applied: false, error: error.message }));
        return true;
      case "click-edit":
        clickEdit().then(sendResponse, () => sendResponse(null));
        return true;
      case "describe-frame":
        send<FillContext>({ type: "get-context", host: location.host })
          .then((context) => sendResponse(describeFrame(context?.profile ?? null)))
          .catch(() => sendResponse(describeFrame(null)));
        return true;
      case "clear-frame-marks":
        clearMarks();
        sendResponse(true);
        return false;
      case "learned":
        panel?.onLearned(message.key, message.answer);
        sendResponse(true);
        return false;
      case "submitted":
        panel?.onSubmitted();
        sendResponse(true);
        return false;
      case "capture-frame":
        captureFrame().then(sendResponse, () => sendResponse(null));
        return true;
      case "captured":
        panel?.onCaptured(message.result);
        sendResponse(true);
        return false;
      case "open-panel":
        void panel?.toggle(true, Boolean(message.fill));
        sendResponse(true);
        return false;
      default:
        return false;
    }
  });

  watchSubmit();
  let autoCapture = true;
  void send<ExtensionSettings>({ type: "get-settings" })
    .then((loaded) => (autoCapture = loaded?.autoCapture !== false))
    .catch(() => undefined);
  watchSave(() => autoCapture);

  if (panel) {
    // Show the floating button only on pages that look like application forms (SPAs render late).
    const hasLargeFrame = () => Array.from(document.querySelectorAll("iframe")).some((frame) => isVisible(frame) && frame.clientWidth > 300 && frame.clientHeight > 300);
    let timer = 0;
    let settings: ExtensionSettings | null = null;
    let observer: MutationObserver | null = null;
    // The first few thousand characters of page text, without forcing a layout of the whole page.
    const pageText = (limit = 3000) => {
      let text = document.title;
      const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node && text.length < limit; node = walker.nextNode()) {
        if (!node.parentElement?.closest("script, style, noscript")) text += ` ${node.textContent ?? ""}`;
      }
      return text;
    };
    const check = async () => {
      // A newer copy has taken over this page, or the button is already there: stop watching.
      if (!alive() || panel.shown) return observer?.disconnect();
      settings ??= await send<ExtensionSettings>({ type: "get-settings" }).catch(() => null);
      if (!settings) return;
      // Settings are read once per page, so a disabled launcher needs no more checks either.
      if (!settings.showLauncher || settings.hiddenHosts.includes(location.host)) return observer?.disconnect();
      // Resume pages often show saved data read-only with 编辑 / 添加 buttons and no inputs.
      const resumeView = () => /(简历|个人信息|基本信息|教育经历|resume|my experience)/i.test(pageText()) && findEditButtons().length > 0;
      // An empty optional section shows only "+ 添加荣誉或奖励": still a place to fill.
      if (looksLikeApplicationForm(document) || hasLargeFrame() || hasSectionAddButton() || resumeView()) {
        panel.showLauncher();
        observer?.disconnect();
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void check(), 800);
    };
    schedule();
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Values read on the previous page (before 下一步 navigated here) are still waiting for review.
    void send<CaptureResult | null>({ type: "get-captured" })
      .then((result) => result?.proposals?.length && panel.onCaptured(result))
      .catch(() => undefined);
  }
}
