import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAffiliateConnectAccountParams,
  isAffiliateConnectReady,
} from "@/lib/affiliate/connect";

const route = readFileSync(join(process.cwd(), "src/app/api/affiliate/connect/route.ts"), "utf8");

describe("Stripe Connect affiliate onboarding", () => {
  it("uses Stripe-hosted Express onboarding with transfers capability", () => {
    const params = buildAffiliateConnectAccountParams({
      userId: "user-1", affiliateId: "affiliate-1", email: "affiliate@example.com",
    });
    expect(params.controller?.requirement_collection).toBe("stripe");
    expect(params.controller?.stripe_dashboard?.type).toBe("express");
    expect(params.capabilities?.transfers?.requested).toBe(true);
  });

  it("enables payouts only when transfers and external payouts are active", () => {
    expect(isAffiliateConnectReady({ payouts_enabled: true, capabilities: { transfers: "active" } })).toBe(true);
    expect(isAffiliateConnectReady({ payouts_enabled: false, capabilities: { transfers: "active" } })).toBe(false);
    expect(isAffiliateConnectReady({ payouts_enabled: true, capabilities: { transfers: "pending" } })).toBe(false);
  });

  it("requires an authenticated ambassador and persists Stripe account state", () => {
    expect(route).toContain("requireUser");
    expect(route).toContain('role !== "affiliate_ambassador"');
    expect(route).toContain('from("affiliates")');
    expect(route).toContain("accountLinks.create");
    expect(route).toContain("payout_enabled");
    expect(route).toContain("stripe_connect_account_id");
  });
});
