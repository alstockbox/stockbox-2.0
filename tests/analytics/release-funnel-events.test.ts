import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsProperties } from "../../src/lib/analytics/events";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("release funnel analytics", () => {
  it("defines privacy-safe funnel events and properties", () => {
    expect(sanitizeAnalyticsProperties("pricing_plan_clicked", { plan: "standard", email: "nope@example.com" })).toEqual({ plan: "standard" });
    expect(sanitizeAnalyticsProperties("batch_completed", { count: 4, completedCount: 3, failedCount: 1, userId: "raw" })).toEqual({ count: 4, completedCount: 3, failedCount: 1 });
    expect(sanitizeAnalyticsProperties("comparison_completed", { count: 2, analysisId: "raw" })).toEqual({ count: 2 });
  });

  it("wires public, auth, comparison, batch and paid conversion events", () => {
    expect(read("src/app/page.tsx")).toContain('captureServerEvent("homepage_view"');
    expect(read("src/app/pricing/page.tsx")).toContain('captureServerEvent("pricing_view"');
    expect(read("src/app/sample-analysis/page.tsx")).toContain('captureServerEvent("sample_analysis_view"');
    const auth = read("src/lib/auth/actions.ts");
    expect(auth).toContain('captureServerEvent("signup_started"');
    expect(auth).toContain('captureServerEvent("signup_completed"');
    expect(auth).toContain('captureServerEvent("login_completed"');
    const compare = read("src/app/compare/page.tsx");
    expect(compare).toContain('captureServerEvent("comparison_started"');
    expect(compare).toContain('captureServerEvent("comparison_completed"');
    const batch = read("src/components/batch/batch-workbench.tsx");
    expect(batch).toContain('captureClientEvent("batch_started"');
    expect(batch).toContain('captureClientEvent("batch_completed"');
    expect(read("src/components/billing/checkout-button.tsx")).toContain('captureClientEvent("pricing_plan_clicked"');
    expect(read("src/lib/supabase/proxy.ts")).toContain('captureServerEvent("affiliate_visit"');
    const webhook = read("src/app/api/stripe/webhook/route.ts");
    expect(webhook).toContain('captureServerEvent("checkout_completed"');
    expect(webhook).toContain('captureServerEvent("affiliate_conversion"');
  });

  it("keeps client analytics behind the internal API boundary", () => {
    expect(read("src/lib/analytics/client.ts")).toContain('fetch("/api/analytics"');
    const route = read("src/app/api/analytics/route.ts");
    expect(route).toContain("captureServerEvent");
    expect(route).toContain("isClientAnalyticsEvent");
  });
});
