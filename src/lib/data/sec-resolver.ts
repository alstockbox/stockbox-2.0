import type { MetricProvenance } from "@/lib/analysis/types";

export type SecTaxonomy = "us-gaap" | "ifrs-full" | "dei";

export type SecFactUnit = {
  start?: string;
  end: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  accn?: string;
  frame?: string;
  val: number;
  sourceCik?: string;
};

export type SecCompanyFacts = {
  cik: number;
  entityName: string;
  facts?: Partial<Record<SecTaxonomy, Record<string, { units?: Record<string, SecFactUnit[]> }>>>;
};

export type ConceptAlias = { taxonomy: SecTaxonomy; concept: string };
export type ConceptSpec = {
  aliases: ConceptAlias[];
  units: string[];
  kind: "duration" | "instant";
};

export type ResolvedSecFact = SecFactUnit & {
  taxonomy: SecTaxonomy;
  concept: string;
  unit: string;
  conceptPriority: number;
  periodBasis?: "TTM_Q1_3M" | "TTM_Q2_6M" | "TTM_Q3_9M";
  currentYtdDurationDays?: number;
  priorYtdDurationDays?: number;
  ttmConstructionMethod?: string;
  sourceCiks?: string[];
};

const annualForms = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F"]);
const quarterlyForms = new Set(["10-Q", "10-Q/A"]);

function daysBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / 86_400_000;
}

function betterFact(current: ResolvedSecFact | undefined, candidate: ResolvedSecFact): ResolvedSecFact {
  if (!current) return candidate;
  const filed = (candidate.filed ?? "").localeCompare(current.filed ?? "");
  if (filed !== 0) return filed > 0 ? candidate : current;
  return candidate.conceptPriority < current.conceptPriority ? candidate : current;
}

function collectCandidates(facts: SecCompanyFacts, spec: ConceptSpec): ResolvedSecFact[] {
  const rows: ResolvedSecFact[] = [];
  spec.aliases.forEach((alias, conceptPriority) => {
    const units = facts.facts?.[alias.taxonomy]?.[alias.concept]?.units ?? {};
    const selectedUnits = spec.units.length ? spec.units.filter((unit) => units[unit]) : Object.keys(units);
    for (const unit of selectedUnits) {
      for (const row of units[unit] ?? []) {
        if (!row.end || !Number.isFinite(row.val)) continue;
        rows.push({ ...row, taxonomy: alias.taxonomy, concept: alias.concept, unit, conceptPriority });
      }
    }
  });
  return rows;
}

