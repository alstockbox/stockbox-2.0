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
  directSnapshotInsert: vi.fn(),
  rpc: vi.fn(),
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

describe("portfolio snapshot ledger revision fencing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000111" });
    mocks.checkDistributedRateLimit.mockResolvedValue({ allowed: true });
    mocks.clientRateLimitKey.mockReturnValue("portfolio-test");
    mocks.resolveComparisonFxContexts.mockImplementation(async (requests: Array<{ id: string }>) =>
      new Map(requests.map((request) => [request.id, { rate: 1 }])),
    );
    mocks.convertWithComparisonFxContext.mockImplementation((amount: number, context?: { rate: number }) =>
      context ? amount * context.rate : null,
    );

    const portfolioQuery: Record<string, unknown> = {};
    portfolioQuery.select = vi.fn(() => portfolioQuery);
    portfolioQuery.eq = vi.fn(() => portfolioQuery);
    portfolioQuery.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000222", name: "Test", base_currency: "SEK" },
    });

    const transactionQuery: Record<string, unknown> = {};
    transactionQuery.select = vi.fn(() => transactionQuery);
    transactionQuery.eq = vi.fn(() => transactionQuery);
    transactionQuery.order = vi.fn().mockResolvedValue({
      data: [{
        id: "buy",
        ticker: "TEST",
        transaction_type: "buy",
        quantity: 1,
        price: 100,
        cash_amount: null,
        fees: 0,
        currency: "SEK",
        executed_at: "2026-09-01",
      }],
      error: null,
    });

    const analysisQuery: Record<string, unknown> = {};
    analysisQuery.select = vi.fn(() => analysisQuery);
    analysisQuery.eq = vi.fn(() => analysisQuery);
    analysisQuery.in = vi.fn(() => analysisQuery);
    analysisQuery.order = vi.fn().mockResolvedValue({ data: [] });

    const revisionQuery: Record<string, unknown> = {};
    revisionQuery.select = vi.fn(() => revisionQuery);
    revisionQuery.eq = vi.fn(() => revisionQuery);
    revisionQuery.maybeSingle = vi.fn().mockResolvedValue({ data: { revision: 7 }, error: null });

    const snapshotQuery: Record<string, unknown> = {};
    snapshotQuery.insert = mocks.directSnapshotInsert.mockReturnValue(snapshotQuery);
    snapshotQuery.select = vi.fn(() => snapshotQuery);
    snapshotQuery.single = vi.fn().mockResolvedValue({
      data: { id: "stale-snapshot", created_at: "2026-09-07T18:00:00.000Z" },
      error: null,
    });

    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "portfolios") return portfolioQuery;
        if (table === "portfolio_transactions") return transactionQuery;
        if (table === "analyses") return analysisQuery;
        if (table === "portfolio_ledger_revisions") return revisionQuery;
        if (table === "portfolio_snapshots") return snapshotQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: mocks.rpc,
    });
  });

  it("refuses to publish when the ledger changes after computation starts", async () => {
    const response = await POST(new Request("http://localhost/api/portfolio/snapshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portfolioId: "00000000-0000-4000-8000-000000000222" }),
    }));

    expect(response.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledWith("insert_portfolio_snapshot_if_current", expect.objectContaining({
      p_portfolio_id: "00000000-0000-4000-8000-000000000222",
      p_expected_revision: 7,
    }));
    expect(mocks.directSnapshotInsert).not.toHaveBeenCalled();
  });
});
