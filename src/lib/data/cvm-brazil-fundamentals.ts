import type { CompanyFundamentals, CompanySearchResult, MetricProvenance } from "@/lib/analysis/types";

export type CvmCsvRow = Record<string, string>;

export type CvmIssuerIdentity = {
  ticker: string;
  cnpj: string;
  cvmCode: string | null;
};

export type CvmDebtObservation = {
  ticker: string;
  cnpj: string;
  cvmCode: string | null;
  totalDebt: number;
  currency: "BRL";
  periodEnd: string;
  provenance: MetricProvenance;
};

function normalizedText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizedTicker(value: string | null | undefined): string | null {
  const ticker = (value ?? "").trim().toUpperCase().replace(/\.SA$/i, "");
  return ticker && /^[A-Z0-9]{4,12}$/.test(ticker) ? ticker : null;
}

function isBrazilCountry(value: string | null | undefined): boolean {
  return ["BR", "BRASIL", "BRAZIL"].includes(normalizedText(value));
}

function isBrazilVenue(exchange: string | null | undefined, mic: string | null | undefined): boolean {
  const normalizedExchange = normalizedText(exchange);
  const normalizedMic = normalizedText(mic);
  return normalizedMic === "BVMF"
    || normalizedExchange === "B3"
    || normalizedExchange === "SAO"
    || normalizedExchange.includes("SAO PAULO");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseCvmNumber(value: string | null | undefined): number | null {
  const raw = (value ?? "").trim().replace(/\s/g, "");
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(",")) {
    normalized = raw.includes(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function validIsoDate(value: string | null | undefined): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test((value ?? "").trim());
}

function scaleMultiplier(value: string | null | undefined): number | null {
  switch (normalizedText(value)) {
    case "MIL":
      return 1_000;
    case "UNIDADE":
    case "UNIDADES":
      return 1;
    default:
      return null;
  }
}

export function normalizeBrazilTradingTicker(
  company: Pick<CompanySearchResult, "ticker" | "canonicalTicker" | "localTicker" | "country" | "exchange" | "mic">,
): string | null {
  const country = normalizedText(company.country);
  if (country && !isBrazilCountry(country)) return null;

  const listedTicker = company.canonicalTicker ?? company.ticker;
  const hasYahooBrazilSuffix = /\.SA$/i.test(listedTicker) || /\.SA$/i.test(company.ticker);
  const venueMatches = isBrazilVenue(company.exchange, company.mic);
  if (!hasYahooBrazilSuffix && !venueMatches) return null;

  return normalizedTicker(company.localTicker ?? listedTicker ?? company.ticker);
}

export function resolveCvmIssuerFromFcaRows(
  rows: CvmCsvRow[],
  ticker: string,
): CvmIssuerIdentity | null {
  const expectedTicker = normalizedTicker(ticker);
  if (!expectedTicker) return null;

  const matches = rows.flatMap((row) => {
    if (normalizedTicker(row.Codigo_Negociacao) !== expectedTicker) return [];
    if (normalizedText(row.Mercado) !== "BOLSA") return [];
    if (normalizedText(row.Sigla_Entidade_Administradora) !== "B3") return [];
    if ((row.Data_Fim_Negociacao ?? "").trim()) return [];

    const cnpj = digits(row.CNPJ_Companhia);
    if (cnpj.length !== 14) return [];
    const cvmCode = (row.Codigo_CVM ?? "").trim() || null;
    return [{ ticker: expectedTicker, cnpj, cvmCode } satisfies CvmIssuerIdentity];
  });

  if (matches.length === 0) return null;
  const identities = new Map(matches.map((match) => [
    `${match.ticker}|${match.cnpj}|${match.cvmCode ?? ""}`,
    match,
  ]));
  return identities.size === 1 ? [...identities.values()][0] : null;
}

export function deriveCvmTotalDebt(
  rows: CvmCsvRow[],
  issuer: CvmIssuerIdentity,
): CvmDebtObservation | null {
  const issuerCnpj = digits(issuer.cnpj);
  if (issuerCnpj.length !== 14) return null;
  const issuerCvmCode = digits(issuer.cvmCode);

  const issuerRows = rows.filter((row) => {
    if (digits(row.CNPJ_CIA) !== issuerCnpj) return false;
    if (issuerCvmCode && digits(row.CD_CVM) !== issuerCvmCode) return false;
    return validIsoDate(row.DT_REFER);
  });
  if (issuerRows.length === 0) return null;

  const latestReference = issuerRows.map((row) => row.DT_REFER.trim()).sort().at(-1);
  if (!latestReference) return null;
  const referenceRows = issuerRows.filter((row) => row.DT_REFER.trim() === latestReference);
  const versions = referenceRows
    .map((row) => Number(row.VERSAO))
    .filter((value) => Number.isFinite(value));
  if (versions.length === 0) return null;
  const latestVersion = Math.max(...versions);

  const currentRows = referenceRows.filter((row) => (
    Number(row.VERSAO) === latestVersion
    && normalizedText(row.ORDEM_EXERC) === "ULTIMO"
    && row.DT_FIM_EXERC?.trim() === latestReference
    && normalizedText(row.MOEDA) === "REAL"
    && normalizedText(row.ST_CONTA_FIXA) === "S"
  ));

  const currentDebtRows = currentRows.filter((row) => row.CD_CONTA?.trim() === "2.01.04");
  const nonCurrentDebtRows = currentRows.filter((row) => row.CD_CONTA?.trim() === "2.02.01");
  if (currentDebtRows.length !== 1 || nonCurrentDebtRows.length !== 1) return null;

  const currentDebtRow = currentDebtRows[0];
  const nonCurrentDebtRow = nonCurrentDebtRows[0];
  const currentScale = scaleMultiplier(currentDebtRow.ESCALA_MOEDA);
  const nonCurrentScale = scaleMultiplier(nonCurrentDebtRow.ESCALA_MOEDA);
  if (currentScale === null || nonCurrentScale === null || currentScale !== nonCurrentScale) return null;

  const currentDebt = parseCvmNumber(currentDebtRow.VL_CONTA);
  const nonCurrentDebt = parseCvmNumber(nonCurrentDebtRow.VL_CONTA);
  if (currentDebt === null || nonCurrentDebt === null || currentDebt < 0 || nonCurrentDebt < 0) return null;

  const totalDebt = (currentDebt + nonCurrentDebt) * currentScale;
  if (!Number.isFinite(totalDebt) || totalDebt < 0) return null;

  return {
    ticker: issuer.ticker,
    cnpj: issuerCnpj,
    cvmCode: issuer.cvmCode,
    totalDebt,
    currency: "BRL",
    periodEnd: latestReference,
    provenance: {
      source: "CVM ITR",
      provider: "cvm-brazil-itr",
      concept: "2.01.04+2.02.01",
      unit: "BRL",
      periodEnd: latestReference,
      valueKind: "derived",
      inputs: ["2.01.04", "2.02.01"],
      note: "Total debt derived from the two directly reported fixed CVM ITR top-level current and non-current borrowing accounts; child accounts are not re-summed.",
    },
  };
}

export function supplementFundamentalsWithCvmDebt(
  company: CompanySearchResult,
  fundamentals: CompanyFundamentals,
  observation: CvmDebtObservation | null,
): CompanyFundamentals {
  const ticker = normalizeBrazilTradingTicker(company);
  if (!ticker || !observation || ticker !== normalizedTicker(observation.ticker)) return fundamentals;

  let changed = false;
  const supplementPeriod = <T extends NonNullable<CompanyFundamentals["trailingTwelveMonths"]>>(period: T): T => {
    if (
      period.periodEndDate !== observation.periodEnd
      || normalizedText(period.currency) !== observation.currency
      || isFiniteNumber(period.totalDebt)
    ) {
      return period;
    }
    changed = true;
    return {
      ...period,
      totalDebt: observation.totalDebt,
      provenance: {
        ...(period.provenance ?? {}),
        totalDebt: observation.provenance,
      },
    };
  };

  const annualPeriods = fundamentals.annualPeriods?.map((period) => supplementPeriod(period));
  const trailingTwelveMonths = fundamentals.trailingTwelveMonths
    ? supplementPeriod(fundamentals.trailingTwelveMonths)
    : undefined;
  const priorTrailingTwelveMonths = fundamentals.priorTrailingTwelveMonths
    ? supplementPeriod(fundamentals.priorTrailingTwelveMonths)
    : undefined;

  if (!changed) return fundamentals;
  return {
    ...fundamentals,
    annualPeriods,
    trailingTwelveMonths,
    priorTrailingTwelveMonths,
  };
}
