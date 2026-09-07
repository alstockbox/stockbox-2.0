import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/data/provider", () => ({ searchCompanies: vi.fn() }));
vi.mock("@/lib/data/company-search", () => ({ resolveCanonicalCompanySelection: vi.fn() }));

import { updatePortfolioCashFlowTransactionAction } from "../../src/lib/workspace/actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("portfolio cash-flow history editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000111", role: "customer" });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("updates an owned dividend or fee through the dedicated cash-flow RPC", async () => {
    await updatePortfolioCashFlowTransactionAction(form({
      id: "00000000-0000-4000-8000-000000000444",
      amount: "42.50",
      currency: "sek",
      transactionDate: "2026-09-06",
    }));

    expect(mocks.rpc).toHaveBeenCalledWith("update_portfolio_cash_flow_transaction", {
      p_transaction_id: "00000000-0000-4000-8000-000000000444",
      p_cash_amount: 42.5,
      p_currency: "SEK",
      p_executed_at: "2026-09-06",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/portfolio");
  });
});
