import { getSecUserAgent } from "@/lib/env/server";
import type { AnnualFinancials, CompanyFundamentals, CompanySearchResult } from "@/lib/analysis/types";
import { commonCompanies } from "./common-companies";

type SecTickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

type SecFactUnit = {
  end: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  val: number;
};

type SecCompanyFacts = {
  cik: number;
  entityName: string;
  facts?: {
    "us-gaap"?: Record<string, { units?: Record<string, SecFactUnit[]> }>;
  };
};

const secBase = "https://data.sec.gov";

function secHeaders() {
  const userAgent = getSecUserAgent();
  if (!userAgent) return null;
  return {
    "User-Agent": userAgent,
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate"
  };
}

export function padCik(cik: string | number) {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

export async function fetchSecTickerUniverse(): Promise<CompanySearchResult[]> {
  const headers = secHeaders();
  if (!headers) return commonCompanies;

  const response = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers,
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) return commonCompanies;

  const data = (await response.json()) as Record<string, SecTickerEntry>;
  return Object.values(data).map((entry) => ({
    ticker: entry.ticker,
    name: entry.title,
    cik: padCik(entry.cik_str),
    exchange: "US",
    country: "US"
  }));
}

export async function searchCompanies(query: string): Promise<CompanySearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const universe = await fetchSecTickerUniverse();
  return universe
    .filter(
      (company) =>
        company.ticker.toLowerCase().includes(normalized) ||
        company.name.toLowerCase().includes(normalized)
    )
    .slice(0, 12);
}

function pickFact(
  facts: SecCompanyFacts,
  names: string[],
  unit: "USD" | "shares" | "USD/shares" = "USD"
): SecFactUnit[] {
  const usGaap = facts.facts?.["us-gaap"];
  if (!usGaap) return [];

  for (const name of names) {
    const rows = usGaap[name]?.units?.[unit];
    if (rows?.length) return rows;
  }

  return [];
}

function latestAnnualByYear(rows: SecFactUnit[]) {
  const byYear = new Map<number, SecFactUnit>();
  rows
    .filter((row) => row.form === "10-K" && row.fy && (!row.fp || row.fp === "FY"))
    .sort((a, b) => (a.filed ?? "").localeCompare(b.filed ?? ""))
    .forEach((row) => {
      if (row.fy) byYear.set(row.fy, row);
    });
  return byYear;
}

function getYearValue(map: Map<number, SecFactUnit>, year: number) {
  return map.get(year)?.val ?? null;
}

export async function fetchCompanyFundamentals(company: CompanySearchResult): Promise<CompanyFundamentals | null> {
  const headers = secHeaders();
  if (!headers || !company.cik) return null;

  const cik = padCik(company.cik);
  const response = await fetch(`${secBase}/api/xbrl/companyfacts/CIK${cik}.json`, {
    headers,
    next: { revalidate: 60 * 60 * 12 }
  });

  if (!response.ok) return null;

  const facts = (await response.json()) as SecCompanyFacts;
  const revenue = latestAnnualByYear(
    pickFact(facts, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"])
  );
  const grossProfit = latestAnnualByYear(pickFact(facts, ["GrossProfit"]));
  const operatingIncome = latestAnnualByYear(pickFact(facts, ["OperatingIncomeLoss"]));
  const netIncome = latestAnnualByYear(pickFact(facts, ["NetIncomeLoss", "ProfitLoss"]));
  const epsDiluted = latestAnnualByYear(pickFact(facts, ["EarningsPerShareDiluted"], "USD/shares"));
  const operatingCashFlow = latestAnnualByYear(
    pickFact(facts, ["NetCashProvidedByUsedInOperatingActivities"])
  );
  const capex = latestAnnualByYear(pickFact(facts, ["PaymentsToAcquirePropertyPlantAndEquipment"]));
  const assets = latestAnnualByYear(pickFact(facts, ["Assets"]));
  const liabilities = latestAnnualByYear(pickFact(facts, ["Liabilities"]));
  const cash = latestAnnualByYear(
    pickFact(facts, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"])
  );
  const debt = latestAnnualByYear(pickFact(facts, ["LongTermDebtAndFinanceLeaseObligations", "LongTermDebt"]));
  const equity = latestAnnualByYear(
    pickFact(facts, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"])
  );
  const interestExpense = latestAnnualByYear(pickFact(facts, ["InterestExpenseNonOperating", "InterestExpense"]));

  const years = Array.from(
    new Set([
      ...revenue.keys(),
      ...netIncome.keys(),
      ...assets.keys(),
      ...operatingCashFlow.keys()
    ])
  )
    .sort((a, b) => b - a)
    .slice(0, 5);

  const annual: AnnualFinancials[] = years.map((year) => ({
    fiscalYear: year,
    revenue: getYearValue(revenue, year),
    grossProfit: getYearValue(grossProfit, year),
    operatingIncome: getYearValue(operatingIncome, year),
    netIncome: getYearValue(netIncome, year),
    epsDiluted: getYearValue(epsDiluted, year),
    operatingCashFlow: getYearValue(operatingCashFlow, year),
    capex: getYearValue(capex, year),
    assets: getYearValue(assets, year),
    liabilities: getYearValue(liabilities, year),
    cash: getYearValue(cash, year),
    debt: getYearValue(debt, year),
    equity: getYearValue(equity, year),
    interestExpense: getYearValue(interestExpense, year)
  }));

  return {
    ticker: company.ticker,
    name: facts.entityName || company.name,
    cik,
    sector: null,
    industry: null,
    annual
  };
}
