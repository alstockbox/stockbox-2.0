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
  snapshotRpc: vi.fn(),
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

describe("portfolio snapshot performance persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000111" });
    mocks.checkDistributedRateLimit.mockResolvedValue({ allowed: true });
    mocks.clientRateLimitKey.mockReturnValue("portfolio-test");
    mocks.resolveComparisonFxContexts.mockImplementation(async (requests: Array<{ id: string; date: string }>) => new Map(
      requests.map((request) => [request.id, { rate: fxRate(request.date) }]),
    ));
    mocks.convertWithComparisonFxContext.mockImplementation((amount: number, context?: FxContext) => context ? amount * context.rate : null);

    const portfolioQuery: Record<string, unknown> = {};
    portfolioQuery.select = vi.fn(() => portfolioQuery);
    portfolioQuery.eq = vi.fn(() => portfolioQuery);
    portfolioQuery.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000222", name: "US", base_currency: "SEK" },
    });

    const revisionQuery: Record<string, unknown> = {};
    revisionQuery.select = vi.fn(() => revisionQuery);
    revisionQuery.eq = vi.fn(() => revisionQuery);
    revisionQuery.maybeSingle = vi.fn().mockResolvedValue({ data: { revision: 4 }, error: null });

    const transactionQuery: Record<string, unknown> = {};
    transactionQuery.select = vi.fn(() => transactionQuery);
    transactionQuery.eq = vi.fn(() => transactionQuery);
    transactionQuery.order = vi.fn().mockResolvedValue({
      data: [
        { id: "buy", ticker: "AAPL", transaction_type: "buy", quantity: 10, price: 100, cash_amount: null, fees: 10, currency: "USD", executed_at: "2026-01-01" },
        { id: "sell", ticker: "AAPL", transaction_type: "sell", quantity: 4, price: 150, cash_amount: null, fees: 2, currency: "USD", executed_at: "2026-03-01" },
        { id: "dividend", ticker: "AAPL", transaction_type: "dividend", quantity: null, price: null, cash_amount: 30, fees: 0, currency: "USD", executed_at: "2026-04-01" },
        { id: "fee", ticker: "AAPL", transaction_type: "fee", quantity: null, price: null, cash_amount: 5, fees: 0, currency: "USD", executed_at: "2026-05-01" },
      ],
      error: null,
    });

    const analysisQuery: Record<string, unknown> = {};
    analysisQuery.select = vi.fn(() => analysisQuery);
    analysisQuery.eq = vi.fn(() => analysisQuery);
    analysisQuery.in = vi.fn(() => analysisQuery);
    analysisQuery.order = vi.fn().mockResolvedValue({
      data: [{
        id: "analysis-1",
        ticker: "AAPL",
        created_at: "2026-09-01T12:00:00.000Z",
        score: 80,
        recommendation: "Hold",
        report: {
          generatedAt: "2026-09-01T12:00:00.000Z",
          recommendation: "Hold",
          score: { score: 80, dimensions: [] },
          market: { price: 140, currency: "USD", date: "2026-09-01" },
        },
      }],
    });

    mocks.snapshotRpc.mockResolvedValue({
      data: [{ id: "snapshot-1", created_at: "2026-09-07T09:00:00.000Z", ledger_revision: 4 }],
      error: null,
    });

    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "portfolios") return portfolioQuery;
        if (table === "portfolio_ledger_revisions") return revisionQuery;
        if (table === "portfolio_transactions") return transactionQuery;
        if (table === "analyses") return analysisQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: mocks.snapshotRpc,
    });
  });

  it("persists realized and total P/L using transaction-date FX", async () => {
    const response = await POST(new Request("http://localhost/api/portfolio/snapshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portfolioId: "00000000-0000-4000-8000-000000000222" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.snapshotRpc).toHaveBeenCalledWith("insert_portfolio_snapshot_if_current", expect.objectContaining({
      p_portfolio_id: "00000000-0000-4000-8000-000000000222",
      p_expected_revision: 4,
      p_snapshot: expect.objectContaining({
        invested_capital: 6060,
        portfolio_value: 10080,
        unrealized_pl: 4020,
        realized_pl: 2538,
        dividend_income: 345,
        standalone_fees: 56,
        trading_fees: 122,
        total_fees: 178,
        total_pl: 6847,
      }),
    }));

    const body = await response.json();
    expect(body.snapshot.ledgerRevision).toBe(4);
    expect(body.snapshot.performance).toEqual({
      realizedProfitLoss: 2538,
      unrealizedProfitLoss: 4020,
      dividendIncome: 345,
      standaloneFees: 56,
      tradingFees: 122,
      totalFees: 178,
      totalProfitLoss: 6847,
    });
  });
});
