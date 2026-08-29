"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "readState.v1";
const MAX_TRACKED_IDS = 3000; // bounds localStorage growth over time

interface ReadStateData {
  version: 1;
  read: string[];
  saved: string[];
}

function emptyState(): ReadStateData {
  return { version: 1, read: [], saved: [] };
}

// useSyncExternalStore requires getServerSnapshot to return a stable (Object.is-equal)
// reference across calls — a fresh object every time makes React think the store
// changes on every check, which is exactly the "should be cached to avoid an
// infinite loop" warning this constant fixes.
const SERVER_SNAPSHOT: ReadStateData = emptyState();

function load(): ReadStateData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.read) || !Array.isArray(parsed.saved)) {
      return emptyState();
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

function save(data: ReadStateData) {
  try {
    // Cap growth: keep only the most recently touched ids (appended at the end).
    const trimmed: ReadStateData = {
      version: 1,
      read: data.read.slice(-MAX_TRACKED_IDS),
      saved: data.saved.slice(-MAX_TRACKED_IDS),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full or blocked — the in-memory `current` below still reflects the
    // change for the rest of this tab's session.
  }
}

// Same in-memory-source-of-truth pattern as useLang, for the same reason: a failed
// localStorage write must not make the UI look unresponsive.
let current: ReadStateData | null = null;
const listeners = new Set<() => void>();

function getState(): ReadStateData {
  if (current === null) current = load();
  return current;
}

function notify() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  function onStorageEvent(e: StorageEvent) {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    current = load();
    onChange();
  }
  window.addEventListener("storage", onStorageEvent);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorageEvent);
  };
}

function getServerSnapshot(): ReadStateData {
  return SERVER_SNAPSHOT;
}

function mutate(fn: (data: ReadStateData) => ReadStateData) {
  const next = fn(getState());
  current = next;
  save(next);
  notify();
}

export interface ReadStateApi {
  isRead: (id: string) => boolean;
  isSaved: (id: string) => boolean;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  toggleSaved: (id: string) => void;
  markAllRead: (ids: string[]) => void;
  readCount: number;
  savedIds: Set<string>;
  readIds: Set<string>;
}

/** Test-only: clears the in-memory hydration cache so each test starts fresh. */
export function __resetReadStateForTests(): void {
  current = null;
}

export function useReadState(): ReadStateApi {
  const data = useSyncExternalStore(subscribe, getState, getServerSnapshot);
  const readIds = new Set(data.read);
  const savedIds = new Set(data.saved);

  return {
    isRead: (id) => readIds.has(id),
    isSaved: (id) => savedIds.has(id),
    markRead: (id) =>
      mutate((d) => (d.read.includes(id) ? d : { ...d, read: [...d.read, id] })),
    markUnread: (id) => mutate((d) => ({ ...d, read: d.read.filter((x) => x !== id) })),
    toggleSaved: (id) =>
      mutate((d) =>
        d.saved.includes(id)
          ? { ...d, saved: d.saved.filter((x) => x !== id) }
          : { ...d, saved: [...d.saved, id] },
      ),
    markAllRead: (ids) =>
      mutate((d) => ({ ...d, read: [...new Set([...d.read, ...ids])] })),
    readCount: readIds.size,
    savedIds,
    readIds,
  };
}
