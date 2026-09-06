import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = path.join(process.cwd(), "src/lib/paper-trading/standings-repository-v3.ts");
const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, "utf8") : "";

describe("Paper Trading V3 competition standings repository", () => {
  it("loads standings through the pure common-cutoff leaderboard engine", () => {
    expect(source).toContain("derivePaperCompetitionLeaderboardV3");
    expect(source).toContain("export async function loadPaperCompetitionStandingsV3");
    expect(source).toContain("evaluationCutoff");
    expect(source).toContain("baseCurrency");
  });

  it("fails closed to public challenge visibility and requires membership for private leagues", () => {
    expect(source).toContain('scope: "public"');
    expect(source).toContain('scope: "member"');
    expect(source).toContain('competition.kind === "private_league"');
    expect(source).toContain('viewer.scope !== "member"');
    expect(source).toContain('.eq("user_id", viewerUserId)');
    expect(source).toContain("PAPER_COMPETITION_STANDINGS_FORBIDDEN");
  });

  it("reads only active or completed competitions and validates their invariant terms", () => {
    expect(source).toContain('.from("paper_competitions_v3")');
    expect(source).toContain('.eq("id", competitionId)');
    expect(source).toContain('competition.status !== "active"');
    expect(source).toContain('competition.status !== "completed"');
    expect(source).toContain("startingCash !== 100_000");
  });

  it("paginates all competition entries instead of silently accepting a backend row cap", () => {
    expect(source).toContain('.from("paper_competition_entries_v3")');
    expect(source).toContain('.eq("competition_id", competitionId)');
    expect(source).toContain(".range(from, to)");
    expect(source).toContain("maxParticipants");
    expect(source).toContain('accountType: "competition"');
  });

  it("loads persisted snapshots only at the exact common evaluation cutoff", () => {
    expect(source).toContain('.from("paper_performance_snapshots_v3")');
    expect(source).toContain('.eq("evaluated_at", evaluationCutoff)');
    expect(source).toContain('.eq("base_currency", competition.baseCurrency)');
    expect(source).toContain('.eq("policy_version", PAPER_PERFORMANCE_V3_POLICY_VERSION)');
    expect(source).toContain('.in("account_id", accountIds)');
  });

  it("chunks snapshot account ids instead of relying on an unbounded IN query", () => {
    expect(source).toContain("PAPER_STANDINGS_V3_SNAPSHOT_CHUNK_SIZE");
    expect(source).toContain("slice(offset, offset + PAPER_STANDINGS_V3_SNAPSHOT_CHUNK_SIZE)");
  });

  it("fails closed on malformed, duplicate or incomplete repository evidence", () => {
    expect(source).toContain("mapPaperPerformanceSnapshotV3");
    expect(source).toContain("PAPER_COMPETITION_STANDINGS_INVALID_DATA");
    expect(source).toContain("seenEntryAccounts");
    expect(source).toContain("seenSnapshotAccounts");
  });

  it("does not recompute returns, fetch market quotes, perform FX, or select latest snapshots", () => {
    expect(source).not.toContain("derivePaperPerformanceV3");
    expect(source).not.toContain("fetchPaperExecutionQuoteV3");
    expect(source).not.toContain("exchangeRate");
    expect(source).not.toContain("fxRate");
    expect(source).not.toContain('.order("evaluated_at"');
    expect(source).not.toContain('.limit(1)');
  });
});
