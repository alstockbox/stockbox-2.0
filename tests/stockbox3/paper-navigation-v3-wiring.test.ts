import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync("src/app/paper-trading/page.tsx", "utf8");
const dashboardSource = readFileSync("src/app/dashboard/page.tsx", "utf8");
const navSource = readFileSync("src/components/app-shell/nav.tsx", "utf8");
const mobileNavSource = readFileSync("src/components/app-shell/mobile-bottom-nav.tsx", "utf8");

describe("Paper Trading V3 dark-launch navigation", () => {
  it("hard-gates the page before authentication work", () => {
    const gateIndex = pageSource.indexOf('if (!isFeatureEnabled("paperTrading")) notFound()');
    const userIndex = pageSource.indexOf("requireUser()");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(userIndex).toBeGreaterThan(gateIndex);
  });

  it("gates workspace navigation entry points behind paperTrading", () => {
    const flagIndex = navSource.indexOf('const paperTradingEnabled = isFeatureEnabled("paperTrading")');
    const desktopLinkIndex = navSource.indexOf('href="/paper-trading"');
    expect(flagIndex).toBeGreaterThan(-1);
    expect(desktopLinkIndex).toBeGreaterThan(flagIndex);
    expect(navSource.slice(flagIndex, desktopLinkIndex)).toContain("paperTradingEnabled ?");
    expect(navSource).toContain("user && paperTradingEnabled ?");
  });

  it("gates the dashboard CTA behind paperTrading", () => {
    const flagIndex = dashboardSource.indexOf('const paperTradingEnabled = isFeatureEnabled("paperTrading")');
    const linkIndex = dashboardSource.indexOf('href="/paper-trading"');
    expect(flagIndex).toBeGreaterThan(-1);
    expect(linkIndex).toBeGreaterThan(flagIndex);
    expect(dashboardSource.slice(flagIndex, linkIndex)).toContain("paperTradingEnabled ?");
  });

  it("does not displace the five mobile primary-navigation slots", () => {
    expect(mobileNavSource).not.toContain('href: "/paper-trading"');
    expect(mobileNavSource).toContain("grid-cols-5");
    for (const href of ["/dashboard", "/analyze", "/portfolio", "/history", "/settings"]) {
      expect(mobileNavSource).toContain(`href: "${href}"`);
    }
  });

  it("keeps simulation messaging explicit", () => {
    expect(pageSource).toContain("aldrig riktiga affärer");
    expect(pageSource).toContain("never real trades");
    expect(dashboardSource).toContain("simulerat kapital");
    expect(dashboardSource).toContain("simulated capital");
    expect(dashboardSource).toContain("Inga riktiga affärer eller pengar används");
    expect(dashboardSource).toContain("No real trades or money are used");
  });
});