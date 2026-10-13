import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeProfile, type ProfileData } from "../../../shared/profileSchema";
import { API_BASE, ApiError, api, errorMessage } from "../api";
import { mergeConcurrent } from "../profileUpdates";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error" | "conflict";

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
  /** The server version `latest` is based on; used to merge after a revision conflict. */
  const base = useRef<ProfileData | null>(null);
  const dirty = useRef(false);
  const saving = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const before = latest.current;
    try {
      const data = await api.getProfile();
      // A focus refresh must not replace edits made while its request was in flight.
      if (latest.current !== before || dirty.current || saving.current) return;
      const loaded = normalizeProfile(data.profile);
      latest.current = loaded;
      base.current = loaded;
      setProfile(loaded);
      setLoadError("");
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (online && !latest.current) void load();
  }, [online, load]);

  // Returning from a recruitment tab refreshes clean data imported by the extension.
  useEffect(() => {
    const onFocus = () => { if (online && !dirty.current && !saving.current) void load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [online, load]);

  /** After a revision conflict, keeps the user's edits on top of the latest server profile. */
  const rebase = useCallback(async (): Promise<boolean> => {
    try {
      const server = normalizeProfile((await api.getProfile()).profile);
      if (!latest.current) return false;
      latest.current = mergeConcurrent(base.current ?? server, latest.current, server);
      base.current = server;
      setProfile(latest.current);
      return true;
    } catch {
      return false;
    }
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (!dirty.current || !latest.current || saving.current) return;
    saving.current = true;
    setSaveState("saving");
    // One automatic merge per save; a second conflict in a row is shown to the user.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sent = latest.current!;
      dirty.current = false;
      try {
        const { profile: saved } = await api.saveProfile(sent);
        base.current = { ...sent, updatedAt: saved.updatedAt };
        latest.current = { ...latest.current!, updatedAt: saved.updatedAt };
        setProfile(latest.current);
        saving.current = false;
        if (dirty.current) void flush();
        else setSaveState("saved");
        return;
      } catch (error) {
        dirty.current = true;
        const conflict = error instanceof ApiError && error.status === 409;
        if (conflict && attempt === 0 && (await rebase())) continue;
        saving.current = false;
        setSaveState(conflict ? "conflict" : "error");
        return;
      }
    }
  }, [rebase]);

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

  // Pending edits when the tab is hidden or closed: save right away, and ask before leaving with unsaved edits.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden" && dirty.current) void flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current && !saving.current) return;
      void flush();
      event.preventDefault();
      event.returnValue = "";
    };
    const onHide = () => {
      // A save still in flight is cancelled when the page unloads, so it is repeated with keepalive.
      if ((!dirty.current && !saving.current) || !latest.current) return;
      const body = JSON.stringify({ profile: latest.current, expectedUpdatedAt: latest.current.updatedAt ?? null });
      // Browsers refuse keepalive bodies over 64 KB; a larger profile relies on the prompt above.
      if (new Blob([body]).size > 60_000) return;
      void fetch(`${API_BASE}/api/profile`, { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" }, body })
        .then((response) => { if (response.ok) dirty.current = false; })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush]);

  return { profile, loadError, reload: load, update, saveState, retrySave: flush };
}
