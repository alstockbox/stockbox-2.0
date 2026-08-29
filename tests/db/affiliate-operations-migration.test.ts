import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260829124811_affiliate_operations.sql"),
  "utf8"
);

describe("affiliate operations migration", () => {
  it("creates a durable commission and payout ledger", () => {
    expect(sql).toContain("create table public.affiliate_commissions");
    expect(sql).toContain("create table public.affiliate_payouts");
    expect(sql).toContain("source_event_id text not null unique");
  });

  it("allows one affiliate code to attribute many referred users", () => {
    expect(sql).toContain("drop constraint if exists referrals_code_key");
    expect(sql).toContain("create unique index if not exists referrals_referred_user_unique");
  });

  it("adds feedback and contact intake tables", () => {
    expect(sql).toContain("create table public.feedback_submissions");
    expect(sql).toContain("create table public.contact_messages");
  });
});