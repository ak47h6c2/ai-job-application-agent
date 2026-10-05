import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

type Tone = "info" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

type ShowToast = (message: string, options?: { tone?: Tone; action?: ToastItem["action"]; duration?: number }) => void;

const ToastContext = createContext<ShowToast>(() => undefined);

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const show = useCallback<ShowToast>(
    (message, options = {}) => {
      const id = nextId.current++;
      const item: ToastItem = { id, message, tone: options.tone ?? "info", action: options.action };
      setItems((current) => [...current.slice(-2), item]);
      const duration = options.duration ?? (options.action ? 6000 : 3200);
      timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-ink py-2.5 pl-4 pr-2 text-[13.5px] text-white shadow-pop"
          >
            {item.tone === "success" && <CircleCheck size={16} className="shrink-0 text-emerald-300" />}
            {item.tone === "error" && <CircleAlert size={16} className="shrink-0 text-red-300" />}
            <span className="min-w-0 flex-1">{item.message}</span>
            {item.action && (
              <button
                type="button"
                className="rounded-md px-2 py-1 font-medium text-teal-300 hover:bg-white/10"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
            <button type="button" aria-label="Close" className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => dismiss(item.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
