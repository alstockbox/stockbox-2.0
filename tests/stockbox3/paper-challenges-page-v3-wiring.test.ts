import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(process.cwd(), "src/app/paper-trading/challenges/page.tsx");
const source = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "";

describe("Paper Trading V3 challenge discovery page", () => {
  it("is dark-gated by both paper trading and challenges", () => {
    expect(source).toContain('isFeatureEnabled("paperTrading")');
    expect(source).toContain('isFeatureEnabled("challenges")');
    expect(source).toContain("notFound()");
  });

  it("uses the authenticated session for own competition entries", () => {
    expect(source).toContain("const user = await requireUser()");
    expect(source).toContain("listPaperCompetitionEntriesV3(user.id)");
    expect(source).not.toContain('searchParams.userId');
    expect(source).not.toContain('formData.get("userId")');
  });

  it("discovers only repository-validated open challenges", () => {
    expect(source).toContain("listOpenPaperChallengesV3()");
    expect(source).toContain('from "@/lib/paper-trading/competition-repository-v3"');
    expect(source).not.toContain('from("paper_competitions_v3")');
    expect(source).not.toContain("private_league");
  });

  it("keeps the kill switch read-only and never exposes a join form while evidence is incomplete", () => {
    expect(source).toContain('const killed = isKilled("paperTrading")');
    expect(source).toContain("const joinEnabled = !killed && entriesResult.ok");
    expect(source).toContain("challengesResult.competitions.filter((competition) => !joinedCompetitionIds.has(competition.id))");
    expect(source).toContain("{openChallenges.map((competition) => (");
    expect(source).toContain("{joinEnabled ? (");
  });

  it("joins only through the gated server action with competition id as the sole hidden authority input", () => {
    expect(source).toContain("joinPaperChallengeAction");
    expect(source).toContain("<form action={joinPaperChallengeAction}");
    expect(source).toContain('type="hidden" name="competitionId" value={competition.id}');
    expect(source).not.toContain('name="userId"');
    expect(source).not.toContain('name="startingCash"');
    expect(source).not.toContain('name="baseCurrency"');
    expect(source).not.toContain('name="accountId"');
    expect(source).not.toContain('name="inviteToken"');
  });

  it("shows official challenge terms without recomputing leaderboard or performance data", () => {
    expect(source).toContain("competition.startingCash");
    expect(source).toContain("competition.baseCurrency");
    expect(source).toContain("competition.startsAt");
    expect(source).toContain("competition.joinDeadline");
    expect(source).toContain("competition.endsAt");
    expect(source).toContain("competition.maxParticipants");
    expect(source).not.toContain("derivePaperCompetitionLeaderboardV3");
    expect(source).not.toContain("loadPaperCompetitionStandingsV3");
    expect(source).not.toContain("derivePaperPerformanceV3");
  });

  it("states clearly that challenges are simulated and not evidence of future returns", () => {
    expect(source).toContain("simuler");
    expect(source).toContain("future returns");
    expect(source).toContain('href="/paper-trading"');
  });
});
