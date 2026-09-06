import type { MetricProvenance } from "@/lib/analysis/types";

const RECONCILIATION_RELATIVE_TOLERANCE = 0.01;

export type YahooInterestFact = {
  concept: string;
  asOfDate: string;
  periodType: string;
  currencyCode: string | null;
  value: number;
};

type InterestDerivationOptions = {
  prefix: "annual" | "trailing";
  date: string;
  periodCurrency?: string;
  periodBasis?: MetricProvenance["periodBasis"];
};

function normalizedCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase();
  return currency || null;
}

function factAt(
  facts: YahooInterestFact[],
  concept: string,
  date: string,
  periodType: string,
): YahooInterestFact | null {
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

function directHistoricalFact(facts: YahooInterestFact[], date: string): YahooInterestFact | null {
  return factAt(facts, "annualInterestExpense", date, "12M")
    ?? factAt(facts, "annualInterestExpenseNonOperating", date, "12M");
}

export function deriveYahooInterestExpenseFromFacts(
  facts: YahooInterestFact[],
  options: InterestDerivationOptions,
): { value: number; provenance: MetricProvenance } | null {
  const periodType = options.prefix === "annual" ? "12M" : "TTM";
  const interestIncome = factAt(
    facts,
    `${options.prefix}InterestIncomeNonOperating`,
    options.date,
    periodType,
  );
  const netNonOperating = factAt(
    facts,
    `${options.prefix}NetNonOperatingInterestIncomeExpense`,
    options.date,
    periodType,
  );
  if (!interestIncome || !netNonOperating) return null;

  const currency = normalizedCurrency(interestIncome.currencyCode);
  if (!currency || currency !== normalizedCurrency(netNonOperating.currencyCode)) return null;
  const selectedPeriodCurrency = normalizedCurrency(options.periodCurrency);
  if (selectedPeriodCurrency && selectedPeriodCurrency !== currency) return null;

  const value = interestIncome.value - netNonOperating.value;
  if (!Number.isFinite(value) || value < 0) return null;

  const historicalDates = [...new Set(facts
    .filter((fact) =>
      fact.asOfDate < options.date
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
      periodEnd: options.date,
      periodBasis: options.periodBasis,
      inputs: [
        `${interestIncome.concept}@${options.date}`,
        `${netNonOperating.concept}@${options.date}`,
        ...evidenceInputs,
      ],
      valueKind: "derived",
      note: `Interest expense derived as InterestIncomeNonOperating - NetNonOperatingInterestIncomeExpense only after ${reconciledObservations} prior annual observations reconciled within 1% tolerance.`,
    },
  };
}
