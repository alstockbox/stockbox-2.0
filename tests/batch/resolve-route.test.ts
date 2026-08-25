import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getBatchEntitlement: vi.fn(),
  searchCompanies: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/db/repositories", () => ({
  getBatchEntitlement: mocks.getBatchEntitlement,
}));
vi.mock("@/lib/data/provider", () => ({
  searchCompanies: mocks.searchCompanies,
}));

import { POST } from "../../src/app/api/batch/resolve/route";

function batchRequest(symbols: string[]) {
  return new Request("http://localhost/api/batch/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols }),
  });
}
describe("batch resolve API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "user@stockbox.test",
      role: "customer",
    });
    mocks.getBatchEntitlement.mockResolvedValue({
      allowed: true,
      configured: true,
      plan: "basic",
      rowLimit: 10,
    });
    mocks.searchCompanies.mockResolvedValue([]);
  });

  it("requires authentication before company lookups", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(batchRequest(["AAPL"]));

    expect(response.status).toBe(401);
    expect(mocks.getBatchEntitlement).not.toHaveBeenCalled();
    expect(mocks.searchCompanies).not.toHaveBeenCalled();
  });
  it("blocks plans without batch entitlement", async () => {
    mocks.getBatchEntitlement.mockResolvedValue({
      allowed: false,
      configured: true,
      plan: "free",
      rowLimit: 0,
    });

    const response = await POST(batchRequest(["AAPL"]));

    expect(response.status).toBe(403);
    expect(mocks.searchCompanies).not.toHaveBeenCalled();
  });

  it("enforces the plan row limit before provider calls", async () => {
    mocks.getBatchEntitlement.mockResolvedValue({
      allowed: true,
      configured: true,
      plan: "basic",
      rowLimit: 2,
    });

    const response = await POST(batchRequest(["AAPL", "MSFT", "NVDA"]));

    expect(response.status).toBe(422);
    expect(mocks.searchCompanies).not.toHaveBeenCalled();
  });
  it("separates ready, unsupported and missing tickers", async () => {
    mocks.searchCompanies.mockImplementation(async (symbol: string) => {
      if (symbol === "AAPL") {
        return [{
          ticker: "AAPL",
          canonicalTicker: "AAPL",
          name: "Apple Inc.",
          securityType: "Common Stock",
          providerCapabilities: {
            fundamentals: true,
            marketData: true,
            providerIds: ["sec"],
          },
        }];
      }
      if (symbol === "SPY") {
        return [{
          ticker: "SPY",
          canonicalTicker: "SPY",
          name: "SPDR S&P 500 ETF",
          securityType: "ETF/Fund",
          providerCapabilities: {
            fundamentals: false,
            marketData: true,
            providerIds: ["yahoo"],
          },
        }];
      }
      return [];
    });
    const response = await POST(batchRequest(["aapl", "SPY", "MISS"]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toEqual([
      expect.objectContaining({ input: "AAPL", status: "ready" }),
      expect.objectContaining({ input: "SPY", status: "unsupported" }),
      expect.objectContaining({ input: "MISS", status: "not_found" }),
    ]);
    expect(mocks.getBatchEntitlement).toHaveBeenCalledWith({
      userId: "user_1",
      isAdmin: false,
    });
  });
});
