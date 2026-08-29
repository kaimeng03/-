"use client";

import { useSyncExternalStore } from "react";
import type { Lang } from "./i18n";

const STORAGE_KEY = "lang";
const DEFAULT_LANG: Lang = "zh";

// useSyncExternalStore (not useState+useEffect) is the React-recommended way to read
// a persistent external store like localStorage: it renders DEFAULT_LANG for both the
// server pass and the initial client hydration pass (getServerSnapshot), so there is
// never a hydration mismatch, then re-syncs to the real stored value right after mount.
const listeners = new Set<() => void>();

function getSnapshot(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
  } catch {
    // localStorage unavailable (private browsing, blocked storage, etc.)
  }
  return DEFAULT_LANG;
}

function getServerSnapshot(): Lang {
  return DEFAULT_LANG;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  function onStorageEvent(e: StorageEvent) {
    if (e.key === null || e.key === STORAGE_KEY) onStoreChange();
  }
  window.addEventListener("storage", onStorageEvent);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorageEvent);
  };
}

function notifyListeners() {
  for (const l of listeners) l();
}

export function useLang(): [Lang, (lang: Lang) => void] {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setLang(next: Lang) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — the notify below still updates this tab's in-memory state
    }
    notifyListeners();
  }

  return [lang, setLang];
}
