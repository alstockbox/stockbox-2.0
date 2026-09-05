import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const providerSource = readFileSync("src/lib/data/provider.ts", "utf8");
const routeSource = readFileSync("src/app/api/analysis/route.ts", "utf8");

describe("Analysis Alerts V3 wiring", () => {
  it("runs Recommendation V3 exactly once from the canonical financial input", () => {
    expect(providerSource.match(/runRecommendationV3Shadow\(canonicalInput, engineResult\)/g)).toHaveLength(1);
    expect(providerSource).toContain("const recommendationV3Shadow = runRecommendationV3Shadow(canonicalInput, engineResult)");
  });

  it("persists the privacy-minimized recommendation audit only after V3 evaluates", () => {
    expect(providerSource).toContain('if (recommendationV3Shadow.status === "evaluated")');
    expect(providerSource).toContain("await persistRecommendationV3ShadowAudit(recommendationV3Shadow.event)");
  });

  it("keeps V3 shadow metadata internal to the provider result instead of the report payload", () => {
    expect(providerSource).toContain("stockbox3?: { recommendationV3Shadow:");
    expect(providerSource).toContain("? { stockbox3: { recommendationV3Shadow } }");
    expect(providerSource).not.toContain("report.stockbox3");
  });

  it("records alerts only after the analysis has been durably persisted", () => {
    const persistedIndex = routeSource.indexOf("const persisted = await persistAnalysis");
    const alertIndex = routeSource.indexOf("recordAnalysisAlertsV3ForPersistedAnalysis({");
    expect(persistedIndex).toBeGreaterThan(-1);
    expect(alertIndex).toBeGreaterThan(persistedIndex);
  });

  it("does not create duplicate alerts on idempotent replay paths", () => {
    const replayIndex = routeSource.indexOf('if ("replayed" in persisted && persisted.replayed)');
    const alertIndex = routeSource.indexOf("recordAnalysisAlertsV3ForPersistedAnalysis({");
    expect(replayIndex).toBeGreaterThan(-1);
    expect(alertIndex).toBeGreaterThan(replayIndex);
    const replayBlock = routeSource.slice(replayIndex, alertIndex);
    expect(replayBlock).toContain("return Response.json");
  });

  it("keeps alert persistence fail-open for the canonical analysis response", () => {
    expect(routeSource).toContain('service: "analysis-alerts-v3"');
    expect(routeSource).toContain('if (alertOutcome.status === "failed")');
    expect(routeSource).not.toContain("throw alertOutcome");
  });
});
