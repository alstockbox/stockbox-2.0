import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repository = fs.readFileSync(
  path.join(process.cwd(), "src/lib/paper-trading/competition-repository-v3.ts"),
  "utf8",
);
const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/paper-trading/challenges/page.tsx"),
  "utf8",
);

function functionBlock(source: string, signature: string, nextSignature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  const end = source.indexOf(nextSignature, start + signature.length);
  return source.slice(start, end >= 0 ? end : source.length);
}

const competitionListResultType = functionBlock(
  repository,
  "export type PaperCompetitionListResultV3",
  "export type PaperCompetitionEntryListResultV3",
);
const joinedLoader = functionBlock(
  repository,
  "export async function listJoinedPaperChallengesV3",
  "export async function loadPaperChallengeWorkspaceV3",
);

describe("Paper Trading V3 joined challenge discovery", () => {
  it("loads joined challenges only through the authenticated user's validated entries", () => {
    expect(repository).toContain("export async function listJoinedPaperChallengesV3");
    expect(joinedLoader).toContain("listPaperCompetitionEntriesV3(normalizedUserId)");
    expect(joinedLoader).not.toContain('formData.get("userId")');
    expect(joinedLoader).not.toContain("searchParams");
  });

  it("queries only challenge rows for competition ids derived from those entries", () => {
    expect(joinedLoader).toContain('.from("paper_competitions_v3")');
    expect(joinedLoader).toContain('.in("id", chunk)');
    expect(joinedLoader).toContain('.eq("kind", "challenge")');
    expect(joinedLoader).not.toContain('.eq("status", "open")');
    expect(joinedLoader).not.toContain('.gt("starts_at"');
    expect(joinedLoader).not.toContain('.gt("join_deadline"');
  });

  it("uses bounded id chunks instead of an unbounded or N+1 competition lookup", () => {
    expect(repository).toContain("PAPER_COMPETITION_ID_CHUNK_SIZE = 100");
    expect(joinedLoader).toContain("for (let index = 0; index < competitionIds.length; index += PAPER_COMPETITION_ID_CHUNK_SIZE)");
    expect(joinedLoader).toContain("competitionIds.slice(index, index + PAPER_COMPETITION_ID_CHUNK_SIZE)");
    expect(joinedLoader).not.toContain("for (const entry of entriesResult.entries)");
  });

  it("maps full competition DTOs fail-closed and rejects duplicate returned ids", () => {
    expect(joinedLoader).toContain("mapCompetition(row as JsonRow)");
    expect(joinedLoader).toContain('"PAPER_JOINED_CHALLENGE_LIST_INVALID"');
    expect(joinedLoader).toContain("seenCompetitionIds.has(competition.id)");
    expect(joinedLoader).toContain("!requestedCompetitionIds.has(competition.id)");
  });

  it("returns no raw user ids, entry ids, or account ids in the joined challenge DTO", () => {
    expect(competitionListResultType).toContain("competitions: PaperCompetitionV3[]");
    expect(competitionListResultType).not.toContain("accountId:");
    expect(competitionListResultType).not.toContain("userId:");
    expect(competitionListResultType).not.toContain("entryId:");
  });

  it("renders a separate My challenges section using the joined loader", () => {
    expect(page).toContain("listJoinedPaperChallengesV3(user.id)");
    expect(page).toContain("joinedChallengesResult");
    expect(page).toContain("Mina challenges");
    expect(page).toContain("My challenges");
  });

  it("links joined challenges to the server-verified workspace without account identifiers", () => {
    expect(page).toContain('href={`/paper-trading/challenges/${encodeURIComponent(competition.id)}`}');
    expect(page).not.toContain("accountId=");
    expect(page).not.toContain('name="accountId"');
  });

  it("keeps open discovery separate and does not surface private leagues or leaderboards", () => {
    expect(page).toContain("listOpenPaperChallengesV3()");
    expect(page).toContain("openChallenges");
    expect(page).toContain("!joinedCompetitionIds.has(competition.id)");
    expect(page).not.toContain("private_league");
    expect(page).not.toContain("derivePaperCompetitionLeaderboardV3");
    expect(page).not.toContain("loadPaperCompetitionLeaderboardV3");
  });
});
