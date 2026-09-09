import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";

const mocks = vi.hoisted(() => ({
  getSecUserAgent: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getSecUserAgent: mocks.getSecUserAgent,
}));

import { fetchCompanyFundamentalsResult } from "../../src/lib/data/sec";

const adrCompany: CompanySearchResult = {
  ticker: "NVO",
  canonicalTicker: "NVO",
  name: "Novo Nordisk A/S ADR",
  exchange: "NYSE",
  country: "US",
  currency: "USD",
  securityType: "ADR",
  cik: "0000353278",
  issuerId: "sec:0000353278",
  entityId: "sec:0000353278",
};

describe("SEC ADR issuer fundamentals identity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSecUserAgent.mockReturnValue("StockBox/1.0 ops@stockbox.test");
  });

  it("fails closed when Companyfacts returns a different issuer CIK than the verified ADR issuer request", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/xbrl/companyfacts/")) {
        return new Response(JSON.stringify({
          cik: 9999999,
          entityName: "Wrong Issuer plc",
          facts: {},
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/submissions/")) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected SEC test URL: ${url}`);
    }));

    const result = await fetchCompanyFundamentalsResult(adrCompany);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/issuer|identity|CIK/i);
  });
});
