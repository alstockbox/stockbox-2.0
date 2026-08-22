export type AnalysisType = "summary" | "numbers" | "deep";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type UiMode = "simple" | "pro";

export type Sector =
  | "technology"
  | "financials"
  | "healthcare"
  | "consumer"
  | "industrials"
  | "energy"
  | "utilities"
  | "realEstate"
  | "materials"
  | "communication"
  | "other";

export type InvestmentProfile =
  | "long_term"
  | "short_term"
  | "growth"
  | "value"
  | "quality"
  | "dividend"
  | "balanced";

export type Recommendation =
  | "No Rating"
  | "Strong Buy"
  | "Buy"
  | "Hold"
  | "Sell"
  | "Strong Sell";

export type AnalysisArchetype =
  | "standard"
  | "software_growth"
  | "bank"
  | "insurer"
  | "reit"
  | "utility"
  | "cyclical"
  | "pre_revenue_biotech"
  | "holding_company"
  | "unknown";

export type MetricValueKind = "reported" | "derived" | "estimated" | "fallback";

export type MetricProvenance = {
  source: string;
  provider?: string;
  taxonomy?: "us-gaap" | "ifrs-full" | "dei" | string;
  concept?: string;
  unit?: string;
  periodStart?: string;
  periodEnd?: string;
  filedAt?: string;
  form?: string;
  valueKind: MetricValueKind;
  inputs?: string[];
  note?: string;
};

export type ProviderDiagnostic = {
  provider: string;
  capability: "search" | "fundamentals" | "market_data" | "estimates";
  status: "available" | "partial" | "unavailable" | "unsupported";
  reason?: string;
  observedAt: string;
};

export type CompanySearchResult = {
  ticker: string;
  name: string;
  cik?: string;
  exchange?: string;
  country?: string;
};

export type AnalysisSource = {
  name: string;
  url: string;
  accessedAt: string;
  freshness: string;
};

export type MarketSnapshot = {
  ticker: string;
  price: number | null;
  currency: string | null;
  date: string | null;
  volume: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  performance: Partial<Record<"1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y", number>>;
};

export type AnnualFinancials = {
  fiscalYear: number;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  epsDiluted: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  assets: number | null;
  liabilities: number | null;
  cash: number | null;
  debt: number | null;
  equity: number | null;
  interestExpense: number | null;
  periodEndDate?: string;
  pretaxIncome?: number | null;
  incomeTaxExpense?: number | null;
  costOfRevenue?: number | null;
  ebitda?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  dividendsPaid?: number | null;
  stockBasedCompensation?: number | null;
  researchAndDevelopment?: number | null;
  sharesDiluted?: number | null;
  currentSharesOutstanding?: number | null;
  provenance?: Record<string, MetricProvenance>;
};

export type CompanyFundamentals = {
  ticker: string;
  name: string;
  cik?: string;
  sector: string | null;
  industry: string | null;
  annual: AnnualFinancials[];
  sic?: string;
  analysisArchetype?: AnalysisArchetype;
  annualPeriods?: FinancialPeriod[];
  trailingTwelveMonths?: FinancialPeriod;
  diagnostics?: AnalysisDiagnostics;
};

export type AnalysisInput = {
  company: CompanySearchResult;
  market: MarketSnapshot | null;
  fundamentals: CompanyFundamentals | null;
  analysisType: AnalysisType;
  investmentProfile: InvestmentProfile;
  providerDiagnostics?: ProviderDiagnostic[];
};

export type Metrics = {
  revenueGrowth1y: number | null;
  revenueCagr3y: number | null;
  epsGrowth1y: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  fcf: number | null;
  fcfMargin: number | null;
  cashConversion: number | null;
  debtToEquity: number | null;
  debtToAssets: number | null;
  netDebt: number | null;
  interestCoverage: number | null;
  earningsYield: number | null;
  fcfYield: number | null;
  priceMomentum1y: number | null;
  priceMomentum3m: number | null;
};

export type ScoreDimensionKey =
  | "growth"
  | "profitability"
  | "financialHealth"
  | "valuation"
  | "cashFlow"
  | "earningsQuality"
  | "quality"
  | "momentum"
  | "risk";

