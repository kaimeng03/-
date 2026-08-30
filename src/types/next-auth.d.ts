import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      professionKey: string | null;
      customProfession: string | null;
      onboardingCompleted: boolean;
      role: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    professionKey: string | null;
    customProfession: string | null;
    onboardingCompleted: boolean;
    role: string;
  }
}
