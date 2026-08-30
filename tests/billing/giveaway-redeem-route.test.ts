import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const pagePath = join(root, "src/app/redeem/[code]/page.tsx");
const redemptionMigration = readFileSync(join(root, "supabase/migrations/20260830125230_commercial_plans_giveaways_v2.sql"), "utf8");

describe("giveaway redeem route", () => {
  it("provides the canonical /redeem/[code] page", () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it("keeps expiry enforcement in the atomic redemption RPC instead of render-time clock checks", () => {
    const page = readFileSync(pagePath, "utf8");
    expect(page).not.toContain("Date.now()");
    expect(redemptionMigration).toContain("claim_expires_at");
    expect(redemptionMigration).toContain("v_campaign.claim_expires_at <= v_now");
  });
});
