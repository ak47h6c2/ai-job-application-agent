import { readValue, type ProfileData } from "../../../shared/profileSchema";
import { send, type ExtensionSettings, type FrameCommand } from "../messages";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function toTab(command: FrameCommand): Promise<void> {
  const tab = await activeTab();
  if (tab?.id === undefined) return;
  await chrome.tabs.sendMessage(tab.id, command, { frameId: 0 }).catch(() => {
    $("profile").textContent = "这个页面不能使用助手（浏览器内置页面或需要刷新）。";
  });
  window.close();
}

async function init(): Promise<void> {
  const settings = await send<ExtensionSettings>({ type: "get-settings" });
  const tab = await activeTab();
  const host = tab?.url ? new URL(tab.url).host : "";
  $<HTMLInputElement>("api").value = settings.apiBase;
  $<HTMLInputElement>("webui").value = settings.webUi;
  $<HTMLAnchorElement>("webui-link").href = settings.webUi;
  $<HTMLInputElement>("launcher").checked = settings.showLauncher;
  $<HTMLInputElement>("hide-host").checked = settings.hiddenHosts.includes(host);

  const health = await send<{ online: boolean; ai?: boolean }>({ type: "health" });
  const status = $("status");
  status.textContent = health.online ? (health.ai ? "已连接 · AI 可用" : "已连接") : "本地服务未启动";
  status.className = `status ${health.online ? "on" : "off"}`;

  const context = await send<{ profile: ProfileData | null; cachedAt?: string }>({ type: "get-context", host });
  const profile = context.profile;
  const name = profile ? readValue(profile.basic.name, "zh").value || readValue(profile.basic.name, "en").value : "";
  $("profile").textContent = profile && name ? `资料：${name} · ${profile.sections.education?.length ?? 0} 段教育 · ${profile.sections.work?.length ?? 0} 段经历` : "资料库还是空的，先去填写资料。";

  $("fill").onclick = () => void toTab({ type: "open-panel", fill: true });
  $("open").onclick = () => void toTab({ type: "open-panel" });
  $<HTMLInputElement>("launcher").onchange = (event) => void send({ type: "save-settings", settings: { showLauncher: (event.target as HTMLInputElement).checked } });
  $<HTMLInputElement>("hide-host").onchange = (event) => {
    const hidden = new Set(settings.hiddenHosts);
    if ((event.target as HTMLInputElement).checked) hidden.add(host);
    else hidden.delete(host);
    settings.hiddenHosts = Array.from(hidden);
    void send({ type: "save-settings", settings: { hiddenHosts: settings.hiddenHosts } });
  };
  $("save").onclick = async () => {
    await send({ type: "save-settings", settings: { apiBase: $<HTMLInputElement>("api").value.trim() || settings.apiBase, webUi: $<HTMLInputElement>("webui").value.trim() || settings.webUi } });
    window.location.reload();
  };
}

void init();
