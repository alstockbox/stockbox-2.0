import { describe, expect, it } from "vitest";
import type { CompanyFundamentals, CompanySearchResult } from "@/lib/analysis/types";
import {
  deriveCvmTotalDebt,
  normalizeBrazilTradingTicker,
  resolveCvmIssuerFromFcaRows,
  supplementFundamentalsWithCvmDebt,
  type CvmCsvRow,
} from "@/lib/data/cvm-brazil-fundamentals";

const brazilCompany: CompanySearchResult = {
  ticker: "CASH3.SA",
  canonicalTicker: "CASH3.SA",
  localTicker: "CASH3",
  name: "Meliuz S.A.",
  country: "Brazil",
  exchange: "SAO",
  mic: "BVMF",
  currency: "BRL",
  securityType: "Common Stock",
};

function fcaRow(overrides: Partial<CvmCsvRow> = {}): CvmCsvRow {
  return {
    CNPJ_Companhia: "14.110.585/0001-07",
    Codigo_CVM: "025232",
    Nome_Empresarial: "MÉLIUZ S.A.",
    Valor_Mobiliario: "Ações Ordinárias",
    Codigo_Negociacao: "CASH3",
    Mercado: "Bolsa",
    Sigla_Entidade_Administradora: "B3",
    Data_Fim_Negociacao: "",
    ...overrides,
  };
}

function debtRow(accountCode: string, value: string, overrides: Partial<CvmCsvRow> = {}): CvmCsvRow {
  return {
    CNPJ_CIA: "14.110.585/0001-07",
    CD_CVM: "025232",
    DT_REFER: "2026-06-30",
    VERSAO: "1",
    DENOM_CIA: "MÉLIUZ S.A.",
    GRUPO_DFP: "DF Consolidado - Balanço Patrimonial Passivo",
    MOEDA: "REAL",
    ESCALA_MOEDA: "MIL",
    ORDEM_EXERC: "ÚLTIMO",
    DT_FIM_EXERC: "2026-06-30",
    CD_CONTA: accountCode,
    DS_CONTA: accountCode === "2.01.04" ? "Empréstimos e Financiamentos" : "Empréstimos e Financiamentos",
    VL_CONTA: value,
    ST_CONTA_FIXA: "S",
    ...overrides,
  };
}

function fundamentals(totalDebt: number | null = null): CompanyFundamentals {
  return {
    ticker: "CASH3.SA",
    name: "Meliuz S.A.",
    sector: "Consumer Cyclical",
    industry: "Internet Retail",
    annual: [],
    reportingCurrency: "BRL",
    annualPeriods: [
      {
        periodEndDate: "2025-12-31",
        periodBasis: "FY",
        currency: "BRL",
        totalDebt: 99_000,
        cashAndEquivalents: 72_857_000,
        provenance: {},
      },
    ],
    trailingTwelveMonths: {
      periodEndDate: "2026-06-30",
      periodBasis: "TTM_REPORTED",
      currency: "BRL",
      totalDebt,
      cashAndEquivalents: 73_301_000,
      provenance: totalDebt === null ? {} : {
        totalDebt: {
          source: "Yahoo Finance fundamentals timeseries",
          provider: "yahoo-fundamentals",
          unit: "BRL",
          periodEnd: "2026-06-30",
          valueKind: "reported",
        },
      },
    },
  } as CompanyFundamentals;
}

