import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dirname, "../..");
const actions = readFileSync(join(root, "src/app/admin/actions.ts"), "utf8");
const page = readFileSync(join(root, "src/app/admin/page.tsx"), "utf8");

describe("admin giveaway controls", () => {
  it("requires admin and mints bounded cryptographic single-use codes", () => {
    expect(actions).toContain("createAffiliateGiveawayCampaignAction");
    expect(actions).toContain("await requireAdmin()");
    expect(actions).toContain("randomBytes");
    expect(actions).toContain('rpc("create_affiliate_giveaway_campaign"');
    expect(actions).toContain("quantity");
    expect(actions).toContain("durationMonths");
    expect(actions).toContain(".min(1).max(24)");
    expect(page).toContain("Free access months");
    expect(page).toContain("Redemption deadline (days, optional)");
    expect(page).toContain("{campaign.duration_months} months");
    expect(page).not.toContain("{campaign.duration_months} days");
  });
  it("wires admin revocation without deleting campaign history", () => {
    expect(actions).toContain("revokeAffiliateGiveawayCampaignAction");
    expect(actions).toContain('rpc("revoke_affiliate_giveaway_campaign"');
    expect(page).toContain("Giveaway campaigns");
    expect(page).toContain("Create giveaway");
  });
});
