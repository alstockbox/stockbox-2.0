import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adapterPath = resolve(process.cwd(), "src/lib/data/official-investment-company-leverage.ts");
const providerPath = resolve(process.cwd(), "src/lib/data/universal-security-provider.ts");

async function loadAdapter() {
  const moduleUrl = pathToFileURL(adapterPath).href;
  return import(/* @vite-ignore */ moduleUrl) as Promise<{
    parseLatourOfficialLeverageDisclosure: (html: string) => {
      ratio: number;
      netDebtExcludingIfrs16: number;
    } | null;
  }>;
}

describe("Investment-company official leverage V3", () => {
  it("provides a dedicated official leverage adapter", () => {
    expect(existsSync(adapterPath)).toBe(true);
  });

  it("parses Latour's issuer-published leverage ratio without debt/NAV algebra", async () => {
    const { parseLatourOfficialLeverageDisclosure } = await loadAdapter();
    const parsed = parseLatourOfficialLeverageDisclosure(`
      <p>Net debt, excluding lease liabilities recognised under IFRS 16, was SEK 13,372 m (10,993 m)
      and is equivalent to 10.4 (9.0) per cent of the market value of total assets.</p>
    `);

    expect(parsed).toEqual({
      ratio: 0.104,
      netDebtExcludingIfrs16: 13_372_000_000,
    });
  });

  it("fails closed when the official disclosure is ambiguous", async () => {
    const { parseLatourOfficialLeverageDisclosure } = await loadAdapter();
    const disclosure = `Net debt, excluding lease liabilities recognised under IFRS 16, was SEK 13,372 m (10,993 m) and is equivalent to 10.4 (9.0) per cent of the market value of total assets.`;
    expect(parseLatourOfficialLeverageDisclosure(`<p>${disclosure}</p><p>${disclosure}</p>`)).toBeNull();
  });

  it("fetches official leverage without response-cache substitution", () => {
    expect(existsSync(adapterPath)).toBe(true);
    if (!existsSync(adapterPath)) return;
    const source = readFileSync(adapterPath, "utf8");
    expect(source).toContain('cache: "no-store"');
    expect(source).not.toContain("next: { revalidate");
    expect(source).toContain("AbortController");
  });

  it("wires only verified comparable leverage into the holding-company specialist", () => {
    const provider = readFileSync(providerPath, "utf8");
    expect(provider).toContain('from "./official-investment-company-leverage"');
    expect(provider).toContain("fetchOfficialInvestmentCompanyLeverage(company)");
    expect(provider).toContain("leverageComparable");
    expect(provider).toContain("holdingCompanyLeverageRatio: verifiedLeverageRatio");
    expect(provider).not.toContain("holdingCompanyLeverageRatio: null");
    expect(provider).not.toContain("debt: latest?.totalDebt");
  });
});
