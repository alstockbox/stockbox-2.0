import { describe, expect, it } from "vitest";
import { validateNewPassword } from "../../src/lib/auth/password-policy";

describe("new password policy", () => {
  it("accepts long passphrases without composition requirements", () => {
    expect(validateNewPassword("correct horse battery staple").success).toBe(true);
    expect(validateNewPassword("enkel lång lösenfras utan siffror").success).toBe(true);
  });

  it("rejects passwords shorter than fifteen characters", () => {
    expect(validateNewPassword("12345678901234").success).toBe(false);
  });

  it("accepts spaces and unicode and caps input at 128 characters", () => {
    expect(validateNewPassword("🔐 säker lösenfras med blanksteg").success).toBe(true);
    expect(validateNewPassword("x".repeat(129)).success).toBe(false);
  });
});