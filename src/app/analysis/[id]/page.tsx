import { notFound } from "next/navigation";
import { EarningsEstimateIntelligence } from "@/components/analysis/earnings-estimate-intelligence";
import { InsiderIntelligence } from "@/components/analysis/insider-intelligence";
import { InvestorValuationSummary } from "@/components/analysis/investor-valuation-summary";
import { ProfileComparison } from "@/components/analysis/profile-comparison";
import { RealPeerIntelligence } from "@/components/analysis/real-peer-intelligence";
import { ReportView } from "@/components/analysis/report-view";
import { Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getAnalysis, getPreviousAnalysisForTicker } from "@/lib/db/repositories";
import type { AnalysisReport } from "@/lib/analysis/types";
import { getLocale } from "@/lib/i18n/server";
import { getEarningsEstimateIntelligence } from "@/lib/investor-intelligence/earnings-estimates-service";
import { getInsiderIntelligence } from "@/lib/investor-intelligence/insider-service";
import { getPeerIntelligence } from "@/lib/investor-intelligence/peer-service";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, locale] = await Promise.all([params, requireUser(), getLocale()]);
  const analysis = await getAnalysis(id, user.id);
  if (!analysis) notFound();
  const report = analysis.report as AnalysisReport;
  const [previousReport, peerIntelligence, earningsEstimateIntelligence, insiderIntelligence] = await Promise.all([
    getPreviousAnalysisForTicker({
      userId: user.id,
      ticker: report.ticker,
      currentAnalysisId: id,
      beforeGeneratedAt: report.generatedAt,
    }),
    getPeerIntelligence(report.ticker),
    getEarningsEstimateIntelligence(report.ticker),
    getInsiderIntelligence(report.ticker, report.companyName),
  ]);
  return <Section><Container><div className="space-y-5"><InvestorValuationSummary report={report} locale={locale} /><ProfileComparison report={report} /><EarningsEstimateIntelligence data={earningsEstimateIntelligence} /><RealPeerIntelligence data={peerIntelligence} /><InsiderIntelligence data={insiderIntelligence} /><ReportView report={report} previousReport={previousReport ?? null} locale={locale} /></div></Container></Section>;
}
