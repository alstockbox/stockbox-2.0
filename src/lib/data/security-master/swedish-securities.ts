import type { ListedSecurity, SecurityMasterVenue } from "./types";
import { swedishTickerVariants, uniqueValues } from "./normalization";

const SOURCE_UPDATED_AT = "2026-08-24";
const NASDAQ_STOCKHOLM_SOURCE = "Nasdaq Nordic reference-data files and Nasdaq Stockholm issuer notices";
const SPOTLIGHT_SOURCE = "Spotlight Stock Market company universe";
const NGM_SOURCE = "NGM market data/reference API";

type SecuritySeed = {
  ticker: string;
  name: string;
  issuerId: string;
  issuerName?: string;
  venue: SecurityMasterVenue;
  marketSegment: string;
  securityType?: ListedSecurity["securityType"];
  canonicalTicker?: string;
  isin?: string;
  lei?: string;
  aliases?: string[];
  primarySecurity?: boolean;
  primaryListing?: boolean;
  source?: string;
  sourceUrl?: string;
};

const venueConfig: Record<SecurityMasterVenue, { exchange: string; mic: string; source: string }> = {
  NASDAQ_STOCKHOLM_MAIN: { exchange: "Nasdaq Stockholm", mic: "XSTO", source: NASDAQ_STOCKHOLM_SOURCE },
  NASDAQ_FIRST_NORTH_STOCKHOLM: { exchange: "Nasdaq First North Growth Market Stockholm", mic: "FNSE", source: NASDAQ_STOCKHOLM_SOURCE },
  SPOTLIGHT: { exchange: "Spotlight Stock Market", mic: "XSAT", source: SPOTLIGHT_SOURCE },
  NGM_MAIN_REGULATED: { exchange: "Nordic Growth Market Main Regulated", mic: "XNGM", source: NGM_SOURCE },
  NGM_GROWTH_NORDIC_SME: { exchange: "Nordic SME", mic: "NSME", source: NGM_SOURCE },
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function security(seed: SecuritySeed): ListedSecurity {
  const config = venueConfig[seed.venue];
  const ticker = seed.ticker.trim().toUpperCase().replace(/\s+/g, " ");
  const providerTickers = swedishTickerVariants(ticker);
  const canonicalTicker = seed.canonicalTicker ?? (ticker.includes(" ") ? ticker.replace(/\s+/g, ".") : `${ticker}.ST`);
  const issuerName = seed.issuerName ?? seed.name.replace(/\s+(ser\.?|series|class)\s+[A-Z]$/i, "").trim();
  return {
    securityId: `${config.mic.toLowerCase()}:${slug(ticker)}`,
    issuerId: seed.issuerId,
    ticker,
    canonicalTicker,
    localTicker: ticker,
    providerTickers: uniqueValues([...providerTickers, canonicalTicker]),
    name: seed.name,
    issuerName,
    isin: seed.isin,
    lei: seed.lei,
    exchange: config.exchange,
    mic: config.mic,
    venue: seed.venue,
    marketSegment: seed.marketSegment,
    country: "SE",
    currency: "SEK",
    securityType: seed.securityType ?? "Common Stock",
    primarySecurity: seed.primarySecurity ?? true,
    primaryListing: seed.primaryListing ?? true,
    analysisCapability: {
      fundamentals: "unavailable",
      marketData: "available",
      reason: "Security is discoverable in the listed-security master; StockBox fundamentals are enabled only where a configured fundamentals provider supports the issuer.",
    },
    aliases: uniqueValues([
      seed.issuerName,
      seed.name,
      ticker.replace(/\s+/g, "."),
      ticker.replace(/\s+/g, "-"),
      ...(seed.aliases ?? []),
    ]),
    source: seed.source ?? config.source,
    sourceUrl: seed.sourceUrl,
    sourceUpdatedAt: SOURCE_UPDATED_AT,
  };
}

export const swedishListedSecuritySeed: ListedSecurity[] = [
  security({
    ticker: "VISC",
    canonicalTicker: "VISC.ST",
    name: "Gruvaktiebolaget Viscaria",
    issuerId: "issuer:se:gruvaktiebolaget-viscaria",
    venue: "NASDAQ_STOCKHOLM_MAIN",
    marketSegment: "Main Market",
    isin: "SE0021148160",
    lei: "5299004NWV90GIWSWQ04",
    aliases: ["Viscaria", "Copperstone", "Copperstone Resources"],
    sourceUrl: "https://view.news.eu.nasdaq.com/view?id=b02676c554ffa4034c47e96ab9b587d77&lang=en&src=micro",
  }),
  security({
    ticker: "SIVE",
    canonicalTicker: "SIVE.ST",
    name: "Sivers Semiconductors AB",
    issuerId: "issuer:se:sivers-semiconductors",
    venue: "NASDAQ_STOCKHOLM_MAIN",
    marketSegment: "Main Market",
    isin: "SE0003917798",
    lei: "254900UBKNY2EJ588J53",
    aliases: ["Sivers", "Sivers Semiconductors", "Sivers IMA"],
    sourceUrl: "https://view.news.eu.nasdaq.com/view?id=b89ed2a90db89d80a94fe87bf6d7e0d02&lang=en",
  }),
  security({ ticker: "INVE A", canonicalTicker: "INVE.A", name: "Investor AB ser. A", issuerId: "issuer:se:investor-ab", issuerName: "Investor AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Investor A", "Investor"], primarySecurity: false, primaryListing: false }),
  security({ ticker: "INVE B", canonicalTicker: "INVE.B", name: "Investor AB ser. B", issuerId: "issuer:se:investor-ab", issuerName: "Investor AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Investor B", "Investor"] }),
  security({ ticker: "VOLV A", canonicalTicker: "VOLV-A.ST", name: "AB Volvo ser. A", issuerId: "issuer:se:ab-volvo", issuerName: "AB Volvo", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Volvo A", "Volvo"], primarySecurity: false, primaryListing: false }),
  security({ ticker: "VOLV B", canonicalTicker: "VOLV-B.ST", name: "AB Volvo ser. B", issuerId: "issuer:se:ab-volvo", issuerName: "AB Volvo", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Volvo B", "Volvo"] }),
  security({ ticker: "ERIC A", canonicalTicker: "ERIC-A.ST", name: "Telefonaktiebolaget LM Ericsson ser. A", issuerId: "issuer:se:ericsson", issuerName: "Telefonaktiebolaget LM Ericsson", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Ericsson A", "Ericsson"], primarySecurity: false, primaryListing: false }),
  security({ ticker: "ERIC B", canonicalTicker: "ERIC-B.ST", name: "Telefonaktiebolaget LM Ericsson ser. B", issuerId: "issuer:se:ericsson", issuerName: "Telefonaktiebolaget LM Ericsson", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Ericsson B", "Ericsson"] }),
  security({ ticker: "HM B", canonicalTicker: "HM-B.ST", name: "H & M Hennes & Mauritz AB ser. B", issuerId: "issuer:se:hennes-mauritz", issuerName: "H & M Hennes & Mauritz AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["H&M", "Hennes Mauritz", "HM"] }),
  security({ ticker: "ABB", canonicalTicker: "ABB.ST", name: "ABB Ltd", issuerId: "issuer:ch:abb-ltd", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["ABB Sweden"] }),
  security({ ticker: "ALFA", canonicalTicker: "ALFA.ST", name: "Alfa Laval AB", issuerId: "issuer:se:alfa-laval", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Alfa Laval"] }),
  security({ ticker: "ASSA B", canonicalTicker: "ASSA-B.ST", name: "ASSA ABLOY AB ser. B", issuerId: "issuer:se:assa-abloy", issuerName: "ASSA ABLOY AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["ASSA ABLOY B", "Assa Abloy"] }),
  security({ ticker: "ATCO A", canonicalTicker: "ATCO-A.ST", name: "Atlas Copco AB ser. A", issuerId: "issuer:se:atlas-copco", issuerName: "Atlas Copco AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Atlas Copco A", "Atlas Copco"], primarySecurity: false, primaryListing: false }),
  security({ ticker: "ATCO B", canonicalTicker: "ATCO-B.ST", name: "Atlas Copco AB ser. B", issuerId: "issuer:se:atlas-copco", issuerName: "Atlas Copco AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Atlas Copco B", "Atlas Copco"] }),
  security({ ticker: "AZN", canonicalTicker: "AZN.ST", name: "AstraZeneca PLC", issuerId: "issuer:gb:astrazeneca", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["AstraZeneca"] }),
  security({ ticker: "BOL", canonicalTicker: "BOL.ST", name: "Boliden AB", issuerId: "issuer:se:boliden", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Boliden"] }),
  security({ ticker: "EPI A", canonicalTicker: "EPI-A.ST", name: "Epiroc AB ser. A", issuerId: "issuer:se:epiroc", issuerName: "Epiroc AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Epiroc A", "Epiroc"], primarySecurity: false, primaryListing: false }),
  security({ ticker: "EPI B", canonicalTicker: "EPI-B.ST", name: "Epiroc AB ser. B", issuerId: "issuer:se:epiroc", issuerName: "Epiroc AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Epiroc B", "Epiroc"] }),
  security({ ticker: "EQT", canonicalTicker: "EQT.ST", name: "EQT AB", issuerId: "issuer:se:eqt", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["EQT"] }),
  security({ ticker: "EVO", canonicalTicker: "EVO.ST", name: "Evolution AB", issuerId: "issuer:se:evolution", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Evolution Gaming", "Evolution"] }),
  security({ ticker: "ESSITY B", canonicalTicker: "ESSITY-B.ST", name: "Essity AB ser. B", issuerId: "issuer:se:essity", issuerName: "Essity AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Essity B", "Essity"] }),
  security({ ticker: "HEXA B", canonicalTicker: "HEXA-B.ST", name: "Hexagon AB ser. B", issuerId: "issuer:se:hexagon", issuerName: "Hexagon AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Hexagon B", "Hexagon"] }),
  security({ ticker: "NIBE B", canonicalTicker: "NIBE-B.ST", name: "NIBE Industrier AB ser. B", issuerId: "issuer:se:nibe", issuerName: "NIBE Industrier AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["NIBE B", "NIBE"] }),
  security({ ticker: "SAAB B", canonicalTicker: "SAAB-B.ST", name: "Saab AB ser. B", issuerId: "issuer:se:saab", issuerName: "Saab AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Saab B", "Saab"] }),
  security({ ticker: "SAND", canonicalTicker: "SAND.ST", name: "Sandvik AB", issuerId: "issuer:se:sandvik", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Sandvik"] }),
  security({ ticker: "SEB A", canonicalTicker: "SEB-A.ST", name: "Skandinaviska Enskilda Banken AB ser. A", issuerId: "issuer:se:seb", issuerName: "Skandinaviska Enskilda Banken AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["SEB A", "SEB"] }),
  security({ ticker: "SHB A", canonicalTicker: "SHB-A.ST", name: "Svenska Handelsbanken AB ser. A", issuerId: "issuer:se:handelsbanken", issuerName: "Svenska Handelsbanken AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Handelsbanken A", "Handelsbanken"] }),
  security({ ticker: "SKF B", canonicalTicker: "SKF-B.ST", name: "AB SKF ser. B", issuerId: "issuer:se:skf", issuerName: "AB SKF", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["SKF B", "SKF"] }),
  security({ ticker: "SWED A", canonicalTicker: "SWED-A.ST", name: "Swedbank AB ser. A", issuerId: "issuer:se:swedbank", issuerName: "Swedbank AB", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Swedbank A", "Swedbank"] }),
  security({ ticker: "TELIA", canonicalTicker: "TELIA.ST", name: "Telia Company AB", issuerId: "issuer:se:telia-company", venue: "NASDAQ_STOCKHOLM_MAIN", marketSegment: "Main Market", aliases: ["Telia"] }),

  security({ ticker: "ACCON", canonicalTicker: "ACCON.ST", name: "Acconeer AB", issuerId: "issuer:se:acconeer", venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", marketSegment: "First North Growth Market Stockholm", aliases: ["Acconeer"] }),
  security({ ticker: "FLAT B", canonicalTicker: "FLAT-B.ST", name: "Flat Capital AB ser. B", issuerId: "issuer:se:flat-capital", issuerName: "Flat Capital AB", venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", marketSegment: "First North Growth Market Stockholm", aliases: ["Flat Capital B", "Flat Capital"] }),
  security({ ticker: "GENO", canonicalTicker: "GENO.ST", name: "Genovis AB", issuerId: "issuer:se:genovis", venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", marketSegment: "First North Growth Market Stockholm", aliases: ["Genovis"] }),
  security({ ticker: "PDX", canonicalTicker: "PDX.ST", name: "Paradox Interactive AB", issuerId: "issuer:se:paradox-interactive", venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", marketSegment: "First North Growth Market Stockholm", aliases: ["Paradox", "Paradox Interactive"] }),
  security({ ticker: "PLEJD", canonicalTicker: "PLEJD.ST", name: "Plejd AB", issuerId: "issuer:se:plejd", venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", marketSegment: "First North Growth Market Stockholm", aliases: ["Plejd"] }),
  security({ ticker: "SEYE", canonicalTicker: "SEYE.ST", name: "Smart Eye AB", issuerId: "issuer:se:smart-eye", venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", marketSegment: "First North Growth Market Stockholm", aliases: ["Smart Eye"] }),
  security({ ticker: "SILEX", canonicalTicker: "SILEX.ST", name: "Silex Microsystems AB", issuerId: "issuer:se:silex-microsystems", venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", marketSegment: "First North Growth Market Stockholm", aliases: ["Silex", "Silex Microsystems"] }),
  security({ ticker: "STORY B", canonicalTicker: "STORY-B.ST", name: "Storytel AB ser. B", issuerId: "issuer:se:storytel", issuerName: "Storytel AB", venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", marketSegment: "First North Growth Market Stockholm", aliases: ["Storytel B", "Storytel"] }),
  security({ ticker: "TDVOX", canonicalTicker: "TDVOX.ST", name: "Tobii Dynavox AB", issuerId: "issuer:se:tobii-dynavox", venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", marketSegment: "First North Growth Market Stockholm", aliases: ["Tobii Dynavox"] }),
  security({ ticker: "XBRANE", canonicalTicker: "XBRANE.ST", name: "Xbrane Biopharma AB", issuerId: "issuer:se:xbrane-biopharma", venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", marketSegment: "First North Growth Market Stockholm", aliases: ["Xbrane", "Xbrane Biopharma"] }),

  security({ ticker: "DLAB", canonicalTicker: "DLAB.ST", name: "Dlaboratory Sweden AB", issuerId: "issuer:se:dlaboratory", venue: "SPOTLIGHT", marketSegment: "Spotlight Stock Market", aliases: ["Dlaboratory"] }),
  security({ ticker: "FLOWS", canonicalTicker: "FLOWS.ST", name: "Flowscape Technology AB", issuerId: "issuer:se:flowscape-technology", venue: "SPOTLIGHT", marketSegment: "Spotlight Stock Market", aliases: ["Flowscape"] }),
  security({ ticker: "HDW B", canonicalTicker: "HDW-B.ST", name: "H&D Wireless AB ser. B", issuerId: "issuer:se:hd-wireless", issuerName: "H&D Wireless AB", venue: "SPOTLIGHT", marketSegment: "Spotlight Stock Market", aliases: ["H&D Wireless", "HD Wireless"] }),
  security({ ticker: "POLAR", canonicalTicker: "POLAR.ST", name: "PolarCool AB", issuerId: "issuer:se:polarcool", venue: "SPOTLIGHT", marketSegment: "Spotlight Stock Market", aliases: ["PolarCool"] }),
  security({ ticker: "QLUC", canonicalTicker: "QLUC.ST", name: "Qlucore AB", issuerId: "issuer:se:qlucore", venue: "SPOTLIGHT", marketSegment: "Spotlight Stock Market", aliases: ["Qlucore"] }),
  security({ ticker: "SFL", canonicalTicker: "SFL.ST", name: "Safello Group AB", issuerId: "issuer:se:safello", venue: "SPOTLIGHT", marketSegment: "Spotlight Stock Market", aliases: ["Safello"] }),
  security({ ticker: "SYNT", canonicalTicker: "SYNT.ST", name: "SyntheticMR AB", issuerId: "issuer:se:syntheticmr", venue: "SPOTLIGHT", marketSegment: "Spotlight Stock Market", aliases: ["SyntheticMR", "Synthetic MR"] }),
  security({ ticker: "TRNSF", canonicalTicker: "TRNSF.ST", name: "Transfer Group AB", issuerId: "issuer:se:transfer-group", venue: "SPOTLIGHT", marketSegment: "Spotlight Stock Market", aliases: ["Transfer Group"] }),

  security({ ticker: "GTAB B", canonicalTicker: "GTAB-B.ST", name: "Glycorex Transplantation AB ser. B", issuerId: "issuer:se:glycorex-transplantation", issuerName: "Glycorex Transplantation AB", venue: "NGM_MAIN_REGULATED", marketSegment: "NGM Main Regulated", aliases: ["Glycorex", "Glycorex B"] }),
  security({ ticker: "SBC", canonicalTicker: "SBC.ST", name: "SBC Sveriges BostadsrättsCentrum AB", issuerId: "issuer:se:sbc", venue: "NGM_MAIN_REGULATED", marketSegment: "NGM Main Regulated", aliases: ["SBC"] }),

  security({ ticker: "ABIG", canonicalTicker: "ABIG.ST", name: "Abelco Investment Group AB", issuerId: "issuer:se:abelco-investment-group", venue: "NGM_GROWTH_NORDIC_SME", marketSegment: "NGM Nordic SME", aliases: ["Abelco"] }),
  security({ ticker: "ADVT", canonicalTicker: "ADVT.ST", name: "Adverty AB", issuerId: "issuer:se:adverty", venue: "NGM_GROWTH_NORDIC_SME", marketSegment: "NGM Nordic SME", aliases: ["Adverty"] }),
  security({ ticker: "AIK B", canonicalTicker: "AIK-B.ST", name: "AIK Fotboll AB ser. B", issuerId: "issuer:se:aik-fotboll", issuerName: "AIK Fotboll AB", venue: "NGM_GROWTH_NORDIC_SME", marketSegment: "NGM Nordic SME", aliases: ["AIK Fotboll", "AIK B"] }),
  security({ ticker: "ARBO A", canonicalTicker: "ARBO-A.ST", name: "Arbona AB ser. A", issuerId: "issuer:se:arbona", issuerName: "Arbona AB", venue: "NGM_GROWTH_NORDIC_SME", marketSegment: "NGM Nordic SME", aliases: ["Arbona A", "Arbona"], primarySecurity: false, primaryListing: false }),
  security({ ticker: "ARBO B", canonicalTicker: "ARBO-B.ST", name: "Arbona AB ser. B", issuerId: "issuer:se:arbona", issuerName: "Arbona AB", venue: "NGM_GROWTH_NORDIC_SME", marketSegment: "NGM Nordic SME", aliases: ["Arbona B", "Arbona"] }),
  security({ ticker: "ATT", canonicalTicker: "ATT.ST", name: "Attana AB", issuerId: "issuer:se:attana", venue: "NGM_GROWTH_NORDIC_SME", marketSegment: "NGM Nordic SME", aliases: ["Attana"] }),
  security({ ticker: "BLUE", canonicalTicker: "BLUE.ST", name: "Bluelake Mineral AB", issuerId: "issuer:se:bluelake-mineral", venue: "NGM_GROWTH_NORDIC_SME", marketSegment: "NGM Nordic SME", aliases: ["Bluelake", "Bluelake Mineral"] }),
  security({ ticker: "DIVI B", canonicalTicker: "DIVI-B.ST", name: "Dividend Sweden AB ser. B", issuerId: "issuer:se:dividend-sweden", issuerName: "Dividend Sweden AB", venue: "NGM_GROWTH_NORDIC_SME", marketSegment: "NGM Nordic SME", aliases: ["Dividend Sweden", "Dividend Sweden B"] }),
  security({ ticker: "NEVI", canonicalTicker: "NEVI.ST", name: "New Equity Venture International AB", issuerId: "issuer:se:new-equity-venture-international", venue: "NGM_GROWTH_NORDIC_SME", marketSegment: "NGM Nordic SME", aliases: ["New Equity Venture", "NEVI"] }),
];
