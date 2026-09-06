import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(
  process.cwd(),
  "src/app/paper-trading/challenges/[competitionId]/page.tsx",
);
const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "";

describe("Paper Trading V3 challenge leaderboard presentation", () => {
  it("loads the presentation-safe read model only behind the leaderboards feature flag", () => {
    expect(page).toContain(
      'import { loadPaperChallengeLeaderboardReadModelV3 } from "@/lib/paper-trading/challenge-leaderboard-read-model-v3"',
    );
    expect(page).toContain('const leaderboardsEnabled = isFeatureEnabled("leaderboards")');
    expect(page).toContain("leaderboardsEnabled");
    expect(page).toContain("loadPaperChallengeLeaderboardReadModelV3({");
    expect(page).toContain("competitionId: workspace.competition.id");
    expect(page).toContain("viewerUserId: user.id");
  });

  it("renders only verified sanitized standings with their exact persisted cutoff", () => {
    expect(page).toContain('leaderboardResult.status === "VERIFIED"');
    expect(page).toContain("leaderboardResult.evaluationCutoff");
    expect(page).toContain("leaderboardResult.baseCurrency");
    expect(page).toContain("leaderboardResult.standings.map(");
    expect(page).toContain("standing.rank");
    expect(page).toContain("standing.returnPercent");
    expect(page).toContain("standing.equity");
    expect(page).toContain("standing.isViewer");
  });

  it("fails closed in the UI when no fully verified common-cutoff leaderboard is available", () => {
    expect(page).toContain('leaderboardResult.status === "UNAVAILABLE"');
    expect(page).toContain("Verifierad leaderboard är inte tillgänglig");
    expect(page).toContain("Verified leaderboard is unavailable");
  });

  it("never triggers valuation, quotes, recomputation or direct standings loading from the workspace", () => {
    expect(page).not.toContain("runPaperCompetitionValuationV3");
    expect(page).not.toContain("fetchYahooExecutionQuoteV3");
    expect(page).not.toContain("derivePaperPerformanceV3");
    expect(page).not.toContain("loadPaperCompetitionStandingsV3");
  });

  it("does not expose participant authority identifiers through leaderboard rows or accept a browser cutoff", () => {
    expect(page).not.toContain("standing.userId");
    expect(page).not.toContain("standing.accountId");
    expect(page).not.toContain('name="evaluationCutoff"');
    expect(page).not.toContain("searchParams.evaluationCutoff");
  });
});
