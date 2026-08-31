export type AnalysisType = "summary" | "numbers" | "deep" | "research";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type UiMode = "simple" | "pro";
export type DataStatus = "current" | "stale" | "unavailable";
export type CurrencyAlignmentStatus = "aligned" | "mismatch" | "unknown";

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
  | "defensive"
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
  | "property_company"
  | "asset_manager"
  | "utility"
  | "cyclical"
  | "pre_revenue_biotech"
  | "holding_company"
  | "unknown";

export type InsurerSubtype = "property_casualty" | "life" | "reinsurance" | "mixed" | "unknown";

export type ArchetypeClassificationDiagnostics = {
  reason: string;
  source: "sic" | "description" | "fallback" | "explicit";
  confidence: number;
  ambiguous: boolean;
  candidates: AnalysisArchetype[];
};

export type MetricValueKind = "reported" | "derived" | "estimated" | "fallback";

export type FinancialPeriodBasis = "FY" | "TTM_REPORTED" | "TTM_Q1_3M" | "TTM_Q2_6M" | "TTM_Q3_9M" | "TTM_FROM_QUARTERS";

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
  accession?: string;
  sourceCik?: string;
  sourceCiks?: string[];
  periodBasis?: FinancialPeriodBasis;
  currentYtdDurationDays?: number;
  priorYtdDurationDays?: number;
  valueKind: MetricValueKind;
  inputs?: string[];
  note?: string;
};

export type ProviderDiagnostic = {
  provider: string;
  capability: "search" | "fundamentals" | "market_data" | "estimates" | "specialized" | "news" | "insider" | "filings_events" | "ownership" | "industry" | "macro" | "geopolitical" | "positioning";
  status: "available" | "partial" | "unavailable" | "unsupported";
  reason?: string;
  observedAt: string;
};

export type ProviderSourceConflict = {
  metric: string;
  periodEnd: string | null;
  primaryProvider: string;
  secondaryProvider: string;
  primaryValue?: number | string | null;
  secondaryValue?: number | string | null;
  relativeDifference?: number | null;
  severity: "medium" | "high";
  reason: string;
  kind?: "economic_disagreement" | "definition_mismatch" | "share_basis_mismatch";
  resolved?: boolean;
};

export type CompanySearchResult = {
  securityId?: string;
  issuerId?: string;
  ticker: string;
  canonicalTicker?: string;
  localTicker?: string;
  providerTickers?: string[];
  name: string;
  cik?: string;
  exchange?: string;
  mic?: string;
  marketSegment?: string;
  country?: string;
  currency?: string;
  entityId?: string;
  isin?: string;
  figi?: string;
  lei?: string;
  securityType?: "Common Stock" | "Preferred" | "ETF/Fund" | "ADR" | "Other";
  providerCapabilities?: {
    fundamentals: boolean;
    marketData: boolean;
    providerIds: string[];
  };
  analysisCapability?: {
    fundamentals: "full" | "partial" | "unavailable";
    marketData: "available" | "unavailable";
    reason?: string;
  };
  source?: string;
  sourceUpdatedAt?: string;
  searchAliases?: string[];
  primarySecurity?: boolean;
  matchType?: "exact_canonical_ticker" | "exact_provider_ticker" | "exact_alias" | "exact_company_name" | "company_name_prefix" | "token_coverage" | "ticker_typo" | "name_typo";
  matchScore?: number;
  matchConfidence?: "high" | "medium" | "low";
  matchReasons?: string[];
  primaryCandidate?: boolean;
};

export type AnalysisSource = {
  name: string;
  url: string;
  accessedAt: string;
  freshness: string;
  provider?: string;
  capability?: ProviderDiagnostic["capability"];
  dataAsOf?: string | null;
  version?: string;
};

export type MarketPricePoint = {
  date: string;
  close: number;
};

export type MarketDividendEvent = {
  date: string;
  amount: number;
  currency?: string | null;
  provider?: string;
};

export type MarketSplitEvent = {
  date: string;
  numerator: number | null;
  denominator: number | null;
  splitRatio: number | null;
  provider?: string;
};

export type HistoricalTtmEpsPoint = {
  periodEndDate: string;
  epsDiluted: number;
  currency: string | null;
  basis: "TTM_FROM_QUARTERS";
  provenance: MetricProvenance;
};