export type MissingDataSeverity = "low" | "medium" | "high";
export type MissingDataImpact =
  | "metric"
  | "score"
  | "dcf"
  | "scenario"
  | "recommendation";

export type MissingDataItem = {
  field: string;
  reason: string;
  impact: MissingDataImpact;
  severity: MissingDataSeverity;
};

export type ScoreContributor = {
  label: string;
  value: number | null;
  score: number | null;
  weight: number;
  impact: "positive" | "negative" | "neutral";
  availability?: "available" | "missing" | "unsuitable";
  source?: string;
  period?: string;
};

export type ScoreDimension = {
  key: ScoreDimensionKey;
  label: string;
  score: number | null;
  weight: number;
  rationale?: string;
  contributors?: ScoreContributor[];
  missingData?: MissingDataItem[];
  rawScore?: number | null;
  adjustedScore?: number | null;
  coverage?: number;
  plannedWeight?: number;
  availableWeight?: number;
};

export type StockBoxScore = {
  score: number | null;
  personalizedScore: number | null;
  confidence: number;
  dimensions: ScoreDimension[];
  missingData: string[];
};

export type Flag = {
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  detail: string;
  metric?: keyof Metrics;
};

export type DcfAssumptions = {
  startingFcf: number;
  years: number;
  growthRate: number;
  discountRate: number;
  terminalGrowthRate: number;
  marginOfSafety: number;
};

export type DcfRange = {
  suitable: boolean;
  reason?: string;
  bear: number | null;
  base: number | null;
  bull: number | null;
  assumptions?: DcfAssumptions;
};

export type Scenario = {
  caseName: "Bull" | "Base" | "Bear";
  assumptions: string[];
  drivers: string[];
  risks: string[];
  qualitativeOutcome: string;
  confidence: number;
};

export type AnalysisReport = {
  id: string;
  ticker: string;
  companyName: string;
  analysisType: AnalysisType;
  investmentProfile: InvestmentProfile;
  generatedAt: string;
  oneSentence: string;
  summary: string;
  recommendation: Recommendation;
  shortTermAssessment: string;
  longTermAssessment: string;
  metrics: Metrics;
  score: StockBoxScore;
  dcf: DcfRange;
  redFlags: Flag[];
  greenFlags: Flag[];
  scenarios: Scenario[];
  sources: AnalysisSource[];
  disclaimer: string;
  modelVersion?: string;
  reportSchemaVersion?: string;
  analysisArchetype?: AnalysisArchetype;
  dataCoverage?: number;
  dataAsOf?: string | null;
  confidenceBreakdown?: ConfidenceBreakdown;
  providerDiagnostics?: ProviderDiagnostic[];
  engine?: FinancialAnalysisResult;
};

export type CompanyProfile = {
  ticker?: string;
  name?: string;
  sector?: Sector;
  industry?: string;
  currency?: string;
  investmentProfile?: InvestmentProfile;
  analysisArchetype?: AnalysisArchetype;
  sic?: string;
};

export type FinancialPeriod = {
  fiscalYear?: number;
  periodEndDate?: string;
  periodStartDate?: string;
  filedDate?: string;
  form?: string;
  currency?: string;
  revenue?: number | null;
  grossProfit?: number | null;
  costOfRevenue?: number | null;
  operatingIncome?: number | null;
  ebitda?: number | null;
  netIncome?: number | null;
  epsDiluted?: number | null;
  operatingCashFlow?: number | null;
  capitalExpenditures?: number | null;
  freeCashFlow?: number | null;
  cashAndEquivalents?: number | null;
  totalDebt?: number | null;
  totalEquity?: number | null;
  totalAssets?: number | null;
  totalLiabilities?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  interestExpense?: number | null;
  pretaxIncome?: number | null;
  incomeTaxExpense?: number | null;
  depreciationAndAmortization?: number | null;
  dividendsPaid?: number | null;
  sharesDiluted?: number | null;
  currentSharesOutstanding?: number | null;
  restrictedCash?: number | null;
  marketableSecurities?: number | null;
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  commercialPaper?: number | null;
  currentPortionLongTermDebt?: number | null;
  stockBasedCompensation?: number | null;
  researchAndDevelopment?: number | null;
  accountsReceivable?: number | null;
  inventory?: number | null;
  netBorrowing?: number | null;
  fundsFromOperations?: number | null;
  adjustedFundsFromOperations?: number | null;
  tangibleBookValue?: number | null;
  provenance?: Record<string, MetricProvenance>;
};

