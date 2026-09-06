import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryPath = path.join(process.cwd(), "src/lib/paper-trading/competition-valuation-repository-v3.ts");
const source = fs.existsSync(repositoryPath) ? fs.readFileSync(repositoryPath, "utf8") : "";

describe("Paper Trading V3 competition valuation evidence repository", () => {
  it("loads only a validated challenge and requires the requested cutoff inside its official window", () => {
    expect(source).toContain("export async function loadPaperCompetitionValuationEvidenceV3");
    expect(source).toContain('.from("paper_competitions_v3")');
    expect(source).toContain('competition.kind !== "challenge"');
    expect(source).toContain('competition.status !== "active" && competition.status !== "completed"');
    expect(source).toContain("cutoffMs < Date.parse(competition.startsAt)");
    expect(source).toContain("cutoffMs > Date.parse(competition.endsAt)");
    expect(source).toContain("startingCash !== PAPER_TRADING_V3_FIXED_STARTING_CASH");
  });

  it("loads every competition entry with bounded pagination and rejects duplicate users or accounts", () => {
    expect(source).toContain("PAPER_COMPETITION_VALUATION_ENTRY_PAGE_SIZE = 500");
    expect(source).toContain('.from("paper_competition_entries_v3")');
    expect(source).toContain('.eq("competition_id", competitionId)');
    expect(source).toContain("seenUsers.has(entry.userId)");
    expect(source).toContain("seenAccounts.has(entry.accountId)");
    expect(source).toContain("entries.length === competition.maxParticipants");
  });

  it("loads competition accounts in bounded chunks and validates identity, type, competition and currency", () => {
    expect(source).toContain("PAPER_COMPETITION_VALUATION_ACCOUNT_CHUNK_SIZE = 100");
    expect(source).toContain('.from("paper_accounts_v3")');
    expect(source).toContain('.in("id", accountIds)');
    expect(source).toContain('account.accountType !== "competition"');
    expect(source).toContain("account.competitionId !== competitionId");
    expect(source).toContain("account.baseCurrency !== competition.baseCurrency");
    expect(source).toContain("account.userId !== entry.userId");
  });

  it("never trusts current cash balances or the normal current-state account loader", () => {
    expect(source).not.toContain("paper_cash_balances_v3");
    expect(source).not.toContain("loadPaperAccountStateV3");
    expect(source).not.toContain("cashValue");
  });

  it("loads filled orders and fills in chunks, and limits fill evidence to the exact common cutoff", () => {
    expect(source).toContain("PAPER_COMPETITION_VALUATION_LEDGER_CHUNK_SIZE = 100");
    expect(source).toContain('.from("paper_orders_v3")');
    expect(source).toContain('.eq("status", "filled")');
    expect(source).toContain('.from("paper_fills_v3")');
    expect(source).toContain('.lte("executed_at", evaluationCutoff)');
    expect(source).toContain('.in("account_id", accountIds)');
  });

  it("strictly validates verified fill evidence against its filled order before returning PaperFillV3 rows", () => {
    expect(source).toContain('marketVerification !== "VERIFIED"');
    expect(source).toContain('pricingBasis !== "VERIFIED_OBSERVATION_EXACT"');
    expect(source).toContain("policyVersion !== PAPER_TRADING_V3_POLICY_VERSION");
    expect(source).toContain("order.accountId !== accountId");
    expect(source).toContain("order.userId !== userId");
    expect(source).toContain("order.ticker !== ticker");
    expect(source).toContain("order.side !== side");
    expect(source).toContain("Math.abs(order.quantity - quantity) > 1e-9");
  });

  it("fails closed unless evidence maps one validated participant per competition entry", () => {
    expect(source).toContain("participants.length !== entries.length");
    expect(source).toContain("PAPER_COMPETITION_VALUATION_EVIDENCE_INVALID");
    expect(source).toContain("fillsByAccount.get(entry.accountId) ?? []");
  });
});
