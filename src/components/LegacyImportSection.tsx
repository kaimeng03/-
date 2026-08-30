"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

const LOCAL_READ_STATE_KEY = "readState.v1";

interface LocalReadState {
  read: unknown;
  saved: unknown;
}

function readLegacyLocalStorage(): LocalReadState | null {
  try {
    const raw = localStorage.getItem(LOCAL_READ_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.read) || !Array.isArray(parsed?.saved)) return null;
    return { read: parsed.read, saved: parsed.saved };
  } catch {
    return null;
  }
}

export default function LegacyImportSection({ lang }: { lang: Lang }) {
  const router = useRouter();

  const [sourcesStatus, setSourcesStatus] = useState<{
    eligible: boolean;
    alreadyImported: boolean;
    preview: { categoryCount: number; sourceCount: number } | null;
  } | null>(null);
  const [sourcesBusy, setSourcesBusy] = useState(false);
  const [sourcesMessage, setSourcesMessage] = useState<string | null>(null);

  const [localData, setLocalData] = useState<LocalReadState | null>(null);
  const [readStateAlreadyImported, setReadStateAlreadyImported] = useState(true);
  const [readStateBusy, setReadStateBusy] = useState(false);
  const [readStateMessage, setReadStateMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/migrations/legacy-sources")
      .then((res) => res.json())
      .then(setSourcesStatus)
      .catch(() => setSourcesStatus(null));

    fetch("/api/migrations/local-read-state")
      .then((res) => res.json())
      .then((data) => setReadStateAlreadyImported(Boolean(data.alreadyImported)))
      .catch(() => setReadStateAlreadyImported(true));

    Promise.resolve().then(() => setLocalData(readLegacyLocalStorage()));
  }, []);

  async function importSources() {
    setSourcesBusy(true);
    setSourcesMessage(null);
    try {
      const res = await fetch("/api/migrations/legacy-sources", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSourcesMessage(data.error || t(lang, "legacySourcesImportFailed"));
        return;
      }
      setSourcesMessage(
        t(lang, "legacySourcesImportSuccess", {
          categories: String(data.importedCategories),
          subscriptions: String(data.importedSubscriptions),
        }),
      );
      setSourcesStatus((prev) => (prev ? { ...prev, alreadyImported: true } : prev));
      router.refresh();
    } catch {
      setSourcesMessage(t(lang, "legacySourcesImportFailed"));
    } finally {
      setSourcesBusy(false);
    }
  }

  async function importReadState() {
    if (!localData) return;
    setReadStateBusy(true);
    setReadStateMessage(null);
    try {
      const res = await fetch("/api/migrations/local-read-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localData),
      });
      const data = await res.json();
      if (!res.ok) {
        setReadStateMessage(data.error || t(lang, "legacyReadStateImportFailed"));
        return;
      }
      setReadStateMessage(t(lang, "legacyReadStateImportSuccess", { count: String(data.imported) }));
      setReadStateAlreadyImported(true);
    } catch {
      setReadStateMessage(t(lang, "legacyReadStateImportFailed"));
    } finally {
      setReadStateBusy(false);
    }
  }

  const showSourcesImport = sourcesStatus?.eligible && !sourcesStatus.alreadyImported && sourcesStatus.preview;
  const localCount =
    (Array.isArray(localData?.read) ? localData.read.length : 0) +
    (Array.isArray(localData?.saved) ? localData.saved.length : 0);
  const showReadStateImport = !readStateAlreadyImported && localData && localCount > 0;

  if (!showSourcesImport && !showReadStateImport) return null;

  return (
    <section className="mb-6 space-y-4">
      {showSourcesImport && sourcesStatus?.preview && (
        <div className="rounded-md border border-black/10 p-4 dark:border-white/15">
          <h2 className="mb-1 text-sm font-semibold">{t(lang, "legacySourcesImportTitle")}</h2>
          <p className="mb-3 text-sm text-neutral-500">
            {t(lang, "legacySourcesImportDescription", {
              categoryCount: String(sourcesStatus.preview.categoryCount),
              sourceCount: String(sourcesStatus.preview.sourceCount),
            })}
          </p>
          <button
            type="button"
            onClick={importSources}
            disabled={sourcesBusy}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {sourcesBusy ? t(lang, "importing") : t(lang, "legacySourcesImportButton")}
          </button>
          {sourcesMessage && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{sourcesMessage}</p>}
        </div>
      )}

      {showReadStateImport && (
        <div className="rounded-md border border-black/10 p-4 dark:border-white/15">
          <h2 className="mb-1 text-sm font-semibold">{t(lang, "legacyReadStateImportTitle")}</h2>
          <p className="mb-3 text-sm text-neutral-500">
            {t(lang, "legacyReadStateImportDescription", { count: String(localCount) })}
          </p>
          <button
            type="button"
            onClick={importReadState}
            disabled={readStateBusy}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {readStateBusy ? t(lang, "importing") : t(lang, "legacyReadStateImportButton")}
          </button>
          {readStateMessage && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{readStateMessage}</p>
          )}
        </div>
      )}
    </section>
  );
}
