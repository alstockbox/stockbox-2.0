import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const actions = fs.readFileSync(path.join(process.cwd(), "src/app/paper-trading/actions.ts"), "utf8");
const competitions = fs.readFileSync(path.join(process.cwd(), "src/lib/paper-trading/competition-repository-v3.ts"), "utf8");

function functionBlock(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  const next = source.indexOf("export async function", start + signature.length);
  return source.slice(start, next >= 0 ? next : source.length);
}

const challengeOrderAction = functionBlock(actions, "export async function executePaperChallengeOrderAction");

describe("Paper Trading V3 challenge order boundary", () => {
  it("resolves the authenticated user's exact competition entry and never trusts a browser account id", () => {
    expect(competitions).toContain("export async function loadPaperChallengeTradingContextV3");
    expect(competitions).toContain('.from("paper_competition_entries_v3")');
    expect(competitions).toContain('.eq("user_id", normalizedUserId)');
    expect(competitions).toContain('.eq("competition_id", normalizedCompetitionId)');
    expect(competitions).toContain(".maybeSingle()");
    expect(challengeOrderAction).not.toContain('formData.get("accountId")');
    expect(challengeOrderAction).not.toContain('formData.get("userId")');
  });

  it("accepts only competition id plus bounded order intent from FormData", () => {
    expect(actions).toContain("const challengeOrderSchema = z.object");
    expect(challengeOrderAction).toContain('competitionId: formData.get("competitionId")');
    expect(challengeOrderAction).toContain('idempotencyKey: formData.get("idempotencyKey")');
    expect(challengeOrderAction).toContain('ticker: formData.get("ticker")');
    expect(challengeOrderAction).toContain('side: formData.get("side")');
    expect(challengeOrderAction).toContain('quantity: formData.get("quantity")');
    expect(challengeOrderAction).not.toContain('formData.get("accountType")');
    expect(challengeOrderAction).not.toContain('formData.get("startingCash")');
  });

  it("validates a public challenge and official trading window before resolving the account", () => {
    expect(competitions).toContain('.from("paper_competitions_v3")');
    expect(competitions).toContain('.select("id,kind,status,starts_at,ends_at")');
    expect(competitions).toContain('competition.kind !== "challenge"');
    expect(competitions).toContain("nowMs < startsAtMs || nowMs > endsAtMs");
    expect(competitions).toContain('"PAPER_CHALLENGE_NOT_TRADING"');
  });

  it("binds the resolved entry to an active competition account for the same competition", () => {
    expect(competitions).toContain("loadPaperAccountBoundaryV3(normalizedUserId, entry.accountId)");
    expect(competitions).toContain('boundary.account.accountType !== "competition"');
    expect(competitions).toContain('boundary.account.competitionId !== normalizedCompetitionId');
    expect(competitions).toContain('boundary.account.status !== "active"');
    expect(competitions).toContain('"PAPER_CHALLENGE_ACCOUNT_INVALID"');
  });

  it("requires the challenge feature boundary before context resolution or order service", () => {
    expect(challengeOrderAction).toContain("const user = await requireUser()");
    expect(challengeOrderAction).toContain("if (!challengeAvailable()) redirect(\"/dashboard\")");
    expect(challengeOrderAction).toContain("loadPaperChallengeTradingContextV3(user.id, parsed.data.competitionId)");
    expect(challengeOrderAction).toContain("executePaperOrderServiceV3");
    const contextIndex = challengeOrderAction.indexOf("loadPaperChallengeTradingContextV3");
    const serviceIndex = challengeOrderAction.indexOf("executePaperOrderServiceV3");
    expect(contextIndex).toBeGreaterThanOrEqual(0);
    expect(serviceIndex).toBeGreaterThan(contextIndex);
  });

  it("passes only the server-resolved competition account into the existing verified order service", () => {
    expect(challengeOrderAction).toContain("accountId: context.accountId");
    expect(challengeOrderAction).toContain("idempotencyKey: parsed.data.idempotencyKey");
    expect(challengeOrderAction).toContain("ticker: parsed.data.ticker");
    expect(challengeOrderAction).toContain("side: parsed.data.side");
    expect(challengeOrderAction).toContain("quantity: parsed.data.quantity");
  });

  it("keeps failures opaque and redirects inside the challenge workspace", () => {
    expect(challengeOrderAction).toContain("/paper-trading/challenges?");
    expect(challengeOrderAction).not.toContain("contextResult.error");
    expect(challengeOrderAction).not.toContain("result.error");
  });
});
