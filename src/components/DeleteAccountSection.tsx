"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { t, type Lang } from "@/lib/i18n";

export default function DeleteAccountSection({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) {
        setError(t(lang, "deleteAccountFailed"));
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(t(lang, "deleteAccountFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-red-200 p-4 dark:border-red-900">
      <h2 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">
        {t(lang, "dangerZoneTitle")}
      </h2>
      <button
        type="button"
        onClick={() => setStep(1)}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        {t(lang, "deleteAccountButton")}
      </button>

      <ConfirmDialog
        open={step === 1}
        title={t(lang, "deleteAccountStep1Title")}
        message={t(lang, "deleteAccountStep1Message")}
        confirmLabel={t(lang, "continueLabel")}
        cancelLabel={t(lang, "cancel")}
        onConfirm={() => setStep(2)}
        onCancel={() => setStep(0)}
      />

      <ConfirmDialog
        open={step === 2}
        title={t(lang, "deleteAccountStep2Title")}
        message={t(lang, "deleteAccountStep2Message")}
        confirmLabel={busy ? t(lang, "deletingAccount") : t(lang, "confirmDelete")}
        cancelLabel={t(lang, "cancel")}
        danger
        busy={busy}
        error={error}
        onConfirm={confirmDelete}
        onCancel={() => setStep(0)}
      />
    </div>
  );
}
