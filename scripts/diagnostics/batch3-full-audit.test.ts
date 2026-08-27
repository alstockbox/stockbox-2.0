import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeCompany, searchCompanies } from "../../src/lib/data/provider";

const queries = [
  "AAPL","NVDA","AMZN","CAT","LMT","CVX","SHOP.TO","TD.TO","CNQ.TO","ATCO-A.ST",
  "ERIC-B.ST","SAND.ST","DNB.OL","NHY.OL","MAERSK-B.CO","ORSTED.CO","NOKIA.HE","KNEBV.HE",
  "BAS.DE","DTE.DE","MBG.DE","MC.PA","BNP.PA","TTE.PA","ADYEN.AS","INGA.AS","ABI.BR",
  "UCB.BR","ABBN.SW","UBSG.SW","HSBA.L","RR.L","NG.L","SAN.MC","IBE.MC","ISP.MI",
  "STLAM.MI","8058.T","6501.T","4502.T","005930.KS","000660.KS","2317.TW","2454.TW",
  "1299.HK","CSL.AX","C6L.SI","RELIANCE.NS","VALE3.SA","WALMEX.MX",
] as const;

const outputDir = resolve(process.cwd(), ".stockbox-diagnostics");
const outputFile = resolve(outputDir, "batch3-current-full.json");
describe("Batch 3 full current-engine audit", () => {
  it("captures all 50 reports for cross-company validation", async () => {
    const results: unknown[] = [];
    for (const query of queries) {
      const candidates = await searchCompanies(query);
      const normalized = query.toUpperCase();
      const company = candidates.find((item) =>
        (item.canonicalTicker ?? item.ticker).toUpperCase() === normalized
      ) ?? candidates[0];
      if (!company) {
        results.push({ query, status: "not_found" });
        continue;
      }
      const result = await analyzeCompany({ company, analysisType: "deep", investmentProfile: "balanced" });
      results.push(result.ok
        ? { query, status: "completed", company, report: result.data, sources: result.sources, warnings: result.warnings }
        : { query, status: "safe_failure", company, error: result.error, warnings: result.warnings });
    }
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputFile, JSON.stringify({ generatedAt: new Date().toISOString(), queries, results }, null, 2));
    expect(results).toHaveLength(50);
  }, 600_000);
});
