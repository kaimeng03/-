import { redirect } from "next/navigation";
import { auth } from "@/auth";
import OnboardingView from "@/components/OnboardingView";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  return (
    <OnboardingView
      initialProfessionKey={session.user.professionKey}
      initialCustomProfession={session.user.customProfession}
    />
  );
}
