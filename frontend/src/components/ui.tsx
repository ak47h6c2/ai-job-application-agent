import { useEffect, useId, useRef, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Spinner({ size = 15, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx("animate-spin", className)} aria-hidden />;
}

interface SegmentedProps<T extends string> {
  options: Array<{ value: T; label: ReactNode }>;
  value: T | "";
  onChange: (value: T | "") => void;
  allowClear?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}

/** Pill-style button group. With allowClear, clicking the active option clears it. */
export function Segmented<T extends string>({ options, value, onChange, allowClear, size = "md", ariaLabel, className }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx("inline-flex max-w-full rounded-lg border border-line bg-sunken p-0.5", size === "sm" ? "h-8" : "h-9", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active && allowClear ? "" : option.value)}
            className={cx(
              "flex-1 whitespace-nowrap rounded-md px-3 font-medium transition-colors",
              size === "sm" ? "text-[12.5px]" : "text-[13.5px]",
              active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-line-strong")}
      >
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <span>{label}</span>
    </label>
  );
}

interface DialogProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Dialog({ open, title, onClose, children, footer }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const first = panel.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-surface shadow-pop sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-[15px] font-semibold">
            {title}
          </h2>
          <button type="button" data-close aria-label="Close" className="btn btn-ghost btn-icon -mr-2" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Small "x / y" counter used in card headers. */
export function Count({ value, total }: { value: number; total?: number }) {
  return (
    <span className={cx("badge tabular-nums", value > 0 ? "bg-accent-soft text-accent-strong" : "bg-sunken text-subtle")}>
      {total === undefined ? value : `${value}/${total}`}
    </span>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
