export type StockBoxOwnerId = string;
export type StockBoxCurrency = "SEK" | "USD" | "EUR" | "GBP" | string;
export type StockBoxPlanId = "free" | "builder" | "pro";

export type CompanyRef = {
  id: string;
  symbol: string;
  exchange: string | null;
  companyName: string;
  currency: StockBoxCurrency;
};

export type ReportSnapshotRef = {
  id: string;
  reportId: string | null;
  companyId: string;
  contentHash: string;
  capturedAt: string;
};

export type ThesisStatus = "draft" | "active" | "reviewing" | "closed" | "archived";
export type ThesisType = "quick" | "deep";

export type ThesisVersionInput = {
  summary: string;
  whyNow?: string;
  keyDrivers?: string;
  valuationView?: string;
  risks?: string;
  disconfirmingEvidence?: string;
  timeHorizon?: string;
  confidence?: number;
  expectedScenario?: string;
  catalysts?: string;
};

export type PaperTradeSide = "buy" | "sell";
export type PaperFillModel = "latest_quote" | "delayed_quote" | "daily_close" | "manual";

export type PaperTradeDraft = {
  portfolioId: string;
  companyId: string;
  side: PaperTradeSide;
  quantity: string;
  executionPrice: string;
  currency: StockBoxCurrency;
  simulatedFillModel: PaperFillModel;
  thesisId?: string;
  reportSnapshotId?: string;
  notes?: string;
  idempotencyKey: string;
};

export type ScoreDimension =
  | "analysis_quality"
  | "thesis_clarity"
  | "valuation_discipline"
  | "risk_awareness"
  | "position_sizing"
  | "forecast_calibration"
  | "review_discipline"
  | "learning_consistency"
  | "outcome_quality";

export type ScoreSnapshot = {
  scoringVersion: string;
  processScore: number | null;
  dimensions: Partial<Record<ScoreDimension, number>>;
  sampleSize: number;
  createdAt: string;
};
