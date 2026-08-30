import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dirname, "../..");
const service = readFileSync(join(root, "src/lib/affiliate/service.ts"), "utf8");
const page = readFileSync(join(root, "src/app/affiliate/page.tsx"), "utf8");
const copyControls = readFileSync(join(root, "src/components/affiliate/giveaway-copy-controls.tsx"), "utf8");

describe("ambassador giveaway visibility", () => {
  it("loads campaigns scoped to the selected affiliate and exposes codes read-only", () => {
    expect(service).toContain('from("affiliate_giveaway_campaigns")');
    expect(service).toContain('.eq("affiliate_id", affiliate.id)');
    expect(service).toContain('from("affiliate_giveaway_codes")');
    expect(service).toContain("giveawayCampaigns");
    expect(page).toContain("Giveaway campaigns");
    expect(page).not.toContain("createAffiliateGiveawayCampaignAction");
    expect(page).not.toContain("revokeAffiliateGiveawayCampaignAction");
  });

  it("shows giveaway duration in months and provides explicit copy controls", () => {
    expect(page).toContain("campaign.durationMonths} months free access");
    expect(page).toContain("GiveawayCopyControls");
    expect(copyControls).toContain("Copy code");
    expect(copyControls).toContain("Copy link");
    expect(copyControls).toContain("navigator.clipboard.writeText");
  });
});
