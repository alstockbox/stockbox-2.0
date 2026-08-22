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

export function resolveTtmFact(facts: SecCompanyFacts, spec: ConceptSpec): ResolvedSecFact | null {
  if (spec.kind !== "duration") return null;
  const latestAnnual = [...resolveAnnualFacts(facts, spec).values()].sort((a, b) => a.end.localeCompare(b.end)).at(-1);
  if (!latestAnnual) return null;
  const byIdentity = new Map<string, ResolvedSecFact>();
  for (const candidate of collectCandidates(facts, spec)) {
    if (!quarterlyForms.has(candidate.form ?? "") || !candidate.start) continue;
    const days = daysBetween(candidate.start, candidate.end);
    if (!Number.isFinite(days) || days < 70 || days > 300) continue;
    byIdentity.set(`${candidate.start}|${candidate.end}`, betterFact(byIdentity.get(`${candidate.start}|${candidate.end}`), candidate));
  }
  const candidates = [...byIdentity.values()].filter((fact) => fact.end > latestAnnual.end).sort((a, b) => a.end.localeCompare(b.end));
  const current = candidates.at(-1);
  if (!current?.start) return null;
  const currentDays = daysBetween(current.start, current.end);
  const prior = [...byIdentity.values()]
    .filter((fact) => {
      if (!fact.start) return false;
      const endGap = daysBetween(fact.end, current.end);
      return endGap >= 330 && endGap <= 400 && Math.abs(daysBetween(fact.start, fact.end) - currentDays) <= 15;
    })
    .sort((a, b) => a.end.localeCompare(b.end))
    .at(-1);
  if (!prior) return null;
  return {
    ...current,
    start: latestAnnual.start,
    val: latestAnnual.val + current.val - prior.val,
    concept: `TTM(${latestAnnual.concept}+${current.concept}-${prior.concept})`,
    conceptPriority: Math.min(latestAnnual.conceptPriority, current.conceptPriority, prior.conceptPriority),
  };
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
    valueKind,
  };
}

const us = (concept: string): ConceptAlias => ({ taxonomy: "us-gaap", concept });
const ifrs = (concept: string): ConceptAlias => ({ taxonomy: "ifrs-full", concept });
const dei = (concept: string): ConceptAlias => ({ taxonomy: "dei", concept });

