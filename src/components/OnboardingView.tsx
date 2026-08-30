"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { useLang } from "@/lib/useLang";
import { PROFESSIONS } from "@/lib/professions";
import type { Source } from "@/lib/sources";

type RecommendedSource = Source & { alreadySubscribed?: boolean };

export default function OnboardingView({
  initialProfessionKey,
  initialCustomProfession,
}: {
  initialProfessionKey: string | null;
  initialCustomProfession: string | null;
}) {
  const [lang] = useLang();
  const router = useRouter();
  const [step, setStep] = useState<"profession" | "recommendations">("profession");
  const [professionKey, setProfessionKey] = useState(initialProfessionKey ?? "");
  const [customProfession, setCustomProfession] = useState(initialCustomProfession ?? "");
  const [recommendations, setRecommendations] = useState<RecommendedSource[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [followingId, setFollowingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function savePreferences(data: Record<string, unknown>) {
    await fetch("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async function handleContinue() {
    setBusy(true);
    try {
      await savePreferences({
        professionKey: professionKey || null,
        customProfession: professionKey === "other" ? customProfession.trim() || null : null,
      });
      const res = await fetch("/api/recommendations");
      const data = await res.json().catch(() => ({ sources: [] }));
      // Onboarding is a "browse and follow" first-run flow — keep it to
      // sources not already followed, without changing the general catalog
      // API's own behavior (which intentionally still includes them, so the
      // regular catalog UI can offer an unfollow action).
      const sources: RecommendedSource[] = data.sources ?? [];
      setRecommendations(sources.filter((s) => !s.alreadySubscribed));
      setStep("recommendations");
    } finally {
      setBusy(false);
    }
  }

  async function handleFollow(source: Source) {
    setFollowingId(source.id);
    try {
      const categoryLabel = PROFESSIONS.find((p) => p.key === professionKey);
      const categoryName = (lang === "zh" ? categoryLabel?.labelZh : categoryLabel?.labelEn) || "我的新聞";
      const res = await fetch("/api/recommendations/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: source.id, categoryName }),
      });
      if (res.ok) {
        setFollowedIds((prev) => new Set(prev).add(source.id));
      }
    } finally {
      setFollowingId(null);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await savePreferences({ onboardingCompleted: true });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await savePreferences({ onboardingCompleted: true });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      {step === "profession" ? (
        <>
          <h1 className="mb-1 text-xl font-semibold">{t(lang, "onboardingTitle")}</h1>
          <p className="mb-6 text-sm text-neutral-500">{t(lang, "onboardingSubtitle")}</p>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROFESSIONS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setProfessionKey(p.key)}
                aria-pressed={professionKey === p.key}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  professionKey === p.key
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                    : "border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                }`}
              >
                {lang === "zh" ? p.labelZh : p.labelEn}
              </button>
            ))}
          </div>

          {professionKey === "other" && (
            <input
              value={customProfession}
              onChange={(e) => setCustomProfession(e.target.value)}
              placeholder={t(lang, "onboardingCustomPlaceholder")}
              className="mb-4 w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-neutral-400 dark:border-white/15"
            />
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={skip}
              disabled={busy}
              className="text-sm text-neutral-500 underline hover:text-neutral-800 disabled:opacity-50 dark:hover:text-neutral-200"
            >
              {t(lang, "onboardingSkip")}
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={busy || !professionKey}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              {t(lang, "onboardingContinue")}
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="mb-4 text-xl font-semibold">{t(lang, "recommendationsTitle")}</h1>

          {recommendations.length === 0 ? (
            <p className="mb-6 text-sm text-neutral-500">{t(lang, "recommendationsEmpty")}</p>
          ) : (
            <ul className="mb-6 space-y-2">
              {recommendations.map((source) => {
                const followed = followedIds.has(source.id);
                return (
                  <li
                    key={source.id}
                    className="flex items-center justify-between rounded-md border border-black/10 px-3 py-2 dark:border-white/15"
                  >
                    <span className="text-sm">{source.name}</span>
                    <button
                      type="button"
                      onClick={() => handleFollow(source)}
                      disabled={followed || followingId === source.id}
                      className="rounded-md border border-black/10 px-3 py-1 text-xs disabled:opacity-50 dark:border-white/15"
                    >
                      {followed
                        ? t(lang, "recommendationFollowed")
                        : followingId === source.id
                          ? t(lang, "recommendationFollowing")
                          : t(lang, "recommendationFollow")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={finish}
            disabled={busy}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {t(lang, "onboardingDone")}
          </button>
        </>
      )}
    </div>
  );
}
