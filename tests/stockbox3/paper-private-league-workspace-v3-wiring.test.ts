import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(process.cwd(), "src/app/paper-trading/private-leagues/[competitionId]/page.tsx");
const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "";

describe("Paper Trading V3 private league member workspace", () => {
  it("is dark-gated and resolves the current member workspace server-side", () => {
    expect(page).toContain('isFeatureEnabled("paperTrading")');
    expect(page).toContain('isFeatureEnabled("privateLeagues")');
    expect(page).toContain("notFound()");
    expect(page).toContain("const user = await requireUser()");
    expect(page).toContain("loadPrivatePaperLeagueWorkspaceV3(user.id, competitionId)");
    expect(page).toContain("workspace.role");
    expect(page).not.toContain('searchParams.userId');
  });

  it("loads ledger state only from the server-resolved competition account", () => {
    expect(page).toContain("loadPaperAccountStateV3(user.id, workspace.accountId)");
    expect(page).toContain("derivePaperTradingLedgerV3");
    expect(page).not.toContain('searchParams.account');
    expect(page).not.toContain('params.accountId');
  });

  it("keeps trading read-only unless kill switch, official window, account and ledger all permit it", () => {
    expect(page).toContain('const killed = isKilled("paperTrading")');
    expect(page).toContain("paperTradingServerNowMsV3()");
    expect(page).toContain("const tradingWindowOpen = nowMs >= startsAtMs && nowMs <= endsAtMs");
    expect(page).toContain('workspace.accountStatus === "active"');
    expect(page).toContain('workspace.competition.status === "open" || workspace.competition.status === "active"');
    expect(page).toContain("verifiedState !== null");
  });

  it("submits only private league identity and bounded intent, never browser account authority", () => {
    expect(page).toContain("executePrivatePaperLeagueOrderAction");
    expect(page).toContain("<form action={executePrivatePaperLeagueOrderAction}");
    expect(page).toContain('type="hidden" name="competitionId" value={workspace.competition.id}');
    expect(page).toContain('type="hidden" name="idempotencyKey" value={orderIdempotencyKey}');
    expect(page).not.toContain('name="accountId"');
    expect(page).not.toContain('name="userId"');
  });

  it("loads private standings only behind the separate leaderboard feature flag", () => {
    expect(page).toContain('const leaderboardsEnabled = isFeatureEnabled("leaderboards")');
    expect(page).toContain("leaderboardsEnabled");
    expect(page).toContain("loadPaperPrivateLeagueLeaderboardReadModelV3({");
    expect(page).toContain("competitionId: workspace.competition.id");
    expect(page).toContain("viewerUserId: user.id");
  });

  it("renders only sanitized verified leaderboard fields and exact cutoff metadata", () => {
    expect(page).toContain('leaderboardResult.status === "VERIFIED"');
    expect(page).toContain("leaderboardResult.evaluationCutoff");
    expect(page).toContain("leaderboardResult.final");
    expect(page).toContain("leaderboardResult.baseCurrency");
    expect(page).toContain("leaderboardResult.standings.map((standing, index) =>");
    expect(page).toContain("standing.rank");
    expect(page).toContain("standing.returnPercent");
    expect(page).toContain("standing.equity");
    expect(page).toContain("standing.isViewer");
    expect(page).not.toContain("standing.userId");
    expect(page).not.toContain("standing.accountId");
  });

  it("fails closed for unavailable leaderboard evidence without surfacing internal reasons", () => {
    expect(page).toContain("Leaderboard unavailable");
    expect(page).toContain("Topplistan är inte verifierad");
    expect(page).not.toContain("leaderboardResult.reason");
    expect(page).not.toContain("loadPaperCompetitionStandingsV3");
    expect(page).not.toContain("derivePaperPerformanceV3");
  });

  it("keeps private leagues simulated, member-only and linked back to the private member list", () => {
    expect(page.toLowerCase()).toContain("simulat");
    expect(page).toContain('href="/paper-trading/private-leagues"');
    expect(page).toContain("member-only");
    expect(page).not.toContain("listOpenPrivate");
    expect(page).not.toContain("inviteTokenHash");
  });
});
