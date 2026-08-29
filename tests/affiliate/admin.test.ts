import { describe, expect, it } from "vitest";
import {
  buildAffiliateCode,
  commissionPercentToBasisPoints,
  normalizeMonthlyAnalysisLimit,
} from "@/lib/affiliate/admin";

describe("affiliate admin helpers", () => {
  it("builds a readable referral code without embedding an email", () => {
    expect(buildAffiliateCode("Anna Svensson", "A1B2C3")).toBe("ANNA-SVENSSON-A1B2C3");
  });

  it("converts commission percent to basis points safely", () => {
    expect(commissionPercentToBasisPoints(20)).toBe(2000);
    expect(commissionPercentToBasisPoints(12.5)).toBe(1250);
    expect(commissionPercentToBasisPoints(110)).toBe(10000);
  });

  it("normalizes custom ambassador analysis limits", () => {
    expect(normalizeMonthlyAnalysisLimit(20)).toBe(20);
    expect(normalizeMonthlyAnalysisLimit(150)).toBe(150);
    expect(normalizeMonthlyAnalysisLimit(-1)).toBe(0);
  });
});