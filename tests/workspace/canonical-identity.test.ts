import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), createAdminClient: vi.fn(), createClient: vi.fn(),
  searchCompanies: vi.fn(), resolveCanonicalCompanySelection: vi.fn(), rpc: vi.fn(),
  from: vi.fn(), portfolioSelect: vi.fn(), portfolioEq: vi.fn(), portfolioSingle: vi.fn(), holdingInsert: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/data/provider", () => ({ searchCompanies: mocks.searchCompanies }));
vi.mock("@/lib/data/company-search", () => ({ resolveCanonicalCompanySelection: mocks.resolveCanonicalCompanySelection }));

import { addHoldingAction, addWatchlistItemAction } from "../../src/lib/workspace/actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}
describe("workspace canonical identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000111", role: "customer" });
    mocks.searchCompanies.mockResolvedValue([]);
    mocks.resolveCanonicalCompanySelection.mockReturnValue({
      ok: true,
      company: { ticker: "TRUE-B.ST", canonicalTicker: "TRUE-B.ST", name: "Truecaller AB (publ)" },
    });
    mocks.rpc.mockResolvedValue({ data: { allowed: true }, error: null });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
    const portfolioQuery = { select: mocks.portfolioSelect, eq: mocks.portfolioEq, single: mocks.portfolioSingle };
    mocks.portfolioSelect.mockReturnValue(portfolioQuery);
    mocks.portfolioEq.mockReturnValue(portfolioQuery);
    mocks.portfolioSingle.mockResolvedValue({ data: { id: "00000000-0000-4000-8000-000000000222" } });
    mocks.holdingInsert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => table === "portfolios" ? portfolioQuery : { insert: mocks.holdingInsert });
    mocks.createClient.mockResolvedValue({ from: mocks.from });
  });

  it("stores the resolver's canonical watchlist identity", async () => {
    await addWatchlistItemAction(form({ ticker: "true b", companyName: "Whatever user typed" }));
    expect(mocks.rpc).toHaveBeenCalledWith("upsert_watchlist_item_with_entitlement", expect.objectContaining({
      p_ticker: "TRUE-B.ST", p_company_name: "Truecaller AB (publ)",
    }));
  });

  it("stores the resolver's canonical holding ticker", async () => {
    await addHoldingAction(form({
      portfolioId: "00000000-0000-4000-8000-000000000222",
      ticker: "true b",
      quantity: "2",
      averageCost: "45",
      currency: "sek",
    }));
    expect(mocks.holdingInsert).toHaveBeenCalledWith(expect.objectContaining({ ticker: "TRUE-B.ST" }));
  });
});
