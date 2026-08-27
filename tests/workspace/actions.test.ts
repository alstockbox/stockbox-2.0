import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  portfolioSelect: vi.fn(),
  portfolioEq: vi.fn(),
  portfolioSingle: vi.fn(),
  portfolioDelete: vi.fn(),
  holdingInsert: vi.fn(),
  holdingUpdate: vi.fn(),
  holdingDelete: vi.fn(),
  holdingEq: vi.fn(),
  searchCompanies: vi.fn(),
  resolveCanonicalCompanySelection: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/data/provider", () => ({ searchCompanies: mocks.searchCompanies }));
vi.mock("@/lib/data/company-search", () => ({ resolveCanonicalCompanySelection: mocks.resolveCanonicalCompanySelection }));

import {
  addHoldingAction,
  addWatchlistItemAction,
  createPortfolioAction,
  deletePortfolioAction,
  removeHoldingAction,
  updateHoldingAction,
} from "../../src/lib/workspace/actions";

function data(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("workspace server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000111", role: "customer" });
    mocks.searchCompanies.mockResolvedValue([]);
    mocks.resolveCanonicalCompanySelection.mockImplementation((selection: { ticker: string; name?: string }) => ({ ok: true, company: { ticker: selection.ticker, canonicalTicker: selection.ticker, name: selection.name ?? selection.ticker } }));
    mocks.rpc.mockResolvedValue({ data: { allowed: true }, error: null });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });

    const portfolioQuery = {
      select: mocks.portfolioSelect,
      eq: mocks.portfolioEq,
      single: mocks.portfolioSingle,
      delete: mocks.portfolioDelete,
    };
    const holdingQuery = {
      insert: mocks.holdingInsert,
      update: mocks.holdingUpdate,
      delete: mocks.holdingDelete,
      eq: mocks.holdingEq,
    };
    mocks.portfolioSelect.mockReturnValue(portfolioQuery);
    mocks.portfolioEq.mockReturnValue(portfolioQuery);
    mocks.portfolioDelete.mockReturnValue(portfolioQuery);
    mocks.portfolioSingle.mockResolvedValue({ data: { id: "00000000-0000-4000-8000-000000000222" } });
    mocks.holdingInsert.mockResolvedValue({ error: null });
    mocks.holdingUpdate.mockReturnValue(holdingQuery);
    mocks.holdingDelete.mockReturnValue(holdingQuery);
    mocks.holdingEq.mockReturnValue(holdingQuery);
    mocks.from.mockImplementation((table: string) => table === "portfolios" ? portfolioQuery : holdingQuery);
    mocks.createClient.mockResolvedValue({ from: mocks.from });
  });

  it("creates watchlist entries through the atomic entitlement rpc", async () => {
    await addWatchlistItemAction(data({ ticker: "volv-b.st", companyName: "Volvo" }));
    expect(mocks.rpc).toHaveBeenCalledWith("upsert_watchlist_item_with_entitlement", {
      p_user_id: "00000000-0000-4000-8000-000000000111",
      p_ticker: "VOLV-B.ST",
      p_company_name: "Volvo",
    });
  });

  it("creates portfolios through the atomic entitlement rpc with explicit base currency", async () => {
    await createPortfolioAction(data({ name: "US portfolio", baseCurrency: "usd" }));
    expect(mocks.rpc).toHaveBeenCalledWith("create_portfolio_with_entitlement", {
      p_user_id: "00000000-0000-4000-8000-000000000111",
      p_name: "US portfolio",
      p_base_currency: "USD",
    });
  });

  it("stores holding cost currency instead of hardcoding SEK", async () => {
    await addHoldingAction(data({
      portfolioId: "00000000-0000-4000-8000-000000000222",
      ticker: "aapl",
      quantity: "2",
      averageCost: "210",
      currency: "usd",
    }));

    expect(mocks.holdingInsert).toHaveBeenCalledWith({
      portfolio_id: "00000000-0000-4000-8000-000000000222",
      ticker: "AAPL",
      quantity: 2,
      average_cost: 210,
      currency: "USD",
    });
  });

  it("updates an owned holding through the RLS-protected holdings table", async () => {
    const id = "00000000-0000-4000-8000-000000000333";
    await updateHoldingAction(data({ id, quantity: "3.5", averageCost: "205.25", currency: "usd" }));
    expect(mocks.holdingUpdate).toHaveBeenCalledWith({ quantity: 3.5, average_cost: 205.25, currency: "USD" });
    expect(mocks.holdingEq).toHaveBeenCalledWith("id", id);
  });

  it("removes an owned holding through the RLS-protected holdings table", async () => {
    const id = "00000000-0000-4000-8000-000000000333";
    await removeHoldingAction(data({ id }));
    expect(mocks.holdingDelete).toHaveBeenCalledTimes(1);
    expect(mocks.holdingEq).toHaveBeenCalledWith("id", id);
  });

  it("deletes only the current user's portfolio", async () => {
    const id = "00000000-0000-4000-8000-000000000222";
    await deletePortfolioAction(data({ id }));
    expect(mocks.portfolioDelete).toHaveBeenCalledTimes(1);
    expect(mocks.portfolioEq).toHaveBeenCalledWith("id", id);
    expect(mocks.portfolioEq).toHaveBeenCalledWith("user_id", "00000000-0000-4000-8000-000000000111");
  });
});
