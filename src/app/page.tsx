import { redirect } from "next/navigation";
import { getUserSourcesConfig } from "@/lib/db/userSources";
import NewsApp from "@/components/NewsApp";
import LoginLanding from "@/components/LoginLanding";
import { auth, signIn, signOut } from "@/auth";

// This page reads the session (a Dynamic API), so it's rendered per-request —
// it can never be a shared, statically-cached page once login gates it.
export const dynamic = "force-dynamic";

function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    const { error } = await searchParams;
    async function signInAction() {
      "use server";
      await signIn("google");
    }
    return (
      <LoginLanding
        oauthConfigured={isGoogleOAuthConfigured()}
        errorCode={error ?? null}
        signInAction={signInAction}
      />
    );
  }

  if (!session.user.onboardingCompleted) {
    redirect("/onboarding");
  }

  const { categories, sources } = await getUserSourcesConfig(session.user.id);
  const lastUpdated = new Date().toISOString();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <NewsApp
      initialArticles={[]}
      categories={categories}
      sources={sources}
      failedSourceNames={[]}
      lastUpdated={lastUpdated}
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }}
      signOutAction={signOutAction}
      professionKey={session.user.professionKey}
      loadArticlesClientSide
    />
  );
}
