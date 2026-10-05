import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { enumLabel, enumOptions, PRESENT, readValue, writeValue, type FieldDef, type FieldValue, type Lang } from "../../../shared/profileSchema";
import { useI18n } from "../i18n";
import { Segmented, Switch, cx } from "./ui";

interface FieldInputProps {
  field: FieldDef;
  value: FieldValue | undefined;
  contentLang: Lang;
  onChange: (next: FieldValue) => void;
  /** Auto-derived value shown when nothing is stored. */
  auto?: string;
  /** Adds a 至今 / Present checkbox (end dates). */
  allowPresent?: boolean;
  sensitive?: { checked: boolean; onChange: (checked: boolean) => void };
}

const REGION_PLACEHOLDER: Record<Lang, string> = { zh: "省/市/区，用 / 分隔", en: "City, State" };

export function isWide(field: FieldDef): boolean {
  return field.type === "longtext";
}

export function FieldInput({ field, value, contentLang, onChange, auto, allowPresent, sensitive }: FieldInputProps) {
  const { lang, t } = useI18n();
  const id = useId();
  const read = readValue(value, contentLang);
  const shown = read.fallback ? "" : read.value;
  const autoLabel = auto ? (field.type === "enum" ? enumLabel(field.enum, auto, lang) : auto) : "";
  const showAuto = Boolean(field.derived && !shown && autoLabel);
  const set = (text: string) => onChange(writeValue(field, value, contentLang, text));

  let placeholder = "";
  if (read.fallback) placeholder = read.value;
  else if (showAuto) placeholder = t("field.auto", { v: autoLabel });
  else if (field.type === "region") placeholder = REGION_PLACEHOLDER[contentLang];

  const common = {
    id,
    lang: field.localized ? (contentLang === "zh" ? "zh-CN" : "en") : undefined,
    placeholder,
  };

  let control: ReactNode;
  switch (field.type) {
    case "longtext":
      control = <AutoTextarea {...common} value={shown} onChange={set} />;
      break;
    case "enum": {
      const options = enumOptions(field.enum);
      if (options.length <= 3) {
        control = (
          <Segmented
            ariaLabel={field[lang]}
            allowClear
            className="w-full"
            value={shown}
            onChange={(next) => set(next)}
            options={options.map((option) => ({ value: option.value, label: option[lang] }))}
          />
        );
      } else {
        control = (
          <select id={id} className={cx("input", !shown && "text-subtle")} value={shown} onChange={(event) => set(event.target.value)}>
            <option value="">{showAuto ? t("field.auto", { v: autoLabel }) : t("field.select")}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value} className="text-ink">
                {option[lang]}
              </option>
            ))}
          </select>
        );
      }
      break;
    }
    case "month":
    case "date": {
      const isPresent = allowPresent && shown === PRESENT;
      control = (
        <div className="flex items-center gap-3">
          <input
            {...common}
            type={field.type}
            className={cx("input", !shown && "text-subtle")}
            value={isPresent ? "" : shown}
            disabled={isPresent}
            onChange={(event) => set(event.target.value)}
          />
          {allowPresent && (
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[13px] text-muted">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-[rgb(var(--accent))]"
                checked={Boolean(isPresent)}
                onChange={(event) => set(event.target.checked ? PRESENT : "")}
              />
              {t("field.present")}
            </label>
          )}
        </div>
      );
      break;
    }
    default: {
      const type = field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text";
      const inputMode = field.type === "number" ? "decimal" : field.type === "url" ? "url" : undefined;
      control = (
        <input
          {...common}
          type={type}
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={field.localized ? undefined : false}
          className="input"
          value={shown}
          onChange={(event) => set(event.target.value)}
        />
      );
    }
  }

  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", isWide(field) && "sm:col-span-2")}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={field.type === "enum" && enumOptions(field.enum).length <= 3 ? undefined : id} className="field-label">
          {field[lang]}
        </label>
        {field.sensitive && <Lock size={12} className="text-subtle" aria-hidden />}
      </div>
      {control}
      {sensitive && <Switch checked={sensitive.checked} onChange={sensitive.onChange} label={t("field.fillSensitive")} />}
    </div>
  );
}

interface AutoTextareaProps {
  id: string;
  lang?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  minRows?: number;
  className?: string;
}

export function AutoTextarea({ value, onChange, minRows = 3, className, ...rest }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [value, rest.placeholder]);
  return (
    <textarea
      ref={ref}
      {...rest}
      rows={minRows}
      className={cx("input", className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