describe("CVM Brazil fundamentals supplement", () => {
  it("normalizes a Brazil/B3 Yahoo ticker to the local trading code", () => {
    expect(normalizeBrazilTradingTicker(brazilCompany)).toBe("CASH3");
    expect(normalizeBrazilTradingTicker({ ...brazilCompany, localTicker: undefined })).toBe("CASH3");
    expect(normalizeBrazilTradingTicker({ ...brazilCompany, country: "United States", exchange: "NYSE", mic: "XNYS" })).toBeNull();
  });

  it("maps an active B3 listed security to CVM issuer identity without ticker-specific rules", () => {
    expect(resolveCvmIssuerFromFcaRows([fcaRow()], "CASH3")).toEqual({
      ticker: "CASH3",
      cnpj: "14110585000107",
      cvmCode: "025232",
    });
  });

  it("rejects expired or non-B3 FCA security mappings", () => {
    expect(resolveCvmIssuerFromFcaRows([
      fcaRow({ Data_Fim_Negociacao: "2025-12-31" }),
    ], "CASH3")).toBeNull();
    expect(resolveCvmIssuerFromFcaRows([
      fcaRow({ Sigla_Entidade_Administradora: "OTC" }),
    ], "CASH3")).toBeNull();
  });

  it("derives reported total debt from exactly the two fixed top-level CVM debt accounts", () => {
    const result = deriveCvmTotalDebt([
      debtRow("2.01.04", "125,5"),
      debtRow("2.01.04.01", "125,5", { DS_CONTA: "Empréstimos Bancários" }),
      debtRow("2.02.01", "374.5000000000"),
      debtRow("2.02.01.01", "374.5000000000", { DS_CONTA: "Empréstimos Bancários" }),
    ], { ticker: "CASH3", cnpj: "14110585000107", cvmCode: "025232" });

    expect(result).toEqual(expect.objectContaining({
      totalDebt: 500_000,
      currency: "BRL",
      periodEnd: "2026-06-30",
    }));
    expect(result?.provenance).toEqual(expect.objectContaining({
      source: "CVM ITR",
      provider: "cvm-brazil-itr",
      concept: "2.01.04+2.02.01",
      unit: "BRL",
      periodEnd: "2026-06-30",
      valueKind: "derived",
      inputs: ["2.01.04", "2.02.01"],
    }));
  });

  it("accepts an explicitly reported zero debt instead of treating zero as missing", () => {
    expect(deriveCvmTotalDebt([
      debtRow("2.01.04", "0.0000000000"),
      debtRow("2.02.01", "0.0000000000"),
    ], { ticker: "CASH3", cnpj: "14110585000107", cvmCode: "025232" })?.totalDebt).toBe(0);
  });

  it("uses only exact current exercise rows and never confuses PENULTIMO with ULTIMO", () => {
    const result = deriveCvmTotalDebt([
      debtRow("2.01.04", "0"),
      debtRow("2.02.01", "0"),
      debtRow("2.01.04", "900", { ORDEM_EXERC: "PENÚLTIMO", DT_FIM_EXERC: "2025-12-31" }),
      debtRow("2.02.01", "1100", { ORDEM_EXERC: "PENÚLTIMO", DT_FIM_EXERC: "2025-12-31" }),
    ], { ticker: "CASH3", cnpj: "14110585000107", cvmCode: "025232" });

    expect(result?.totalDebt).toBe(0);
    expect(result?.periodEnd).toBe("2026-06-30");
  });

  it("fails closed when either top-level debt component is missing or scale/currency is unsupported", () => {
    const issuer = { ticker: "CASH3", cnpj: "14110585000107", cvmCode: "025232" };
    expect(deriveCvmTotalDebt([debtRow("2.01.04", "0")], issuer)).toBeNull();
    expect(deriveCvmTotalDebt([
      debtRow("2.01.04", "0", { ESCALA_MOEDA: "MILHÃO" }),
      debtRow("2.02.01", "0", { ESCALA_MOEDA: "MILHÃO" }),
    ], issuer)).toBeNull();
    expect(deriveCvmTotalDebt([
      debtRow("2.01.04", "0", { MOEDA: "DOLAR" }),
      debtRow("2.02.01", "0", { MOEDA: "DOLAR" }),
    ], issuer)).toBeNull();
  });

  it("selects the latest reference/version for the issuer and ignores another CNPJ", () => {
    const issuer = { ticker: "CASH3", cnpj: "14110585000107", cvmCode: "025232" };
    const result = deriveCvmTotalDebt([
      debtRow("2.01.04", "10", { DT_REFER: "2026-03-31", DT_FIM_EXERC: "2026-03-31" }),
      debtRow("2.02.01", "20", { DT_REFER: "2026-03-31", DT_FIM_EXERC: "2026-03-31" }),
      debtRow("2.01.04", "30", { VERSAO: "1" }),
      debtRow("2.02.01", "40", { VERSAO: "1" }),
      debtRow("2.01.04", "50", { VERSAO: "2" }),
      debtRow("2.02.01", "60", { VERSAO: "2" }),
      debtRow("2.01.04", "999", { CNPJ_CIA: "00.000.000/0000-00", VERSAO: "9" }),
      debtRow("2.02.01", "999", { CNPJ_CIA: "00.000.000/0000-00", VERSAO: "9" }),
    ], issuer);

    expect(result?.periodEnd).toBe("2026-06-30");
    expect(result?.totalDebt).toBe(110_000);
  });

  it("immutably fills only matching missing debt and preserves an existing provider value", () => {
    const observation = deriveCvmTotalDebt([
      debtRow("2.01.04", "0"),
      debtRow("2.02.01", "0"),
    ], { ticker: "CASH3", cnpj: "14110585000107", cvmCode: "025232" });
    expect(observation).not.toBeNull();

    const input = fundamentals(null);
    const output = supplementFundamentalsWithCvmDebt(brazilCompany, input, observation);
    expect(output).not.toBe(input);
    expect(input.trailingTwelveMonths?.totalDebt).toBeNull();
    expect(output.trailingTwelveMonths?.totalDebt).toBe(0);
    expect(output.trailingTwelveMonths?.provenance?.totalDebt).toEqual(observation?.provenance);
    expect(output.annualPeriods?.[0]?.totalDebt).toBe(99_000);

    const existing = fundamentals(123_000);
    const preserved = supplementFundamentalsWithCvmDebt(brazilCompany, existing, observation);
    expect(preserved.trailingTwelveMonths?.totalDebt).toBe(123_000);
    expect(preserved.trailingTwelveMonths?.provenance?.totalDebt?.provider).toBe("yahoo-fundamentals");
  });

  it("does not apply an observation to a non-Brazil company or a different period", () => {
    const observation = deriveCvmTotalDebt([
      debtRow("2.01.04", "0", { DT_REFER: "2026-03-31", DT_FIM_EXERC: "2026-03-31" }),
      debtRow("2.02.01", "0", { DT_REFER: "2026-03-31", DT_FIM_EXERC: "2026-03-31" }),
    ], { ticker: "CASH3", cnpj: "14110585000107", cvmCode: "025232" });
    const input = fundamentals(null);

    expect(supplementFundamentalsWithCvmDebt(brazilCompany, input, observation).trailingTwelveMonths?.totalDebt).toBeNull();
    expect(supplementFundamentalsWithCvmDebt(
      { ...brazilCompany, country: "United States", exchange: "NYSE", mic: "XNYS" },
      input,
      { ...observation!, periodEnd: "2026-06-30" },
    ).trailingTwelveMonths?.totalDebt).toBeNull();
  });
});