export type FinancialMarketSnapshot = {
  price?: number | null;
  marketCap?: number | null;
  enterpriseValue?: number | null;
  sharesOutstanding?: number | null;
  beta?: number | null;
  currency?: string | null;
  priceDate?: string | null;
  volume?: number | null;
  yearHigh?: number | null;
  yearLow?: number | null;
  pricePerformance?: {
    oneMonth?: number | null;
    threeMonth?: number | null;
    sixMonth?: number | null;
    yearToDate?: number | null;
    oneYear?: number | null;
  };
};

export type ForwardEstimates = {
  nextYearRevenueGrowth?: number | null;
  nextYearEpsGrowth?: number | null;
  nextYearFreeCashFlowGrowth?: number | null;
};

export type DcfInputAssumptions = {
  baseFreeCashFlow?: number | null;
  forecastYears?: number | null;
  discountRate?: number | null;
  terminalGrowthRate?: number | null;
  fcfGrowthRates?: number[] | null;
  netDebt?: number | null;
  sharesOutstanding?: number | null;
  riskFreeRate?: number | null;
  equityRiskPremium?: number | null;
  countryRiskPremium?: number | null;
  preTaxCostOfDebt?: number | null;
};

export type FinancialAnalysisInput = {
  company: CompanyProfile;
  annualPeriods: FinancialPeriod[];
  trailingTwelveMonths?: FinancialPeriod;
  market?: FinancialMarketSnapshot;
  estimates?: ForwardEstimates;
  dcfAssumptions?: DcfInputAssumptions;
  analysisDate?: string;
  providerDiagnostics?: ProviderDiagnostic[];
};

export type MarginMetrics = {
  grossMargin: number | null;
  operatingMargin: number | null;
  ebitdaMargin: number | null;
  netMargin: number | null;
  freeCashFlowMargin: number | null;
  operatingCashFlowMargin: number | null;
};

export type GrowthMetrics = {
  revenueGrowthYoY: number | null;
  revenueCagr3y: number | null;
  epsGrowthYoY: number | null;
  epsCagr3y: number | null;
  freeCashFlowGrowthYoY: number | null;
  freeCashFlowCagr3y: number | null;
  revenueCagr5y: number | null;
  freeCashFlowPerShareCagr3y: number | null;
};

export type RatioMetrics = {
  currentRatio: number | null;
  debtToEquity: number | null;
  netDebt: number | null;
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  returnOnInvestedCapital: number | null;
  cashConversion: number | null;
  cashToDebt: number | null;
  equityToAssets: number | null;
  returnOnInvestedCapitalSpread: number | null;
};

export type CashFlowQualityMetrics = {
  simpleFreeCashFlow: number | null;
  fcff: number | null;
  fcfe: number | null;
  normalizedTaxRate: number | null;
  taxRateSource: "reported_normalized" | "fallback_assumption" | "unavailable";
  cfoToNetIncome: number | null;
  freeCashFlowToNetIncome: number | null;
  accrualRatio: number | null;
  stockBasedCompensationToRevenue: number | null;
  operatingMarginStability: number | null;
  grossMarginStability: number | null;
  freeCashFlowStability: number | null;
  dividendYield: number | null;
  dividendPayoutRatio: number | null;
  freeCashFlowPayoutRatio: number | null;
  dividendGrowthYoY: number | null;
  dividendCagr3y: number | null;
};

export type ValuationMetrics = {
  marketCap: number | null;
  enterpriseValue: number | null;
  priceEarnings: number | null;
  priceSales: number | null;
  priceBook: number | null;
  evSales: number | null;
  evEbitda: number | null;
  freeCashFlowYield: number | null;
  earningsYield: number | null;
  peg: number | null;
};

export type TrendMetrics = {
  operatingMarginChangeYoY: number | null;
  grossMarginChangeYoY: number | null;
  revenueAcceleration: number | null;
  sharesDilutionYoY: number | null;
};

