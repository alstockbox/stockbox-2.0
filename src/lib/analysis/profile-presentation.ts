import type { InvestmentProfile, ScoreDimension, ScoreDimensionKey } from "./types";
import type { Locale } from "@/lib/i18n/types";

type ProfilePresentation = {
  priority: ScoreDimensionKey[];
  en: string;
  sv: string;
};

export const PROFILE_PRESENTATION: Record<InvestmentProfile, ProfilePresentation> = {
  balanced: {
    priority: ["growth", "profitability", "financialHealth", "valuation", "cashFlow", "quality", "earningsQuality", "risk", "momentum"],
    en: "Balances growth, profitability, financial strength, valuation and cash flow without letting one dimension dominate.",
    sv: "Balanserar tillväxt, lönsamhet, finansiell styrka, värdering och kassaflöde utan att en dimension dominerar.",
  },
  growth: {
    priority: ["growth", "profitability", "quality", "cashFlow", "valuation", "financialHealth", "earningsQuality", "momentum", "risk"],
    en: "Prioritizes durable growth, margins, cash generation and quality before headline valuation multiples.",
    sv: "Prioriterar uthållig tillväxt, marginaler, kassagenerering och kvalitet före enskilda värderingsmultiplar.",
  },
  value: {
    priority: ["valuation", "cashFlow", "financialHealth", "profitability", "quality", "earningsQuality", "growth", "risk", "momentum"],
    en: "Prioritizes valuation, normalized cash generation and balance-sheet resilience while checking whether apparent cheapness is justified.",
    sv: "Prioriterar värdering, normaliserad kassagenerering och balansräkning samt granskar om en låg värdering faktiskt är motiverad.",
  },
  quality: {
    priority: ["quality", "profitability", "cashFlow", "financialHealth", "earningsQuality", "growth", "valuation", "risk", "momentum"],
    en: "Prioritizes returns on capital, margin quality, cash conversion, financial strength and earnings durability.",
    sv: "Prioriterar kapitalavkastning, marginalkvalitet, kassakonvertering, finansiell styrka och uthålliga vinster.",
  },
  dividend: {
    priority: ["cashFlow", "financialHealth", "earningsQuality", "profitability", "quality", "valuation", "growth", "risk", "momentum"],
    en: "Prioritizes cash-flow coverage, balance-sheet strength, earnings quality and the durability of shareholder distributions.",
    sv: "Prioriterar kassaflödestäckning, balansräkning, vinstkvalitet och hur uthålliga utdelningarna är.",
  },
  defensive: {
    priority: ["financialHealth", "risk", "cashFlow", "earningsQuality", "quality", "profitability", "valuation", "growth", "momentum"],
    en: "Prioritizes resilience: balance-sheet strength, risk control, stable cash generation and earnings quality come before aggressive growth.",
    sv: "Prioriterar motståndskraft: balansräkning, riskkontroll, stabil kassagenerering och vinstkvalitet går före aggressiv tillväxt.",
  },
  long_term: {
    priority: ["quality", "growth", "profitability", "cashFlow", "financialHealth", "earningsQuality", "valuation", "risk", "momentum"],
    en: "Prioritizes durable business quality, compounding growth and cash generation over short-term price movement.",
    sv: "Prioriterar uthållig bolagskvalitet, långsiktig tillväxt och kassagenerering framför kortsiktiga kursrörelser.",
  },
  short_term: {
    priority: ["momentum", "valuation", "growth", "risk", "financialHealth", "profitability", "cashFlow", "earningsQuality", "quality"],
    en: "Raises the importance of momentum, near-term valuation and current growth signals while keeping explicit risk controls.",
    sv: "Ökar vikten på momentum, kortsiktig värdering och aktuella tillväxtsignaler samtidigt som risk vägs in tydligt.",
  },
};

export function profilePresentationFor(profile: InvestmentProfile, locale: Locale) {
  const presentation = PROFILE_PRESENTATION[profile];
  return {
    priority: presentation.priority,
    description: locale === "sv" ? presentation.sv : presentation.en,
  };
}

export function orderScoreDimensions(dimensions: ScoreDimension[], profile: InvestmentProfile): ScoreDimension[] {
  const priority = PROFILE_PRESENTATION[profile].priority;
  const rank = new Map(priority.map((key, index) => [key, index]));
  return [...dimensions].sort((left, right) => (rank.get(left.key) ?? 999) - (rank.get(right.key) ?? 999));
}
