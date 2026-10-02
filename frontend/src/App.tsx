import { useState, type ReactNode } from "react";
import { ListChecks, Settings, ServerOff, UserRound, type LucideIcon } from "lucide-react";
import type { Lang } from "../../shared/profileSchema";
import { Segmented, cx } from "./components/ui";
import { useHealth } from "./hooks/useHealth";
import { useProfile } from "./hooks/useProfile";
import { useI18n, type MessageKey } from "./i18n";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { storage } from "./storage";

type Page = "profile" | "applications" | "settings";

const NAV: Array<{ page: Page; label: MessageKey; icon: LucideIcon }> = [
  { page: "profile", label: "nav.profile", icon: UserRound },
  { page: "applications", label: "nav.applications", icon: ListChecks },
  { page: "settings", label: "nav.settings", icon: Settings },
];

function initialPage(): Page {
  const saved = storage.get("page");
  return saved === "applications" || saved === "settings" ? saved : "profile";
}

export default function App() {
  const { lang, setLang, t } = useI18n();
  const [page, setPageState] = useState<Page>(initialPage);
  const health = useHealth();
  const profileStore = useProfile(health.online);

  const setPage = (next: Page) => {
    setPageState(next);
    storage.set("page", next);
    window.scrollTo({ top: 0 });
  };

  const langToggle = (
    <Segmented<Lang>
      size="sm"
      ariaLabel="Interface language"
      value={lang}
      onChange={(next) => next && setLang(next)}
      options={[
        { value: "zh", label: "中" },
        { value: "en", label: "EN" },
      ]}
    />
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-[216px] shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:flex">
        <Brand />
        <nav className="mt-6 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <button
              key={item.page}
              type="button"
              aria-current={page === item.page ? "page" : undefined}
              onClick={() => setPage(item.page)}
              className={cx(
                "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium transition-colors",
                page === item.page ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-sunken hover:text-ink",
              )}
            >
              <item.icon size={17} />
              {t(item.label)}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex flex-col gap-3 px-1">
          <StatusDot online={health.online} withLabel />
          {langToggle}
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-line bg-surface md:hidden">
        <div className="flex h-12 items-center gap-2 px-4">
          <Brand />
          <StatusDot online={health.online} />
          <div className="flex-1" />
          {langToggle}
        </div>
        <nav className="flex px-2">
          {NAV.map((item) => (
            <button
              key={item.page}
              type="button"
              aria-current={page === item.page ? "page" : undefined}
              onClick={() => setPage(item.page)}
              className={cx(
                "flex h-10 flex-1 items-center justify-center gap-1.5 border-b-2 text-[13.5px] font-medium",
                page === item.page ? "border-accent text-accent-strong" : "border-transparent text-muted",
              )}
            >
              <item.icon size={16} />
              {t(item.label)}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 sm:px-6">
        {health.online === false && <OfflineBanner onRetry={() => void health.refresh()} />}
        {page === "profile" && (
          <ProfilePage
            online={health.online}
            aiReady={health.ai}
            profile={profileStore.profile}
            loadError={profileStore.loadError}
            reload={profileStore.reload}
            update={profileStore.update}
            saveState={profileStore.saveState}
            retrySave={profileStore.retrySave}
          />
        )}
        {page === "applications" && <ApplicationsPage online={health.online} />}
        {page === "settings" && <SettingsPage online={health.online} onAiChanged={() => void health.refresh()} />}
      </main>
    </div>
  );
}

function Brand() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 px-1">
      <img src="/favicon.svg" alt="" className="h-6 w-6" />
      <span className="text-[15px] font-semibold tracking-tight">{t("appName")}</span>
    </div>
  );
}

function StatusDot({ online, withLabel }: { online: boolean | null; withLabel?: boolean }) {
  const { t } = useI18n();
  const label = online === null ? t("backend.checking") : online ? t("backend.online") : t("backend.offline");
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-subtle" title={label} role="status">
      <span className={cx("h-2 w-2 shrink-0 rounded-full", online === null ? "bg-line-strong" : online ? "bg-success" : "bg-danger")} />
      {withLabel ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  const { t, tn } = useI18n();
  const code = (text: ReactNode) => <code className="kbd-code whitespace-nowrap">{text}</code>;
  return (
    <div className="mx-auto mt-4 flex max-w-[880px] items-start gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 md:mt-6" role="alert">
      <ServerOff size={18} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{t("offline.title")}</div>
        <div className="mt-0.5 text-[13px] leading-7 text-muted">
          {tn("offline.body", { bat: code("start-webui.bat"), cmd: code("python -m backend.app.api") })}
        </div>
      </div>
      <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>
        {t("retry")}
      </button>
    </div>
  );
}
