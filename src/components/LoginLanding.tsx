"use client";

import { t } from "@/lib/i18n";
import { useLang } from "@/lib/useLang";

export default function LoginLanding({
  oauthConfigured,
  errorCode,
  signInAction,
}: {
  oauthConfigured: boolean;
  errorCode: string | null;
  signInAction: () => Promise<void>;
}) {
  const [lang, setLang] = useLang();

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="absolute right-4 top-4">
        <div className="flex overflow-hidden rounded-md border border-black/10 text-sm dark:border-white/15">
          <button
            type="button"
            onClick={() => setLang("zh")}
            aria-pressed={lang === "zh"}
            className={`px-2.5 py-1.5 transition ${lang === "zh" ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"}`}
          >
            繁中
          </button>
          <button
            type="button"
            onClick={() => setLang("en")}
            aria-pressed={lang === "en"}
            className={`px-2.5 py-1.5 transition ${lang === "en" ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"}`}
          >
            EN
          </button>
        </div>
      </div>

      <h1 className="text-3xl font-semibold tracking-tight">{t(lang, "appTitle")}</h1>
      <p className="text-sm text-neutral-500">{t(lang, "loginTagline")}</p>

      {oauthConfigured ? (
        <form action={signInAction}>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            {t(lang, "signInWithGoogle")}
          </button>
        </form>
      ) : (
        <div className="max-w-sm rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">{t(lang, "oauthNotConfiguredTitle")}</p>
          <p className="mt-1 text-xs">{t(lang, "oauthNotConfiguredMessage")}</p>
        </div>
      )}

      {errorCode && (
        <p role="alert" className="max-w-sm text-sm text-red-600 dark:text-red-400">
          {t(lang, "signInError")}
        </p>
      )}

      <p className="max-w-sm text-xs leading-relaxed text-neutral-500">
        {t(lang, "signInPrivacyStatement")}
      </p>
    </div>
  );
}
