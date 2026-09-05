import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync("src/app/briefing/page.tsx", "utf8");
const dashboardSource = readFileSync("src/app/dashboard/page.tsx", "utf8");
const navSource = readFileSync("src/components/app-shell/nav.tsx", "utf8");
const mobileNavSource = readFileSync("src/components/app-shell/mobile-bottom-nav.tsx", "utf8");

describe("Daily Briefing V3 dark-launch wiring", () => {
  it("hard-gates the briefing page before user data is loaded", () => {
    const gateIndex = pageSource.indexOf('if (!isFeatureEnabled("dailyBriefing")) notFound()');
    const userIndex = pageSource.indexOf("getCurrentUser()");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(userIndex).toBeGreaterThan(gateIndex);
  });

  it("only exposes the workspace navigation link behind the dailyBriefing flag", () => {
    const flagIndex = navSource.indexOf('const briefingEnabled = isFeatureEnabled("dailyBriefing")');
    const desktopLinkIndex = navSource.indexOf('href="/briefing"');
    expect(flagIndex).toBeGreaterThan(-1);
    expect(desktopLinkIndex).toBeGreaterThan(flagIndex);
    expect(navSource.slice(flagIndex, desktopLinkIndex)).toContain("briefingEnabled ?");
  });

  it("only exposes the dashboard CTA behind the dailyBriefing flag", () => {
    const flagIndex = dashboardSource.indexOf('const dailyBriefingEnabled = isFeatureEnabled("dailyBriefing")');
    const linkIndex = dashboardSource.indexOf('href="/briefing"');
    expect(flagIndex).toBeGreaterThan(-1);
    expect(linkIndex).toBeGreaterThan(flagIndex);
    expect(dashboardSource.slice(flagIndex, linkIndex)).toContain("dailyBriefingEnabled ?");
  });

  it("preserves the five existing mobile primary-navigation slots", () => {
    expect(mobileNavSource).not.toContain('href: "/briefing"');
    expect(mobileNavSource).toContain('grid-cols-5');
    for (const href of ["/dashboard", "/analyze", "/portfolio", "/history", "/settings"]) {
      expect(mobileNavSource).toContain(`href: "${href}"`);
    }
  });

  it("keeps briefing entry points profile-neutral", () => {
    const relevant = `${pageSource}\n${dashboardSource}\n${navSource}`;
    expect(relevant).not.toContain('name="personalizedScore"');
    expect(relevant).not.toContain('name="userMatchScore"');
    expect(relevant).not.toContain('name="personalizedRating"');
    expect(pageSource).toContain("investerarprofil ändrar aldrig objektiva ratingar");
    expect(pageSource).toContain("investor profile never changes objective ratings");
  });
});
