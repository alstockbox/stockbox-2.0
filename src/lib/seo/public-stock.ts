import type { AnalysisReport } from "@/lib/analysis/types";

const MIN_CONFIDENCE = 0.65;
const MIN_COVERAGE = 0.7;

type PublicSecurityMetaExtension = {
  securityClassification?: {
    kind?: string;
  };
  securityAnalysis?: {
    etf?: {
      kind?: string;
    };
    investmentCompany?: {
      kind?: string;
    };
  };
};

export function slugifyStockPage(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/å/gi, "a")
    .replace(/ä/gi, "a")
    .replace(/ö/gi, "o")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value <= 1) return value;
  if (value <= 100) return value / 100;
  return null;
}

export function sanitizePublicReport(report: AnalysisReport): AnalysisReport {
  const publicReport = { ...report };
  delete publicReport.adminQa;
  return publicReport;
}

export function evaluatePublicSnapshot(report: AnalysisReport): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const confidence = normalizePercent(report.score?.confidence);
  const coverage = normalizePercent(report.dataCoverage);

  if (report.investmentProfile !== "balanced") reasons.push("balanced_profile_required");
  if (report.dataStatus !== "current") reasons.push("current_data_required");
  if (typeof report.score?.score !== "number" || !Number.isFinite(report.score.score)) reasons.push("stockbox_score_required");
  if (coverage === null || coverage < MIN_COVERAGE) reasons.push("minimum_coverage_not_met");
  if (confidence === null || confidence < MIN_CONFIDENCE) reasons.push("minimum_confidence_not_met");
  if (!report.ticker?.trim() || !report.companyName?.trim()) reasons.push("company_identity_required");

  return { eligible: reasons.length === 0, reasons };
}

function clipMetaDescription(value: string): string {
  if (value.length <= 160) return value;
  const clipped = value.slice(0, 157).replace(/\s+\S*$/, "").trimEnd();
  return `${clipped}...`;
}

function resolvePublicSecurityKind(report: AnalysisReport): "stock" | "investment_company" | "etf" {
  const extension = report as AnalysisReport & PublicSecurityMetaExtension;
  const isEtf = extension.securityAnalysis?.etf?.kind === "etf"
    || extension.securityClassification?.kind?.endsWith("_etf") === true;
  if (isEtf) return "etf";

  const archetype = report.engine?.analysisArchetype ?? report.analysisArchetype;
  const isInvestmentCompany = extension.securityAnalysis?.investmentCompany?.kind === "investment_company"
    || archetype === "holding_company";
  return isInvestmentCompany ? "investment_company" : "stock";
}

export function buildStockMetaDescription(report: AnalysisReport): string {
  const score = typeof report.score?.score === "number" ? `${Math.round(report.score.score)}/100` : "utan komplett score";
  const securityKind = resolvePublicSecurityKind(report);

  if (securityKind === "etf") {
    return clipMetaDescription(
      `${report.companyName} (${report.ticker}) ETF-analys från StockBox: score ${score}, kostnad, diversifiering, likviditet, risk och källor.`
    );
  }

  if (securityKind === "investment_company") {
    return clipMetaDescription(
      `${report.companyName} (${report.ticker}) investmentbolagsanalys från StockBox: score ${score}, NAV, substansrabatt/premie, skuldsättning, portföljkvalitet och källor.`
    );
  }

  return clipMetaDescription(
    `${report.companyName} (${report.ticker}) aktieanalys från StockBox: score ${score}, värdering, tillväxt, lönsamhet, finansiell hälsa, risk och källor.`
  );
}
