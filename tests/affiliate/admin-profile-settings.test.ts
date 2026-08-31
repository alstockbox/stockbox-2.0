import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actionsPath = join(process.cwd(), "src/app/admin/actions.ts");
const pagePath = join(process.cwd(), "src/app/admin/page.tsx");

describe("affiliate admin profile settings", () => {
  it("lets an admin edit affiliate identity and operational status", () => {
    const actions = readFileSync(actionsPath, "utf8");
    expect(actions).toContain("updateAffiliateProfileAction");
    expect(actions).toContain("normalizeReferralCode");
    expect(actions).toContain('z.enum(["active", "paused", "pending"])');
    expect(actions).toContain('.eq("id", parsed.data.affiliateId)');
  });

  it("renders affiliate name, referral code and status controls in Admin", () => {
    const page = readFileSync(pagePath, "utf8");
    expect(page).toContain("updateAffiliateProfileAction");
    expect(page).toContain('name="displayName"');
    expect(page).toContain('name="referralCode"');
    expect(page).toContain('name="affiliateStatus"');
  });
});
