import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readRepositoryPath = path.join(process.cwd(), "src/lib/paper-trading/private-league-read-repository-v3.ts");
const standingsPath = path.join(process.cwd(), "src/lib/paper-trading/standings-repository-v3.ts");
const readRepository = fs.existsSync(readRepositoryPath) ? fs.readFileSync(readRepositoryPath, "utf8") : "";
const standings = fs.readFileSync(standingsPath, "utf8");

function block(source: string, signature: string, nextSignature?: string): string {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  if (!nextSignature) return source.slice(start);
  const end = source.indexOf(nextSignature, start + signature.length);
  return source.slice(start, end >= 0 ? end : source.length);
}

const joined = block(
  readRepository,
  "export async function listJoinedPrivatePaperLeaguesV3",
  "export async function loadPrivatePaperLeagueWorkspaceV3",
);
const workspace = block(
  readRepository,
  "export async function loadPrivatePaperLeagueWorkspaceV3",
  "export async function listPrivatePaperLeagueInvitesV3",
);
const invites = block(
  readRepository,
  "export async function listPrivatePaperLeagueInvitesV3",
);
const standingsMembership = block(
  standings,
  "async function verifyPrivateLeagueMembership",
  "async function loadAllCompetitionEntries",
);

describe("Paper Trading V3 private league member read model", () => {
  it("has no public private-league discovery and derives joined league ids from the current user's membership rows", () => {
    expect(readRepository).toContain("export async function listJoinedPrivatePaperLeaguesV3");
    expect(joined).toContain('.from("paper_private_league_members_v3")');
    expect(joined).toContain('.eq("user_id", normalizedUserId)');
    expect(joined).toContain('.from("paper_competitions_v3")');
    expect(joined).toContain('.in("id", chunk)');
    expect(joined).toContain('.eq("kind", "private_league")');
    expect(readRepository).not.toContain("listOpenPrivatePaperLeaguesV3");
    expect(readRepository).not.toContain("listPublicPrivatePaperLeaguesV3");
  });

  it("uses bounded competition-id chunks and fails closed on duplicate or malformed membership evidence", () => {
    expect(readRepository).toContain("PRIVATE_LEAGUE_ID_CHUNK_SIZE = 100");
    expect(joined).toContain("competitionIds.slice(index, index + PRIVATE_LEAGUE_ID_CHUNK_SIZE)");
    expect(joined).toContain("seenCompetitionIds");
    expect(joined).toContain("seenMembershipCompetitionIds");
    expect(joined).toContain('"PRIVATE_LEAGUE_LIST_INVALID"');
  });

  it("loads workspace membership from the authoritative member table before accepting a private competition", () => {
    expect(workspace).toContain('.from("paper_private_league_members_v3")');
    expect(workspace).toContain('.eq("competition_id", normalizedCompetitionId)');
    expect(workspace).toContain('.eq("user_id", normalizedUserId)');
    expect(workspace).toContain("role === \"owner\" || role === \"admin\" || role === \"member\"");
    expect(workspace).toContain('.from("paper_competitions_v3")');
    expect(workspace).toContain('competition.kind !== "private_league"');
  });

  it("binds workspace membership to the exact competition entry and server-verified competition account", () => {
    expect(workspace).toContain('.from("paper_competition_entries_v3")');
    expect(workspace).toContain('.eq("competition_id", normalizedCompetitionId)');
    expect(workspace).toContain('.eq("user_id", normalizedUserId)');
    expect(workspace).toContain("loadPaperAccountBoundaryV3(normalizedUserId, entry.accountId)");
    expect(workspace).toContain('boundary.account.accountType !== "competition"');
    expect(workspace).toContain('boundary.account.competitionId !== normalizedCompetitionId');
  });

  it("returns only member-scoped workspace data and never invite hashes or raw invite tokens", () => {
    expect(readRepository).toContain("export type PrivatePaperLeagueWorkspaceV3");
    expect(workspace).toContain("accountId: entry.accountId");
    expect(workspace).toContain("role,");
    expect(workspace).not.toContain("invite_token_hash");
    expect(workspace).not.toContain("inviteToken");
  });

  it("lists invite metadata only for owner/admin members and explicitly omits token hashes", () => {
    expect(invites).toContain('.from("paper_private_league_members_v3")');
    expect(invites).toContain('.eq("competition_id", normalizedCompetitionId)');
    expect(invites).toContain('.eq("user_id", normalizedUserId)');
    expect(invites).toContain("role !== \"owner\" && role !== \"admin\"");
    expect(invites).toContain('.from("paper_private_league_invites_v3")');
    expect(invites).toContain('.select("id,competition_id,expires_at,revoked_at,created_at")');
    expect(invites).not.toContain("invite_token_hash");
    expect(invites).not.toContain("created_by_user_id");
  });

  it("hardens private standings authorization to the authoritative membership table, never generic entry presence", () => {
    expect(standingsMembership).toContain('.from("paper_private_league_members_v3")');
    expect(standingsMembership).toContain('select("competition_id,user_id,role")');
    expect(standingsMembership).toContain('.eq("competition_id", competitionId)');
    expect(standingsMembership).toContain('.eq("user_id", viewerUserId)');
    expect(standingsMembership).toContain("role === \"owner\" || role === \"admin\" || role === \"member\"");
    expect(standingsMembership).not.toContain('.from("paper_competition_entries_v3")');
  });

  it("does not fetch quotes, recompute performance, or perform FX in the private league read model", () => {
    expect(readRepository).not.toContain("fetchPaperExecutionQuoteV3");
    expect(readRepository).not.toContain("derivePaperPerformanceV3");
    expect(readRepository).not.toContain("exchangeRate");
    expect(readRepository).not.toContain("fxRate");
  });
});
