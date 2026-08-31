import type { Locale } from "./types";

export const marketingCopy = {
  en: {
    kicker: "Data-driven equity research",
    heroTitle: "Analyze stocks with data-driven fundamentals, valuation and risk",
    heroCopy: "StockBox turns company filings, market data and versioned model logic into a structured view for your own investment research.",
    primaryCta: "Analyze a stock free",
    sampleCta: "View sample analysis",
    missingTitle: "Missing data stays missing",
    missingCopy: "StockBox never invents financial figures to complete a report. Coverage and confidence are shown with every assessment.",
    deterministicTitle: "Deterministic where numbers matter",
    deterministicCopy: "Ratios, scores and valuation calculations are produced by versioned code from verified inputs — not improvised in prose.",
    sourceTitle: "Sources stay visible",
    sourceCopy: "Reports preserve provider, period and provenance so you can inspect what the model actually used.",
    proofTitle: "See the research before you sign up",
    proofCopy: "A real Apple analysis from the current production engine shows the same score, research view and dimension structure available in StockBox reports.",
  },
  sv: {
    kicker: "Databaserad aktieanalys",
    heroTitle: "Analysera aktier med databaserad fundamenta, värdering och risk",
    heroCopy: "StockBox omvandlar bolagsrapporter, marknadsdata och versionsstyrd modellogik till en strukturerad vy för din egen investeringsanalys.",
    primaryCta: "Analysera en aktie gratis",
    sampleCta: "Se exempelanalys",
    missingTitle: "Saknad data förblir saknad",
    missingCopy: "StockBox hittar aldrig på finansiella siffror för att fylla en rapport. Datatäckning och konfidens visas tillsammans med varje bedömning.",
    deterministicTitle: "Deterministiskt där siffror spelar roll",
    deterministicCopy: "Nyckeltal, poäng och värderingsberäkningar skapas av versionsstyrd kod från verifierade indata — inte improviserad text.",
    sourceTitle: "Källorna förblir synliga",
    sourceCopy: "Rapporter bevarar leverantör, period och proveniens så att du kan kontrollera vad modellen faktiskt använde.",
    proofTitle: "Se analysen innan du skapar konto",
    proofCopy: "En riktig Apple-analys från nuvarande produktionsmotor visar samma poäng, researchvy och dimensionsstruktur som används i StockBox-rapporter.",
  },
} as const;

export function getMarketingCopy(locale: Locale) {
  return marketingCopy[locale];
}
