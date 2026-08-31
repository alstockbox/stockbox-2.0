import { describe, expect, it } from "vitest";
import { parseBolagsverketDocumentList } from "../../src/lib/data/bolagsverket";
import { parseFiInsiderCsv, parseFiShortRegisterHtml } from "../../src/lib/data/fi-market-intelligence";
import { pickGleifCandidate } from "../../src/lib/data/gleif";
import { pickOpenFigiCandidate } from "../../src/lib/data/openfigi";
import { parseRiksbankLatestObservation, riskFreeSeriesForCurrency } from "../../src/lib/data/riksbank";
import { parseSecOwnershipXml } from "../../src/lib/data/sec-insider";

describe("official data intelligence adapters", () => {
  it("maps supported currencies to official 10-year government bond series", () => {
    expect(riskFreeSeriesForCurrency("SEK")?.seriesId).toBe("SEGVB10YC");
    expect(riskFreeSeriesForCurrency("USD")?.seriesId).toBe("USGVB10Y");
    expect(riskFreeSeriesForCurrency("EUR")?.seriesId).toBe("EMGVB10Y");
    expect(riskFreeSeriesForCurrency("GBP")?.seriesId).toBe("GBGVB10Y");
    expect(riskFreeSeriesForCurrency("XYZ")).toBeNull();
  });

  it("parses the latest Riksbank observation without manufacturing a rate", () => {
    expect(parseRiksbankLatestObservation([{ date: "2026-08-28", value: 2.431 }])).toEqual({
      date: "2026-08-28",
      value: 2.431,
    });
    expect(parseRiksbankLatestObservation({ observations: [] })).toBeNull();
  });

  it("parses FI insider CSV and classifies acquisitions and disposals newest first", () => {
    const csv = [
      "Publiceringsdatum;Emittent;Person i ledande ställning;Befattning;Närstående;Karaktär;Instrumentnamn;Instrumenttyp;ISIN;Transaktionsdatum;Volym;Volymsenhet;Pris;Valuta;Status;Detaljer",
      "2026-08-20;Exempel AB;Anna Andersson;VD;Nej;Förvärv;Aktie;Aktie;SE0000000001;2026-08-19;1000;Antal;42,50;SEK;Aktuell;",
      "2026-08-21;Exempel AB;Bo Berg;Styrelseledamot;Nej;Avyttring;Aktie;Aktie;SE0000000001;2026-08-20;500;Antal;45,00;SEK;Aktuell;",
    ].join("\n");
    const parsed = parseFiInsiderCsv(csv, "Exempel AB");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual(expect.objectContaining({ transactionType: "open_market_sell", insiderRole: "Styrelseledamot", shares: 500, value: 22500, date: "2026-08-20" }));
    expect(parsed[1]).toEqual(expect.objectContaining({ transactionType: "open_market_buy", insiderRole: "VD", shares: 1000, value: 42500, date: "2026-08-19" }));
  });

  it("matches FI short-interest rows by LEI rather than a fuzzy company name", () => {
    const html = `
      <table><tbody>
        <tr><td>Wrong Name AB</td><td>11111111111111111111</td><td>2026-08-07</td><td>9,99</td></tr>
        <tr><td>Exempel Aktiebolag</td><td>549300ABCDEFGHIJKLMN</td><td>2026-08-08</td><td>4,25</td></tr>
      </tbody></table>`;
    expect(parseFiShortRegisterHtml(html, { name: "Exempel AB", lei: "549300ABCDEFGHIJKLMN" })).toEqual({
      issuerName: "Exempel Aktiebolag",
      lei: "549300ABCDEFGHIJKLMN",
      positionDate: "2026-08-08",
      aggregateShortPercent: 4.25,
    });
  });

  it("parses discretionary and 10b5-1 SEC Form 4 transactions", () => {
    const xml = `<?xml version="1.0"?>
      <ownershipDocument>
        <reportingOwner><reportingOwnerId><rptOwnerName>Jane Doe</rptOwnerName></reportingOwnerId>
          <reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>Chief Financial Officer</officerTitle></reportingOwnerRelationship>
        </reportingOwner>
        <aff10b5One>1</aff10b5One>
        <nonDerivativeTable>
          <nonDerivativeTransaction>
            <transactionDate><value>2026-08-13</value></transactionDate>
            <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
            <transactionAmounts>
              <transactionShares><value>100</value></transactionShares>
              <transactionPricePerShare><value>75</value></transactionPricePerShare>
              <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
            </transactionAmounts>
          </nonDerivativeTransaction>
        </nonDerivativeTable>
      </ownershipDocument>`;
    const parsed = parseSecOwnershipXml(xml);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(expect.objectContaining({ transactionType: "automatic_plan", insiderRole: "Chief Financial Officer", shares: 100, value: 7500, date: "2026-08-13", automaticPlan: true }));
  });

  it("selects an OpenFIGI candidate only when identity evidence is sufficiently specific", () => {
    const candidate = pickOpenFigiCandidate([
      { figi: "BBG1", ticker: "EX", name: "EXAMPLE CORP", securityType2: "Common Stock", exchCode: "US" },
      { figi: "BBG2", ticker: "EX", name: "EXAMPLE CORP NOTE", securityType2: "Bond", exchCode: "US" },
    ], { ticker: "EX", name: "Example Corp", securityType: "Common Stock" });
    expect(candidate?.figi).toBe("BBG1");
  });

  it("does not accept a weak GLEIF legal-name match", () => {
    const records = [
      { lei: "LEI-WRONG", legalName: "Example Logistics Holdings GmbH", country: "DE", registrationAuthorityEntityId: "123456" },
      { lei: "LEI-RIGHT", legalName: "Example AB", country: "SE", registrationAuthorityEntityId: "5590000000" },
    ];
    expect(pickGleifCandidate(records, { name: "Example AB", country: "SE" })?.lei).toBe("LEI-RIGHT");
    expect(pickGleifCandidate(records, { name: "Completely Different AB", country: "SE" })).toBeNull();
  });

  it("normalizes Bolagsverket annual-report metadata and rejects malformed entries", () => {
    expect(parseBolagsverketDocumentList({
      dokument: [
        { dokumentId: "doc-1", filformat: "application/zip", rapporteringsperiodTom: "2025-12-31", registreringstidpunkt: "2026-05-01T10:00:00Z" },
        { dokumentId: "", filformat: "application/zip" },
      ],
    })).toEqual([
      { documentId: "doc-1", fileFormat: "application/zip", reportingPeriodEnd: "2025-12-31", registeredAt: "2026-05-01T10:00:00Z" },
    ]);
  });
});
