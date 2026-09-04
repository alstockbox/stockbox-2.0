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

function jsonResponse(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function htmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

function submissions() {
  return {
    cik: "0000000001",
    filings: {
      recent: {
        accessionNumber: ["0000000001-26-000010"],
        filingDate: ["2026-07-30"],
        form: ["8-K"],
        items: ["2.02,9.01"],
      },
    },
  };
}

function filingIndex() {
  return `
    <div>Period of Report</div><div>2026-06-30</div>
    <table>
      <tr><td><a href="ex991.htm">Supplement</a></td><td>EX-99.1</td></tr>
    </table>
  `;
}

function expectForbiddenStage(result: Awaited<ReturnType<typeof fetchSecReitSpecializedData>>, reason: string) {
  expect(result).toMatchObject({
    ok: false,
    reason: "upstream_error",
    diagnostic: {
      provider: "SEC REIT filings",
      capability: "specialized",
      status: "unavailable",
      reason,
    },
  });
}

describe("SEC REIT HTTP diagnostics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    envMocks.getSecUserAgent.mockReturnValue("StockBox test contact test@example.com");
  });

  it("identifies a forbidden submissions response without changing retry semantics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Forbidden", { status: 403 }));

    const result = await fetchSecReitSpecializedData(company);

    expectForbiddenStage(result, "submissions_http_403");
  });

  it("identifies a forbidden filing-index response", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/submissions/CIK0000000001.json")) return jsonResponse(submissions());
      if (url.endsWith("-index.htm")) return new Response("Forbidden", { status: 403 });
      throw new Error(`Unexpected fetch ${url}`);
    });

    const result = await fetchSecReitSpecializedData(company);

    expectForbiddenStage(result, "filing_index_http_403");
  });

  it("identifies a forbidden exhibit response", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/submissions/CIK0000000001.json")) return jsonResponse(submissions());
      if (url.endsWith("-index.htm")) return htmlResponse(filingIndex());
      if (url.endsWith("/ex991.htm")) return new Response("Forbidden", { status: 403 });
      throw new Error(`Unexpected fetch ${url}`);
    });

    const result = await fetchSecReitSpecializedData(company);

    expectForbiddenStage(result, "exhibit_http_403");
  });
});