export function resolveAnnualFacts(facts: SecCompanyFacts, spec: ConceptSpec): Map<string, ResolvedSecFact> {
  const byIdentity = new Map<string, ResolvedSecFact>();
  for (const candidate of collectCandidates(facts, spec)) {
    if (!annualForms.has(candidate.form ?? "")) continue;
    if (spec.kind === "duration") {
      if (!candidate.start) continue;
      const days = daysBetween(candidate.start, candidate.end);
      if (!Number.isFinite(days) || days < 330 || days > 400) continue;
    }
    const identity = spec.kind === "duration" ? `${candidate.start}|${candidate.end}` : candidate.end;
    byIdentity.set(identity, betterFact(byIdentity.get(identity), candidate));
  }
  const byEnd = new Map<string, ResolvedSecFact>();
  for (const fact of byIdentity.values()) byEnd.set(fact.end, betterFact(byEnd.get(fact.end), fact));
  return new Map([...byEnd.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function resolveInstantFacts(facts: SecCompanyFacts, spec: ConceptSpec): Map<string, ResolvedSecFact> {
  if (spec.kind !== "instant") return new Map();
  const byEnd = new Map<string, ResolvedSecFact>();
  for (const candidate of collectCandidates(facts, spec)) {
    if (!annualForms.has(candidate.form ?? "") && !quarterlyForms.has(candidate.form ?? "")) continue;
    byEnd.set(candidate.end, betterFact(byEnd.get(candidate.end), candidate));
  }
  return new Map([...byEnd.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function durationClass(days: number): ResolvedSecFact["periodBasis"] | null {
  if (days >= 70 && days <= 110) return "TTM_Q1_3M";
  if (days >= 150 && days <= 200) return "TTM_Q2_6M";
  if (days >= 230 && days <= 300) return "TTM_Q3_9M";
  return null;
}

function preferredYtdFacts(facts: SecCompanyFacts, spec: ConceptSpec): ResolvedSecFact[] {
  const byIdentity = new Map<string, ResolvedSecFact>();
  for (const candidate of collectCandidates(facts, spec)) {
    if (!quarterlyForms.has(candidate.form ?? "") || !candidate.start) continue;
    const days = daysBetween(candidate.start, candidate.end);
    if (!durationClass(days)) continue;
    const identity = `${candidate.start}|${candidate.end}`;
    byIdentity.set(identity, betterFact(byIdentity.get(identity), candidate));
  }
  const byEnd = new Map<string, ResolvedSecFact[]>();
  for (const fact of byIdentity.values()) byEnd.set(fact.end, [...(byEnd.get(fact.end) ?? []), fact]);
  return [...byEnd.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([, candidates]) => {
    const longestDays = Math.max(...candidates.map((candidate) => daysBetween(candidate.start as string, candidate.end)));
    const longest = candidates.filter((candidate) => daysBetween(candidate.start as string, candidate.end) === longestDays);
    const selected = longest.reduce<ResolvedSecFact | undefined>((best, candidate) => betterFact(best, candidate), undefined);
    return selected ? [{ ...selected, periodBasis: durationClass(longestDays) ?? undefined }] : [];
  });
}

export function resolveTtmFacts(facts: SecCompanyFacts, spec: ConceptSpec): ResolvedSecFact[] {
  if (spec.kind !== "duration") return [];
  const annual = [...resolveAnnualFacts(facts, spec).values()].sort((a, b) => a.end.localeCompare(b.end));
  const ytd = preferredYtdFacts(facts, spec);
  return ytd.flatMap((current) => {
    if (!current.start || !current.periodBasis) return [];
    const currentDays = daysBetween(current.start, current.end);
    const prior = ytd
      .filter((candidate) => {
        if (!candidate.start || candidate.periodBasis !== current.periodBasis) return false;
        const endGap = daysBetween(candidate.end, current.end);
        return endGap >= 330 && endGap <= 400 && Math.abs(daysBetween(candidate.start, candidate.end) - currentDays) <= 15;
      })
      .sort((left, right) => left.end.localeCompare(right.end))
      .at(-1);
    if (!prior?.start) return [];
    const fiscalYear = annual.filter((fact) => fact.end > prior.end && fact.end < current.end).at(-1);
    if (!fiscalYear) return [];
    const priorDays = daysBetween(prior.start, prior.end);
    return [{
      ...current,
      start: undefined,
      form: "TTM",
      val: fiscalYear.val + current.val - prior.val,
      concept: `TTM(${fiscalYear.concept}+${current.concept}-${prior.concept})`,
      conceptPriority: Math.min(fiscalYear.conceptPriority, current.conceptPriority, prior.conceptPriority),
      periodBasis: current.periodBasis,
      currentYtdDurationDays: currentDays,
      priorYtdDurationDays: priorDays,
      ttmConstructionMethod: "latest FY + current comparable YTD - prior comparable YTD",
      sourceCiks: [...new Set([fiscalYear.sourceCik, current.sourceCik, prior.sourceCik].filter((cik): cik is string => Boolean(cik)))],
    }];
  });
}

export function resolveTtmFact(facts: SecCompanyFacts, spec: ConceptSpec): ResolvedSecFact | null {
  return resolveTtmFacts(facts, spec).at(-1) ?? null;
}

export function secFactProvenance(fact: ResolvedSecFact, valueKind: "reported" | "derived" = "reported"): MetricProvenance {
  return {
    source: "SEC Companyfacts",
    provider: "sec",
    taxonomy: fact.taxonomy,
    concept: fact.concept,
    unit: fact.unit,
    periodStart: fact.start,
    periodEnd: fact.end,
    filedAt: fact.filed,
    form: fact.form,
    accession: fact.accn,
    sourceCik: fact.sourceCik,
    sourceCiks: fact.sourceCiks ?? (fact.sourceCik ? [fact.sourceCik] : undefined),
    periodBasis: fact.periodBasis,
    currentYtdDurationDays: fact.currentYtdDurationDays,
    priorYtdDurationDays: fact.priorYtdDurationDays,
    note: fact.ttmConstructionMethod,
    valueKind,
  };
}

const us = (concept: string): ConceptAlias => ({ taxonomy: "us-gaap", concept });
const ifrs = (concept: string): ConceptAlias => ({ taxonomy: "ifrs-full", concept });
const dei = (concept: string): ConceptAlias => ({ taxonomy: "dei", concept });

export const SEC_CONCEPTS = {
  revenue: { kind: "duration", units: ["USD"], aliases: [us("RevenueFromContractWithCustomerExcludingAssessedTax"), us("RevenueFromContractWithCustomerIncludingAssessedTax"), us("RegulatedAndUnregulatedOperatingRevenue"), us("Revenues"), us("RevenuesNetOfInterestExpense"), us("SalesRevenueNet"), us("SalesRevenueGoodsNet"), ifrs("Revenue")] },
  costOfRevenue: { kind: "duration", units: ["USD"], aliases: [us("CostOfRevenue"), us("CostOfGoodsAndServicesSold"), ifrs("CostOfSales")] },
  grossProfit: { kind: "duration", units: ["USD"], aliases: [us("GrossProfit"), ifrs("GrossProfit")] },
  operatingIncome: { kind: "duration", units: ["USD"], aliases: [us("OperatingIncomeLoss"), ifrs("ProfitLossFromOperatingActivities")] },
  netIncome: { kind: "duration", units: ["USD"], aliases: [us("NetIncomeLoss"), us("ProfitLoss"), ifrs("ProfitLoss")] },
  netIncomeCommonStockholders: { kind: "duration", units: ["USD"], aliases: [us("NetIncomeLossAvailableToCommonStockholdersBasic"), ifrs("ProfitLossAttributableToOwnersOfParent")] },
  dilutedNetIncomeAvailableToCommon: { kind: "duration", units: ["USD"], aliases: [us("NetIncomeLossAvailableToCommonStockholdersDiluted"), us("NetIncomeLossAvailableToCommonStockholdersBasic"), ifrs("ProfitLossAttributableToOwnersOfParent")] },
  pretaxIncome: { kind: "duration", units: ["USD"], aliases: [us("IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"), us("IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"), ifrs("ProfitLossBeforeTax")] },
  incomeTaxExpense: { kind: "duration", units: ["USD"], aliases: [us("IncomeTaxExpenseBenefit"), ifrs("IncomeTaxExpenseContinuingOperations")] },
  epsDiluted: { kind: "duration", units: ["USD/shares", "USD-per-shares"], aliases: [us("EarningsPerShareDiluted"), ifrs("DilutedEarningsLossPerShare")] },
  sharesDiluted: { kind: "duration", units: ["shares"], aliases: [us("WeightedAverageNumberOfDilutedSharesOutstanding"), ifrs("AdjustedWeightedAverageShares")] },
  operatingCashFlow: { kind: "duration", units: ["USD"], aliases: [us("NetCashProvidedByUsedInOperatingActivities"), ifrs("CashFlowsFromUsedInOperatingActivities")] },
  capitalExpenditures: { kind: "duration", units: ["USD"], aliases: [us("PaymentsToAcquirePropertyPlantAndEquipment"), us("PaymentsForAdditionsToPropertyPlantAndEquipment"), us("PaymentsToAcquireProductiveAssets"), ifrs("PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities")] },
  interestExpense: { kind: "duration", units: ["USD"], aliases: [us("InterestExpenseNonOperating"), us("InterestExpense"), ifrs("FinanceCosts")] },
  depreciationAndAmortization: { kind: "duration", units: ["USD"], aliases: [us("DepreciationDepletionAndAmortization"), us("DepreciationDepletionAndAmortizationPropertyPlantAndEquipment"), ifrs("DepreciationAndAmortisationExpense")] },
  dividendsPaid: { kind: "duration", units: ["USD"], aliases: [us("PaymentsOfDividends"), us("PaymentsOfDividendsCommonStock"), ifrs("DividendsPaidClassifiedAsFinancingActivities")] },
  stockBasedCompensation: { kind: "duration", units: ["USD"], aliases: [us("ShareBasedCompensation"), ifrs("ShareBasedPaymentExpense")] },
  researchAndDevelopment: { kind: "duration", units: ["USD"], aliases: [us("ResearchAndDevelopmentExpense"), ifrs("ResearchAndDevelopmentExpense")] },
  assets: { kind: "instant", units: ["USD"], aliases: [us("Assets"), ifrs("Assets")] },
  liabilities: { kind: "instant", units: ["USD"], aliases: [us("Liabilities"), ifrs("Liabilities")] },
  equity: { kind: "instant", units: ["USD"], aliases: [us("StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"), us("StockholdersEquity"), ifrs("Equity")] },
  cash: { kind: "instant", units: ["USD"], aliases: [us("CashAndCashEquivalentsAtCarryingValue"), ifrs("CashAndCashEquivalents")] },
  restrictedCash: { kind: "instant", units: ["USD"], aliases: [us("RestrictedCashAndCashEquivalentsCurrent"), us("RestrictedCashAndCashEquivalentsNoncurrent")] },
  currentAssets: { kind: "instant", units: ["USD"], aliases: [us("AssetsCurrent"), ifrs("CurrentAssets")] },
  currentLiabilities: { kind: "instant", units: ["USD"], aliases: [us("LiabilitiesCurrent"), ifrs("CurrentLiabilities")] },
  totalDebt: { kind: "instant", units: ["USD"], aliases: [us("DebtAndCapitalLeaseObligations"), us("DebtLongtermAndShorttermCombinedAmount")] },
  shortTermDebt: { kind: "instant", units: ["USD"], aliases: [us("ShortTermBorrowings")] },
  commercialPaper: { kind: "instant", units: ["USD"], aliases: [us("CommercialPaper")] },
  currentPortionLongTermDebt: { kind: "instant", units: ["USD"], aliases: [us("LongTermDebtCurrent"), us("CurrentPortionOfLongTermDebt")] },
  longTermDebt: { kind: "instant", units: ["USD"], aliases: [us("LongTermDebtNoncurrent"), us("LongTermDebt") , ifrs("NoncurrentBorrowings")] },
  accountsReceivable: { kind: "instant", units: ["USD"], aliases: [us("AccountsReceivableNetCurrent"), ifrs("TradeAndOtherCurrentReceivables")] },
  inventory: { kind: "instant", units: ["USD"], aliases: [us("InventoryNet"), ifrs("Inventories")] },
  currentShares: { kind: "instant", units: ["shares"], aliases: [dei("EntityCommonStockSharesOutstanding")] },
  netInterestIncome: { kind: "duration", units: ["USD"], aliases: [us("InterestIncomeExpenseNet")] },
  grossLoans: { kind: "instant", units: ["USD"], aliases: [us("LoansAndLeasesReceivableNetOfDeferredIncome"), us("LoansAndLeasesReceivableNetReportedAmount")] },
  deposits: { kind: "instant", units: ["USD"], aliases: [us("Deposits")] },
} as const satisfies Record<string, ConceptSpec>;
