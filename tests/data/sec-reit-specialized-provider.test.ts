import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";

const envMocks = vi.hoisted(() => ({
  getSecUserAgent: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getSecUserAgent: envMocks.getSecUserAgent,
}));

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

function response(body: string | object, init: ResponseInit = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": typeof body === "string" ? "text/html" : "application/json" },
    ...init,
  });
}

function submissions() {
  return {
    cik: "0000000001",
    filings: {
      recent: {
        accessionNumber: ["0000000001-26-000010", "0000000001-26-000009"],
        filingDate: ["2026-07-30", "2026-07-20"],
        form: ["8-K", "8-K"],
        primaryDocument: ["reit-20260730.htm", "reit-other.htm"],
        items: ["2.02,9.01", "1.01"],
      },
    },
  };
}

function filingIndex(extraLink = "") {
  return `
    <html><body>
      <div class="infoHead">Period of Report</div><div class="info">2026-06-30</div>
      <table class="tableFile">
        <tr><td>1</td><td>Press Release</td><td><a href="/Archives/edgar/data/1/000000000126000010/ex991.htm">ex991.htm</a></td><td>EX-99.1</td></tr>
        <tr><td>2</td><td>Supplemental</td><td><a href="ex992.htm">ex992.htm</a></td><td>EX-99.2</td></tr>
        ${extraLink}
      </table>
    </body></html>
  `;
}

describe("SEC REIT specialized provider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    envMocks.getSecUserAgent.mockReturnValue("StockBox test contact test@example.com");
  });

  it("fails without SEC contact configuration before performing any network request", async () => {
    envMocks.getSecUserAgent.mockReturnValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await fetchSecReitSpecializedData(company);

    expect(result).toMatchObject({ ok: false, reason: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed when no SEC CIK is available", async () => {
    const result = await fetchSecReitSpecializedData({ ...company, cik: undefined });
    expect(result).toMatchObject({ ok: false, reason: "unsupported_symbol" });
  });

  it("uses the latest earnings 8-K, follows only SEC-hosted EX-99 exhibits, and returns reported REIT specialist facts with provenance", async () => {
    const seenUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      seenUrls.push(url);
      if (url.includes("/submissions/CIK0000000001.json")) return response(submissions());
      if (url.endsWith("/0000000001-26-000010-index.htm")) return response(filingIndex(
        '<tr><td>3</td><td>External</td><td><a href="https://example.com/not-sec.htm">external</a></td><td>EX-99.3</td></tr>',
      ));
      if (url.endsWith("/ex991.htm")) return response(`
        <p>98.8% occupancy</p>
        <p>Net Debt to Annualized Pro Forma Adjusted EBITDAre was 5.4x</p>
      `);
      if (url.endsWith("/ex992.htm")) return response(`
        <table><tr><td>Cash Same Store NOI*</td><td>8.5%</td></tr></table>
        <table><tr><td>Fixed Charge Coverage Ratio</td><td>4.7x</td></tr></table>
      `);
      throw new Error(`Unexpected fetch ${url}`);
    });

    const result = await fetchSecReitSpecializedData(company);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.kind).toBe("reit");
      expect(result.data.occupancy).toMatchObject({ value: 0.988, unit: "ratio", dataAsOf: "2026-06-30" });
      expect(result.data.sameStoreNoiGrowth).toMatchObject({ value: 0.085, unit: "ratio", dataAsOf: "2026-06-30" });
      expect(result.data.netDebtToEbitdare).toMatchObject({ value: 5.4, unit: "ratio", dataAsOf: "2026-06-30" });
      expect(result.data.fixedChargeCoverage).toMatchObject({ value: 4.7, unit: "ratio", dataAsOf: "2026-06-30" });
      expect(result.data.occupancy.provenance).toMatchObject({
        provider: "sec-reit-filings",
        valueKind: "reported",
        periodEnd: "2026-06-30",
        filedAt: "2026-07-30",
        form: "8-K",
        accession: "0000000001-26-000010",
      });
      expect(result.data.fundsFromOperations.value).toBeNull();
      expect(result.data.adjustedFundsFromOperations.value).toBeNull();
      expect(result.data.adjustedFundsFromOperations.companyDefined).toBe(true);
    }
    expect(seenUrls.some((url) => url.startsWith("https://example.com"))).toBe(false);
    expect(seenUrls.some((url) => url.includes("0000000001-26-000009"))).toBe(false);
  });

  it("does not fetch exhibits from a non-earnings 8-K when no Item 2.02 filing is available", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/submissions/CIK0000000001.json")) {
        return response({
          cik: "0000000001",
          filings: { recent: {
            accessionNumber: ["0000000001-26-000009"],
            filingDate: ["2026-07-20"],
            form: ["8-K"],
            primaryDocument: ["reit-other.htm"],
            items: ["1.01"],
          } },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const result = await fetchSecReitSpecializedData(company);
    expect(result).toMatchObject({ ok: false, reason: "empty_response" });
  });

  it("fails closed when the filing index has no period-of-report date", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/submissions/CIK0000000001.json")) return response(submissions());
      if (url.endsWith("/0000000001-26-000010-index.htm")) {
        return response('<table><tr><td><a href="ex991.htm">ex991.htm</a></td><td>EX-99.1</td></tr></table>');
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const result = await fetchSecReitSpecializedData(company);
    expect(result).toMatchObject({ ok: false, reason: "empty_response" });
  });
});
