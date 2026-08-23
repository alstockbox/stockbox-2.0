import { describe, expect, it } from "vitest";
import {
  formattedCompanySelection,
  selectionAfterQueryChange,
  supportsLiveFundamentals,
} from "../../src/components/analysis/analysis-workbench-state";
import { commonCompanies } from "../../src/lib/data/common-companies";

const company = (ticker: string) => commonCompanies.find((candidate) => candidate.ticker === ticker)!;

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
});
