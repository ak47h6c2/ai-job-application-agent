import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

/** Polls /api/health. online is null until the first check finishes. */
export function useHealth() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [ai, setAi] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const check = useCallback(async () => {
    window.clearTimeout(timer.current);
    let ok = false;
    try {
      const health = await api.health();
      ok = health.status === "ok";
      setAi(Boolean(health.ai));
    } catch {
      ok = false;
    }
    setOnline(ok);
    timer.current = window.setTimeout(() => void check(), ok ? 20000 : 4000);
  }, []);

  useEffect(() => {
    void check();
    return () => window.clearTimeout(timer.current);
  }, [check]);

  return { online, ai, refresh: check };
}
