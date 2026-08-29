"use client";

import { useEffect, useState, useCallback } from "react";

export function useAdminSession() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setIsAdmin(Boolean(data.isAdmin));
        setConfigured(Boolean(data.configured));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (password: string): Promise<string | null> => {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error || "登入失敗";
    setIsAdmin(true);
    return null;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    setIsAdmin(false);
  }, []);

  return { isAdmin, configured, checked, login, logout };
}