export type FinancialMetrics = {
  latestPeriod: FinancialPeriod | null;
  previousPeriod: FinancialPeriod | null;
  margins: MarginMetrics;
  growth: GrowthMetrics;
  ratios: RatioMetrics;
  valuation: ValuationMetrics;
  trends: TrendMetrics;
  cashFlow: CashFlowQualityMetrics;
  provenance: Record<string, MetricProvenance>;
  missingData: MissingDataItem[];
};

export type ConfidenceBreakdown = {
  dataCoverage: number;
  dataFreshness: number;
  sourceQuality: number;
  reconciliation: number;
  estimateAvailability: number;
  valuationInputs: number;
};

export type ScoreResult = {
  stockBoxScore: number | null;
  personalizedScore: number | null;
  investmentProfile: InvestmentProfile;
  sector: Sector;
  analysisArchetype: AnalysisArchetype;
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  dataCoverage: number;
  dimensions: Record<ScoreDimensionKey, ScoreDimension>;
  shortTermScore: number | null;
  longTermScore: number | null;
  methodology: {
    modelVersion: string;
    sectorWeights: Record<ScoreDimensionKey, number>;
    personalizedWeights: Record<ScoreDimensionKey, number>;
  };
  missingData: MissingDataItem[];
};

export type RedFlagSeverity = "low" | "medium" | "high" | "critical";

export type RedFlag = {
  code: string;
  label: string;
  severity: RedFlagSeverity;
  metric?: string;
  value?: number | null;
  rationale: string;
};

export type RecommendationDecision = {
  rating: Recommendation;
  scoreUsed: number | null;
  confidence: number;
  rationale: string[];
  constraintsApplied: string[];
  disclosure: string;
};

export type ScenarioName = "Bull" | "Base" | "Bear";

export type DiscountedCashFlowAssumptions = {
  baseFreeCashFlow: number;
  forecastYears: number;
  discountRate: number;
  terminalGrowthRate: number;
  fcfGrowthRates: number[];
  netDebt: number;
  sharesOutstanding: number;
};

export type DiscountedCashFlowResult = {
  enterpriseValue: number;
  equityValue: number;
  perShareValue: number;
  terminalValue: number;
  presentValueOfCashFlows: number;
  presentValueOfTerminalValue: number;
  assumptions: DiscountedCashFlowAssumptions;
};

export type DcfScenarioResult = DiscountedCashFlowResult & {
  name: ScenarioName;
  confidence: number;
};

export type DcfRangeResult = {
  status: "available" | "unavailable" | "inappropriate";
  method: string;
  currency?: string;
  reason?: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  scenarios: DcfScenarioResult[];
  missingData: MissingDataItem[];
  currentPrice?: number | null;
  impliedUpside?: number | null;
  terminalValueShare?: number | null;
  sensitivity?: Array<{ discountRate: number; terminalGrowthRate: number; perShareValue: number }>;
  assumptionNotes?: string[];
  confidence?: number;
};

export type ReconciliationCheck = {
  code: string;
  status: "pass" | "warning" | "unavailable";
  message: string;
  differenceRatio?: number;
};

export type AnalysisDiagnostics = {
  latestFinancialPeriodEnd: string | null;
  latestAnnualPeriodEnd: string | null;
  dataAgeDays: number | null;
  ttmStatus: "available" | "annual_fallback" | "unavailable";
  providerDiagnostics: ProviderDiagnostic[];
};

export type AnalysisScenario = {
  name: ScenarioName;
  assumptions: string[];
  drivers: string[];
  risks: string[];
  qualitativeOutcome: string;
  valuationRange: {
    low: number;
    high: number;
    currency?: string;
  } | null;
  confidence: number;
  keyVariables: string[];
};

export type FinancialAnalysisResult = {
  modelVersion: string;
  reportSchemaVersion: string;
  analysisArchetype: AnalysisArchetype;
  metrics: FinancialMetrics;
  scores: ScoreResult;
  redFlags: RedFlag[];
  recommendation: RecommendationDecision;
  dcf: DcfRangeResult;
  scenarios: AnalysisScenario[];
  missingData: MissingDataItem[];
  dataCoverage: number;
  confidenceBreakdown: ConfidenceBreakdown;
  diagnostics: AnalysisDiagnostics;
  reconciliation: ReconciliationCheck[];
  provenance: Record<string, MetricProvenance>;
};
