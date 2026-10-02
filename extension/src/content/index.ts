import { looksLikeApplicationForm } from "../engine/discover";
import { isVisible } from "../engine/dom";
import { send, type ExtensionSettings, type FillContext, type FrameCommand } from "../messages";
import { describeFrame } from "./describe";
import { clearMarks, fillFrame, fillOne, focusField, setText, watchSubmit } from "./frame";
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
      case "open-panel":
        void panel?.toggle(true, Boolean(message.fill));
        sendResponse(true);
        return false;
      default:
        return false;
    }
  });

  watchSubmit();

  if (panel) {
    // Show the floating button only on pages that look like application forms (SPAs render late).
    const hasLargeFrame = () => Array.from(document.querySelectorAll("iframe")).some((frame) => isVisible(frame) && frame.clientWidth > 300 && frame.clientHeight > 300);
    let timer = 0;
    let settings: ExtensionSettings | null = null;
    const check = async () => {
      settings ??= await send<ExtensionSettings>({ type: "get-settings" }).catch(() => null);
      if (!settings?.showLauncher || settings.hiddenHosts.includes(location.host)) return;
      if (looksLikeApplicationForm(document) || hasLargeFrame()) panel.showLauncher();
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void check(), 800);
    };
    schedule();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }
}
