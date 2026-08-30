import { describe, expect, it } from "vitest";
import {
  calculateCommissionCents,
  commissionAvailableAt,
  isCommissionPayable,
} from "@/lib/affiliate/commission";

describe("affiliate commission rules", () => {
  it("calculates basis-point commission without overpaying fractions of a cent", () => {
    expect(calculateCommissionCents(7900, 2000)).toBe(1580);
    expect(calculateCommissionCents(4999, 1500)).toBe(749);
  });

  it("never returns a negative commission", () => {
    expect(calculateCommissionCents(-100, 2000)).toBe(0);
    expect(calculateCommissionCents(7900, -100)).toBe(0);
  });

  it("holds commissions until the configured availability date", () => {
    const paidAt = new Date("2026-08-29T08:00:00.000Z");
    expect(commissionAvailableAt(paidAt, 30).toISOString()).toBe("2026-09-28T08:00:00.000Z");
  });

  it("only makes approved commissions payable after the hold", () => {
    const now = new Date("2026-09-30T00:00:00.000Z");
    expect(isCommissionPayable("approved", "2026-09-28T08:00:00.000Z", now)).toBe(true);
    expect(isCommissionPayable("pending", "2026-09-28T08:00:00.000Z", now)).toBe(false);
    expect(isCommissionPayable("approved", "2026-10-01T00:00:00.000Z", now)).toBe(false);
  });
});