export type MarketSnapshot = {
  ticker: string;
  price: number | null;
  currency: string | null;
  date: string | null;
  volume: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  marketCap?: number | null;
  marketCapAsOf?: string | null;
  marketCapCurrency?: string | null;
  sharesOutstanding?: number | null;
  sharesOutstandingAsOf?: string | null;
  beta?: number | null;
  betaBenchmark?: string | null;
  betaMethod?: "provider_statistics" | "historical_weekly_regression" | null;
  betaObservationCount?: number | null;
  provider?: string;
  historyLength?: number;
  priceHistory?: MarketPricePoint[];
  priceHistoryBasis?: "adjusted_close" | "close";
  dividendEvents?: MarketDividendEvent[];
  splitEvents?: MarketSplitEvent[];
  performance: Partial<Record<"1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y", number>>;
};

export type AnnualFinancials = {
  fiscalYear: number;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  netIncomeCommonStockholders?: number | null;
  dilutedNetIncomeAvailableToCommon?: number | null;
  epsDiluted: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow?: number | null;
  assets: number | null;
  liabilities: number | null;
  cash: number | null;
  debt: number | null;
  equity: number | null;
  minorityInterest?: number | null;
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
  shareBasisStatus?: "cross_provider_reciprocal";
  shareBasisScale?: number;
  currentSharesOutstanding?: number | null;
  provenance?: Record<string, MetricProvenance>;
};

export type ProviderReportedValuation = {
  provider: string;
  asOfDate?: string | null;
  priceEarnings?: number | null;
  priceSales?: number | null;
  priceBook?: number | null;
  evSales?: number | null;
  evEbitda?: number | null;
  peg?: number | null;
  marketCap?: number | null;
  marketCapCurrency?: string | null;
  enterpriseValue?: number | null;
  enterpriseValueCurrency?: string | null;
  freeCashFlow?: number | null;
  freeCashFlowCurrency?: string | null;
  freeCashFlowDate?: string | null;
};

export type CompanyFundamentals = {
  ticker: string;
  name: string;
  cik?: string;
  sourceCiks?: string[];
  entityId?: string;
  sector: string | null;
  industry: string | null;
  annual: AnnualFinancials[];
  sic?: string;
  analysisArchetype?: AnalysisArchetype;
  classificationDiagnostics?: ArchetypeClassificationDiagnostics;
  annualPeriods?: FinancialPeriod[];
  trailingTwelveMonths?: FinancialPeriod;
  priorTrailingTwelveMonths?: FinancialPeriod;
  historicalTtmEps?: HistoricalTtmEpsPoint[];
  specialized?: SpecializedCompanyData;
  diagnostics?: AnalysisDiagnostics;
  reportedMarketCap?: number | null;
  reportedMarketCapDate?: string | null;
  reportedMarketCapCurrency?: string | null;
  reportedSharesOutstanding?: number | null;
  reportedSharesDate?: string | null;
  reportedValuation?: ProviderReportedValuation;
  reportingCurrency?: string | null;
  sourceConflicts?: ProviderSourceConflict[];
};

