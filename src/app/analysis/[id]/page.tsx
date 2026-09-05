import { notFound } from "next/navigation";
import { ContextualRecommendationCard } from "@/components/analysis/contextual-recommendation-card";
import { ReportView } from "@/components/analysis/report-view";
import { Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getAnalysis, getPreviousAnalysisForTicker } from "@/lib/db/repositories";
import type { AnalysisReport } from "@/lib/analysis/types";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

async function isTickerInPortfolio(ticker: string) {
  const supabase = await createClient();
  if (!supabase) return false;

  const { data: portfolios } = await supabase.from("portfolios").select("id");
  const portfolioIds = (portfolios ?? []).map((portfolio) => portfolio.id);
  if (!portfolioIds.length) return false;

  const { data: holding } = await supabase
    .from("holdings")
    .select("id")
    .in("portfolio_id", portfolioIds)
    .ilike("ticker", ticker.trim())
    .limit(1)
    .maybeSingle();

  return Boolean(holding);
}

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, locale] = await Promise.all([params, requireUser(), getLocale()]);
  const analysis = await getAnalysis(id, user.id);
  if (!analysis) notFound();
  const report = analysis.report as AnalysisReport;
  const [previousReport, inPortfolio] = await Promise.all([
    getPreviousAnalysisForTicker({
      userId: user.id,
      ticker: report.ticker,
      currentAnalysisId: id,
      beforeGeneratedAt: report.generatedAt,
    }),
    isTickerInPortfolio(report.ticker),
  ]);

  return (
    <Section>
      <Container>
        <div className="space-y-5">
          <ContextualRecommendationCard
            recommendation={report.recommendation}
            inPortfolio={inPortfolio}
            score={report.score.score}
            confidence={report.score.confidence}
            dataCoverage={report.dataCoverage}
            locale={locale}
          />
          <ReportView report={report} previousReport={previousReport ?? null} locale={locale} />
        </div>
      </Container>
    </Section>
  );
}
