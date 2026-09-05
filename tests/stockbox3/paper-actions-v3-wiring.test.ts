import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync("src/app/paper-trading/actions.ts", "utf8");
const accounts = readFileSync("src/lib/paper-trading/accounts-v3.ts", "utf8");

describe("Paper Trading V3 action boundary", () => {
  it("binds identity from the authenticated server session and never from FormData", () => {
    expect(actions).toContain("await requireUser()");
    expect(actions).toContain("userId: user.id");
    expect(actions).not.toContain('formData.get("userId")');
    expect(actions).not.toContain('formData.get("user_id")');
  });

  it("checks both the dark-launch feature flag and emergency kill switch before writes", () => {
    expect(actions).toContain('isFeatureEnabled("paperTrading")');
    expect(actions).toContain('isKilled("paperTrading")');
    expect(actions).toContain("if (!featureAvailable()) redirect(\"/dashboard\")");
  });

  it("never accepts arbitrary starting cash from the browser", () => {
    expect(actions).toContain("startingCash: PAPER_TRADING_V3_STARTING_CASH");
    expect(actions).not.toContain('formData.get("startingCash")');
    expect(actions).not.toContain('formData.get("cash")');
    expect(accounts).toContain("PAPER_TRADING_V3_STARTING_CASH = 100_000");
  });

  it("validates account ownership identifiers and order intent before the service call", () => {
    expect(actions).toContain("accountId: z.string().uuid()");
    expect(actions).toContain('side: z.enum(["buy", "sell"])');
    expect(actions).toContain("quantity: z.coerce.number().finite().positive().max(1_000_000_000)");
    expect(actions).toContain("executePaperOrderServiceV3");
  });

  it("lists accounts only through an explicit user filter and a bounded query", () => {
    expect(accounts).toContain('.from("paper_accounts_v3")');
    expect(accounts).toContain('.eq("user_id", normalizedUserId)');
    expect(accounts).toContain(".limit(20)");
  });

  it("keeps leaderboard fairness separate from account creation by fixing capital while allowing currency choice", () => {
    expect(accounts).toContain('"SEK"');
    expect(accounts).toContain('"USD"');
    expect(actions).toContain("baseCurrency: parsed.data.baseCurrency");
    expect(actions).not.toContain("leaderboard");
    expect(actions).not.toContain("challenge");
  });
});