export type AnalysisInput = {
  company: CompanySearchResult;
  market: MarketSnapshot | null;
  fundamentals: CompanyFundamentals | null;
  analysisType: AnalysisType;
  investmentProfile: InvestmentProfile;
  estimates?: ForwardEstimates;
  providerDiagnostics?: ProviderDiagnostic[];
  analysisDate?: string;
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
  missingReason?: string;
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

export type HistoricalFinancialPoint = {
  fiscalYear: number;
  periodEndDate: string | null;
  currency: string | null;
  revenue: number | null;
  revenueGrowth: number | null;
  eps: number | null;
  epsGrowth: number | null;
  netIncome: number | null;
  freeCashFlow: number | null;
  freeCashFlowPerShare: number | null;
  freeCashFlowMargin: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  returnOnInvestedCapital: number | null;
  cash: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  sharesOutstanding: number | null;
  shareGrowth: number | null;
  dividendsPaid: number | null;
  dividendPerShare: number | null;
  dividendGrowth: number | null;
  payoutRatio: number | null;
  freeCashFlowPayoutRatio: number | null;
  referencePrice: number | null;
  priceEarnings: number | null;
  dividendYield: number | null;
  provenance?: Record<string, MetricProvenance>;
};

export type HistoricalValuationPoint = {
  date: string;
  priceDate: string | null;
  referencePrice: number | null;
  ttmEps: number | null;
  priceEarnings: number | null;
  priceEarningsStatus: "available" | "not_meaningful" | "unavailable";
  trailingDividendsPerShare: number | null;
  dividendPaymentCount: number;
  dividendYield: number | null;
  epsProvenance?: MetricProvenance;
};

export type HistoricalValuationWindowStats = {
  requestedYears: 1 | 3 | 5 | 10 | null;
  firstDate: string | null;
  lastDate: string | null;
  spanYears: number;
  sufficientHistory: boolean;
  observationCount: number;
  peObservationCount: number;
  priceEarningsMedian: number | null;
  priceEarningsAverage: number | null;
  dividendYieldObservationCount: number;
  dividendYieldAverage: number | null;
};

export type HistoricalValuationContext = {
  methodVersion: string;
  currentPriceEarnings: number | null;
  currentDividendYield: number | null;
  currentTrailingDividendsPerShare: number | null;
  currentDividendPaymentCount: number;
  currentPeVsReferenceMedian: number | null;
  referenceWindow: "5Y" | "MAX";
  referencePriceEarningsMedian: number | null;
  availableSince: string | null;
  oneYear?: HistoricalValuationWindowStats;
  threeYear: HistoricalValuationWindowStats;
  fiveYear: HistoricalValuationWindowStats;
  tenYear: HistoricalValuationWindowStats;
  maximum: HistoricalValuationWindowStats;
};

export type HistoricalDiscountSignalStatus = "healthy" | "warning" | "severe" | "unavailable" | "not_applicable";

export type HistoricalDiscountSignal = {
  key: "growth" | "freeCashFlow" | "roic" | "margins" | "leverage" | "dilution" | "cashConversion" | "earningsStability";
  label: string;
  status: HistoricalDiscountSignalStatus;
  detail: string;
  value: number | null;
  weight: number;
};

export type HistoricalDiscountQualityClassification =
  | "STRONG"
  | "REASONABLE"
  | "MIXED"
  | "QUESTIONABLE"
  | "MISLEADING"
  | "INSUFFICIENT DATA";

export type HistoricalDiscountQuality = {
  methodVersion: string;
  status: "discount" | "not_discount" | "insufficient";
  classification: HistoricalDiscountQualityClassification | null;
  discountToReferenceMedian: number | null;
  referenceWindow: "5Y" | "MAX" | null;
  coverage: number;
  evaluatedSignalCount: number;
  applicableSignalCount: number;
  deteriorationScore: number | null;
  signals: HistoricalDiscountSignal[];
  summary: string;
};

export type HistoricalResearchData = {
  financials: HistoricalFinancialPoint[];
  price: MarketPricePoint[];
  valuation?: HistoricalValuationPoint[];
  valuationContext?: HistoricalValuationContext;
  valuationMethodVersion?: string;
  discountQuality?: HistoricalDiscountQuality;
  revenueCagr3y: number | null;
  revenueCagr5y: number | null;
  revenueCagr10y: number | null;
  epsCagr3y: number | null;
  epsCagr5y: number | null;
  epsCagr10y: number | null;
  freeCashFlowGrowth1y?: number | null;
  freeCashFlowCagr3y?: number | null;
  freeCashFlowCagr5y?: number | null;
  freeCashFlowCagr10y?: number | null;
  dividendCagr3y: number | null;
  dividendCagr5y: number | null;
  dividendCagr10y: number | null;
  dividendYearsIncreased: number;
  dividendYearsUnchanged: number;
  dividendYearsCut: number;
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
  reportingCurrency?: string | null;
  market?: MarketSnapshot;
  historical?: HistoricalResearchData;
  forwardEstimates?: ForwardEstimates;
  dataAsOf?: string | null;
  dataStatus?: DataStatus;
  confidenceBreakdown?: ConfidenceBreakdown;
  providerDiagnostics?: ProviderDiagnostic[];
  scenarioStatus?: ScenarioStatus;
  deepReport?: DeepReport;
  research?: ResearchResult;
  researchPlan?: ResearchPlan;
  multiScores?: MultiScoreResult;
  adminQa?: AdminQaDiagnostics;
  engine?: FinancialAnalysisResult;
};

export type CompanyProfile = {
  ticker?: string;
  canonicalTicker?: string;
  entityId?: string;
  entityIdentityConfidence?: number;
  cik?: string;
  name?: string;
  sector?: Sector;
  industry?: string;
  currency?: string;
  reportingCurrency?: string;
  tradingCurrency?: string;
  investmentProfile?: InvestmentProfile;
  analysisArchetype?: AnalysisArchetype;
  classificationDiagnostics?: ArchetypeClassificationDiagnostics;
  sic?: string;
};

export type FinancialPeriod = {
  fiscalYear?: number;
  periodEndDate?: string;
  periodStartDate?: string;
  filedDate?: string;
  form?: string;
  periodBasis?: FinancialPeriodBasis;
  currentYtdDurationDays?: number;
  priorYtdDurationDays?: number;
  ttmConstructionMethod?: string;
  shareBasisStatus?: "cross_provider_reciprocal";
  shareBasisScale?: number;
  balanceSheetDate?: string;
  currency?: string;
  currencyConflict?: string[];
  revenue?: number | null;
  grossProfit?: number | null;
  costOfRevenue?: number | null;
  operatingIncome?: number | null;
  ebitda?: number | null;
  netIncome?: number | null;
  netIncomeCommonStockholders?: number | null;
  dilutedNetIncomeAvailableToCommon?: number | null;
  epsDiluted?: number | null;
  operatingCashFlow?: number | null;
  capitalExpenditures?: number | null;
  freeCashFlow?: number | null;
  cashAndEquivalents?: number | null;
  totalDebt?: number | null;
  totalEquity?: number | null;
  minorityInterest?: number | null;
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
  marketCapAsOf?: string | null;
  marketCapCurrency?: string | null;
  enterpriseValue?: number | null;
  sharesOutstanding?: number | null;
  sharesOutstandingAsOf?: string | null;
  beta?: number | null;
  betaBenchmark?: string | null;
  betaMethod?: "provider_statistics" | "historical_weekly_regression" | null;
  betaObservationCount?: number | null;
  provider?: string;
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
  priorTrailingTwelveMonths?: FinancialPeriod;
  market?: FinancialMarketSnapshot;
  reportedValuation?: ProviderReportedValuation;
  estimates?: ForwardEstimates;
  dcfAssumptions?: DcfInputAssumptions;
  analysisDate?: string;
  providerDiagnostics?: ProviderDiagnostic[];
  specialized?: SpecializedCompanyData;
  sourceConflicts?: ProviderSourceConflict[];
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
  revenueGrowthBasis: "TTM_YOY" | "ANNUAL_YOY" | "UNAVAILABLE";
  freeCashFlowGrowthBasis: "TTM_YOY" | "ANNUAL_YOY" | "UNAVAILABLE";
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
  priceTangibleBook: number | null;
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
  entityIdentity: number;
  currencyAlignment: number;
  archetypeConfidence: number;
  specializedCoverage: number | null;
  marketInputFreshness: number;
  valuationAssumptions: number;
  sourceConflict: number;
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
  specializedCoverage?: SpecializedCoverage;
  methodology: {
    modelVersion: string;
    scorePolicyVersion: string;
    benchmarkVersion: string;
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

export type ValuationAssumption = {
  value: number | number[];
  source: string;
  asOf: string | null;
  valueKind: "reported" | "market_sourced" | "configured" | "derived" | "policy" | "fallback";
  version: string;
};

export type ValuationAssumptionQuality = {
  level: "high" | "moderate" | "fallback_heavy";
  fallbackCount: number;
  centralFallbackCount: number;
  assumptions: Record<string, ValuationAssumption>;
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
  directionalSupport?: boolean;
  assumptionQuality?: ValuationAssumptionQuality;
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
  financialFlowPeriodEnd?: string | null;
  financialFlowPeriodBasis?: FinancialPeriodBasis | null;
  balanceSheetPeriodEnd?: string | null;
  marketPriceDate?: string | null;
  dataStatus: DataStatus;
  financialFlowAgeDays?: number | null;
  balanceSheetAgeDays?: number | null;
  marketPriceAgeDays?: number | null;
  marketCapAgeDays?: number | null;
  sharesOutstandingAgeDays?: number | null;
  financialFlowStatus?: "current" | "stale" | "unavailable";
  balanceSheetStatus?: "current" | "stale" | "unavailable";
  marketPriceStatus?: "current" | "stale" | "unavailable";
  marketCapStatus?: "current" | "stale" | "unavailable";
  sharesOutstandingStatus?: "current" | "stale" | "unavailable";
  currencyAlignment?: CurrencyAlignmentStatus;
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
  canonicalInputFingerprint: string;
  reportSchemaVersion: string;
  analysisArchetype: AnalysisArchetype;
  classificationDiagnostics?: ArchetypeClassificationDiagnostics;
  currencyAlignment: CurrencyAlignmentStatus;
  dataStatus: DataStatus;
  metrics: FinancialMetrics;
  scores: ScoreResult;
  redFlags: RedFlag[];
  recommendation: RecommendationDecision;
  dcf: DcfRangeResult;
  scenarios: AnalysisScenario[];
  scenarioStatus: ScenarioStatus;
  missingData: MissingDataItem[];
  dataCoverage: number;
  confidenceBreakdown: ConfidenceBreakdown;
  diagnostics: AnalysisDiagnostics;
  reconciliation: ReconciliationCheck[];
  provenance: Record<string, MetricProvenance>;
  sourceConflicts: ProviderSourceConflict[];
};

export type ScenarioStatus = "valuation" | "qualitative_research" | "insufficient_data";

export type SpecializedMetric = {
  value: number | null;
  unit?: string;
  dataAsOf?: string | null;
  provenance?: MetricProvenance;
  definition?: string;
};

export type BankSpecializedMetrics = {
  kind: "bank";
  netInterestIncome: SpecializedMetric;
  netInterestMargin: SpecializedMetric;
  grossLoans: SpecializedMetric;
  deposits: SpecializedMetric;
  depositGrowth: SpecializedMetric;
  netInterestIncomeGrowth: SpecializedMetric;
  grossLoanGrowth: SpecializedMetric;
  fundingCost: SpecializedMetric;
  cet1CapitalRatio: SpecializedMetric;
  tangibleCommonEquity: SpecializedMetric;
  tangibleBookValuePerShare: SpecializedMetric;
  nonPerformingLoans: SpecializedMetric;
  netChargeOffs: SpecializedMetric;
  loanLossProvisions: SpecializedMetric;
  efficiencyRatio: SpecializedMetric;
  returnOnAssets: SpecializedMetric;
  returnOnEquity: SpecializedMetric;
  returnOnTangibleCommonEquity: SpecializedMetric;
};

export type InsurerSpecializedMetrics = {
  kind: "insurer";
  premiumGrowth: SpecializedMetric;
  combinedRatio: SpecializedMetric;
  lossRatio: SpecializedMetric;
  expenseRatio: SpecializedMetric;
  bookValue: SpecializedMetric;
  tangibleBookValue: SpecializedMetric;
  returnOnEquity: SpecializedMetric;
  regulatoryCapitalRatio: SpecializedMetric;
  reserveDevelopment: SpecializedMetric;
};

export type ReitSpecializedMetrics = {
  kind: "reit";
  fundsFromOperations: SpecializedMetric;
  fundsFromOperationsPerShare: SpecializedMetric;
  adjustedFundsFromOperations: SpecializedMetric & { companyDefined: boolean };
  adjustedFundsFromOperationsPerShare: SpecializedMetric & { companyDefined: boolean };
  fundsFromOperationsGrowth: SpecializedMetric;
  adjustedFundsFromOperationsGrowth: SpecializedMetric;
  adjustedFundsFromOperationsPayout: SpecializedMetric;
  dividendCoverage: SpecializedMetric;
  occupancy: SpecializedMetric;
  sameStoreNoiGrowth: SpecializedMetric;
  netDebtToEbitdare: SpecializedMetric;
  debtMaturities: SpecializedMetric;
  fixedChargeCoverage: SpecializedMetric;
  netAssetValue: SpecializedMetric;
};

export type SpecializedCompanyData = BankSpecializedMetrics | InsurerSpecializedMetrics | ReitSpecializedMetrics;

export type SpecializedCoverage = {
  overall: number;
  required: string[];
  available: string[];
  missing: string[];
  insurerSubtype?: InsurerSubtype;
};

export type EvidenceKind =
  | "reported_fact"
  | "derived_metric"
  | "estimate"
  | "management_guidance"
  | "external_estimate"
  | "model_assumption"
  | "qualitative_inference";

export type SourceTier =
  | "regulatory_filing"
  | "company_ir"
  | "official_regulator"
  | "exchange"
  | "financial_provider"
  | "reputable_news"
  | "secondary_source";

export type ResearchEvidence = {
  id: string;
  kind: EvidenceKind;
  sourceTier: SourceTier;
  title: string;
  source: AnalysisSource;
  excerpt?: string;
  dataAsOf?: string | null;
};

export type ResearchFinding = {
  statement: string;
  evidenceIds: string[];
  confidence: number;
};

export type ResearchModuleStatus = "available" | "partial" | "unavailable" | "unsupported";

export type ResearchLayerId =
  | "fundamental" | "valuation" | "market" | "filings_events" | "earnings_expectations"
  | "news_events" | "insider_ownership" | "industry" | "macro" | "geopolitical" | "positioning";

export type ResearchLayerStatus = {
  layer: ResearchLayerId;
  label: string;
  status: ResearchModuleStatus;
  coverage: number;
  confidence: number;
  dataAsOf: string | null;
  reason?: string;
  evidenceIds: string[];
};

export type ResearchSignal = {
  id: string;
  category: "quality" | "opportunity" | "inflection";
  statement: string;
  metric: string;
  current: number | null;
  previous: number | null;
  change: number | null;
  periodCurrent: string | null;
  periodPrevious: string | null;
  direction: "positive" | "negative" | "change";
  confidence: number;
  source?: MetricProvenance;
  evidenceIds: string[];
};

export type ResearchScoreContributor = {
  key: string;
  label: string;
  value: number | null;
  score: number | null;
  weight: number;
  coverage: number;
  status: "available" | "missing" | "unsuitable";
  reason?: string;
};

export type ResearchScore = {
  score: number | null;
  confidence: number;
  coverage: number;
  contributors: ResearchScoreContributor[];
  positiveSignals: ResearchSignal[];
  negativeSignals: ResearchSignal[];
};

export type ResearchEventCategory =
  | "earnings_results" | "acquisition_disposition" | "financing_capital" | "management_governance"
  | "impairment_restructuring" | "material_agreement" | "guidance_outlook" | "other_material_event";

export type ResearchEvent = {
  category: ResearchEventCategory;
  form: "10-K" | "10-Q" | "8-K" | "6-K" | "20-F";
  filingDate: string;
  accession: string;
  primaryDocument: string | null;
  url: string;
  items: string[];
  source: string;
  provider: string;
};

export type ResearchModuleId =
  | "fundamental_core"
  | "business_model_moat"
  | "segments_geography"
  | "management_capital_allocation"
  | "earnings_guidance"
  | "analyst_expectations"
  | "news_material_events"
  | "insider_transactions"
  | "ownership_positioning"
  | "competitor_industry"
  | "supply_chain_customers"
  | "macro_exposure"
  | "geopolitical_exposure"
  | "inflection_turnaround"
  | "advanced_valuation_scenarios";

export type ResearchModuleResult = {
  id: ResearchModuleId;
  title: string;
  status: ResearchModuleStatus;
  coverage: number;
  confidence: number;
  dataAsOf: string | null;
  findings: ResearchFinding[];
  positiveSignals: string[];
  negativeSignals: string[];
  unknowns: string[];
  sources: ResearchEvidence[];
};

export type DeepSectionId =
  | "executive_thesis" | "company_overview" | "business_model" | "revenue_profit_drivers"
  | "segment_analysis" | "geographic_exposure" | "historical_financial_trend" | "growth_quality"
  | "margin_development" | "capital_efficiency" | "balance_sheet" | "cash_flow" | "capital_allocation"
  | "share_dilution_sbc" | "archetype_kpis" | "valuation" | "peer_comparison" | "historical_valuation"
  | "risk_analysis" | "catalysts" | "scenarios" | "improve_case" | "break_thesis" | "watch_next"
  | "data_confidence" | "sources_provenance" | "missing_data";

export type DeepReportSection = {
  id: DeepSectionId;
  title: string;
  status: ResearchModuleStatus;
  findings: ResearchFinding[];
  unknowns: string[];
};

export type DeepReport = { sections: DeepReportSection[] };

export type MaterialNewsEventType =
  | "earnings" | "guidance_raise" | "guidance_cut" | "major_order" | "contract_loss"
  | "acquisition" | "divestment" | "capital_raise" | "buyback" | "dividend_change"
  | "management_change" | "regulatory_event" | "fda_ema_event" | "lawsuit_investigation"
  | "credit_rating" | "cybersecurity_event" | "factory_supply_disruption" | "product_launch"
  | "customer_win_loss" | "short_seller_report" | "geopolitical_exposure_event" | "unclassified";

export type MaterialNewsEvent = {
  eventType: MaterialNewsEventType;
  materiality: "low" | "medium" | "high";
  direction: "positive" | "negative" | "mixed" | "neutral";
  confidence: number;
  timeHorizon: "near_term" | "medium_term" | "long_term" | "unknown";
  affectedFinancialDriver: string | null;
  evidence: ResearchEvidence;
};

export type InsiderTransactionType = "open_market_buy" | "open_market_sell" | "option_exercise" | "tax_related" | "automatic_plan" | "other";
export type InsiderTransaction = {
  transactionType: InsiderTransactionType;
  insiderRole: string | null;
  shares: number | null;
  value: number | null;
  ownershipChange: number | null;
  date: string;
  automaticPlan: boolean;
  evidence?: ResearchEvidence;
};

export type InsiderContextResult = {
  direction: "positive" | "negative" | "mixed" | "neutral" | "unknown";
  confidence: number;
  clusterBuying: boolean;
  clusterSelling: boolean;
  findings: string[];
};

export type InflectionStage = "deteriorating" | "bottoming" | "early_turnaround" | "confirmed_turnaround" | "accelerating" | "mature" | "unknown";
export type InflectionScoreResult = {
  inflectionScore: number | null;
  direction: "positive" | "negative" | "mixed" | "unknown";
  confidence: number;
  supportingSignals: string[];
  contradictingSignals: string[];
  estimatedStage: InflectionStage;
};

export type MultiScoreResult = {
  businessQualityScore: number | null;
  opportunityScore: number | null;
  inflectionScore: InflectionScoreResult;
  riskScore: number | null;
};

export type ResearchPlan = {
  investmentHorizon: "short" | "medium" | "long" | "unspecified";
  nextSuggestedReview: string | null;
  whatToWatch: string[];
  improveCase: string[];
  weakenCase: string[];
  invalidationTriggers: string[];
  upcomingEvents: string[];
  valuationReviewZone: string | null;
};

export type ResearchResult = {
  modules: ResearchModuleResult[];
  evidence: ResearchEvidence[];
  quality: ResearchScore;
  opportunity: ResearchScore;
  inflection: ResearchScore;
  inflectionDetail: InflectionScoreResult;
  confidence: number;
  coverage: number;
  layers: ResearchLayerStatus[];
  signals: ResearchSignal[];
  events: ResearchEvent[];
  positives: ResearchSignal[];
  negatives: ResearchSignal[];
  changes: ResearchSignal[];
  generatedAt: string;
};

export type ResearchLayerPayload<T = unknown> = {
  data: T;
  dataAsOf: string | null;
  coverage: number;
  confidence: number;
  evidence: ResearchEvidence[];
};

export type AdminQaDiagnostics = {
  providerAttempts: ProviderDiagnostic[];
  selectedProviders: string[];
  providerFailures: ProviderDiagnostic[];
  fallbacks: string[];
  missingDataReasons: MissingDataItem[];
  classificationDiagnostics: ArchetypeClassificationDiagnostics | null;
  timingsMs: Record<string, number>;
  sourceConflicts: ProviderSourceConflict[];
  currencyState: CurrencyAlignmentStatus;
  specializedCoverage: number | null;
  valuationSupport: "directional" | "illustrative" | "specialized" | "unavailable";
};

export type QaFlag =
  | "STALE_DATA" | "LOW_COVERAGE" | "ENTITY_MISMATCH" | "UNSUPPORTED_MARKET" | "WRONG_ARCHETYPE"
  | "TTM_FALLBACK" | "PERIOD_MISMATCH" | "RECONCILIATION_FAIL" | "MARKET_PROVIDER_ERROR"
  | "CURRENCY_MISMATCH" | "SPECIALIZED_DATA_MISSING" | "VALUATION_UNAVAILABLE" | "SCENARIO_UNSUPPORTED" | "SOURCE_CONFLICT"
  | "FALLBACK_USED" | "DATA_UNAVAILABLE" | "FUTURE_DATA" | "ARCHETYPE_UNCERTAIN";

export type BatchQaResult = {
  batchId: string;
  rerunKey: string;
  modelVersion: string;
  scorePolicyVersion: string;
  benchmarkVersion: string;
  canonicalInputFingerprint: string;
  providerVersions: Record<string, string>;
  analysisTimestamp: string;
  canonicalEntity: string;
  archetype: AnalysisArchetype;
  coverage: number;
  confidence: number;
  score: number | null;
  rating: Recommendation;
  flags: QaFlag[];
};
