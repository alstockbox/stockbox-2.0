import { analyzeStock, type CompanyAnalysisInput } from "./analysis-engine";

const companyHistory = [19, 20, 21, 22, 23, 24, 24, 25, 26, 27, 28, 29, 31, 32, 34, 35, 36, 38, 40, 42, 43, 44, 45, 46];
const sectorHistory = [15, 16, 17, 18, 18, 19, 20, 21, 21, 22, 22, 23, 24, 25, 26, 26, 27, 28, 29, 30, 31, 33, 35, 36];

export const sampleStockInput: CompanyAnalysisInput = {
  company: {
    name: "Nordic Compounder",
    ticker: "NCOMP",
    sector: "industrials",
    industry: "Industrial technology",
    currency: "SEK",
    market: "Sweden"
  },
  current: {
    pe: 34,
    forwardPe: 29,
    evEbitda: 19,
    evEbit: 26,
    pFcf: 38,
    fcfYield: 2.6,
    revenueGrowth: 18,
    epsGrowth: 21,
    fcfGrowth: 16,
    grossMargin: 48,
    operatingMargin: 19,
    netMargin: 14,
    fcfMargin: 13,
    fcfConversion: 88,
    roic: 21,
    roe: 24,
    netDebtToEbitda: 0.8,
    interestCoverage: 14,
    currentRatio: 1.7,
    sharesGrowth: -1.5,
    revenueGrowthSeries: [9, 12, 15, 18],
    operatingIncomeGrowthSeries: [11, 16, 22, 28],
    operatingMarginSeries: [14, 16, 18, 19],
    fcfMarginSeries: [9, 10, 12, 13]
  },
  benchmarks: {
    industry: {
      pe: 25,
      forwardPe: 22,
      evEbitda: 14,
      evEbit: 19,
      pFcf: 27,
      revenueGrowth: 9,
      roic: 13,
      operatingMargin: 14,
      fcfMargin: 8
    },
    sector: {
      pe: 23,
      forwardPe: 20,
      evEbitda: 13,
      evEbit: 18,
      pFcf: 25,
      revenueGrowth: 7,
      roic: 11,
      operatingMargin: 12,
      fcfMargin: 7
    },
    market: {
      pe: 18,
      forwardPe: 17,
      evEbitda: 11,
      pFcf: 22
    },
    peers: {
      pe: 26,
      forwardPe: 21,
      evEbitda: 15,
      evEbit: 20,
      pFcf: 29,
      revenueGrowth: 10,
      roic: 14
    },
    sectorHistory: {
      pe: sectorHistory,
      forwardPe: sectorHistory.map((value) => value - 2),
      evEbitda: sectorHistory.map((value) => value / 1.8)
    }
  },
  history: {
    pe: companyHistory,
    forwardPe: companyHistory.map((value) => value - 3),
    evEbitda: companyHistory.map((value) => value / 1.9),
    pFcf: companyHistory.map((value) => value + 3)
  },
  peerCount: 8,
  dataFreshness: {
    priceAsOf: "2026-09-02",
    financialPeriod: "TTM Q2 2026",
    lastReportedQuarter: "2026-Q2",
    ttmPeriod: "2025-Q3 to 2026-Q2",
    estimateTimestamp: "2026-09-01"
  }
};

export const sampleStockAnalysis = analyzeStock(sampleStockInput);
