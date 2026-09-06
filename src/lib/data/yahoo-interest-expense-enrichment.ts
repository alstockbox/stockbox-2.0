import type {
  CompanyFundamentals,
  CompanySearchResult,
  MetricProvenance,
  ProviderDiagnostic,
} from "@/lib/analysis/types";
import { yahooSymbolForCompany } from "./yahoo-fundamentals-core";

const TIMESERIES_BASE = "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries";
const REQUEST_TIMEOUT_MS = 10_000;
const RECONCILIATION_RELATIVE_TOLERANCE = 0.01;

const INTEREST_FIELDS = [
  "InterestExpense",
  "InterestExpenseNonOperating",
  "InterestIncomeNonOperating",
  "NetNonOperatingInterestIncomeExpense",
] as const;

const REQUEST_TYPES = INTEREST_FIELDS.flatMap((field) => [`annual${field}`, `trailing${field}`]);

type InterestFact = {
  concept: string;
  asOfDate: string;
  periodType: string;
  currencyCode: string | null;
  value: number;
};

type FinancialPeriod = NonNullable<CompanyFundamentals["annualPeriods"]>[number];

type InterestEnrichmentResult = {
  fundamentals: CompanyFundamentals;
  diagnostics: ProviderDiagnostic[];
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase();
  return currency || null;
}

function parseFacts(payload: unknown): InterestFact[] {
  const root = object(payload);
  const timeseries = object(root?.timeseries);
  const results = Array.isArray(timeseries?.result) ? timeseries.result : [];
  const facts: InterestFact[] = [];

  for (const resultValue of results) {
    const result = object(resultValue);
    const meta = object(result?.meta);
    const type = Array.isArray(meta?.type) ? stringValue(meta.type[0]) : null;
    if (!result || !type || !REQUEST_TYPES.includes(type)) continue;

    const rows = Array.isArray(result[type]) ? result[type] : [];
    for (const rowValue of rows) {
      const row = object(rowValue);
      const reported = object(row?.reportedValue);
      const value = finiteNumber(reported?.raw);
      const asOfDate = stringValue(row?.asOfDate);
      const periodType = stringValue(row?.periodType);
      if (value === null || !asOfDate || !periodType) continue;
      facts.push({
        concept: type,
        asOfDate,
        periodType,
        currencyCode: stringValue(row?.currencyCode),
        value,
      });
    }
  }

  return facts;
}

function partialDiagnostic(reason: string): ProviderDiagnostic {
  return {
    provider: "Yahoo Finance fundamentals",
    capability: "fundamentals",
    status: "partial",
    reason,
    observedAt: new Date().toISOString(),
  };
}

function stablePeriod2(now = Date.now()): string {
  const date = new Date(now);
  return String(Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) / 1000));
}

