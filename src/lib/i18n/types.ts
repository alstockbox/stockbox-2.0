export type Locale = "en" | "sv";

export type Dictionary = {
  common: {
    appName: string;
    tagline: string;
    search: string;
    analyze: string;
    pricing: string;
    dashboard: string;
    login: string;
    signup: string;
    logout: string;
    language: string;
    simpleMode: string;
    proMode: string;
    unavailable: string;
    sources: string;
    confidence: string;
    explain: string;
  };
  marketing: {
    heroTitle: string;
    heroCopy: string;
    primaryCta: string;
    secondaryCta: string;
    proof: string;
  };
  analysis: {
    oneSentence: string;
    stockboxScore: string;
    personalizedScore: string;
    recommendation: string;
    shortTerm: string;
    longTerm: string;
    redFlags: string;
    greenFlags: string;
    valuation: string;
    financialHealth: string;
    quality: string;
    growthQuality: string;
    earningsQuality: string;
    missingData: string;
    disclaimer: string;
  };
};
