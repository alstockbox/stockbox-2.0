import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync("src/app/watchlist/page.tsx", "utf8");
const actionSource = readFileSync("src/lib/workspace/actions.ts", "utf8");

describe("Watchlist V3 objective alert wiring", () => {
  it("requires both Watchlist V3 and Alerts flags before exposing the new surface", () => {
    const gate = 'isFeatureEnabled("watchlistV3") && isFeatureEnabled("alerts")';
    expect(pageSource).toContain(gate);
    expect(actionSource).toContain(gate);
  });

  it("only queries the V3 event store behind the dark launch gate", () => {
    const flagIndex = pageSource.indexOf('const v3AlertsEnabled = isFeatureEnabled("watchlistV3")');
    const queryIndex = pageSource.indexOf('.from("stockbox_alert_events_v3")');
    expect(flagIndex).toBeGreaterThan(-1);
    expect(queryIndex).toBeGreaterThan(flagIndex);
    expect(pageSource.slice(flagIndex, queryIndex)).toContain("v3AlertsEnabled && supabase");
  });

  it("states that objective alerts are independent from investor profile", () => {
    expect(pageSource).toContain("påverkas inte av din investerarprofil");
    expect(pageSource).toContain("never changed by your investor profile");
  });

  it("merges existing preferences instead of erasing hidden V3 settings", () => {
    expect(actionSource).toContain('.select("alert_preferences")');
    expect(actionSource).toContain("...currentPreferences");
    expect(actionSource).toContain("Object.assign(alertPreferences");
  });

  it("validates bounded V3 thresholds before saving them", () => {
    expect(actionSource).toContain("convictionDropMinimum: z.coerce.number().int().min(1).max(100)");
    expect(actionSource).toContain("dataQualityDropMinimum: z.coerce.number().int().min(1).max(100)");
    expect(actionSource).toContain("z.coerce.number().finite().nonnegative().max(1_000_000_000).nullable()");
  });

  it("does not expose personalized score or User Match controls in Watchlist V3", () => {
    const relevant = `${pageSource}\n${actionSource}`;
    expect(relevant).not.toContain('name="personalizedScore"');
    expect(relevant).not.toContain('name="userMatchScore"');
    expect(relevant).not.toContain('name="personalizedRating"');
  });
});
