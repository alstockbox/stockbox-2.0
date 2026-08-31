import { describe, expect, it } from "vitest";
import { buildWeeklyInvestorBrief } from "./weekly-brief";

const now = new Date("2026-08-31T12:00:00Z");

describe("buildWeeklyInvestorBrief", () => {
  it("prioritizes thesis-changing and important changes without inventing commentary", () => {
    const brief = buildWeeklyInvestorBrief({
      now,
      changes: [
        { ticker: "MSFT", metricKey: "fundamentals.revenueGrowth", materiality: "THESIS_CHANGING", reasoning: "Revenue growth fell below the user's thesis requirement.", createdAt: "2026-08-30T10:00:00Z" },
        { ticker: "AAPL", metricKey: "valuation.pe", materiality: "IMPORTANT", reasoning: "P/E moved materially relative to the prior snapshot.", createdAt: "2026-08-29T10:00:00Z" },
      ],
      thesisAlerts: [{ ticker: "MSFT", title: "Growth remains above 10%", status: "WATCH", newlyFailed: ["rev-growth"] }],
      alertEvents: [],
      snapshots: [],
      portfolioTickers: ["MSFT"],
      watchlistTickers: ["MSFT", "AAPL"],
      screenerMatches: [],
      earnings: [],
      estimateRevisions: [],
      dividendEvents: [],
    });
    expect(brief.mostImportantChanges[0]?.ticker).toBe("MSFT");
    expect(brief.thesisAlerts[0]?.status).toBe("WATCH");
    expect(JSON.stringify(brief)).not.toContain("buy");
  });

  it("keeps unsupported sections empty instead of synthesizing events", () => {
    const brief = buildWeeklyInvestorBrief({
      now,
      changes: [], thesisAlerts: [], alertEvents: [], snapshots: [], portfolioTickers: [], watchlistTickers: [],
      screenerMatches: [], earnings: [], estimateRevisions: [], dividendEvents: [],
    });
    expect(brief.earningsAhead).toEqual([]);
    expect(brief.estimateRevisions).toEqual([]);
    expect(brief.newScreenerMatches).toEqual([]);
    expect(brief.dividendEvents).toEqual([]);
  });
});
