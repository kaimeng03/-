"use client";

import { useEffect, useSyncExternalStore } from "react";

interface ReadStateData {
  read: string[];
  saved: string[];
}

function emptyState(): ReadStateData {
  return { read: [], saved: [] };
}

// useSyncExternalStore requires getServerSnapshot to return a stable (Object.is-equal)
// reference across calls — a fresh object every time makes React think the store
// changes on every check.
const SERVER_SNAPSHOT: ReadStateData = emptyState();

// DB-backed, per-user read/saved state (see /api/article-states). The
// in-memory `current` below is an optimistic cache: mutations apply here
// immediately (so the UI never waits on a round trip), then sync to the
// server in the background. A failed sync rolls the optimistic change back
// and reports it via the onError callback passed to useReadState().
let current: ReadStateData = emptyState();
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

function getState(): ReadStateData {
  return current;
}

function getServerSnapshot(): ReadStateData {
  return SERVER_SNAPSHOT;
}

function notify() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function ensureHydrated(onError?: (message: string) => void) {
  if (hydrated || hydrating) return;
  hydrating = fetch("/api/article-states")
    .then(async (res) => {
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      current = {
        read: Array.isArray(data.read) ? data.read : [],
        saved: Array.isArray(data.saved) ? data.saved : [],
      };
      hydrated = true;
      notify();
    })
    .catch(() => {
      onError?.("無法載入已讀／收藏狀態，請重新整理頁面再試一次。");
    })
    .finally(() => {
      hydrating = null;
    });
}

function applyOptimistic(next: ReadStateData) {
  current = next;
  notify();
}

async function syncArticleState(
  articleId: string,
  update: { read?: boolean; saved?: boolean },
  rollback: ReadStateData,
  onError?: (message: string) => void,
) {
  try {
    const res = await fetch(`/api/article-states/${encodeURIComponent(articleId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!res.ok) throw new Error("sync failed");
  } catch {
    applyOptimistic(rollback);
    onError?.("同步已讀／收藏狀態失敗，已還原這個變更。");
  }
}

async function syncMarkAllRead(ids: string[], rollback: ReadStateData, onError?: (message: string) => void) {
  try {
    const res = await fetch("/api/article-states/mark-all-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleIds: ids }),
    });
    if (!res.ok) throw new Error("sync failed");
  } catch {
    applyOptimistic(rollback);
    onError?.("同步已讀狀態失敗，已還原這個變更。");
  }
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

/** Test-only: resets the in-memory store so each test starts fresh. */
export function __resetReadStateForTests(): void {
  current = emptyState();
  hydrated = false;
  hydrating = null;
}

export function useReadState(onError?: (message: string) => void): ReadStateApi {
  const data = useSyncExternalStore(subscribe, getState, getServerSnapshot);

  useEffect(() => {
    ensureHydrated(onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readIds = new Set(data.read);
  const savedIds = new Set(data.saved);

  return {
    isRead: (id) => readIds.has(id),
    isSaved: (id) => savedIds.has(id),
    markRead: (id) => {
      if (readIds.has(id)) return;
      const rollback = data;
      applyOptimistic({ ...data, read: [...data.read, id] });
      void syncArticleState(id, { read: true }, rollback, onError);
    },
    markUnread: (id) => {
      const rollback = data;
      applyOptimistic({ ...data, read: data.read.filter((x) => x !== id) });
      void syncArticleState(id, { read: false }, rollback, onError);
    },
    toggleSaved: (id) => {
      const rollback = data;
      const nowSaved = !savedIds.has(id);
      applyOptimistic({
        ...data,
        saved: nowSaved ? [...data.saved, id] : data.saved.filter((x) => x !== id),
      });
      void syncArticleState(id, { saved: nowSaved }, rollback, onError);
    },
    markAllRead: (ids) => {
      const rollback = data;
      applyOptimistic({ ...data, read: [...new Set([...data.read, ...ids])] });
      void syncMarkAllRead(ids, rollback, onError);
    },
    readCount: readIds.size,
    savedIds,
    readIds,
  };
}
