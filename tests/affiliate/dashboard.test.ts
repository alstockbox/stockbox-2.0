import { describe, expect, it } from "vitest";
import { aggregateAffiliateMetrics } from "@/lib/affiliate/dashboard";

describe("affiliate dashboard metrics", () => {
  it("separates pending, available, paid and lifetime earnings", () => {
    const metrics = aggregateAffiliateMetrics({
      clicks: 100,
      referrals: 20,
      payingCustomers: 5,
      now: new Date("2026-09-30T00:00:00.000Z"),
      commissions: [
        { status: "approved", amountCents: 500, availableAt: "2026-10-01T00:00:00.000Z" },
        { status: "approved", amountCents: 700, availableAt: "2026-09-01T00:00:00.000Z" },
        { status: "paid", amountCents: 1200, availableAt: "2026-08-01T00:00:00.000Z" },
        { status: "reversed", amountCents: 300, availableAt: "2026-08-01T00:00:00.000Z" },
      ],
    });
    expect(metrics.pendingCents).toBe(500);
    expect(metrics.availableCents).toBe(700);
    expect(metrics.paidCents).toBe(1200);
    expect(metrics.lifetimeEarningsCents).toBe(2400);
    expect(metrics.conversionRate).toBe(5);
  });
});