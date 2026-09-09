import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adapterPath = resolve(process.cwd(), "src/lib/data/official-investment-company-leverage.ts");
const providerPath = resolve(process.cwd(), "src/lib/data/universal-security-provider.ts");

async function loadAdapter() {
  const moduleUrl = pathToFileURL(adapterPath).href;
  return import(/* @vite-ignore */ moduleUrl) as Promise<{
    parseInvestorOfficialLeverageDisclosure: (html: string) => {
      ratio: number;
    } | null;
  }>;
}

const INVESTOR_Q2_2026_DISCLOSURE = `
  <p>Leverage was 1.9 percent as of June 30, 2026 (2.1 percent as of December 31, 2025).</p>
`;

describe("StockBox 3 Investor issuer-level leverage authority", () => {
  it("parses Investor's explicit current issuer leverage ratio without debt algebra", async () => {
    const { parseInvestorOfficialLeverageDisclosure } = await loadAdapter();

    expect(parseInvestorOfficialLeverageDisclosure(INVESTOR_Q2_2026_DISCLOSURE)).toEqual({
      ratio: 0.019,
    });
  });

  it("fails closed when more than one current Investor leverage disclosure is present", async () => {
    const { parseInvestorOfficialLeverageDisclosure } = await loadAdapter();

    expect(parseInvestorOfficialLeverageDisclosure(`
      ${INVESTOR_Q2_2026_DISCLOSURE}
      ${INVESTOR_Q2_2026_DISCLOSURE}
    `)).toBeNull();
  });

  it("registers Investor's official 2026 reporting page as a dedicated leverage authority", () => {
    const source = readFileSync(adapterPath, "utf8");

    expect(source).toContain('id: "investor"');
    expect(source).toContain('const INVESTOR_Q2_2026_AS_OF = "2026-06-30"');
    expect(source).toContain('https://www.investorab.com/investors-media/reports-presentations/2026');
    expect(source).toContain('identity.includes("investor ab")');
  });

  it("keeps Investor leverage behind the existing comparable-disclosure gate and never substitutes consolidated debt", () => {
    const provider = readFileSync(providerPath, "utf8");

    expect(provider).toContain("const dedicatedLeverageRatio = leverageComparable && officialLeverage.ok");
    expect(provider).toContain("holdingCompanyLeverageRatio: verifiedLeverageRatio");
    expect(provider).not.toContain("debt: latest?.totalDebt");
  });
});
