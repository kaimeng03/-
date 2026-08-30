import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import SettingsView from "@/components/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <SettingsView
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }}
      signOutAction={signOutAction}
    />
  );
}
