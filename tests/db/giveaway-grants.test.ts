import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260830000656_commercial_plans_giveaways.sql"), "utf8").replace(/\s+/g, " ").toLowerCase();

describe("affiliate giveaway grants", () => {
  it("creates durable campaign, code and promotional grant tables with RLS", () => {
    expect(sql).toContain("create table public.affiliate_giveaway_campaigns");
    expect(sql).toContain("create table public.affiliate_giveaway_codes");
    expect(sql).toContain("create table public.promotional_access_grants");
    expect(sql).toContain("code text not null unique");
    expect(sql).toContain("code_id uuid not null unique");
    expect(sql).toContain("unique (user_id, campaign_id)");
    expect(sql.match(/enable row level security/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("restricts mint and revoke RPCs to service role and validates admin ownership", () => {
    expect(sql).toContain("create or replace function public.create_affiliate_giveaway_campaign");
    expect(sql).toContain("create or replace function public.revoke_affiliate_giveaway_campaign");
    expect(sql).toContain("coalesce(v_actor_role, '') <> 'admin'");
    expect(sql).toContain("grant execute on function public.create_affiliate_giveaway_campaign");
    expect(sql).toContain("to service_role");
  });

  it("models giveaway duration in months from 1 to 24 with an optional redemption deadline", () => {
    expect(sql).toContain("duration_months integer not null");
    expect(sql).toContain("p_duration_months integer");
    expect(sql).toContain("p_duration_months not between 1 and 24");
    expect(sql).toContain("make_interval(months => v_campaign.duration_months)");
    expect(sql).not.toContain("claim_expires_at timestamptz not null");
  });

  it("redeems codes atomically for the authenticated winner without touching Stripe or commissions", () => {
    expect(sql).toContain("create or replace function public.redeem_affiliate_giveaway_code");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("for update");
    expect(sql).toContain("status = 'redeemed'");
    expect(sql).toContain("insert into public.promotional_access_grants");
    expect(sql).toContain("grant execute on function public.redeem_affiliate_giveaway_code(text) to authenticated");
    const redemptionSql = sql.split("create or replace function public.redeem_affiliate_giveaway_code")[1]
      ?.split("create or replace function private.stockbox_effective_plan")[0] ?? "";
    expect(redemptionSql).not.toContain("stripe_subscription_id");
    expect(redemptionSql).not.toContain("affiliate_commissions");
  });

  it("revokes unused codes but preserves already redeemed grants", () => {
    expect(sql).toContain("where campaign_id = p_campaign_id and status = 'available'");
    expect(sql).not.toContain("delete from public.promotional_access_grants");
  });
});
