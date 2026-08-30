import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import Google from "next-auth/providers/google";

describe("Google OAuth provider — minimal scope requirement", () => {
  it("the provider factory carries no built-in scope override (Auth.js OIDC default: openid email profile)", () => {
    const provider = Google({ clientId: "test", clientSecret: "test" });
    expect(provider.authorization).toBeUndefined();
  });

  it("auth.ts never requests Gmail/Contacts/Calendar/Drive scopes or overrides the default scope", () => {
    const authSource = readFileSync(path.join(process.cwd(), "auth.ts"), "utf-8");
    expect(authSource).not.toMatch(/gmail|contacts|calendar|drive\.readonly|drive\.file/i);
    expect(authSource).not.toMatch(/authorization:\s*{/);
    expect(authSource).not.toContain("scope:");
  });
});
