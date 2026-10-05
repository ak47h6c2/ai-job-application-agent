import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { readValue, resolveBasic, type GroupDef, type Lang, type ProfileData } from "../../../shared/profileSchema";
import { useI18n } from "../i18n";
import { storage } from "../storage";
import { FieldInput } from "./FieldInput";
import { Count, cx } from "./ui";

/** Collapsible card whose open state is remembered per browser. */
export function Collapsible({
  storageKey,
  defaultOpen,
  title,
  meta,
  actions,
  openSignal,
  children,
}: {
  storageKey: string;
  defaultOpen: boolean;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  /** Changing this number forces the card open (e.g. after "add"). */
  openSignal?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    const saved = storage.get(`open:${storageKey}`);
    return saved === null ? defaultOpen : saved === "1";
  });
  useEffect(() => {
    if (openSignal) {
      setOpen(true);
      storage.set(`open:${storageKey}`, "1");
    }
  }, [openSignal, storageKey]);
  const toggle = () => {
    setOpen(!open);
    storage.set(`open:${storageKey}`, open ? "0" : "1");
  };
  return (
    <section className="card">
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-3.5 pl-4 text-left sm:pl-5"
        >
          <ChevronDown size={16} className={cx("shrink-0 text-subtle transition-transform", !open && "-rotate-90")} />
          <h2 className="truncate text-[15px] font-semibold">{title}</h2>
          {meta}
        </button>
        {actions}
      </div>
      {open && <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5">{children}</div>}
    </section>
  );
}

interface GroupCardProps {
  group: GroupDef;
  profile: ProfileData;
  contentLang: Lang;
  update: (recipe: (current: ProfileData) => ProfileData) => void;
}

export function GroupCard({ group, profile, contentLang, update }: GroupCardProps) {
  const { lang } = useI18n();
  const ownFields = group.fields.filter((field) => !field.derived);
  const filled = ownFields.filter((field) => readValue(profile.basic[field.key], contentLang).value).length;

  return (
    <Collapsible
      storageKey={`group:${group.key}`}
      defaultOpen={group.key === "identity" || group.key === "contact"}
      title={group[lang]}
      meta={<Count value={filled} total={ownFields.length} />}
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        {group.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={profile.basic[field.key]}
            contentLang={contentLang}
            auto={field.derived ? resolveBasic({ ...profile, basic: { ...profile.basic, [field.key]: "" } }, field.key, contentLang).value : undefined}
            onChange={(next) => update((current) => ({ ...current, basic: { ...current.basic, [field.key]: next } }))}
            sensitive={
              field.sensitive
                ? {
                    checked: profile.settings.fillSensitive,
                    onChange: (checked) => update((current) => ({ ...current, settings: { ...current.settings, fillSensitive: checked } })),
                  }
                : undefined
            }
          />
        ))}
      </div>
    </Collapsible>
  );
}
