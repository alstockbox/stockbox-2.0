import { describe, expect, it } from "vitest";
import { maskEmail, normalizeReferralCode } from "@/lib/affiliate/attribution";

describe("affiliate attribution helpers", () => {
  it("normalizes valid referral codes", () => {
    expect(normalizeReferralCode(" arthur-01 ")).toBe("ARTHUR-01");
    expect(normalizeReferralCode("Stock_Box")).toBe("STOCK_BOX");
  });

  it("rejects malformed or suspicious referral codes", () => {
    expect(normalizeReferralCode("x")).toBeNull();
    expect(normalizeReferralCode("<script>alert(1)</script>")).toBeNull();
    expect(normalizeReferralCode("a".repeat(60))).toBeNull();
  });

  it("masks referred customer emails before affiliate display", () => {
    expect(maskEmail("johan@example.com")).toBe("jo***@example.com");
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
    expect(maskEmail(null)).toBe("Customer");
  });
});