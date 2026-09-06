import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repo = fs.readFileSync(path.join(process.cwd(), "src/lib/paper-trading/competition-repository-v3.ts"), "utf8");
const pagePath = path.join(process.cwd(), "src/app/paper-trading/challenges/[competitionId]/page.tsx");
const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "";
const discovery = fs.readFileSync(path.join(process.cwd(), "src/app/paper-trading/challenges/page.tsx"), "utf8");

describe("Paper Trading V3 challenge workspace", () => {
  it("loads an exact joined public challenge without requiring the trading window to be open", () => {
    expect(repo).toContain("export async function loadPaperChallengeWorkspaceV3");
    expect(repo).toContain('.from("paper_competitions_v3")');
    expect(repo).toContain('.eq("id", normalizedCompetitionId)');
    expect(repo).toContain('.from("paper_competition_entries_v3")');
    expect(repo).toContain('.eq("user_id", normalizedUserId)');
    expect(repo).toContain('.eq("competition_id", normalizedCompetitionId)');
    expect(repo).toContain('competition.kind !== "challenge"');
  });

  it("binds the joined entry to the user's dedicated competition account", () => {
    expect(repo).toContain("loadPaperAccountBoundaryV3(normalizedUserId, entry.accountId)");
    expect(repo).toContain('boundary.account.accountType !== "competition"');
    expect(repo).toContain('boundary.account.competitionId !== normalizedCompetitionId');
    expect(repo).toContain("accountId: entry.accountId");
  });

  it("is dark-gated and authenticates before loading user-specific state", () => {
    expect(page).toContain('isFeatureEnabled("paperTrading")');
    expect(page).toContain('isFeatureEnabled("challenges")');
    expect(page).toContain("notFound()");
    expect(page).toContain("const user = await requireUser()");
    expect(page).toContain("loadPaperChallengeWorkspaceV3(user.id, competitionId)");
  });

  it("loads ledger state only from the server-resolved competition account", () => {
    expect(page).toContain("loadPaperAccountStateV3(user.id, workspace.accountId)");
    expect(page).toContain("derivePaperTradingLedgerV3");
    expect(page).not.toContain('searchParams.account');
    expect(page).not.toContain('params.accountId');
  });

  it("only enables challenge orders when time, kill-switch, account and ledger checks all pass", () => {
    expect(page).toContain('const killed = isKilled("paperTrading")');
    expect(page).toContain("const tradingWindowOpen = nowMs >= startsAtMs && nowMs <= endsAtMs");
    expect(page).toContain('workspace.accountStatus === "active"');
    expect(page).toContain("const tradingEnabled = !killed && tradingWindowOpen && workspace.accountStatus === \"active\" && verifiedState !== null");
  });

  it("submits only challenge identity and bounded intent to the challenge order action", () => {
    expect(page).toContain("executePaperChallengeOrderAction");
    expect(page).toContain("<form action={executePaperChallengeOrderAction}");
    expect(page).toContain('type="hidden" name="competitionId" value={workspace.competition.id}');
    expect(page).toContain('type="hidden" name="idempotencyKey" value={orderIdempotencyKey}');
    expect(page).not.toContain('name="accountId"');
  });

  it("keeps the feature explicitly simulated and separate from leaderboard claims", () => {
    expect(page.toLowerCase()).toContain("simulat");
    expect(page).not.toContain("derivePaperCompetitionLeaderboardV3");
    expect(page).not.toContain("loadPaperCompetitionLeaderboardV3");
  });

  it("links joined discoverable challenges into the server-verified workspace without account ids", () => {
    expect(discovery).toContain('href={`/paper-trading/challenges/${encodeURIComponent(competition.id)}`}');
    expect(discovery).not.toContain("accountId=");
  });
});
