import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readRepository = fs.readFileSync(
  path.join(process.cwd(), "src/lib/paper-trading/private-league-read-repository-v3.ts"),
  "utf8",
);
const actions = fs.readFileSync(
  path.join(process.cwd(), "src/app/paper-trading/actions.ts"),
  "utf8",
);

function block(source: string, signature: string, nextSignature?: string): string {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  if (!nextSignature) return source.slice(start);
  const end = source.indexOf(nextSignature, start + signature.length);
  return source.slice(start, end >= 0 ? end : source.length);
}

const tradingContext = block(
  readRepository,
  "export async function loadPrivatePaperLeagueTradingContextV3",
  "export async function listPrivatePaperLeagueInvitesV3",
);
const action = block(
  actions,
  "export async function executePrivatePaperLeagueOrderAction",
);

describe("Paper Trading V3 private league trading boundary", () => {
  it("resolves trading authority through the authenticated member workspace, never a browser account id", () => {
    expect(readRepository).toContain("export async function loadPrivatePaperLeagueTradingContextV3");
    expect(tradingContext).toContain("loadPrivatePaperLeagueWorkspaceV3(normalizedUserId, normalizedCompetitionId)");
    expect(tradingContext).toContain("workspace.accountId");
    expect(tradingContext).not.toContain("accountId: string");
  });

  it("fails closed outside the official private league window or for terminal competition state", () => {
    expect(tradingContext).toContain('workspace.competition.kind !== "private_league"');
    expect(tradingContext).toContain('workspace.competition.status === "cancelled"');
    expect(tradingContext).toContain('workspace.competition.status === "completed"');
    expect(tradingContext).toContain("nowMs < startsAtMs || nowMs > endsAtMs");
    expect(tradingContext).toContain('workspace.accountStatus !== "active"');
  });

  it("accepts only competition identity plus bounded order intent from the browser", () => {
    expect(actions).toContain("const privateLeagueOrderSchema = z.object");
    expect(action).toContain("const user = await requireUser()");
    expect(action).toContain("if (!privateLeagueAvailable()) redirect(\"/dashboard\")");
    expect(action).toContain('competitionId: formData.get("competitionId")');
    expect(action).toContain('idempotencyKey: formData.get("idempotencyKey")');
    expect(action).toContain('ticker: formData.get("ticker")');
    expect(action).toContain('side: formData.get("side")');
    expect(action).toContain('quantity: formData.get("quantity")');
    expect(action).not.toContain('formData.get("accountId")');
    expect(action).not.toContain('formData.get("userId")');
  });

  it("derives the competition account server-side immediately before execution", () => {
    expect(action).toContain("loadPrivatePaperLeagueTradingContextV3(user.id, parsed.data.competitionId)");
    expect(action).toContain("accountId: context.accountId");
    expect(action).toContain("executePaperOrderServiceV3");
    expect(action).toContain("idempotencyKey: parsed.data.idempotencyKey");
    expect(action).toContain("ticker: parsed.data.ticker");
    expect(action).toContain("side: parsed.data.side");
    expect(action).toContain("quantity: parsed.data.quantity");
  });

  it("keeps private trading dark-gated by the existing private league feature boundary and paper kill switch", () => {
    expect(actions).toContain('isFeatureEnabled("privateLeagues")');
    expect(actions).toContain('isFeatureEnabled("paperTrading")');
    expect(actions).toContain('!isKilled("paperTrading")');
    expect(action).toContain("privateLeagueAvailable()");
  });

  it("does not route private league orders through challenge authority or expose repository errors", () => {
    expect(action).not.toContain("loadPaperChallengeTradingContextV3");
    expect(action).not.toContain("challengeAvailable()");
    expect(action).not.toContain("result.error");
    expect(action).not.toContain("contextResult.error");
  });
});
