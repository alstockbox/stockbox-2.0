import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyFundamentals, CompanySearchResult } from "@/lib/analysis/types";
import {
  enrichBrazilFundamentalsWithCvmDebt,
  resetCvmBrazilDatasetCacheForTests,
} from "@/lib/data/cvm-brazil-provider";

const company: CompanySearchResult = {
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

function fundamentals(totalDebt: number | null = null): CompanyFundamentals {
  return {
    ticker: "CASH3.SA",
    name: "Meliuz S.A.",
    sector: "Consumer Cyclical",
    industry: "Internet Retail",
    annual: [],
    reportingCurrency: "BRL",
    annualPeriods: [],
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

function latin1Bytes(text: string): Uint8Array {
  return Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 0xff));
}

async function zipResponse(fileName: string, csv: string): Promise<Response> {
  const zip = new JSZip();
  zip.file(fileName, latin1Bytes(csv));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: { "content-type": "application/zip" },
  });
}

function fcaCsv(ticker = "CASH3"): string {
  return [
    "CNPJ_Companhia;Codigo_CVM;Nome_Empresarial;Valor_Mobiliario;Codigo_Negociacao;Mercado;Sigla_Entidade_Administradora;Data_Fim_Negociacao",
    `14.110.585/0001-07;025232;MÉLIUZ S.A.;Ações Ordinárias;${ticker};Bolsa;B3;`,
  ].join("\n");
}

function itrCsv({ period = "2026-06-30", currentDebt = "0.0000000000", nonCurrentDebt = "0.0000000000" } = {}): string {
  return [
    "CNPJ_CIA;CD_CVM;DT_REFER;VERSAO;DENOM_CIA;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_FIM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA",
    `14.110.585/0001-07;025232;${period};1;MÉLIUZ S.A.;DF Consolidado - Balanço Patrimonial Passivo;REAL;MIL;ÚLTIMO;${period};2.01.04;Empréstimos e Financiamentos;${currentDebt};S`,
    `14.110.585/0001-07;025232;${period};1;MÉLIUZ S.A.;DF Consolidado - Balanço Patrimonial Passivo;REAL;MIL;ÚLTIMO;${period};2.02.01;Empréstimos e Financiamentos;${nonCurrentDebt};S`,
  ].join("\n");
}

function providerFetch({ fca = fcaCsv(), itr = itrCsv(), failFca = false, failItr = false } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/FCA/")) {
      if (failFca) return new Response("failure", { status: 503 });
      return zipResponse("fca_cia_aberta_valor_mobiliario_2026.csv", fca);
    }
    if (url.includes("/ITR/")) {
      if (failItr) return new Response("failure", { status: 503 });
      return zipResponse("itr_cia_aberta_BPP_con_2026.csv", itr);
    }
    return new Response("not found", { status: 404 });
  });
}

describe("CVM Brazil debt provider", () => {
  beforeEach(() => resetCvmBrazilDatasetCacheForTests());

  it("does not call CVM when current debt is already available", async () => {
    const fetchImpl = providerFetch();
    const input = fundamentals(123_000);

    const result = await enrichBrazilFundamentalsWithCvmDebt(company, input, { fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.fundamentals).toBe(input);
    expect(result.supplemented).toBe(false);
    expect(result.diagnostic).toBeNull();
  });

  it("does not call CVM for a non-Brazil/B3 security", async () => {
    const fetchImpl = providerFetch();
    const input = fundamentals(null);

    const result = await enrichBrazilFundamentalsWithCvmDebt(
      { ...company, country: "United States", exchange: "NYSE", mic: "XNYS" },
      input,
      { fetchImpl },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.fundamentals).toBe(input);
    expect(result.supplemented).toBe(false);
  });

  it("maps the B3 ticker through FCA, fetches matching ITR and supplements explicit zero debt", async () => {
    const fetchImpl = providerFetch();
    const input = fundamentals(null);

    const result = await enrichBrazilFundamentalsWithCvmDebt(company, input, { fetchImpl, useCache: false });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("fca_cia_aberta_2026.zip");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("itr_cia_aberta_2026.zip");
    expect(input.trailingTwelveMonths?.totalDebt).toBeNull();
    expect(result.fundamentals.trailingTwelveMonths?.totalDebt).toBe(0);
    expect(result.fundamentals.trailingTwelveMonths?.provenance?.totalDebt?.provider).toBe("cvm-brazil-itr");
    expect(result.supplemented).toBe(true);
    expect(result.diagnostic).toEqual(expect.objectContaining({
      provider: "CVM ITR",
      capability: "fundamentals",
      status: "available",
      reason: "supplemented_missing_total_debt",
    }));
    expect(result.source).toEqual(expect.objectContaining({
      provider: "cvm-brazil-itr",
      capability: "fundamentals",
      dataAsOf: "2026-06-30",
    }));
  });

  it("does not download the large ITR archive when FCA cannot map the ticker", async () => {
    const fetchImpl = providerFetch({ fca: fcaCsv("OTHER3") });
    const input = fundamentals(null);

    const result = await enrichBrazilFundamentalsWithCvmDebt(company, input, { fetchImpl, useCache: false });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/FCA/");
    expect(result.fundamentals).toBe(input);
    expect(result.supplemented).toBe(false);
    expect(result.diagnostic).toEqual(expect.objectContaining({
      provider: "CVM ITR",
      status: "unavailable",
      reason: "issuer_mapping_not_found",
    }));
  });

  it("fails closed when the latest CVM observation does not match the provider financial period", async () => {
    const fetchImpl = providerFetch({ itr: itrCsv({ period: "2026-03-31" }) });
    const input = fundamentals(null);

    const result = await enrichBrazilFundamentalsWithCvmDebt(company, input, { fetchImpl, useCache: false });

    expect(result.fundamentals).toBe(input);
    expect(result.supplemented).toBe(false);
    expect(result.diagnostic).toEqual(expect.objectContaining({
      provider: "CVM ITR",
      status: "partial",
      reason: "period_mismatch",
    }));
  });

  it("preserves provider data and surfaces upstream failures without inventing debt", async () => {
    const fetchImpl = providerFetch({ failItr: true });
    const input = fundamentals(null);

    const result = await enrichBrazilFundamentalsWithCvmDebt(company, input, { fetchImpl, useCache: false });

    expect(result.fundamentals).toBe(input);
    expect(result.fundamentals.trailingTwelveMonths?.totalDebt).toBeNull();
    expect(result.supplemented).toBe(false);
    expect(result.diagnostic).toEqual(expect.objectContaining({
      provider: "CVM ITR",
      status: "unavailable",
      reason: "upstream_error",
    }));
  });

  it("reuses the same yearly FCA and ITR datasets within the provider cache", async () => {
    const fetchImpl = providerFetch();

    const first = await enrichBrazilFundamentalsWithCvmDebt(company, fundamentals(null), {
      fetchImpl,
      useCache: true,
      now: () => 1_000,
    });
    const second = await enrichBrazilFundamentalsWithCvmDebt(company, fundamentals(null), {
      fetchImpl,
      useCache: true,
      now: () => 2_000,
    });

    expect(first.supplemented).toBe(true);
    expect(second.supplemented).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
