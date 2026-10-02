// Per-browser UI preferences only (current page, languages, collapsed cards). Never profile data.
const PREFIX = "job-profile:";

export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(PREFIX + key, value);
    } catch {
      // Storage may be unavailable (private mode); preferences just won't persist.
    }
  },
};
