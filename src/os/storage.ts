// Persistence adapter — the only module that knows state lives in localStorage. Moving to IndexedDB means
// rewriting just these three methods. Writes are skipped when the persisted slices are reference-equal to
// the last write (window drags, focus changes...), and a warning fires once when nearing the ~5MB quota.
import type { PersistStorage, StorageValue } from "zustand/middleware";

export const QUOTA_CHARS = 5 * 1024 * 1024;
const WARN_RATIO = 0.8;

export function createStorage<T extends object>(onNearQuota: (usedChars: number) => void): PersistStorage<T> {
  let lastState: T | undefined;
  let warned = false;
  return {
    getItem(name) {
      const raw = localStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<T>) : null;
    },
    setItem(name, value) {
      const state = value.state;
      const unchanged =
        lastState && Object.keys(state).every((key) => state[key as keyof T] === lastState?.[key as keyof T]);
      if (unchanged) return;
      lastState = state;
      const raw = JSON.stringify(value);
      try {
        localStorage.setItem(name, raw);
      } catch {
        warned = false; // quota exceeded: always warn
      }
      if (raw.length > QUOTA_CHARS * WARN_RATIO && !warned) {
        warned = true;
        onNearQuota(raw.length);
      }
    },
    removeItem: (name) => localStorage.removeItem(name),
  };
}
