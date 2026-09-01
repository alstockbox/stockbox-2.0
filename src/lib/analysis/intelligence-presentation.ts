import type { Locale } from "@/lib/i18n/types";
import type { IntelligenceSnapshot } from "./intelligence-snapshot";

export type IntelligencePresentationCardId = "core" | "mispricing" | "inflection" | "opportunity";

export type IntelligencePresentationCard = {
  id: IntelligencePresentationCardId;
  label: string;
  score: number | null;
  status: string;
  detail: string;
  confidence: number | null;
  coverage: number | null;
};

export type IntelligencePresentation = {
  title: string;
  subtitle: string;
  cards: IntelligencePresentationCard[];
  warnings: string[];
  disclaimer: string;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function coreStatus(score: number | null, locale: Locale) {
  if (!finite(score)) return locale === "sv" ? "Otillgänglig" : "Unavailable";
  if (score >= 80) return locale === "sv" ? "Mycket stark" : "Very strong";
  if (score >= 65) return locale === "sv" ? "Stark" : "Strong";
  if (score >= 45) return locale === "sv" ? "Blandad" : "Mixed";
  return locale === "sv" ? "Svag" : "Weak";
}

function mispricingStatus(label: IntelligenceSnapshot["mispricing"]["label"], locale: Locale) {
  const sv = {
    deep_discount: "Tydlig rabatt",
    discounted: "Rabatterad",
    roughly_fair: "Ungefär rimligt värderad",
    premium: "Premievärderad",
    uncertain: "Osäker / otillgänglig",
  } as const;
  const en = {
    deep_discount: "Deep discount",
    discounted: "Discounted",
    roughly_fair: "Roughly fair",
    premium: "Premium valuation",
    uncertain: "Uncertain / unavailable",
  } as const;
  return (locale === "sv" ? sv : en)[label];
}

function mispricingDetail(label: IntelligenceSnapshot["mispricing"]["label"], locale: Locale) {
  if (locale === "sv") {
    if (label === "deep_discount") return "Flera värderingsperspektiv pekar mot en tydlig rabatt, men StockBox kontrollerar samtidigt risken för value trap.";
    if (label === "discounted") return "Aktien ser rabatterad ut relativt tillgänglig intrinsic-, historisk- och bolagsanpassad värdering.";
    if (label === "roughly_fair") return "Tillgänglig värdering ger inte stöd för en tydlig felprissättning åt något håll.";
    if (label === "premium") return "Aktien handlas på en premie relativt tillgänglig värdering och kräver starkare framtida utveckling för att motiveras.";
    return "Underlaget räcker inte för att ge en robust riktning på felvärderingen.";
  }
  if (label === "deep_discount") return "Multiple valuation lenses point to a material discount, while StockBox separately checks for value trap risk.";
  if (label === "discounted") return "The shares look discounted versus available intrinsic, historical and company-aware valuation evidence.";
  if (label === "roughly_fair") return "Available valuation evidence does not show a clear directional mispricing.";
  if (label === "premium") return "The shares trade at a premium to available valuation evidence and require stronger future execution to justify it.";
  return "Evidence is insufficient for a robust directional mispricing view.";
}

function inflectionStatus(stage: IntelligenceSnapshot["inflection"]["stage"], locale: Locale) {
  const sv = {
    dormant: "Ingen tydlig vändning",
    building: "Bygger upp",
    confirming: "Bekräftas",
    extended: "Översträckt",
    fragile: "Skör setup",
    uncertain: "Osäker / otillgänglig",
  } as const;
  const en = {
    dormant: "No clear inflection",
    building: "Building",
    confirming: "Confirming",
    extended: "Overextended",
    fragile: "Fragile setup",
    uncertain: "Uncertain / unavailable",
  } as const;
  return (locale === "sv" ? sv : en)[stage];
}

function inflectionDetail(stage: IntelligenceSnapshot["inflection"]["stage"], locale: Locale) {
  if (locale === "sv") {
    if (stage === "confirming") return "Fundamental förbättring bekräftas av flera oberoende signalfamiljer, exempelvis marknad, finansiering eller förväntningar.";
    if (stage === "building") return "Tidiga förbättringssignaler finns, men setupen saknar ännu full bekräftelse från flera oberoende håll.";
    if (stage === "extended") return "Signalerna kan vara starka, men kursrörelsen har blivit översträckt och conviction sänks i stället för att momentum belönas blint.";
    if (stage === "fragile") return "Finansiell överlevnads- eller finansieringsrisk begränsar potentialen oavsett stark tillväxt eller momentum.";
    if (stage === "dormant") return "StockBox hittar ännu ingen tillräckligt tydlig kombination av fundamental acceleration och marknadsbekräftelse.";
    return "Underlaget räcker inte för en robust inflection-bedömning.";
  }
  if (stage === "confirming") return "Fundamental improvement is supported by several independent signal families such as market action, funding quality or expectations.";
  if (stage === "building") return "Early improvement signals exist, but the setup still lacks broad independent confirmation.";
  if (stage === "extended") return "Signals may be strong, but price action is overextended and conviction is reduced instead of blindly rewarding momentum.";
  if (stage === "fragile") return "Funding or financial-survival risk caps the setup regardless of strong growth or momentum.";
  if (stage === "dormant") return "StockBox does not yet see a sufficiently clear combination of fundamental acceleration and market confirmation.";
  return "Evidence is insufficient for a robust inflection assessment.";
}

function opportunityStatus(label: IntelligenceSnapshot["opportunity"]["label"], locale: Locale) {
  const sv = {
    exceptional: "Exceptionell setup",
    attractive: "Attraktiv setup",
    mixed: "Blandad setup",
    weak: "Svag setup",
    uncertain: "Otillgänglig / osäker",
  } as const;
  const en = {
    exceptional: "Exceptional setup",
    attractive: "Attractive setup",
    mixed: "Mixed setup",
    weak: "Weak setup",
    uncertain: "Unavailable / uncertain",
  } as const;
  return (locale === "sv" ? sv : en)[label];
}

function opportunityDetail(snapshot: IntelligenceSnapshot, locale: Locale) {
  const profile = snapshot.opportunity.profile.replace("_", " ");
  return locale === "sv"
    ? `Samlad möjlighet för linsen ${profile}: väger bolagskvalitet, felvärdering och inflection olika beroende på investeringsstil.`
    : `Combined opportunity for the ${profile} lens: weights business quality, mispricing and inflection differently by investment style.`;
}

export function buildIntelligencePresentation(snapshot: IntelligenceSnapshot, locale: Locale): IntelligencePresentation {
  const warnings: string[] = [];
  if (snapshot.mispricing.valueTrapRisk === "high") {
    warnings.push(locale === "sv" ? "Hög value-trap-risk: billig värdering sammanfaller med tydliga försämringssignaler." : "High value trap risk: cheap valuation coincides with material deterioration signals.");
  } else if (snapshot.mispricing.valueTrapRisk === "medium") {
    warnings.push(locale === "sv" ? "Förhöjd value-trap-risk: vissa fundamentala motbevis finns." : "Elevated value trap risk: some fundamental counter-evidence is present.");
  }
  if (snapshot.inflection.overextensionRisk === "high") {
    warnings.push(locale === "sv" ? "Kursen ser översträckt ut; inflection-conviction har därför sänkts." : "Price action looks overextended; inflection conviction has been reduced.");
  } else if (snapshot.inflection.overextensionRisk === "medium") {
    warnings.push(locale === "sv" ? "Kursrörelsen börjar bli utsträckt och kräver högre riskdisciplin." : "Price action is becoming extended and requires tighter risk discipline.");
  }
  if (snapshot.inflection.stage === "fragile") {
    warnings.push(locale === "sv" ? "Kritisk finansierings-/överlevnadsrisk begränsar setupen." : "Critical funding/survival risk caps the setup.");
  }
  if (snapshot.mispricing.coverage < 0.6 || snapshot.inflection.coverage < 0.6) {
    warnings.push(locale === "sv" ? "Delar av intelligence-bedömningen har begränsad datatäckning; saknad data räknas inte som negativ evidens." : "Parts of the intelligence assessment have limited data coverage; missing data is not treated as negative evidence.");
  }

  return {
    title: locale === "sv" ? "Möjlighetsanalys" : "Opportunity Intelligence",
    subtitle: locale === "sv"
      ? "Separera ett bra bolag från en billig aktie och från en möjlig tidig vändning. Linsen påverkar bara hur delarna vägs ihop."
      : "Separate a good business from a cheap stock and from a possible early inflection. The lens only changes how those components are combined.",
    cards: [
      {
        id: "core",
        label: locale === "sv" ? "Bolagskvalitet" : "Core quality",
        score: snapshot.lensCoreScore,
        status: coreStatus(snapshot.lensCoreScore, locale),
        detail: locale === "sv"
          ? "Den etablerade StockBox-scoringmotorn: kvalitet, tillväxt, lönsamhet, finansiell hälsa, värdering, kassaflöde, risk och momentum enligt vald lins."
          : "The established StockBox scoring engine: quality, growth, profitability, financial health, valuation, cash flow, risk and momentum under the selected lens.",
        confidence: null,
        coverage: null,
      },
      {
        id: "mispricing",
        label: locale === "sv" ? "Felvärdering" : "Mispricing",
        score: snapshot.mispricing.score,
        status: mispricingStatus(snapshot.mispricing.label, locale),
        detail: mispricingDetail(snapshot.mispricing.label, locale),
        confidence: snapshot.mispricing.confidence,
        coverage: snapshot.mispricing.coverage,
      },
      {
        id: "inflection",
        label: locale === "sv" ? "Inflection / tidig acceleration" : "Inflection / early acceleration",
        score: snapshot.inflection.score,
        status: inflectionStatus(snapshot.inflection.stage, locale),
        detail: inflectionDetail(snapshot.inflection.stage, locale),
        confidence: snapshot.inflection.confidence,
        coverage: snapshot.inflection.coverage,
      },
      {
        id: "opportunity",
        label: locale === "sv" ? "Opportunity" : "Opportunity",
        score: snapshot.opportunity.score,
        status: opportunityStatus(snapshot.opportunity.label, locale),
        detail: opportunityDetail(snapshot, locale),
        confidence: null,
        coverage: snapshot.opportunity.coverage,
      },
    ],
    warnings,
    disclaimer: locale === "sv"
      ? "Detta är inte en prognos eller garanti om framtida kursutveckling. Signalerna är sannolikhetsbaserade och ska läsas tillsammans med risk, datatäckning och källor."
      : "This is not a forecast or guarantee of future price performance. Signals are probabilistic and must be read together with risk, data coverage and sources.",
  };
}
