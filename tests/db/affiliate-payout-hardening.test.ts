import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260829125113_affiliate_payout_hardening.sql"),
  "utf8"
);

describe("affiliate payout hardening migration", () => {
  it("binds commissions to one specific payout", () => {
    expect(sql).toContain("add column if not exists payout_id uuid");
    expect(sql).toContain("where payout_id = p_payout_id");
  });

  it("creates future clawbacks when a paid commission is refunded", () => {
    expect(sql).toContain("create table public.affiliate_clawbacks");
    expect(sql).toContain("v_previous_status in ('paid', 'payable')");
    expect(sql).toContain("insert into public.affiliate_clawbacks");
  });

  it("nets open clawbacks before a payout can be queued", () => {
    expect(sql).toContain("v_clawback_amount");
    expect(sql).toContain("v_net_amount := v_commission_amount - v_clawback_amount");
    expect(sql).toContain("payout_id = v_payout_id");
  });

  it("releases only rows allocated to a failed payout", () => {
    expect(sql).toContain("create or replace function public.fail_affiliate_payout");
    expect(sql).toContain("set status = 'approved', payout_id = null");
    expect(sql).toContain("set status = 'open', payout_id = null");
  });
});
