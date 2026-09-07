import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  getCurrentUser: vi.fn(),
  createClient: vi.fn(),
  checkDistributedRateLimit: vi.fn(),
  clientRateLimitKey: vi.fn(),
  rateLimitExceededResponse: vi.fn(),
  resolveComparisonFxContexts: vi.fn(),
  convertWithComparisonFxContext: vi.fn(),
  snapshotInsert: vi.fn(),
}));

vi.mock("@/lib/analytics/events", () => ({ captureServerEvent: mocks.captureServerEvent }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkDistributedRateLimit: mocks.checkDistributedRateLimit,
  clientRateLimitKey: mocks.clientRateLimitKey,
  rateLimitExceededResponse: mocks.rateLimitExceededResponse,
}));
vi.mock("@/lib/data/ecb-fx", () => ({
  resolveComparisonFxContexts: mocks.resolveComparisonFxContexts,
  convertWithComparisonFxContext: mocks.convertWithComparisonFxContext,
}));

import { POST } from "../../src/app/api/portfolio/snapshot/route";

type FxContext = { rate: number };

function fxRate(date: string) {
  if (date === "2026-01-01") return 10;
  if (date === "2026-03-01") return 11;
  if (date === "2026-04-01") return 11.5;
  if (date === "2026-05-01") return 11.2;
  return 12;
}

describe("closed portfolio snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000111" });
    mocks.checkDistributedRateLimit.mockResolvedValue({ allowed: true });
    mocks.clientRateLimitKey.mockReturnValue("portfolio-closed-test");
    mocks.resolveComparisonFxContexts.mockImplementation(async (requests: Array<{ id: string; date: string }>) => new Map(
      requests.map((request) => [request.id, { rate: fxRate(request.date) }]),
    ));
    mocks.convertWithComparisonFxContext.mockImplementation((amount: number, context?: FxContext) => context ? amount * context.rate : null);

    const portfolioQuery: Record<string, unknown> = {};
    portfolioQuery.select = vi.fn(() => portfolioQuery);
    portfolioQuery.eq = vi.fn(() => portfolioQuery);
    portfolioQuery.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000222", name: "Closed", base_currency: "SEK" },
    });

    const transactionQuery: Record<string, unknown> = {};
    transactionQuery.select = vi.fn(() => transactionQuery);
    transactionQuery.eq = vi.fn(() => transactionQuery);
    transactionQuery.order = vi.fn().mockResolvedValue({
      data: [
        { id: "buy", ticker: "AAPL", transaction_type: "buy", quantity: 10, price: 100, cash_amount: null, fees: 10, currency: "USD", executed_at: "2026-01-01" },
        { id: "sell", ticker: "AAPL", transaction_type: "sell", quantity: 10, price: 150, cash_amount: null, fees: 2, currency: "USD", executed_at: "2026-03-01" },
        { id: "dividend", ticker: "AAPL", transaction_type: "dividend", quantity: null, price: null, cash_amount: 30, fees: 0, currency: "USD", executed_at: "2026-04-01" },
        { id: "fee", ticker: "AAPL", transaction_type: "fee", quantity: null, price: null, cash_amount: 5, fees: 0, currency: "USD", executed_at: "2026-05-01" },
      ],
      error: null,
    });

    const snapshotQuery: Record<string, unknown> = {};
    mocks.snapshotInsert.mockReturnValue(snapshotQuery);
    snapshotQuery.insert = mocks.snapshotInsert;
    snapshotQuery.select = vi.fn(() => snapshotQuery);
    snapshotQuery.single = vi.fn().mockResolvedValue({ data: { id: "snapshot-closed", created_at: "2026-09-07T13:00:00.000Z" }, error: null });

    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "portfolios") return portfolioQuery;
        if (table === "portfolio_transactions") return transactionQuery;
        if (table === "portfolio_snapshots") return snapshotQuery;
        if (table === "analyses") throw new Error("Closed portfolios must not query analyses when there are no active positions.");
        throw new Error(`Unexpected table ${table}`);
      }),
    });
  });

  it("persists a final performance snapshot after every position is fully sold", async () => {
    const response = await POST(new Request("http://localhost/api/portfolio/snapshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portfolioId: "00000000-0000-4000-8000-000000000222" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.snapshotInsert).toHaveBeenCalledWith(expect.objectContaining({
      invested_capital: 0,
      portfolio_value: 0,
      unrealized_pl: 0,
      unrealized_pl_percent: null,
      realized_pl: 6378,
      dividend_income: 345,
      standalone_fees: 56,
      trading_fees: 122,
      total_fees: 178,
      total_pl: 6667,
      portfolio_score: null,
      diversification_score: null,
      holdings: [],
    }));

    const body = await response.json();
    expect(body.snapshot.totals).toEqual({
      investedCapital: 0,
      marketValue: 0,
      unrealizedProfitLoss: 0,
      unrealizedProfitLossPercent: null,
      complete: true,
    });
    expect(body.snapshot.performance.totalProfitLoss).toBe(6667);
    expect(body.snapshot.completeValuation).toBe(true);
  });
});
