"use client";

import { useSyncExternalStore } from "react";
import type { Lang } from "./i18n";

const STORAGE_KEY = "lang";
const DEFAULT_LANG: Lang = "zh";

// The in-memory `currentLang` — not localStorage — is the source of truth for what
// getSnapshot() returns. localStorage is only used to (a) hydrate the initial value
// once, (b) persist choices best-effort, and (c) sync other tabs via the "storage"
// event. Reading localStorage fresh on every getSnapshot() call (the earlier
// implementation) meant that if a write ever silently failed — a full quota, a
// privacy-mode restriction, a blocking browser extension — the UI would look like it
// updated once and then stopped responding, because the "current" value was really
// whatever localStorage happened to contain, not what the user last clicked.
let currentLang: Lang | null = null; // null = not hydrated from storage yet
const listeners = new Set<() => void>();

function readStoredLang(): Lang | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
  } catch {
    // localStorage unavailable (private browsing, blocked storage, etc.)
  }
  return null;
}

function getSnapshot(): Lang {
  if (currentLang === null) {
    currentLang = readStoredLang() ?? DEFAULT_LANG;
  }
  return currentLang;
}

function getServerSnapshot(): Lang {
  return DEFAULT_LANG;
}

function notifyListeners() {
  for (const l of listeners) l();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  function onStorageEvent(e: StorageEvent) {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    const next = readStoredLang();
    if (next !== null && next !== currentLang) {
      currentLang = next;
      onStoreChange();
    }
  }
  window.addEventListener("storage", onStorageEvent);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorageEvent);
  };
}

export function setStoredLang(next: Lang): void {
  const changed = currentLang !== next;
  currentLang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Best-effort persistence only. currentLang above is already updated, so the
    // language still changes for the rest of this tab's session even if it can't
    // be remembered for next time.
  }
  // Always notify: even when the value is unchanged (e.g. clicking the language
  // that's already active), this keeps behavior predictable and side-effect free —
  // React's own Object.is check on the returned snapshot prevents any extra render.
  if (changed) notifyListeners();
}

export function useLang(): [Lang, (lang: Lang) => void] {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [lang, setStoredLang];
}

/** Test-only: clears the in-memory hydration cache so each test starts fresh. */
export function __resetLangStoreForTests(): void {
  currentLang = null;
}
