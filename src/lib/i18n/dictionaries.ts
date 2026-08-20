import type { Dictionary, Locale } from "./types";

export const dictionaries: Record<Locale, Dictionary> = {
  en: {
    common: {
      appName: "StockBox",
      tagline: "Understand any stock faster.",
      search: "Search",
      analyze: "Analyze",
      pricing: "Pricing",
      dashboard: "Dashboard",
      login: "Log in",
      signup: "Sign up",
      logout: "Log out",
      language: "Language",
      simpleMode: "Simple",
      proMode: "Pro",
      unavailable: "Unavailable",
      sources: "Sources",
      confidence: "Confidence",
      explain: "Explain"
    },
    marketing: {
      heroTitle: "StockBox",
      heroCopy:
        "A calm equity research workspace that turns raw filings, market data, and model logic into a decision-ready view.",
      primaryCta: "Analyze a stock",
      secondaryCta: "View pricing",
      proof: "Built for search -> analyze -> understand, with clear methodology and no black-box arithmetic."
    },
    analysis: {
      oneSentence: "One sentence analysis",
      stockboxScore: "StockBox Score",
      personalizedScore: "Personalized score",
      recommendation: "Model assessment",
      shortTerm: "Short-term assessment",
      longTerm: "Long-term assessment",
      redFlags: "Red flags",
      greenFlags: "Green flags",
      valuation: "Valuation",
      financialHealth: "Financial health",
      quality: "Quality",
      growthQuality: "Growth quality",
      earningsQuality: "Earnings quality",
      missingData: "Missing data",
      disclaimer:
        "StockBox is an analytical tool. This model assessment is based on available data and assumptions, not individualized financial advice or a guaranteed outcome."
    }
  },
  sv: {
    common: {
      appName: "StockBox",
      tagline: "Förstå en aktie snabbare.",
      search: "Sök",
      analyze: "Analysera",
      pricing: "Priser",
      dashboard: "Översikt",
      login: "Logga in",
      signup: "Skapa konto",
      logout: "Logga ut",
      language: "Språk",
      simpleMode: "Enkelt",
      proMode: "Pro",
      unavailable: "Ej tillgängligt",
      sources: "Källor",
      confidence: "Konfidens",
      explain: "Förklara"
    },
    marketing: {
      heroTitle: "StockBox",
      heroCopy:
        "En lugn analysyta för aktier som gör rapportdata, marknadsdata och modellogik lättare att förstå.",
      primaryCta: "Analysera en aktie",
      secondaryCta: "Se priser",
      proof: "Byggt för sök -> analysera -> förstå, med tydlig metodik och utan svart låda."
    },
    analysis: {
      oneSentence: "Analys i en mening",
      stockboxScore: "StockBox-poäng",
      personalizedScore: "Personlig poäng",
      recommendation: "Modellbedömning",
      shortTerm: "Kortsiktig bedömning",
      longTerm: "Långsiktig bedömning",
      redFlags: "Varningsflaggor",
      greenFlags: "Styrkor",
      valuation: "Värdering",
      financialHealth: "Finansiell hälsa",
      quality: "Kvalitet",
      growthQuality: "Tillväxtkvalitet",
      earningsQuality: "Vinstkvalitet",
      missingData: "Saknad data",
      disclaimer:
        "StockBox är ett analysverktyg. Modellbedömningen bygger på tillgänglig data och antaganden, inte personlig finansiell rådgivning eller garanterat utfall."
    }
  }
};
