import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: {
    // Explicit for clarity — this is also the adapter-present default.
    // Server-side, HttpOnly, DB-backed sessions (never a client-readable JWT).
    strategy: "database",
  },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async signIn({ account, profile }) {
      // Only Google is configured, but keep the check explicit and provider-scoped.
      if (account?.provider === "google") {
        // Reject unverified Google emails — never let an unverified address
        // become the stable identity for a session.
        return profile?.email_verified === true;
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.professionKey = user.professionKey ?? null;
        session.user.customProfession = user.customProfession ?? null;
        session.user.onboardingCompleted = user.onboardingCompleted;
        session.user.role = user.role;
      }
      return session;
    },
  },
  events: {
    async signIn({ account, profile, user }) {
      // Record Google's stable "sub" claim as our identity key. Idempotent —
      // safe to run on every sign-in, not just the first account link.
      if (account?.provider === "google" && profile?.sub && user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { googleSub: profile.sub },
        });
      }
    },
  },
});
