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

  it("uses the same ambiguity gate as single-company analysis", async () => {
    mocks.searchCompanies.mockResolvedValue([
      {
        ticker: "ABC",
        canonicalTicker: "ABC",
        name: "ABC Holdings US",
        entityId: "issuer:abc-us",
        country: "US",
        securityType: "Common Stock",
        providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["sec"] },
      },
      {
        ticker: "ABC",
        canonicalTicker: "ABC",
        name: "ABC Holdings Canada",
        entityId: "issuer:abc-ca",
        country: "CA",
        securityType: "Common Stock",
        providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["yahoo"] },
      },
    ]);

    const response = await POST(batchRequest(["ABC"]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toEqual([expect.objectContaining({
      input: "ABC",
      status: "ambiguous",
    })]);
  });

  it("rate limits repeated batch validation before entitlement and provider work", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "batch_rate_user",
      email: "batch-rate@stockbox.test",
      role: "customer",
    });

    const responses: Response[] = [];
    for (let index = 0; index < 31; index += 1) {
      responses.push(await POST(batchRequest(["AAPL"])));
    }

    expect(responses.at(-1)?.status).toBe(429);
    await expect(responses.at(-1)?.json()).resolves.toEqual({
      error: "Too many requests. Please try again shortly.",
    });
    expect(mocks.getBatchEntitlement).toHaveBeenCalledTimes(30);
    expect(mocks.searchCompanies).toHaveBeenCalledTimes(30);
  });
});