export const SEC_CONCEPTS = {
  revenue: { kind: "duration", units: ["USD"], aliases: [us("RevenueFromContractWithCustomerExcludingAssessedTax"), us("Revenues"), us("SalesRevenueNet"), us("SalesRevenueGoodsNet"), ifrs("Revenue")] },
  costOfRevenue: { kind: "duration", units: ["USD"], aliases: [us("CostOfRevenue"), us("CostOfGoodsAndServicesSold"), ifrs("CostOfSales")] },
  grossProfit: { kind: "duration", units: ["USD"], aliases: [us("GrossProfit"), ifrs("GrossProfit")] },
  operatingIncome: { kind: "duration", units: ["USD"], aliases: [us("OperatingIncomeLoss"), ifrs("ProfitLossFromOperatingActivities")] },
  netIncome: { kind: "duration", units: ["USD"], aliases: [us("NetIncomeLoss"), us("ProfitLoss"), ifrs("ProfitLoss")] },
  pretaxIncome: { kind: "duration", units: ["USD"], aliases: [us("IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"), us("IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"), ifrs("ProfitLossBeforeTax")] },
  incomeTaxExpense: { kind: "duration", units: ["USD"], aliases: [us("IncomeTaxExpenseBenefit"), ifrs("IncomeTaxExpenseContinuingOperations")] },
  epsDiluted: { kind: "duration", units: ["USD/shares", "USD-per-shares"], aliases: [us("EarningsPerShareDiluted"), ifrs("DilutedEarningsLossPerShare")] },
  sharesDiluted: { kind: "duration", units: ["shares"], aliases: [us("WeightedAverageNumberOfDilutedSharesOutstanding"), ifrs("AdjustedWeightedAverageShares")] },
  operatingCashFlow: { kind: "duration", units: ["USD"], aliases: [us("NetCashProvidedByUsedInOperatingActivities"), ifrs("CashFlowsFromUsedInOperatingActivities")] },
  capitalExpenditures: { kind: "duration", units: ["USD"], aliases: [us("PaymentsToAcquirePropertyPlantAndEquipment"), us("PaymentsForAdditionsToPropertyPlantAndEquipment"), ifrs("PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities")] },
  interestExpense: { kind: "duration", units: ["USD"], aliases: [us("InterestExpenseNonOperating"), us("InterestExpense"), ifrs("FinanceCosts")] },
  depreciationAndAmortization: { kind: "duration", units: ["USD"], aliases: [us("DepreciationDepletionAndAmortization"), us("DepreciationDepletionAndAmortizationPropertyPlantAndEquipment"), ifrs("DepreciationAndAmortisationExpense")] },
  dividendsPaid: { kind: "duration", units: ["USD"], aliases: [us("PaymentsOfDividends"), us("PaymentsOfDividendsCommonStock"), ifrs("DividendsPaidClassifiedAsFinancingActivities")] },
  stockBasedCompensation: { kind: "duration", units: ["USD"], aliases: [us("ShareBasedCompensation"), ifrs("ShareBasedPaymentExpense")] },
  researchAndDevelopment: { kind: "duration", units: ["USD"], aliases: [us("ResearchAndDevelopmentExpense"), ifrs("ResearchAndDevelopmentExpense")] },
  assets: { kind: "instant", units: ["USD"], aliases: [us("Assets"), ifrs("Assets")] },
  liabilities: { kind: "instant", units: ["USD"], aliases: [us("Liabilities"), ifrs("Liabilities")] },
  equity: { kind: "instant", units: ["USD"], aliases: [us("StockholdersEquity"), us("StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"), ifrs("Equity")] },
  cash: { kind: "instant", units: ["USD"], aliases: [us("CashAndCashEquivalentsAtCarryingValue"), ifrs("CashAndCashEquivalents")] },
  restrictedCash: { kind: "instant", units: ["USD"], aliases: [us("RestrictedCashAndCashEquivalentsCurrent"), us("RestrictedCashAndCashEquivalentsNoncurrent")] },
  currentAssets: { kind: "instant", units: ["USD"], aliases: [us("AssetsCurrent"), ifrs("CurrentAssets")] },
  currentLiabilities: { kind: "instant", units: ["USD"], aliases: [us("LiabilitiesCurrent"), ifrs("CurrentLiabilities")] },
  totalDebt: { kind: "instant", units: ["USD"], aliases: [us("LongTermDebtAndFinanceLeaseObligations"), us("LongTermDebtAndCapitalLeaseObligations")] },
  shortTermDebt: { kind: "instant", units: ["USD"], aliases: [us("ShortTermBorrowings")] },
  commercialPaper: { kind: "instant", units: ["USD"], aliases: [us("CommercialPaper")] },
  currentPortionLongTermDebt: { kind: "instant", units: ["USD"], aliases: [us("LongTermDebtCurrent"), us("CurrentPortionOfLongTermDebt")] },
  longTermDebt: { kind: "instant", units: ["USD"], aliases: [us("LongTermDebtNoncurrent"), us("LongTermDebt") , ifrs("NoncurrentBorrowings")] },
  accountsReceivable: { kind: "instant", units: ["USD"], aliases: [us("AccountsReceivableNetCurrent"), ifrs("TradeAndOtherCurrentReceivables")] },
  inventory: { kind: "instant", units: ["USD"], aliases: [us("InventoryNet"), ifrs("Inventories")] },
  currentShares: { kind: "instant", units: ["shares"], aliases: [dei("EntityCommonStockSharesOutstanding")] },
} as const satisfies Record<string, ConceptSpec>;
