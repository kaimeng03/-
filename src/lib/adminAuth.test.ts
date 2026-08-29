import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkPassword,
  createSessionCookieValue,
  verifySessionCookieValue,
  isAdminConfigured,
} from "./adminAuth";

const ORIGINAL_ENV = process.env.ADMIN_PASSWORD;

describe("adminAuth", () => {
  afterEach(() => {
    process.env.ADMIN_PASSWORD = ORIGINAL_ENV;
  });

  it("reports not configured when ADMIN_PASSWORD is unset", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(isAdminConfigured()).toBe(false);
    expect(checkPassword("anything")).toBe(false);
  });

  describe("with ADMIN_PASSWORD set", () => {
    beforeEach(() => {
      process.env.ADMIN_PASSWORD = "correct-horse-battery-staple";
    });

    it("accepts the correct password and rejects a wrong one", () => {
      expect(checkPassword("correct-horse-battery-staple")).toBe(true);
      expect(checkPassword("wrong-password")).toBe(false);
      expect(checkPassword("")).toBe(false);
    });

    it("creates a session cookie that verifies as valid", () => {
      const cookie = createSessionCookieValue();
      expect(verifySessionCookieValue(cookie)).toBe(true);
    });

    it("rejects a tampered cookie", () => {
      const cookie = createSessionCookieValue();
      const [payload] = cookie.split(".");
      const tampered = `${payload}.0000000000000000000000000000000000000000000000000000000000000000`;
      expect(verifySessionCookieValue(tampered)).toBe(false);
    });

    it("rejects a missing cookie", () => {
      expect(verifySessionCookieValue(undefined)).toBe(false);
    });

    it("rejects a session after its expiry time has passed", () => {
      const cookie = createSessionCookieValue();
      expect(verifySessionCookieValue(cookie)).toBe(true);

      const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
      const realNow = Date.now;
      Date.now = () => realNow() + eightDaysMs;
      try {
        expect(verifySessionCookieValue(cookie)).toBe(false);
      } finally {
        Date.now = realNow;
      }
    });

    it("session created with a different password does not verify after password change", () => {
      const cookie = createSessionCookieValue();
      process.env.ADMIN_PASSWORD = "a-different-password";
      expect(verifySessionCookieValue(cookie)).toBe(false);
    });
  });
});
