import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260829135927_release_fk_indexes.sql"),
  "utf8",
);

describe("release foreign-key support indexes", () => {
  it("indexes affiliate payout and referral relationships used by release flows", () => {
    expect(sql).toContain("affiliate_clawbacks_payout_idx");
    expect(sql).toContain("affiliate_commissions_payout_idx");
    expect(sql).toContain("affiliate_commissions_referred_user_idx");
    expect(sql).toContain("affiliate_payouts_affiliate_idx");
    expect(sql).toContain("referrals_affiliate_idx");
    expect(sql).toContain("referrals_referrer_idx");
  });

  it("indexes support submissions by user without indexing null-only rows", () => {
    expect(sql).toContain("contact_messages_user_idx");
    expect(sql).toContain("feedback_submissions_user_idx");
    expect(sql).toContain("where user_id is not null");
  });
});
