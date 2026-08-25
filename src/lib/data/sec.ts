import { classifyCompany } from "@/lib/analysis/archetypes";
import type {
  AnalysisArchetype,
  AnnualFinancials,
  CompanyFundamentals,
  CompanySearchResult,
  FinancialPeriod,
  MetricProvenance,
  SpecializedCompanyData,
  SpecializedMetric,
} from "@/lib/analysis/types";
import { getSecUserAgent } from "@/lib/env/server";
import { commonCompanies } from "./common-companies";
import { entityIdentityFor } from "./entity-identities";
import { providerDiagnostic, type AdapterResult, type FundamentalsProvider, type ProviderCapabilities } from "./providers";
import {
  resolveAnnualFacts,
  resolveInstantFacts,
  resolveTtmFact,
  resolveTtmFacts,
  secFactProvenance,
  SEC_CONCEPTS,
  type ConceptSpec,
  type ResolvedSecFact,
  type SecCompanyFacts,
} from "./sec-resolver";

type SecTickerEntry = { cik_str: number; ticker: string; title: string };
type SecSubmissions = { sic?: string; sicDescription?: string; exchanges?: string[] };

const secBase = "https://data.sec.gov";
const SEC_TIMEOUT_MS = 10_000;
const SEC_RETRIES = 2;

export const SEC_CAPABILITIES: ProviderCapabilities = {
  supportedCountries: ["US", "SEC foreign private issuers with standardized Companyfacts"],
  supportedExchanges: ["NYSE", "Nasdaq", "NYSE American", "SEC registrants"],
  supportsFundamentals: true,
  supportsMarketData: false,
  supportsEstimates: false,
};

function secHeaders() {
  const userAgent = getSecUserAgent();
  if (!userAgent) return null;
  return { "User-Agent": userAgent, Accept: "application/json", "Accept-Encoding": "gzip, deflate" };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchSecJson<T>(url: string, revalidate: number): Promise<T | null> {
  const headers = secHeaders();
  if (!headers) return null;
  for (let attempt = 0; attempt <= SEC_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEC_TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers, signal: controller.signal, next: { revalidate } });
      if (response.ok) return await response.json() as T;
      if (response.status !== 429 && response.status < 500) return null;
      if (attempt === SEC_RETRIES) {
        console.error("SEC provider request failed", { status: response.status, endpoint: new URL(url).pathname });
        return null;
      }
    } catch (error) {
      if (attempt === SEC_RETRIES) {
        console.error("SEC provider request failed", {
          reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
          endpoint: new URL(url).pathname,
        });
        return null;
      }
    } finally {
      clearTimeout(timeout);
    }
    await delay(200 * 2 ** attempt);
  }
  return null;
}

