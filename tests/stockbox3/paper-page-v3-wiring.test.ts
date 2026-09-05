import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/paper-trading/page.tsx", "utf8");

describe("Paper Trading V3 workspace", () => {
  it("keeps the route dark-launched and binds all reads to the authenticated user", () => {
    expect(page).toContain('if (!isFeatureEnabled("paperTrading")) notFound()');
    expect(page).toContain("requireUser()");
    expect(page).toContain("listPaperAccountsV3(user.id)");
    expect(page).toContain("loadPaperAccountStateV3(user.id, selectedAccount.id)");
    expect(page).not.toContain("createAdminClient");
    expect(page).not.toContain("createClient");
    expect(page).not.toContain(".from(");
  });

  it("renders history read-only while the emergency kill switch blocks both write forms", () => {
    expect(page).toContain('const killed = isKilled("paperTrading")');
    expect(page).toContain("!killed && accountsResult.accounts.length < 20");
    expect(page).toContain('!killed && selectedAccount.status === "active"');
    expect(page).toContain("recentFills.map");
    expect(page).toContain("recentOrders.map");
  });

  it("uses only authenticated server actions for account creation and trading", () => {
    expect(page).toContain("action={createPaperAccountAction}");
    expect(page).toContain("action={executePaperOrderAction}");
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("fetchYahooExecutionQuoteV3");
    expect(page).not.toContain("persistPaperFillV3");
  });

  it("generates the idempotency key on the server-rendered page and posts it as hidden intent", () => {
    expect(page).toContain("const orderIdempotencyKey = randomUUID()");
    expect(page).toContain('type="hidden" name="idempotencyKey" value={orderIdempotencyKey}');
  });

  it("does not calculate or present invented live valuation from the stored ledger", () => {
    expect(page).not.toContain("currentValue");
    expect(page).not.toContain("unrealizedProfitLoss");
    expect(page).not.toContain("unrealizedPl");
    expect(page).not.toContain("market.price");
    expect(page).toContain("StockBox gissar inte aktuellt portföljvärde");
    expect(page).toContain("StockBox does not guess current portfolio value");
  });

  it("states that the feature is simulation-only and keeps leaderboards out of the workflow", () => {
    expect(page).toContain("skickar inga order till en mäklare");
    expect(page).toContain("sends no orders to a broker");
    expect(page).toContain("utför aldrig riktiga värdepappersaffärer");
    expect(page).toContain("never executes real securities trades");
    expect(page).toContain("Konton med olika valutor jämförs inte i någon leaderboard");
  });
});
