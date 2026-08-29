import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260829125023_affiliate_clicks_custom_quota.sql"),
  "utf8"
);

describe("affiliate click tracking and ambassador quota migration", () => {
  it("upgrades the legacy production affiliate_clicks table without recreating it", () => {
    expect(sql).not.toContain("create table public.affiliate_clicks");
    expect(sql).toContain("alter table public.affiliate_clicks");
    expect(sql).toContain("add column if not exists visitor_token text");
    expect(sql).toContain("set visitor_token = 'legacy:' || id::text");
    expect(sql).toContain("alter column visitor_token set not null");
  });

  it("uses the ambassador's configured monthly analysis limit", () => {
    expect(sql).toContain("a.monthly_analysis_limit");
    expect(sql).toContain("v_monthly_limit := coalesce(v_ambassador_limit, 0)");
  });

  it("backfills legacy ambassador roles before enforcing active affiliate access", () => {
    expect(sql).toContain("insert into public.affiliates");
    expect(sql).toContain("where p.role = 'affiliate_ambassador'");
  });
});