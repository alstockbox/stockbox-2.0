import type { MarketCapBand } from "./market-cap";

export type AlphaClassification = "exceptional" | "high_potential" | "watchlist" | "low_conviction";

export type AlphaHistoryPoint = {
  period: string;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  epsGrowth: number | null;
  fcfMargin: number | null;
  shareGrowth: number | null;
};

export type AlphaSignalInput = {
  ticker: string;
  companyName: string;
  sector?: string | null;
  archetype?: string | null;
  analysisDate: string;
  market: {
    price: number | null;
    marketCap: number | null;
    marketCapCurrency?: string | null;
    volume: number | null;
    yearHigh: number | null;
    yearLow: number | null;
    performance1m: number | null;
    performance3m: number | null;
    performance6m: number | null;
    performance1y: number | null;
  };
  valuation: {
    pe: number | null;
    evEbitda: number | null;
    fcfYield: number | null;
    earningsYield: number | null;
  };
  balanceSheet: {
    debtToEquity: number | null;
    netDebtToEbitda: number | null;
    interestCoverage: number | null;
    currentRatio: number | null;
  };
  history: AlphaHistoryPoint[];
  forward: {
    revenueGrowth: number | null;
    epsGrowth: number | null;
    fcfGrowth: number | null;
  };
  catalyst?: {
    strength: number;
    confidence: number;
    sourceCount: number;
  } | null;
  estimateRevision?: {
    direction: number;
    magnitude: number;
    confidence: number;
  } | null;
  sentimentShift?: {
    direction: number;
    confidence: number;
  } | null;
  dataQuality: number;
};

export type AlphaDimensionScores = {
  undervaluation: number;
  quality: number;
  growthAcceleration: number;
  earningsInflection: number;
  catalyst: number;
  momentum: number;
  estimateRevisions: number;
  sentimentShift: number;
  smallCapAsymmetry: number;
  breakoutProbability: number;
};

export type AlphaRisk = {
  financialRisk: number;
  dilutionRisk: number;
  liquidityRisk: number;
  hypeRisk: number;
  overall: number;
};

export type AlphaUpsideProbability = {
  up10: number;
  up25: number;
  up50: number;
};

export type AlphaProbabilityCurve = {
  oneMonth: AlphaUpsideProbability;
  threeMonths: AlphaUpsideProbability;
  sixMonths: AlphaUpsideProbability;
  twelveMonths: AlphaUpsideProbability;
};

export type AlphaIntelligenceResult = {
  ticker: string;
  companyName: string;
  modelVersion: string;
  generatedAt: string;
  marketCapBand: MarketCapBand;
  alphaScore: number;
  classification: AlphaClassification;
  confidence: number;
  scores: AlphaDimensionScores;
  risk: AlphaRisk;
  probabilities: AlphaProbabilityCurve;
  strongestSignals: string[];
  riskSignals: string[];
  coverage: {
    fundamentalHistory: number;
    forwardEstimates: number;
    catalyst: number;
    estimateRevisions: number;
    sentiment: number;
  };
  methodology: {
    purpose: "ranking";
    independentFromFundamentalScore: true;
    probabilitiesAreModelImplied: true;
    marketCapPolicyVersion: string;
  };
};
