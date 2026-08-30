import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260830000656_commercial_plans_giveaways.sql"), "utf8").replace(/\s+/g, " ").toLowerCase();

describe("commercial plan quota migration", () => {
  it("publishes the approved recurring plan prices and quotas", () => {
    expect(sql).toContain("'basic', 'basic', 69");
    expect(sql).toContain("'standard', 'standard', 119");
    expect(sql).toContain("'premium', 'pro', 179");
    expect(sql).toContain("'elite', 'elite', 399");
    expect(sql).toContain("{\"monthlyanalyses\":10");
    expect(sql).toContain("{\"monthlyanalyses\":35");
    expect(sql).toContain("{\"monthlyanalyses\":90");
    expect(sql).toContain("{\"monthlyanalyses\":350");
  });

  it("keeps Free at three per month but grants five total during the first rolling 30 days", () => {
    expect(sql).toContain("'free', 'free', null");
    expect(sql).toContain("{\"monthlyanalyses\":3");
    expect(sql).toContain("v_profile_created_at + interval '30 days'");
    expect(sql).toContain("v_period_start := v_profile_created_at");
    expect(sql).toContain("v_monthly_limit := 5");
  });

  it("persists launch redemption per paid plan while keeping the legacy timestamp", () => {
    expect(sql).toContain("launch_offer_redeemed_plans text[] not null default '{}'");
    expect(sql).toContain("launch_offer_redeemed_at is not null");
    expect(sql).toContain("array_append");
    expect(sql).toContain("p_plan_key");
  });

  it("switches Free to calendar-month quota after day 30 and keeps admin effectively unlimited", () => {
    expect(sql).toContain("v_period_start := date_trunc('month', now())");
    expect(sql).not.toContain("v_period_start := greatest(date_trunc('month', now()), v_profile_created_at + interval '30 days')");
    expect(sql).toContain("v_monthly_limit := 2147483647");
    expect(sql).toContain("v_deep_limit := 2147483647");
  });

  it("resolves paid and promotional access by deterministic plan rank", () => {
    expect(sql).toContain("create or replace function private.stockbox_plan_rank");
    expect(sql).toContain("when 'free' then 0");
    expect(sql).toContain("when 'elite' then 4");
    expect(sql).toContain("promotional_access_grants");
    expect(sql).toContain("private.stockbox_plan_rank");
  });
});
