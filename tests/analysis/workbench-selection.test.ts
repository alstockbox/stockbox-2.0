import { describe, expect, it } from "vitest";
import {
  formattedCompanySelection,
  securitySelectionKey,
  selectionAfterQueryChange,
  supportsLiveFundamentals,
} from "../../src/components/analysis/analysis-workbench-state";
import { commonCompanies } from "../../src/lib/data/common-companies";
import type { CompanySearchResult } from "../../src/lib/analysis/types";

const company = (ticker: string) => commonCompanies.find((candidate) => candidate.ticker === ticker)!;

const jpmSecurities: CompanySearchResult[] = [
  {
    ticker: "JPM",
    canonicalTicker: "JPM",
    name: "JPMorgan Chase & Co.",
    entityId: "issuer:jpmorgan-chase",
    securityType: "Common Stock",
    exchange: "NYSE",
  },
  {
    ticker: "JPM-PC",
    canonicalTicker: "JPM-PC",
    name: "JPMorgan Chase & Co. Depositary Shares Series CC",
    entityId: "issuer:jpmorgan-chase",
    securityType: "Preferred",
    exchange: "NYSE",
  },
  {
    ticker: "JPM-PD",
    canonicalTicker: "JPM-PD",
    name: "JPMorgan Chase & Co. Depositary Shares Series DD",
    entityId: "issuer:jpmorgan-chase",
    securityType: "Preferred",
    exchange: "NYSE",
  },
];

describe("analysis workbench selection state", () => {
  it("clears NVDA when the user types JPM without selecting it", () => {
    expect(selectionAfterQueryChange(company("NVDA"), "JPM")).toBeNull();
  });

  it("clears XOM when the user types Investor B without selecting it", () => {
    expect(selectionAfterQueryChange(company("XOM"), "Investor B")).toBeNull();
  });

  it("retains only text that explicitly represents the selected company", () => {
    const nvda = company("NVDA");
    expect(selectionAfterQueryChange(nvda, formattedCompanySelection(nvda))).toBe(nvda);
    expect(selectionAfterQueryChange(nvda, "NVIDIA Corporation")).toBe(nvda);
  });

  it("keeps unsupported listings in search without enabling live fundamentals", () => {
    expect(supportsLiveFundamentals(company("INVE.B"))).toBe(false);
    expect(supportsLiveFundamentals(company("AAPL"))).toBe(true);
  });

  it.each([
    ["JPM", 0],
    ["JPM-PC", 1],
  ])("selects only the exact %s security within a shared issuer", (_ticker, selectedIndex) => {
    const selectedKey = securitySelectionKey(jpmSecurities[selectedIndex]);
    const selectedStates = jpmSecurities.map(
      (candidate) => securitySelectionKey(candidate) === selectedKey,
    );

    expect(selectedStates).toEqual(jpmSecurities.map((_candidate, index) => index === selectedIndex));
    expect(selectedStates.filter(Boolean)).toHaveLength(1);
  });

  it("finds the exact highlighted index for JPM-PD instead of the first shared issuer result", () => {
    const selectedKey = securitySelectionKey(jpmSecurities[2]);
    const highlightedIndex = jpmSecurities.findIndex(
      (candidate) => securitySelectionKey(candidate) === selectedKey,
    );

    expect(highlightedIndex).toBe(2);
  });
});
