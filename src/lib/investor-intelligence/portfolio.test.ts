import { describe, expect, it } from "vitest";
import { buildPortfolioIntelligence } from "./portfolio";
import type { CompanyMetricSnapshot } from "./types";

function snapshot(ticker: string, score: number, pe: number): CompanyMetricSnapshot {
  return { ticker, companyName:ticker, capturedAt:"2026-08-31", analysisId:ticker, price:100, priceChange1d:null, score, personalizedScore:score, confidence:.9, coverage:.9, fairValue:120, fairValueLow:null, fairValueHigh:null, fairValueUpside:.2, archetype:"standard", valuation:{pe,forwardPe:null,ps:2,evSales:2,evEbitda:10,fcfYield:.05,dividendYield:.02,historicalPePercentile:.5,peVs5yMedian:null,peVs10yMedian:null}, fundamentals:{revenueGrowth:.1,epsGrowth:.1,fcf:1,fcfGrowth:.1,fcfMargin:.15,grossMargin:.4,operatingMargin:.2,netMargin:.15,roic:.18,roe:.2,netDebt:0,netDebtToEbitda:0}, dividend:{yield:.02,payoutRatio:.4,fcfPayoutRatio:.35,growth:.05,dividendPerShare:1}, estimates:{revenueGrowth:null,epsGrowth:null,fcfGrowth:null,targetPrice:null}, dimensions:{quality:score,valuation:score-10,financialHealth:score,risk:score-5,growth:score-5,profitability:score}, riskFlags:[],sourceMeta:{} };
}

describe("buildPortfolioIntelligence",()=>{
  it("weights metrics by compatible market value",()=>{
    const result=buildPortfolioIntelligence({baseCurrency:"SEK",positions:[
      {ticker:"AAA",quantity:2,holdingCurrency:"SEK",catalogCurrency:"SEK",sector:"technology",country:"SE",marketCap:1_000_000_000,snapshot:snapshot("AAA",90,30)},
      {ticker:"BBB",quantity:1,holdingCurrency:"SEK",catalogCurrency:"SEK",sector:"industrials",country:"SE",marketCap:2_000_000_000,snapshot:snapshot("BBB",60,15)},
    ]});
    expect(result.coverage.marketValueCoverage).toBe(1);
    expect(result.scores.stockBox).toBeCloseTo(80);
    expect(result.concentration.topHolding).toBeCloseTo(2/3);
  });
  it("excludes currency-incompatible positions from weighted metrics",()=>{
    const result=buildPortfolioIntelligence({baseCurrency:"SEK",positions:[{ticker:"AAA",quantity:1,holdingCurrency:"USD",catalogCurrency:"USD",sector:"technology",country:"US",marketCap:1,snapshot:snapshot("AAA",90,30)}]});
    expect(result.coverage.marketValueCoverage).toBe(0);
    expect(result.scores.stockBox).toBeNull();
  });
});
