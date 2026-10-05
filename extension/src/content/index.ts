import { looksLikeApplicationForm } from "../engine/discover";
import { isVisible } from "../engine/dom";
import { send, type CaptureResult, type ExtensionSettings, type FillContext, type FrameCommand } from "../messages";
import { describeFrame } from "./describe";
import { captureFrame, clearMarks, clickEdit, fillFrame, fillOne, findEditButtons, focusField, setText, watchSave, watchSubmit } from "./frame";
import { Panel } from "./panel";

declare global {
  interface Window {
    __jobAutofillLoaded?: boolean;
  }
}

if (!window.__jobAutofillLoaded) {
  window.__jobAutofillLoaded = true;
  const isTop = window === window.top;
  const panel = isTop ? new Panel() : null;

  chrome.runtime.onMessage.addListener((message: FrameCommand, _sender, sendResponse) => {
    switch (message.type) {
      case "fill-frame":
        fillFrame(message.lang, message.overwrite).then(sendResponse, (error: Error) => sendResponse({ lang: "zh", items: [], added: [], notes: [error.message] }));
        return true;
      case "fill-one-frame":
        fillOne(message.id, message.target, message.lang).then(sendResponse, () => sendResponse(null));
        return true;
      case "focus-frame-field":
        focusField(message.id);
        sendResponse(true);
        return false;
      case "set-frame-text":
        sendResponse(setText(message.id, message.text));
        return false;
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
    const check = async () => {
      settings ??= await send<ExtensionSettings>({ type: "get-settings" }).catch(() => null);
      if (!settings?.showLauncher || settings.hiddenHosts.includes(location.host)) return;
      // Resume pages often show saved data read-only with 编辑 / 添加 buttons and no inputs.
      const resumeView = () => /(简历|个人信息|基本信息|教育经历|resume|my experience)/i.test(document.title + (document.body?.innerText ?? "").slice(0, 3000)) && findEditButtons().length > 0;
      if (looksLikeApplicationForm(document) || hasLargeFrame() || resumeView()) panel.showLauncher();
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void check(), 800);
    };
    schedule();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    // Values read on the previous page (before 下一步 navigated here) are still waiting for review.
    void send<CaptureResult | null>({ type: "get-captured" })
      .then((result) => result?.proposals?.length && panel.onCaptured(result))
      .catch(() => undefined);
  }
}
