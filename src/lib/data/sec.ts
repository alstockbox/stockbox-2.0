import { classifyCompany } from "@/lib/analysis/archetypes";
import type {
  AnnualFinancials,
  CompanyFundamentals,
  CompanySearchResult,
  FinancialPeriod,
  MetricProvenance,
} from "@/lib/analysis/types";
import { getSecUserAgent } from "@/lib/env/server";
import { commonCompanies } from "./common-companies";
import { providerDiagnostic, type AdapterResult, type FundamentalsProvider, type ProviderCapabilities } from "./providers";
import {
  resolveAnnualFacts,
  resolveInstantFacts,
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

export async function searchCompanies(query: string): Promise<CompanySearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const universe = await fetchSecTickerUniverse();
  return universe
    .filter((company) => company.ticker.toLowerCase().includes(normalized) || company.name.toLowerCase().includes(normalized))
    .slice(0, 12);
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

function balanceSnapshotAt(maps: FactMaps, targetEnd: string): Partial<FinancialPeriod> {
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
    currentSharesOutstanding: value("currentShares"),
    provenance,
  };
}

function buildTtmPeriods(facts: SecCompanyFacts, instantMaps: FactMaps): {
  current?: FinancialPeriod;
  prior?: FinancialPeriod;
} {
  const ttmKeys = [
    "revenue", "costOfRevenue", "grossProfit", "operatingIncome", "netIncome", "pretaxIncome",
    "incomeTaxExpense", "operatingCashFlow", "capitalExpenditures", "interestExpense",
    "depreciationAndAmortization", "dividendsPaid", "stockBasedCompensation", "researchAndDevelopment",
  ] as const;
  const series = Object.fromEntries(
    ttmKeys.map((key) => [key, resolveTtmFacts(facts, SEC_CONCEPTS[key] as ConceptSpec)]),
  ) as Record<typeof ttmKeys[number], ResolvedSecFact[]>;
  const requiredKeys = ["revenue", "operatingIncome", "netIncome", "operatingCashFlow", "capitalExpenditures"] as const;
  const coherent = series.revenue.flatMap((revenueFact) => {
    if (!revenueFact.periodBasis) return [];
    const required = Object.fromEntries(requiredKeys.map((key) => [
      key,
      series[key].find((fact) => fact.end === revenueFact.end && fact.periodBasis === revenueFact.periodBasis),
    ])) as Record<typeof requiredKeys[number], ResolvedSecFact | undefined>;
    if (Object.values(required).some((fact) => !fact)) return [];
    const requiredFacts = Object.values(required) as ResolvedSecFact[];
    const currentDurations = requiredFacts.map((fact) => fact.currentYtdDurationDays as number);
    const priorDurations = requiredFacts.map((fact) => fact.priorYtdDurationDays as number);
    if (
      currentDurations.some((days) => !Number.isFinite(days))
      || priorDurations.some((days) => !Number.isFinite(days))
      || Math.max(...currentDurations) - Math.min(...currentDurations) > 15
      || Math.max(...priorDurations) - Math.min(...priorDurations) > 15
    ) return [];
    const resolved = Object.fromEntries(ttmKeys.map((key) => [
      key,
      series[key].find((fact) => fact.end === revenueFact.end && fact.periodBasis === revenueFact.periodBasis) ?? null,
    ])) as Record<typeof ttmKeys[number], ResolvedSecFact | null>;
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
        periodEnd: revenueFact.end,
        periodBasis: revenueFact.periodBasis,
        currentYtdDurationDays: revenueFact.currentYtdDurationDays,
        priorYtdDurationDays: revenueFact.priorYtdDurationDays,
        inputs: ["revenue", "costOfRevenue"],
      };
    }
    const balance = balanceSnapshotAt(instantMaps, revenueFact.end);
    return [{
      ...balance,
      fiscalYear: undefined,
      periodStartDate: undefined,
      periodEndDate: revenueFact.end,
      filedDate: revenueFact.filed,
      form: "TTM",
      periodBasis: revenueFact.periodBasis,
      currentYtdDurationDays: revenueFact.currentYtdDurationDays,
      priorYtdDurationDays: revenueFact.priorYtdDurationDays,
      ttmConstructionMethod: revenueFact.ttmConstructionMethod,
      currency: revenueFact.unit === "USD" ? "USD" : undefined,
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

export function resolveSecFinancialPeriods(facts: SecCompanyFacts): {
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
  const ttm = buildTtmPeriods(facts, instantMaps);
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
  const cik = padCik(company.cik);
  const [facts, submissions] = await Promise.all([
    fetchSecJson<SecCompanyFacts>(`${secBase}/api/xbrl/companyfacts/CIK${cik}.json`, 60 * 60 * 12),
    fetchSecJson<SecSubmissions>(`${secBase}/submissions/CIK${cik}.json`, 60 * 60 * 24),
  ]);
  if (!facts) {
    return { ok: false, reason: "upstream_error", message: "SEC Companyfacts could not be retrieved.", diagnostic: { provider: "SEC Companyfacts", capability: "fundamentals", status: "unavailable", reason: "upstream_error", observedAt } };
  }
  const { annualPeriods, trailingTwelveMonths, priorTrailingTwelveMonths } = resolveSecFinancialPeriods(facts);
  const latestAnnualPeriodEnd = annualPeriods.at(-1)?.periodEndDate ?? null;
  const classification = classifyCompany({ sic: submissions?.sic, sicDescription: submissions?.sicDescription, name: facts.entityName || company.name });
  const diagnostic = { provider: "SEC Companyfacts", capability: "fundamentals" as const, status: annualPeriods.length ? "available" as const : "partial" as const, reason: trailingTwelveMonths ? undefined : "ttm_unavailable_annual_fallback", observedAt };
  return {
    ok: true,
    data: {
      ticker: company.ticker,
      name: facts.entityName || company.name,
      cik,
      sector: classification.sector,
      industry: classification.industry,
      sic: submissions?.sic,
      analysisArchetype: classification.analysisArchetype,
      annual: annualPeriods.map(toLegacy),
      annualPeriods,
      trailingTwelveMonths,
      priorTrailingTwelveMonths,
      diagnostics: {
        latestFinancialPeriodEnd: trailingTwelveMonths?.periodEndDate ?? latestAnnualPeriodEnd,
        latestAnnualPeriodEnd,
        dataAgeDays: null,
        ttmStatus: trailingTwelveMonths ? "available" : annualPeriods.length ? "annual_fallback" : "unavailable",
        providerDiagnostics: [diagnostic],
        financialFlowPeriodEnd: trailingTwelveMonths?.periodEndDate ?? latestAnnualPeriodEnd,
        financialFlowPeriodBasis: trailingTwelveMonths?.periodBasis ?? (latestAnnualPeriodEnd ? "FY" : null),
        balanceSheetPeriodEnd: trailingTwelveMonths?.balanceSheetDate ?? latestAnnualPeriodEnd,
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
