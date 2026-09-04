import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCoverageAuditBatches } from "../../src/lib/data/coverage-audit-batch";

const LIVE = process.env.RUN_LIVE_COVERAGE === "1";

const tickers = [
  "EQH$A", "USB$A", "BH-A", "ICR-PA", "AGN.AS", "ASML.AS", "KRI.AT", "KARE.AT",
  "ASG.AX", "ERG.AX", "SR.BK", "FMT.BK", "SIP.BR", "MIKO.BR", "SIG.CO", "EMBLA.CO",
  "TIW.DE", "HAG.DE", "NOHO.HE", "SRV1V.HE", "0352.HK", "1282.HK", "ZGYO.IS", "BESTE.IS",
  "DUTI.JK", "SKLT.JK", "0082.KL", "0205.KL", "025980.KQ", "054540.KQ", "002900.KS", "012160.KS",
  "0QKB.L", "III.L", "IPR.LS", "SNG.LS", "GRF.MC", "LAB.MC", "COP.MI", "PLC.MI",
  "MMEL.NS", "SOLARA.NS", "NZL.NZ", "BGP.NZ", "DNB.OL", "PLT.OL", "GTT.PA", "ALBLD.PA",
  "CASH3.SA", "MRVE3.SA", "540.SI", "AP4.SI", "2285.SR", "9515.SR", "600403.SS", "601718.SS",
  "GPG.ST", "GCOR.ST", "MTG.SW", "VILN.SW", "000826.SZ", "002436.SZ", "7157.T", "3917.T",
  "ORA.TA", "AVIA.TA", "L.TO", "PXT.TO", "1558.TW", "2488.TW", "2937.TWO", "3603.TWO",
  "B.V", "BEX.V", "APR.WA", "CPL.WA", "COSM", "ORC", "AAPL", "MSFT",
  "NVDA", "KO", "JPM", "EQIX", "O", "PLD", "NVO", "SHOP", "SBUX", "BRK-B",
  "BF-B", "9984.T", "SAP.DE", "005930.KS", "RELIANCE.NS", "BHP.AX", "OR.PA", "2330.TW",
  "NESN.SW", "CBA.AX",
];

(LIVE ? describe : describe.skip)("live coverage diagnostic batch", () => {
  it("audits a stratified 100-ticker global sample without aborting on individual failures", async () => {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const result = await runCoverageAuditBatches(tickers, {
      analysisType: "numbers",
      investmentProfile: "balanced",
      batchSize: 20,
      concurrency: 3,
      pauseMs: 250,
      retainResults: true,
    });

    const payload = {
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      sampleSize: tickers.length,
      tickers,
      ...result,
    };

    const outputDir = join(process.cwd(), "artifacts", "coverage-live");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, "coverage-live-100.json"), JSON.stringify(payload, null, 2));
    console.log("COVERAGE_LIVE_SUMMARY", JSON.stringify(result.summary));

    expect(result.inputCount).toBe(100);
    expect(result.uniqueTickerCount).toBe(100);
    expect(result.summary.total).toBe(100);
    expect(result.results).toHaveLength(100);
  }, 3_000_000);
});
