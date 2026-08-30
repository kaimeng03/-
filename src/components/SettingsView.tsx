"use client";

import Link from "next/link";
import Image from "next/image";
import { t } from "@/lib/i18n";
import { useLang } from "@/lib/useLang";
import DeleteAccountSection from "@/components/DeleteAccountSection";
import LegacyImportSection from "@/components/LegacyImportSection";

export default function SettingsView({
  user,
  signOutAction,
}: {
  user: { name: string | null; email: string | null; image: string | null };
  signOutAction: () => Promise<void>;
}) {
  const [lang, setLang] = useLang();

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/" className="mb-6 inline-block text-sm text-neutral-500 hover:underline">
        {t(lang, "backToApp")}
      </Link>
      <h1 className="mb-6 text-xl font-semibold">{t(lang, "settingsTitle")}</h1>

      <section className="mb-6 rounded-md border border-black/10 p-4 dark:border-white/15">
        <h2 className="mb-3 text-sm font-semibold">{t(lang, "accountSectionTitle")}</h2>
        <div className="flex items-center gap-3">
          {user.image ? (
            <Image src={user.image} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-full" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700">
              {(user.name || user.email || "").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-neutral-500">
              {t(lang, "signedInAs", { email: user.email ?? "" })}
            </p>
          </div>
        </div>
        <form action={signOutAction} className="mt-4">
          <button
            type="submit"
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            {t(lang, "signOutButton")}
          </button>
        </form>
      </section>

      <section className="mb-6 rounded-md border border-black/10 p-4 dark:border-white/15">
        <h2 className="mb-3 text-sm font-semibold">{t(lang, "languageLabel")}</h2>
        <div className="flex overflow-hidden rounded-md border border-black/10 text-sm dark:border-white/15" style={{ width: "fit-content" }}>
          <button
            type="button"
            onClick={() => setLang("zh")}
            aria-pressed={lang === "zh"}
            className={`px-3 py-1.5 transition ${lang === "zh" ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"}`}
          >
            繁中
          </button>
          <button
            type="button"
            onClick={() => setLang("en")}
            aria-pressed={lang === "en"}
            className={`px-3 py-1.5 transition ${lang === "en" ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"}`}
          >
            EN
          </button>
        </div>
      </section>

      <section className="mb-6 rounded-md border border-black/10 p-4 dark:border-white/15">
        <h2 className="mb-3 text-sm font-semibold">{t(lang, "workCategoryLabel")}</h2>
        <Link
          href="/onboarding"
          className="inline-block rounded-md border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          {t(lang, "changeWorkCategory")}
        </Link>
      </section>

      <LegacyImportSection lang={lang} />

      <DeleteAccountSection lang={lang} />
    </div>
  );
}
