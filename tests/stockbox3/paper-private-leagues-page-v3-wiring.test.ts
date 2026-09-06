import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(process.cwd(), "src/app/paper-trading/private-leagues/page.tsx");
const source = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "";

describe("Paper Trading V3 private league member list page", () => {
  it("is dark-gated by paper trading and private leagues", () => {
    expect(source).toContain('isFeatureEnabled("paperTrading")');
    expect(source).toContain('isFeatureEnabled("privateLeagues")');
    expect(source).toContain("notFound()");
  });

  it("uses only the authenticated user membership list and never public league discovery", () => {
    expect(source).toContain("const user = await requireUser()");
    expect(source).toContain("listJoinedPrivatePaperLeaguesV3(user.id)");
    expect(source).toContain('from "@/lib/paper-trading/private-league-read-repository-v3"');
    expect(source).not.toContain("listOpenPaperChallengesV3");
    expect(source).not.toContain("listOpenPrivate");
    expect(source).not.toContain('from("paper_competitions_v3")');
    expect(source).not.toContain('searchParams.userId');
  });

  it("renders only repository-verified league terms and the member role", () => {
    expect(source).toContain("league.competition.name");
    expect(source).toContain("league.competition.status");
    expect(source).toContain("league.competition.startingCash");
    expect(source).toContain("league.competition.baseCurrency");
    expect(source).toContain("league.competition.startsAt");
    expect(source).toContain("league.competition.endsAt");
    expect(source).toContain("league.competition.maxParticipants");
    expect(source).toContain("league.role");
  });

  it("links only to the member-scoped private league workspace", () => {
    expect(source).toContain('href={`/paper-trading/private-leagues/${encodeURIComponent(league.competition.id)}`}');
    expect(source).not.toContain('name="accountId"');
    expect(source).not.toContain('name="userId"');
    expect(source).not.toContain('name="inviteToken"');
    expect(source).not.toContain("inviteTokenHash");
  });

  it("keeps the kill switch read-only and exposes no mutation forms on the list page", () => {
    expect(source).toContain('const killed = isKilled("paperTrading")');
    expect(source).not.toContain("joinPrivatePaperLeagueAction");
    expect(source).not.toContain("createPrivatePaperLeagueAction");
    expect(source).not.toContain("createPrivatePaperLeagueInviteAction");
    expect(source).not.toContain("executePaperPrivateLeagueOrderAction");
  });

  it("fails closed when memberships cannot be verified", () => {
    expect(source).toContain("!leaguesResult.ok");
    expect(source).toContain("inga privata ligor");
    expect(source).toContain("No private league data");
    expect(source).not.toContain("derivePaperCompetitionLeaderboardV3");
    expect(source).not.toContain("derivePaperPerformanceV3");
    expect(source).not.toContain("loadPaperCompetitionStandingsV3");
  });

  it("states that private leagues are simulated and non-public", () => {
    expect(source).toContain("simuler");
    expect(source).toContain("inte publikt sökbara");
    expect(source).toContain("not publicly discoverable");
    expect(source).toContain('href="/paper-trading"');
  });
});
