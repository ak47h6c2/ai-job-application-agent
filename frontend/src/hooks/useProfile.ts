import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeProfile, type ProfileData } from "../../../shared/profileSchema";
import { API_BASE, api, errorMessage } from "../api";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;

/**
 * Holds the profile for the whole app and autosaves it (debounced PUT).
 * Saving is only enabled after a successful load, so an offline start never overwrites data.
 */
export function useProfile(online: boolean | null) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const latest = useRef<ProfileData | null>(null);
  const dirty = useRef(false);
  const saving = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const data = await api.getProfile();
      const loaded = normalizeProfile(data.profile);
      latest.current = loaded;
      setProfile(loaded);
      setLoadError("");
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (online && !latest.current) void load();
  }, [online, load]);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (!dirty.current || !latest.current || saving.current) return;
    saving.current = true;
    dirty.current = false;
    setSaveState("saving");
    try {
      await api.saveProfile(latest.current);
      saving.current = false;
      if (dirty.current) {
        void flush();
      } else {
        setSaveState("saved");
      }
    } catch {
      saving.current = false;
      dirty.current = true;
      setSaveState("error");
    }
  }, []);

  /** Applies a pure update and schedules an autosave. */
  const update = useCallback(
    (recipe: (current: ProfileData) => ProfileData) => {
      if (!latest.current) return;
      const next = recipe(latest.current);
      latest.current = next;
      setProfile(next);
      dirty.current = true;
      if (!saving.current) setSaveState("pending");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush],
  );

  // Best-effort save when the tab is closed with pending edits.
  useEffect(() => {
    const onHide = () => {
      if (!dirty.current || !latest.current) return;
      try {
        void fetch(`${API_BASE}/api/profile`, {
          method: "PUT",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: latest.current }),
        });
        dirty.current = false;
      } catch {
        // ignore
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  return { profile, loadError, reload: load, update, saveState, retrySave: flush };
}
