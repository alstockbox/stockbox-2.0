import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;

const CVM_ITR_2026_URL = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_2026.zip";
const CVM_FCA_2026_URL = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_2026.zip";
const MELIUZ_CNPJ = "14110585000107";
const MELIUZ_TICKER = "CASH3";

function digits(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function parseDelimitedLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ";" && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = parseDelimitedLine(lines[0]).map((header) => header.replace(/^\uFEFF/, ""));
  return lines.slice(1).map((line) => {
    const values = parseDelimitedLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

async function fetchZip(url: string): Promise<JSZip> {
  const response = await fetch(url, {
    headers: { accept: "application/zip", "user-agent": "StockBox/1.0 https://www.getstockbox.app/contact" },
  });
  expect(response.ok, `CVM download failed for ${url} with ${response.status}`).toBe(true);
  if (!response.ok) throw new Error(`CVM download failed with ${response.status}`);
  return JSZip.loadAsync(await response.arrayBuffer());
}

async function readZipCsv(zip: JSZip, matcher: RegExp): Promise<{ name: string; rows: Array<Record<string, string>> } | null> {
  const name = Object.keys(zip.files).find((entry) => matcher.test(entry));
  if (!name) return null;
  const bytes = await zip.file(name)?.async("uint8array");
  if (!bytes) return null;
  const text = new TextDecoder("latin1").decode(bytes);
  return { name, rows: parseCsv(text) };
}

function latestIssuerRows(rows: Array<Record<string, string>>) {
  const issuerRows = rows.filter((row) => digits(row.CNPJ_CIA) === MELIUZ_CNPJ);
  const latestReference = issuerRows.map((row) => row.DT_REFER).filter(Boolean).sort().at(-1);
  const latestVersion = issuerRows
    .filter((row) => row.DT_REFER === latestReference)
    .map((row) => Number(row.VERSAO || 0))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  return issuerRows.filter((row) => (
    row.DT_REFER === latestReference
    && Number(row.VERSAO || 0) === latestVersion
    && (!row.ORDEM_EXERC || /ultimo|último/i.test(row.ORDEM_EXERC))
  ));
}

function compact(row: Record<string, string>) {
  return {
    cnpj: row.CNPJ_CIA ?? null,
    company: row.DENOM_CIA ?? null,
    cvmCode: row.CD_CVM ?? null,
    referenceDate: row.DT_REFER ?? null,
    version: row.VERSAO ?? null,
    statement: row.GRUPO_DFP ?? null,
    currency: row.MOEDA ?? null,
    scale: row.ESCALA_MOEDA ?? null,
    periodEnd: row.DT_FIM_EXERC ?? null,
    accountCode: row.CD_CONTA ?? null,
    accountDescription: row.DS_CONTA ?? null,
    value: row.VL_CONTA ?? null,
    fixedAccount: row.ST_CONTA_FIXA ?? null,
  };
}

liveDescribe("live CVM Brazil fundamentals fingerprint", () => {
  it("extracts current Meliuz debt/cash evidence and proves a generic FCA ticker-to-CNPJ mapping", async () => {
    const [itrZip, fcaZip] = await Promise.all([
      fetchZip(CVM_ITR_2026_URL),
      fetchZip(CVM_FCA_2026_URL),
    ]);

    const entries = Object.keys(itrZip.files).sort();
    const [bppCon, bppInd, bpaCon, bpaInd] = await Promise.all([
      readZipCsv(itrZip, /itr_cia_aberta_BPP_con_2026\.csv$/i),
      readZipCsv(itrZip, /itr_cia_aberta_BPP_ind_2026\.csv$/i),
      readZipCsv(itrZip, /itr_cia_aberta_BPA_con_2026\.csv$/i),
      readZipCsv(itrZip, /itr_cia_aberta_BPA_ind_2026\.csv$/i),
    ]);

    expect(bppCon || bppInd, "Expected at least one CVM BPP statement file").toBeTruthy();
    expect(bpaCon || bpaInd, "Expected at least one CVM BPA statement file").toBeTruthy();

    const debtPattern = /empr[eé]st|financi|arrend|lease|deb[eê]nt|d[ií]vid|oneroso/i;
    const cashPattern = /caixa|equivalente|aplica[cç][aã]o financeira|disponibilidade/i;
    const statementRows = [
      ["BPP_con", bppCon],
      ["BPP_ind", bppInd],
      ["BPA_con", bpaCon],
      ["BPA_ind", bpaInd],
    ] as const;

    const fingerprint = statementRows.map(([label, file]) => {
      const latest = file ? latestIssuerRows(file.rows) : [];
      return {
        label,
        file: file?.name ?? null,
        latestReferenceDate: latest[0]?.DT_REFER ?? null,
        latestVersion: latest[0]?.VERSAO ?? null,
        issuerRowCount: latest.length,
        debtRows: latest.filter((row) => debtPattern.test(row.DS_CONTA ?? "")).map(compact),
        cashRows: latest.filter((row) => cashPattern.test(row.DS_CONTA ?? "")).map(compact),
      };
    });

    const fcaEntries = Object.keys(fcaZip.files).filter((entry) => entry.toLowerCase().endsWith(".csv")).sort();
    const securityMapMatches: Array<{ file: string; row: Record<string, string> }> = [];
    for (const entry of fcaEntries) {
      const bytes = await fcaZip.file(entry)?.async("uint8array");
      if (!bytes) continue;
      const rows = parseCsv(new TextDecoder("latin1").decode(bytes));
      for (const row of rows) {
        const values = Object.values(row);
        const hasTicker = values.some((value) => value.trim().toUpperCase() === MELIUZ_TICKER);
        const hasCnpj = values.some((value) => digits(value) === MELIUZ_CNPJ);
        if (hasTicker || hasCnpj) securityMapMatches.push({ file: entry, row });
      }
    }

    const result = {
      source: CVM_ITR_2026_URL,
      securityMapSource: CVM_FCA_2026_URL,
      cnpj: MELIUZ_CNPJ,
      ticker: MELIUZ_TICKER,
      zipEntryCount: entries.length,
      relevantZipEntries: entries.filter((entry) => /_(BPP|BPA)_(con|ind)_2026\.csv$/i.test(entry)),
      fingerprint,
      securityMap: {
        zipEntries: fcaEntries,
        matches: securityMapMatches,
      },
    };

    console.log(`CVM_BRAZIL_FUNDAMENTALS_FINGERPRINT ${JSON.stringify(result)}`);
    await mkdir("artifacts/coverage-live", { recursive: true });
    await writeFile(
      "artifacts/coverage-live/cvm-brazil-fundamentals-fingerprint.json",
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );

    const issuerRows = fingerprint.reduce((count, item) => count + item.issuerRowCount, 0);
    expect(issuerRows, "Expected current CVM statement rows for Meliuz CNPJ").toBeGreaterThan(0);
    expect(
      securityMapMatches.some(({ row }) => Object.values(row).some((value) => value.trim().toUpperCase() === MELIUZ_TICKER)),
      "Expected FCA to map the listed CASH3 security without ticker-specific production code",
    ).toBe(true);
    expect(
      securityMapMatches.some(({ row }) => Object.values(row).some((value) => digits(value) === MELIUZ_CNPJ)),
      "Expected FCA security mapping evidence to include Meliuz CNPJ",
    ).toBe(true);
  }, 240_000);
});
