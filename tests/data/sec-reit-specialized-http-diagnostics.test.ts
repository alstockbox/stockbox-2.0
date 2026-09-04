import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";

const envMocks = vi.hoisted(() => ({ getSecUserAgent: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ getSecUserAgent: envMocks.getSecUserAgent }));

import { fetchSecReitSpecializedData } from "../../src/lib/data/sec-reit-specialized-provider";

const company: CompanySearchResult = {
  ticker: "REIT",
  canonicalTicker: "REIT",
  name: "Example Realty Trust",
  country: "US",
  exchange: "NYSE",
  cik: "0000000001",
  securityType: "Common Stock",
};

describe("SEC REIT HTTP diagnostics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    envMocks.getSecUserAgent.mockReturnValue("StockBox test contact test@example.com");
  });

  it("preserves a forbidden SEC response as an auditable HTTP diagnostic without changing retry semantics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Forbidden", { status: 403 }));

    const result = await fetchSecReitSpecializedData(company);

    expect(result).toMatchObject({
      ok: false,
      reason: "upstream_error",
      diagnostic: {
        provider: "SEC REIT filings",
        capability: "specialized",
        status: "unavailable",
        reason: "http_403",
      },
    });
  });
});
