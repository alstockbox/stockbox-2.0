import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryPath = path.join(process.cwd(), "src/lib/paper-trading/competition-valuation-repository-v3.ts");
const source = fs.existsSync(repositoryPath) ? fs.readFileSync(repositoryPath, "utf8") : "";

function block(signature: string, nextSignature?: string): string {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  if (!nextSignature) return source.slice(start);
  const end = source.indexOf(nextSignature, start + signature.length);
  return source.slice(start, end >= 0 ? end : source.length);
}

const membershipLoader = block(
  "async function loadPrivateLeagueMemberships(",
  "async function loadAccounts(",
);
const sharedLoader = block(
  "async function loadPaperCompetitionValuationEvidenceForKindV3(",
  "/**\n * Loads challenge valuation evidence",
);
const challengeLoader = block(
  "export async function loadPaperCompetitionValuationEvidenceV3(",
  "/**\n * Loads private-league valuation evidence",
);
const privateLoader = block(
  "export async function loadPrivatePaperLeagueValuationEvidenceV3(",
);

describe("Paper Trading V3 private league valuation evidence", () => {
  it("supports explicit challenge/private-league evidence kinds without weakening the existing challenge export", () => {
    expect(source).toContain('kind: "challenge" | "private_league"');
    expect(source).toContain("expectedKind: PaperCompetitionValuationKindV3");
    expect(challengeLoader).toContain('loadPaperCompetitionValuationEvidenceForKindV3(input, "challenge")');
    expect(privateLoader).toContain('loadPaperCompetitionValuationEvidenceForKindV3(input, "private_league")');
  });

  it("loads private membership evidence only for the private-league path after competition entries are validated", () => {
    expect(source).toContain("async function loadPrivateLeagueMemberships(");
    expect(sharedLoader).toContain('if (expectedKind === "private_league")');
    expect(sharedLoader).toContain("loadPrivateLeagueMemberships(supabase, competitionId, entries)");
    const entriesIndex = sharedLoader.indexOf("const entries = await loadEntries");
    const membershipIndex = sharedLoader.indexOf("loadPrivateLeagueMemberships(supabase, competitionId, entries)");
    const accountsIndex = sharedLoader.indexOf("const accounts = await loadAccounts");
    expect(entriesIndex).toBeGreaterThanOrEqual(0);
    expect(membershipIndex).toBeGreaterThan(entriesIndex);
    expect(accountsIndex).toBeGreaterThan(membershipIndex);
  });

  it("queries only league-scoped membership rows with bounded pagination and no identity-directory enrichment", () => {
    expect(source).toContain("PAPER_PRIVATE_LEAGUE_VALUATION_MEMBER_PAGE_SIZE = 500");
    expect(membershipLoader).toContain('.from("paper_private_league_members_v3")');
    expect(membershipLoader).toContain('.select("competition_id,user_id,role")');
    expect(membershipLoader).toContain('.eq("competition_id", competitionId)');
    expect(membershipLoader).toContain(".range(from, to)");
    expect(membershipLoader).not.toContain("auth.users");
    expect(membershipLoader).not.toContain("email");
  });

  it("fails closed on malformed roles, duplicate members, missing/extra members, or anything other than exactly one owner", () => {
    expect(membershipLoader).toContain('role !== "owner" && role !== "admin" && role !== "member"');
    expect(membershipLoader).toContain("seenUsers.has(userId)");
    expect(membershipLoader).toContain("seenUsers.size !== entries.length");
    expect(membershipLoader).toContain("entries.some((entry) => !seenUsers.has(entry.userId))");
    expect(membershipLoader).toContain("ownerCount !== 1");
  });

  it("keeps all existing account, currency, ledger and cutoff integrity checks on the shared path", () => {
    expect(sharedLoader).toContain("competition.kind !== expectedKind");
    expect(sharedLoader).toContain("cutoffMs < Date.parse(competition.startsAt)");
    expect(sharedLoader).toContain("cutoffMs > Date.parse(competition.endsAt)");
    expect(sharedLoader).toContain("const accounts = await loadAccounts");
    expect(sharedLoader).toContain("const fillsByAccount = await loadLedgerEvidence");
    expect(sharedLoader).toContain("participants.length !== entries.length");
    expect(sharedLoader).not.toContain("paper_cash_balances_v3");
  });

  it("returns the same immutable participant evidence shape for private leagues and never introduces quote fetching", () => {
    expect(privateLoader).toContain("PaperCompetitionValuationEvidenceResultV3");
    expect(source).not.toContain("fetchExecutionQuote");
    expect(source).not.toContain("fetchYahooExecutionQuoteV3");
    expect(source).not.toContain("regularMarketPrice");
  });
});
