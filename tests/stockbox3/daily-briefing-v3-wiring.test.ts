import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/db/daily-briefing-v3.ts", "utf8");

describe("Daily Briefing V3 repository wiring", () => {
  it("is dark-launched behind the dailyBriefing feature flag", () => {
    expect(source).toContain('isFeatureEnabled("dailyBriefing")');
    expect(source).toContain('return { status: "disabled" }');
  });

  it("reads only persisted StockBox facts and never invokes data providers or AI", () => {
    expect(source).toContain('.from("stockbox_alert_events_v3")');
    expect(source).toContain('.from("monitoring_events")');
    expect(source).toContain('.from("portfolio_snapshots")');
    expect(source).not.toContain("fetchOfficialResearchBundle");
    expect(source).not.toContain("searchCompanies");
    expect(source).not.toContain("analyzeFinancials");
    expect(source).not.toContain("openai");
  });

  it("scopes every source query to the authenticated server-supplied user id", () => {
    expect(source.match(/\.eq\("user_id", input\.userId\)/g)).toHaveLength(3);
  });

  it("uses the same bounded rolling window for every event source", () => {
    expect(source.match(/\.gte\("(?:observed_at|created_at)", since\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source.match(/\.lte\("(?:observed_at|created_at)", through\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("degrades sources independently instead of failing the entire briefing", () => {
    expect(source).toContain('degradedSources.push("stockbox_alerts")');
    expect(source).toContain('degradedSources.push("official_monitoring")');
    expect(source).toContain('degradedSources.push("portfolio")');
    expect(source).toContain('status: "ready"');
  });
});