export function padCik(cik: string | number) {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

export async function fetchSecTickerUniverse(): Promise<CompanySearchResult[]> {
  const data = await fetchSecJson<Record<string, SecTickerEntry>>(
    "https://www.sec.gov/files/company_tickers.json",
    60 * 60 * 24,
  );
  if (!data) return commonCompanies;
  return Object.values(data).map((entry) => ({
    ticker: entry.ticker,
    name: entry.title,
    cik: padCik(entry.cik_str),
    exchange: "US",
    country: "US",
  }));
}

export function mergeSecCompanyFacts(factSets: SecCompanyFacts[]): SecCompanyFacts {
  const merged: NonNullable<SecCompanyFacts["facts"]> = {};
  for (const factSet of factSets) {
    const sourceCik = padCik(factSet.cik);
    for (const [taxonomy, concepts] of Object.entries(factSet.facts ?? {})) {
      const targetTaxonomy = (merged[taxonomy as keyof typeof merged] ??= {});
      for (const [concept, definition] of Object.entries(concepts ?? {})) {
        const targetConcept = (targetTaxonomy[concept] ??= { units: {} });
        const targetUnits = (targetConcept.units ??= {});
        for (const [unit, rows] of Object.entries(definition.units ?? {})) {
          targetUnits[unit] = [
            ...(targetUnits[unit] ?? []),
            ...(rows ?? []).map((row) => ({ ...row, sourceCik: row.sourceCik ?? sourceCik })),
          ];
        }
      }
    }
  }
  return {
    cik: factSets.at(-1)?.cik ?? 0,
    entityName: factSets.at(-1)?.entityName ?? "Unknown SEC registrant",
    facts: merged,
  };
}

type FactMaps = Record<keyof typeof SEC_CONCEPTS, Map<string, ResolvedSecFact>>;

function resolveMaps(facts: SecCompanyFacts, includeQuarterlyInstants = false): FactMaps {
  return Object.fromEntries(
    Object.entries(SEC_CONCEPTS).map(([key, spec]) => [
      key,
      includeQuarterlyInstants && spec.kind === "instant"
        ? resolveInstantFacts(facts, spec as ConceptSpec)
        : resolveAnnualFacts(facts, spec as ConceptSpec),
    ]),
  ) as FactMaps;
}

function factAt(map: Map<string, ResolvedSecFact>, end: string): ResolvedSecFact | undefined {
  return map.get(end);
}

function latestAtOrBefore(map: Map<string, ResolvedSecFact>, end: string): ResolvedSecFact | undefined {
  return [...map.values()].filter((fact) => fact.end <= end).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
}

function debtAt(maps: FactMaps, end: string): { value: number | null; provenance?: MetricProvenance } {
  const aggregate = factAt(maps.totalDebt, end);
  if (aggregate) return { value: aggregate.val, provenance: secFactProvenance(aggregate) };
  const shortTerm = factAt(maps.shortTermDebt, end);
  const longTerm = factAt(maps.longTermDebt, end);
  if (shortTerm && longTerm) {
    return {
      value: shortTerm.val + longTerm.val,
      provenance: {
        source: "SEC Companyfacts",
        provider: "sec",
        valueKind: "derived",
        periodEnd: end,
        inputs: [shortTerm.concept, longTerm.concept],
        note: "Total interest-bearing debt from current borrowings and non-current debt.",
      },
    };
  }
  const commercialPaper = factAt(maps.commercialPaper, end);
  const currentPortion = factAt(maps.currentPortionLongTermDebt, end);
  if (!commercialPaper || !currentPortion || !longTerm) return { value: null };
  return {
    value: commercialPaper.val + currentPortion.val + longTerm.val,
    provenance: {
      source: "SEC Companyfacts",
      provider: "sec",
      valueKind: "derived",
      periodEnd: end,
      inputs: [commercialPaper.concept, currentPortion.concept, longTerm.concept],
      note: "Total interest-bearing debt from non-overlapping commercial paper, current maturities and non-current debt.",
    },
  };
}

function periodFromMaps(maps: FactMaps, end: string): FinancialPeriod {
  const get = (key: keyof FactMaps) => factAt(maps[key], end);
  const provenance: Record<string, MetricProvenance> = {};
  const value = (key: keyof FactMaps, output: string = key): number | null => {
    const fact = get(key);
    if (!fact) return null;
    provenance[String(output)] = secFactProvenance(fact);
    return fact.val;
  };
  const revenue = value("revenue");
  const costOfRevenue = value("costOfRevenue");
  let grossProfit = value("grossProfit");
  if (grossProfit === null && revenue !== null && costOfRevenue !== null) {
    grossProfit = revenue - costOfRevenue;
    provenance.grossProfit = { source: "StockBox SEC resolver", provider: "sec", valueKind: "derived", periodEnd: end, inputs: ["revenue", "costOfRevenue"] };
  }
  const operatingIncome = value("operatingIncome");
  const depreciation = value("depreciationAndAmortization");
  const debt = debtAt(maps, end);
  if (debt.provenance) provenance.totalDebt = debt.provenance;
  const primary = get("revenue") ?? get("netIncome") ?? get("assets") ?? get("operatingCashFlow");
  return {
    fiscalYear: primary?.fy ?? Number(end.slice(0, 4)),
    periodStartDate: primary?.start,
    periodEndDate: end,
    filedDate: primary?.filed,
    form: primary?.form,
    periodBasis: "FY",
    balanceSheetDate: end,
    currency: primary?.unit === "USD" ? "USD" : undefined,
    revenue,
    costOfRevenue,
    grossProfit,
    operatingIncome,
    ebitda: operatingIncome !== null && depreciation !== null ? operatingIncome + depreciation : null,
    netIncome: value("netIncome"),
    pretaxIncome: value("pretaxIncome"),
    incomeTaxExpense: value("incomeTaxExpense"),
    epsDiluted: value("epsDiluted"),
    sharesDiluted: value("sharesDiluted"),
    operatingCashFlow: value("operatingCashFlow"),
    capitalExpenditures: value("capitalExpenditures"),
    interestExpense: value("interestExpense"),
    depreciationAndAmortization: depreciation,
    dividendsPaid: value("dividendsPaid"),
    stockBasedCompensation: value("stockBasedCompensation"),
    researchAndDevelopment: value("researchAndDevelopment"),
    totalAssets: value("assets", "totalAssets"),
    totalLiabilities: value("liabilities", "totalLiabilities"),
    totalEquity: value("equity", "totalEquity"),
    cashAndEquivalents: value("cash", "cashAndEquivalents"),
    restrictedCash: value("restrictedCash"),
    totalDebt: debt.value,
    shortTermDebt: value("shortTermDebt"),
    longTermDebt: value("longTermDebt"),
    commercialPaper: value("commercialPaper"),
    currentPortionLongTermDebt: value("currentPortionLongTermDebt"),
    currentAssets: value("currentAssets"),
    currentLiabilities: value("currentLiabilities"),
    accountsReceivable: value("accountsReceivable"),
    inventory: value("inventory"),
    currentSharesOutstanding: value("currentShares"),
    provenance,
  };
}

function sharesForPeriod(maps: FactMaps, targetEnd: string, filingAccession?: string): ResolvedSecFact | undefined {
  const exact = factAt(maps.currentShares, targetEnd);
  if (exact) return exact;
  if (!filingAccession) return undefined;
  return [...maps.currentShares.values()]
    .filter((fact) => fact.accn === filingAccession)
    .sort((left, right) => left.end.localeCompare(right.end))
    .at(-1);
}

function balanceSnapshotAt(maps: FactMaps, targetEnd: string, filingAccession?: string): Partial<FinancialPeriod> {
  const anchor = latestAtOrBefore(maps.assets, targetEnd)?.end
    ?? latestAtOrBefore(maps.equity, targetEnd)?.end
    ?? latestAtOrBefore(maps.cash, targetEnd)?.end;
  if (!anchor) return {};
  const provenance: Record<string, MetricProvenance> = {};
  const value = (key: keyof FactMaps, output: string = key) => {
    const fact = factAt(maps[key], anchor);
    if (!fact) return null;
    provenance[output] = secFactProvenance(fact);
    return fact.val;
  };
  const debt = debtAt(maps, anchor);
  if (debt.provenance) provenance.totalDebt = debt.provenance;
  const currentShares = sharesForPeriod(maps, anchor, filingAccession);
  if (currentShares) provenance.currentSharesOutstanding = secFactProvenance(currentShares);
  return {
    balanceSheetDate: anchor,
    totalAssets: value("assets", "totalAssets"),
    totalLiabilities: value("liabilities", "totalLiabilities"),
    totalEquity: value("equity", "totalEquity"),
    cashAndEquivalents: value("cash", "cashAndEquivalents"),
    restrictedCash: value("restrictedCash"),
    totalDebt: debt.value,
    shortTermDebt: value("shortTermDebt"),
    longTermDebt: value("longTermDebt"),
    commercialPaper: value("commercialPaper"),
    currentPortionLongTermDebt: value("currentPortionLongTermDebt"),
    currentAssets: value("currentAssets"),
    currentLiabilities: value("currentLiabilities"),
    accountsReceivable: value("accountsReceivable"),
    inventory: value("inventory"),
    currentSharesOutstanding: currentShares?.val ?? null,
    provenance,
  };
}

const TTM_FLOW_KEYS = [
  "revenue", "costOfRevenue", "grossProfit", "operatingIncome", "netIncome", "pretaxIncome",
  "incomeTaxExpense", "operatingCashFlow", "capitalExpenditures", "interestExpense",
  "depreciationAndAmortization", "dividendsPaid", "stockBasedCompensation", "researchAndDevelopment",
] as const;

type TtmFlowKey = typeof TTM_FLOW_KEYS[number];

const TTM_REQUIREMENT_PROFILES: Record<AnalysisArchetype, readonly TtmFlowKey[]> = {
  standard: ["revenue", "netIncome"],
  software_growth: ["revenue", "netIncome"],
  cyclical: ["revenue", "netIncome"],
  bank: ["revenue", "netIncome"],
  insurer: ["revenue", "netIncome"],
  reit: ["revenue", "netIncome"],
  utility: ["revenue", "netIncome"],
  pre_revenue_biotech: ["netIncome"],
  holding_company: ["revenue", "netIncome"],
  unknown: ["revenue", "netIncome"],
};

function hasComparableTtmDuration(anchor: ResolvedSecFact, candidate: ResolvedSecFact): boolean {
  return candidate.end === anchor.end
    && candidate.periodBasis === anchor.periodBasis
    && Number.isFinite(anchor.currentYtdDurationDays)
    && Number.isFinite(candidate.currentYtdDurationDays)
    && Number.isFinite(anchor.priorYtdDurationDays)
    && Number.isFinite(candidate.priorYtdDurationDays)
    && Math.abs((anchor.currentYtdDurationDays as number) - (candidate.currentYtdDurationDays as number)) <= 15
    && Math.abs((anchor.priorYtdDurationDays as number) - (candidate.priorYtdDurationDays as number)) <= 15;
}

function buildTtmPeriods(
  facts: SecCompanyFacts,
  instantMaps: FactMaps,
  archetype: AnalysisArchetype,
): {
  current?: FinancialPeriod;
  prior?: FinancialPeriod;
} {
  const series = Object.fromEntries(
    TTM_FLOW_KEYS.map((key) => [key, resolveTtmFacts(facts, SEC_CONCEPTS[key] as ConceptSpec)]),
  ) as Record<TtmFlowKey, ResolvedSecFact[]>;
  const requiredKeys = TTM_REQUIREMENT_PROFILES[archetype];
  const anchorKey = requiredKeys[0];
  const coherent = series[anchorKey].flatMap((anchorFact) => {
    if (!anchorFact.periodBasis) return [];
    const requiredFacts = requiredKeys.map((key) =>
      series[key].find((fact) => hasComparableTtmDuration(anchorFact, fact))
    );
    if (requiredFacts.some((fact) => !fact)) return [];
    const resolved = Object.fromEntries(TTM_FLOW_KEYS.map((key) => [
      key,
      series[key].find((fact) => hasComparableTtmDuration(anchorFact, fact)) ?? null,
    ])) as Record<TtmFlowKey, ResolvedSecFact | null>;
    const provenance: Record<string, MetricProvenance> = {};
    for (const [key, fact] of Object.entries(resolved)) if (fact) provenance[key] = secFactProvenance(fact, "derived");
    const value = (key: keyof typeof resolved) => resolved[key]?.val ?? null;
    const revenue = value("revenue");
    const cost = value("costOfRevenue");
    const reportedGross = value("grossProfit");
    const grossProfit = reportedGross ?? (revenue !== null && cost !== null ? revenue - cost : null);
    if (reportedGross === null && grossProfit !== null) {
      provenance.grossProfit = {
        source: "StockBox SEC resolver",
        provider: "sec",
        valueKind: "derived",
        periodEnd: anchorFact.end,
        periodBasis: anchorFact.periodBasis,
        currentYtdDurationDays: anchorFact.currentYtdDurationDays,
        priorYtdDurationDays: anchorFact.priorYtdDurationDays,
        inputs: ["revenue", "costOfRevenue"],
      };
    }
    const balance = balanceSnapshotAt(instantMaps, anchorFact.end, anchorFact.accn);
    return [{
      ...balance,
      fiscalYear: undefined,
      periodStartDate: undefined,
      periodEndDate: anchorFact.end,
      filedDate: anchorFact.filed,
      form: "TTM",
      periodBasis: anchorFact.periodBasis,
      currentYtdDurationDays: anchorFact.currentYtdDurationDays,
      priorYtdDurationDays: anchorFact.priorYtdDurationDays,
      ttmConstructionMethod: anchorFact.ttmConstructionMethod,
      currency: anchorFact.unit === "USD" ? "USD" : undefined,
      revenue,
      costOfRevenue: cost,
      grossProfit,
      operatingIncome: value("operatingIncome"),
      ebitda: value("operatingIncome") !== null && value("depreciationAndAmortization") !== null
        ? (value("operatingIncome") as number) + (value("depreciationAndAmortization") as number)
        : null,
      netIncome: value("netIncome"),
      pretaxIncome: value("pretaxIncome"),
      incomeTaxExpense: value("incomeTaxExpense"),
      operatingCashFlow: value("operatingCashFlow"),
      capitalExpenditures: value("capitalExpenditures"),
      interestExpense: value("interestExpense"),
      depreciationAndAmortization: value("depreciationAndAmortization"),
      dividendsPaid: value("dividendsPaid"),
      stockBasedCompensation: value("stockBasedCompensation"),
      researchAndDevelopment: value("researchAndDevelopment"),
      provenance: { ...(balance.provenance ?? {}), ...provenance },
    } satisfies FinancialPeriod];
  }).sort((left, right) => (left.periodEndDate ?? "").localeCompare(right.periodEndDate ?? ""));
  const current = coherent.at(-1);
  if (!current?.periodEndDate) return {};
  const prior = coherent
    .filter((candidate) => candidate.periodEndDate && candidate.periodBasis === current.periodBasis)
    .filter((candidate) => {
      const gap = (Date.parse(current.periodEndDate as string) - Date.parse(candidate.periodEndDate as string)) / 86_400_000;
      return gap >= 330 && gap <= 400;
    })
    .at(-1);
  return { current, prior };
}

function toLegacy(period: FinancialPeriod): AnnualFinancials {
  return {
    fiscalYear: period.fiscalYear ?? Number(period.periodEndDate?.slice(0, 4)),
    periodEndDate: period.periodEndDate,
    revenue: period.revenue ?? null,
    grossProfit: period.grossProfit ?? null,
    costOfRevenue: period.costOfRevenue ?? null,
    operatingIncome: period.operatingIncome ?? null,
    ebitda: period.ebitda ?? null,
    netIncome: period.netIncome ?? null,
    pretaxIncome: period.pretaxIncome ?? null,
    incomeTaxExpense: period.incomeTaxExpense ?? null,
    epsDiluted: period.epsDiluted ?? null,
    operatingCashFlow: period.operatingCashFlow ?? null,
    capex: period.capitalExpenditures ?? null,
    assets: period.totalAssets ?? null,
    liabilities: period.totalLiabilities ?? null,
    cash: period.cashAndEquivalents ?? null,
    debt: period.totalDebt ?? null,
    equity: period.totalEquity ?? null,
    currentAssets: period.currentAssets ?? null,
    currentLiabilities: period.currentLiabilities ?? null,
    interestExpense: period.interestExpense ?? null,
    dividendsPaid: period.dividendsPaid ?? null,
    stockBasedCompensation: period.stockBasedCompensation ?? null,
    researchAndDevelopment: period.researchAndDevelopment ?? null,
    sharesDiluted: period.sharesDiluted ?? null,
    currentSharesOutstanding: period.currentSharesOutstanding ?? null,
    provenance: period.provenance,
  };
}

function unavailableSpecializedMetric(definition: string): SpecializedMetric {
  return { value: null, dataAsOf: null, definition };
}

function specializedMetric(
  fact: ResolvedSecFact | null | undefined,
  definition: string,
): SpecializedMetric {
  return fact ? {
    value: fact.val,
    unit: fact.unit,
    dataAsOf: fact.end,
    provenance: secFactProvenance(fact),
    definition,
  } : unavailableSpecializedMetric(definition);
}

export function resolveSecSpecializedData(
  facts: SecCompanyFacts,
  archetype: AnalysisArchetype,
): SpecializedCompanyData | undefined {
  if (archetype !== "bank") return undefined;

  const netInterestIncome = resolveTtmFact(facts, SEC_CONCEPTS.netInterestIncome)
    ?? [...resolveAnnualFacts(facts, SEC_CONCEPTS.netInterestIncome).values()].at(-1);
  const grossLoans = [...resolveInstantFacts(facts, SEC_CONCEPTS.grossLoans).values()].at(-1);
  const deposits = [...resolveInstantFacts(facts, SEC_CONCEPTS.deposits).values()].at(-1);
  const missing = unavailableSpecializedMetric;
  return {
    kind: "bank",
    netInterestIncome: specializedMetric(netInterestIncome, "Reported net interest income after interest expense."),
    netInterestMargin: missing("Reported net interest margin; not inferred from period-end assets."),
    grossLoans: specializedMetric(grossLoans, "Reported loans and leases receivable."),
    deposits: specializedMetric(deposits, "Reported customer deposits."),
    depositGrowth: missing("Deposit growth requires comparable reported deposit balances."),
    fundingCost: missing("Reported funding cost."),
    cet1CapitalRatio: missing("Reported common equity tier 1 capital ratio."),
    tangibleCommonEquity: missing("Reported tangible common equity."),
    tangibleBookValuePerShare: missing("Reported tangible book value per share."),
    nonPerformingLoans: missing("Reported nonperforming loans."),
    netChargeOffs: missing("Reported net charge-offs."),
    loanLossProvisions: missing("Reported provision for credit losses."),
    efficiencyRatio: missing("Reported efficiency ratio."),
    returnOnAssets: missing("Reported return on average assets."),
    returnOnEquity: missing("Reported return on average equity."),
    returnOnTangibleCommonEquity: missing("Reported return on tangible common equity."),
  };
}

export function resolveSecFinancialPeriods(
  facts: SecCompanyFacts,
  archetype: AnalysisArchetype = "standard",
): {
  annualPeriods: FinancialPeriod[];
  trailingTwelveMonths?: FinancialPeriod;
  priorTrailingTwelveMonths?: FinancialPeriod;
} {
  const annualMaps = resolveMaps(facts);
  const instantMaps = resolveMaps(facts, true);
  const periodEnds = [...new Set([
    ...annualMaps.revenue.keys(),
    ...annualMaps.netIncome.keys(),
    ...annualMaps.assets.keys(),
    ...annualMaps.operatingCashFlow.keys(),
  ])].sort().slice(-6);
  const ttm = buildTtmPeriods(facts, instantMaps, archetype);
  return {
    annualPeriods: periodEnds.map((end) => periodFromMaps(annualMaps, end)),
    trailingTwelveMonths: ttm.current,
    priorTrailingTwelveMonths: ttm.prior,
  };
}

export async function fetchCompanyFundamentalsResult(company: CompanySearchResult): Promise<AdapterResult<CompanyFundamentals>> {
  const observedAt = new Date().toISOString();
  if (!getSecUserAgent()) {
    return { ok: false, reason: "not_configured", message: "SEC contact is not configured.", diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unavailable", "not_configured") };
  }
  if (!company.cik) {
    return { ok: false, reason: "unsupported_symbol", message: "A SEC CIK is required for this fundamentals adapter.", diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unsupported", "missing_cik") };
  }
  const identity = entityIdentityFor(company);
  const cik = identity?.currentCik ?? padCik(company.cik);
  const requestedCiks = identity ? [...identity.predecessorCiks, identity.currentCik] : [cik];
  const [factSets, submissions] = await Promise.all([
    Promise.all(requestedCiks.map((sourceCik) =>
      fetchSecJson<SecCompanyFacts>(`${secBase}/api/xbrl/companyfacts/CIK${sourceCik}.json`, 60 * 60 * 12)
    )),
    fetchSecJson<SecSubmissions>(`${secBase}/submissions/CIK${cik}.json`, 60 * 60 * 24),
  ]);
  const availableFactSets = factSets.filter((facts): facts is SecCompanyFacts => Boolean(facts));
  if (!availableFactSets.length) {
    return { ok: false, reason: "upstream_error", message: "SEC Companyfacts could not be retrieved.", diagnostic: { provider: "SEC Companyfacts", capability: "fundamentals", status: "unavailable", reason: "upstream_error", observedAt } };
  }
  const facts = mergeSecCompanyFacts(availableFactSets);
  const classification = classifyCompany({ sic: submissions?.sic, sicDescription: submissions?.sicDescription, name: identity ? company.name : facts.entityName || company.name });
  const { annualPeriods, trailingTwelveMonths, priorTrailingTwelveMonths } = resolveSecFinancialPeriods(
    facts,
    classification.analysisArchetype,
  );
  const specialized = resolveSecSpecializedData(facts, classification.analysisArchetype);
  const latestAnnualPeriodEnd = annualPeriods.at(-1)?.periodEndDate ?? null;
  const diagnostic = { provider: "SEC Companyfacts", capability: "fundamentals" as const, status: annualPeriods.length ? "available" as const : "partial" as const, reason: trailingTwelveMonths ? undefined : "ttm_unavailable_annual_fallback", observedAt };
  return {
    ok: true,
    data: {
      ticker: company.ticker,
      name: identity ? company.name : facts.entityName || company.name,
      cik,
      sourceCiks: availableFactSets.map((factSet) => padCik(factSet.cik)),
      entityId: identity?.canonicalId ?? company.entityId,
      sector: classification.sector,
      industry: classification.industry,
      sic: submissions?.sic,
      analysisArchetype: classification.analysisArchetype,
      annual: annualPeriods.map(toLegacy),
      annualPeriods,
      trailingTwelveMonths,
      priorTrailingTwelveMonths,
      specialized,
      diagnostics: {
        latestFinancialPeriodEnd: trailingTwelveMonths?.periodEndDate ?? latestAnnualPeriodEnd,
        latestAnnualPeriodEnd,
        dataAgeDays: null,
        ttmStatus: trailingTwelveMonths ? "available" : annualPeriods.length ? "annual_fallback" : "unavailable",
        providerDiagnostics: [diagnostic],
        financialFlowPeriodEnd: trailingTwelveMonths?.periodEndDate ?? latestAnnualPeriodEnd,
        financialFlowPeriodBasis: trailingTwelveMonths?.periodBasis ?? (latestAnnualPeriodEnd ? "FY" : null),
        balanceSheetPeriodEnd: trailingTwelveMonths?.balanceSheetDate ?? latestAnnualPeriodEnd,
        dataStatus: annualPeriods.length ? "current" : "unavailable",
      },
    },
    diagnostic,
  };
}

export async function fetchCompanyFundamentals(company: CompanySearchResult): Promise<CompanyFundamentals | null> {
  const result = await fetchCompanyFundamentalsResult(company);
  return result.ok ? result.data : null;
}

export const secFundamentalsProvider: FundamentalsProvider = {
  id: "sec-companyfacts",
  capabilities: SEC_CAPABILITIES,
  fetchFundamentals: fetchCompanyFundamentalsResult,
};