async function fetchInterestFacts(company: CompanySearchResult): Promise<{
  facts: InterestFact[];
  diagnostics: ProviderDiagnostic[];
}> {
  const symbol = yahooSymbolForCompany(company);
  const url = new URL(`${TIMESERIES_BASE}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", REQUEST_TYPES.join(","));
  url.searchParams.set("period1", "1262304000");
  url.searchParams.set("period2", stablePeriod2());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return {
        facts: [],
        diagnostics: [partialDiagnostic(`interest_component_enrichment_http_${response.status}`)],
      };
    }
    const facts = parseFacts(await response.json());
    return {
      facts,
      diagnostics: facts.length > 0 ? [] : [partialDiagnostic("interest_component_history_unavailable")],
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError"
      ? "interest_component_enrichment_timeout"
      : "interest_component_enrichment_request_failed";
    return { facts: [], diagnostics: [partialDiagnostic(reason)] };
  } finally {
    clearTimeout(timeout);
  }
}

function factAt(
  facts: InterestFact[],
  concept: string,
  date: string,
  periodType: string,
): InterestFact | null {
  return facts.find((fact) =>
    fact.concept === concept
    && fact.asOfDate === date
    && fact.periodType === periodType
  ) ?? null;
}

function reconciles(reported: number, derived: number): boolean {
  const tolerance = Math.max(
    1e-6,
    RECONCILIATION_RELATIVE_TOLERANCE * Math.max(Math.abs(reported), Math.abs(derived), 1),
  );
  return Math.abs(reported - derived) <= tolerance;
}

function directHistoricalFact(facts: InterestFact[], date: string): InterestFact | null {
  return factAt(facts, "annualInterestExpense", date, "12M")
    ?? factAt(facts, "annualInterestExpenseNonOperating", date, "12M");
}

function evidenceGatedInterestExpense(
  period: FinancialPeriod,
  prefix: "annual" | "trailing",
  facts: InterestFact[],
): { value: number; provenance: MetricProvenance } | null {
  const date = period.periodEndDate;
  if (!date) return null;
  const periodType = prefix === "annual" ? "12M" : "TTM";
  const interestIncome = factAt(facts, `${prefix}InterestIncomeNonOperating`, date, periodType);
  const netNonOperating = factAt(facts, `${prefix}NetNonOperatingInterestIncomeExpense`, date, periodType);
  if (!interestIncome || !netNonOperating) return null;

  const currency = normalizedCurrency(interestIncome.currencyCode);
  if (!currency || currency !== normalizedCurrency(netNonOperating.currencyCode)) return null;
  const selectedPeriodCurrency = normalizedCurrency(period.currency);
  if (selectedPeriodCurrency && selectedPeriodCurrency !== currency) return null;

  const value = interestIncome.value - netNonOperating.value;
  if (!Number.isFinite(value) || value < 0) return null;

  const historicalDates = [...new Set(facts
    .filter((fact) =>
      fact.asOfDate < date
      && fact.periodType === "12M"
      && (fact.concept === "annualInterestExpense" || fact.concept === "annualInterestExpenseNonOperating")
    )
    .map((fact) => fact.asOfDate))]
    .sort();

  const evidenceInputs: string[] = [];
  let reconciledObservations = 0;
  for (const historicalDate of historicalDates) {
    const reported = directHistoricalFact(facts, historicalDate);
    const historicalIncome = factAt(facts, "annualInterestIncomeNonOperating", historicalDate, "12M");
    const historicalNet = factAt(facts, "annualNetNonOperatingInterestIncomeExpense", historicalDate, "12M");
    if (!reported || !historicalIncome || !historicalNet) continue;

    const currencies = [reported, historicalIncome, historicalNet].map((fact) => normalizedCurrency(fact.currencyCode));
    if (currencies.some((candidate) => candidate !== currency)) continue;

    const historicalDerived = historicalIncome.value - historicalNet.value;
    if (!Number.isFinite(historicalDerived) || historicalDerived < 0) return null;
    if (!reconciles(reported.value, historicalDerived)) return null;

    reconciledObservations += 1;
    evidenceInputs.push(
      `${reported.concept}@${historicalDate}`,
      `${historicalIncome.concept}@${historicalDate}`,
      `${historicalNet.concept}@${historicalDate}`,
    );
  }

  if (reconciledObservations < 2) return null;

  return {
    value,
    provenance: {
      source: "Yahoo Finance fundamentals timeseries",
      provider: "yahoo-fundamentals",
      unit: currency,
      periodEnd: date,
      periodBasis: period.periodBasis,
      inputs: [
        `${interestIncome.concept}@${date}`,
        `${netNonOperating.concept}@${date}`,
        ...evidenceInputs,
      ],
      valueKind: "derived",
      note: `Interest expense derived as InterestIncomeNonOperating - NetNonOperatingInterestIncomeExpense only after ${reconciledObservations} prior annual observations reconciled within 1% tolerance.`,
    },
  };
}

function enrichPeriod(
  period: FinancialPeriod | undefined,
  prefix: "annual" | "trailing",
  facts: InterestFact[],
): FinancialPeriod | undefined {
  if (!period || period.interestExpense !== null) return period;
  const derived = evidenceGatedInterestExpense(period, prefix, facts);
  if (!derived) return period;
  return {
    ...period,
    interestExpense: derived.value,
    provenance: {
      ...(period.provenance ?? {}),
      interestExpense: derived.provenance,
    },
  };
}

function selectedInterestPeriod(fundamentals: CompanyFundamentals): FinancialPeriod | undefined {
  return fundamentals.trailingTwelveMonths ?? fundamentals.annualPeriods?.at(-1);
}

function syncLegacyAnnual(
  fundamentals: CompanyFundamentals,
  annualPeriods: FinancialPeriod[] | undefined,
): CompanyFundamentals["annual"] {
  if (!annualPeriods?.length) return fundamentals.annual;
  const periodsByDate = new Map(annualPeriods.flatMap((period) =>
    period.periodEndDate ? [[period.periodEndDate, period] as const] : []
  ));
  return fundamentals.annual.map((annual) => {
    if (annual.interestExpense !== null || !annual.periodEndDate) return annual;
    const period = periodsByDate.get(annual.periodEndDate);
    const interestProvenance = period?.provenance?.interestExpense;
    if (!period || period.interestExpense === null || !interestProvenance) return annual;
    return {
      ...annual,
      interestExpense: period.interestExpense,
      provenance: {
        ...(annual.provenance ?? {}),
        interestExpense: interestProvenance,
      },
    };
  });
}

export async function enrichYahooInterestExpense(
  company: CompanySearchResult,
  fundamentals: CompanyFundamentals,
): Promise<InterestEnrichmentResult> {
  const selected = selectedInterestPeriod(fundamentals);
  if (!selected || selected.interestExpense !== null) {
    return { fundamentals, diagnostics: [] };
  }

  const fetched = await fetchInterestFacts(company);
  if (fetched.facts.length === 0) {
    return { fundamentals, diagnostics: fetched.diagnostics };
  }

  const annualPeriods = fundamentals.annualPeriods?.map((period) =>
    enrichPeriod(period, "annual", fetched.facts) ?? period
  );
  const trailingTwelveMonths = enrichPeriod(fundamentals.trailingTwelveMonths, "trailing", fetched.facts);
  const priorTrailingTwelveMonths = enrichPeriod(fundamentals.priorTrailingTwelveMonths, "trailing", fetched.facts);

  const enriched: CompanyFundamentals = {
    ...fundamentals,
    annualPeriods,
    trailingTwelveMonths,
    priorTrailingTwelveMonths,
  };
  enriched.annual = syncLegacyAnnual(enriched, annualPeriods);

  return {
    fundamentals: enriched,
    diagnostics: fetched.diagnostics,
  };
}
