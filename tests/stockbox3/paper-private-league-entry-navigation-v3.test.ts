import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/paper-trading/page.tsx"), "utf8");
const mobileNavSource = fs.readFileSync(path.join(process.cwd(), "src/components/app-shell/mobile-bottom-nav.tsx"), "utf8");

describe("Paper Trading V3 private league entry navigation", () => {
  it("keeps the private league entry behind the privateLeagues feature flag", () => {
    expect(pageSource).toContain('const privateLeaguesEnabled = isFeatureEnabled("privateLeagues")');
    const flagIndex = pageSource.indexOf('const privateLeaguesEnabled = isFeatureEnabled("privateLeagues")');
    const linkIndex = pageSource.indexOf('href="/paper-trading/private-leagues"');
    expect(linkIndex).toBeGreaterThan(flagIndex);
    expect(pageSource.slice(flagIndex, linkIndex)).toContain("privateLeaguesEnabled ?");
  });

  it("links only to the authenticated member list, not a public private league catalogue", () => {
    expect(pageSource).toContain('href="/paper-trading/private-leagues"');
    expect(pageSource).toContain("Privata ligor");
    expect(pageSource).toContain("Private leagues");
    expect(pageSource).toContain("medlemskap");
    expect(pageSource).toContain("membership");
    expect(pageSource).not.toContain("listOpenPrivate");
    expect(pageSource).not.toContain('from("paper_competitions_v3")');
  });

  it("keeps the main paper trading page free of private league mutation authority", () => {
    expect(pageSource).not.toContain("joinPrivatePaperLeagueAction");
    expect(pageSource).not.toContain("createPrivatePaperLeagueAction");
    expect(pageSource).not.toContain("createPrivatePaperLeagueInviteAction");
    expect(pageSource).not.toContain("executePrivatePaperLeagueOrderAction");
    expect(pageSource).not.toContain('name="inviteToken"');
    expect(pageSource).not.toContain("inviteTokenHash");
  });

  it("does not consume a mobile primary navigation slot", () => {
    expect(mobileNavSource).toContain("grid-cols-5");
    expect(mobileNavSource).not.toContain('href: "/paper-trading/private-leagues"');
  });

  it("keeps the entry explicitly private and simulated", () => {
    expect(pageSource.toLowerCase()).toContain("simulat");
    expect(pageSource).toContain("inte publikt sökbara");
    expect(pageSource).toContain("not publicly discoverable");
  });
});
