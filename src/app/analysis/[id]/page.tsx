import { notFound } from "next/navigation";
import { InvestorValuationSummary } from "@/components/analysis/investor-valuation-summary";
import { ReportView } from "@/components/analysis/report-view";
import { Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getAnalysis, getPreviousAnalysisForTicker } from "@/lib/db/repositories";
import type { AnalysisReport } from "@/lib/analysis/types";
import { getLocale } from "@/lib/i18n/server";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, locale] = await Promise.all([params, requireUser(), getLocale()]);
  const analysis = await getAnalysis(id, user.id);
  if (!analysis) notFound();
  const report = analysis.report as AnalysisReport;
  const previousReport = await getPreviousAnalysisForTicker({
    userId: user.id,
    ticker: report.ticker,
    currentAnalysisId: id,
    beforeGeneratedAt: report.generatedAt,
  });
  return <Section><Container><div className="space-y-5"><InvestorValuationSummary report={report} locale={locale} /><ReportView report={report} previousReport={previousReport ?? null} locale={locale} /></div></Container></Section>;
}
