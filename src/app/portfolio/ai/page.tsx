import type { Metadata } from "next";
import type { AnalysisReport } from "@/lib/analysis/types";
import { PortfolioAiCoach } from "@/components/portfolio/portfolio-ai-coach";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { comparePortfolioSnapshots } from "@/lib/portfolio/portfolio-ai-planner";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Portfolio AI" };

type PageProps = { searchParams: Promise<{ portfolioId?: string }> };
type Numeric = number | string | null;
type PortfolioRow = { id: string; name: string; base_currency: string };
type AnalysisRow = { id: string; ticker: string; created_at: string; score: Numeric; recommendation: string | null; report: AnalysisReport };
type SnapshotHolding = { ticker?: string; currency?: string; weight?: number | null };
type SnapshotRow = {
  id: string;
  portfolio_id: string;
  portfolio_value: Numeric;
  portfolio_score: Numeric;
  risk_score: Numeric;
  diversification_score: Numeric;
  ledger_revision: Numeric;
  holdings: SnapshotHolding[] | null;
  analysis_summary: { largestPosition?: string | null; largestPositionWeight?: number | null } | null;
  created_at: string;
};

function numeric(value: Numeric | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dimension(report: AnalysisReport | undefined, key: string) {
  return report?.score.dimensions.find((item) => item.key === key)?.score ?? null;
}

function snapshotSignal(snapshot: SnapshotRow | null | undefined) {
  if (!snapshot) return null;
  return {
    portfolioScore: numeric(snapshot.portfolio_score),
    riskScore: numeric(snapshot.risk_score),
    diversificationScore: numeric(snapshot.diversification_score),
    unrealizedProfitLoss: null,
    portfolioValue: numeric(snapshot.portfolio_value),
    largestPositionWeight: typeof snapshot.analysis_summary?.largestPositionWeight === "number"
      ? snapshot.analysis_summary.largestPositionWeight
      : null,
  };
}

export default async function PortfolioAiPage({ searchParams }: PageProps) {
  const [params, user, locale] = await Promise.all([searchParams, getCurrentUser(), getLocale()]);
  const sv = locale === "sv";

  if (!user) {
    return (
      <Section className="pb-10 pt-8 sm:pt-10">
        <Container>
          <Card>
            <h1 className="serif text-3xl font-semibold">Portfolio AI</h1>
            <p className="mt-3 text-sm text-[#9aa7b8]">{sv ? "Logga in för att använda Portfolio AI." : "Sign in to use Portfolio AI."}</p>
            <ButtonLink href="/auth/login?next=/portfolio/ai" className="mt-4">{sv ? "Logga in" : "Sign in"}</ButtonLink>
          </Card>
        </Container>
      </Section>
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return (
      <Section className="pb-10 pt-8 sm:pt-10">
        <Container>
          <ButtonLink href="/portfolio" variant="ghost">← {sv ? "Till portföljer" : "Back to portfolios"}</ButtonLink>
          <Card className="mt-5">
            <h1 className="serif text-3xl font-semibold">Portfolio AI</h1>
            <p className="mt-3 text-sm leading-6 text-[#9aa7b8]">{sv ? "Portfolio AI kan inte läsa ett verifierat dataunderlag i den här miljön just nu." : "Portfolio AI cannot read a verified data source in this environment right now."}</p>
          </Card>
        </Container>
      </Section>
    );
  }

  const portfolioResult = params.portfolioId
    ? await supabase.from("portfolios").select("id,name,base_currency").eq("id", params.portfolioId).maybeSingle()
    : await supabase.from("portfolios").select("id,name,base_currency").order("created_at").limit(1).maybeSingle();
  const portfolio = portfolioResult.data as PortfolioRow | null;

  if (!portfolio) {
    return (
      <Section className="pb-10 pt-8 sm:pt-10">
        <Container>
          <ButtonLink href="/portfolio" variant="ghost">← {sv ? "Till portföljer" : "Back to portfolios"}</ButtonLink>
          <Card className="mt-5">
            <h1 className="serif text-3xl font-semibold">Portfolio AI</h1>
            <p className="mt-3 text-sm text-[#9aa7b8]">{sv ? "Skapa en portfölj först." : "Create a portfolio first."}</p>
          </Card>
        </Container>
      </Section>
    );
  }

  const [revisionResult, snapshotResult, analysisResult] = await Promise.all([
    supabase.from("portfolio_ledger_revisions").select("revision").eq("portfolio_id", portfolio.id).maybeSingle(),
    supabase.from("portfolio_snapshots")
      .select("id,portfolio_id,portfolio_value,portfolio_score,risk_score,diversification_score,ledger_revision,holdings,analysis_summary,created_at")
      .eq("portfolio_id", portfolio.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("analyses")
      .select("id,ticker,created_at,score,recommendation,report")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(160),
  ]);

  const currentRevision = numeric((revisionResult.data as { revision?: Numeric } | null)?.revision);
  const snapshots = (snapshotResult.data ?? []) as SnapshotRow[];
  const currentSnapshots = currentRevision === null
    ? []
    : snapshots.filter((snapshot) => numeric(snapshot.ledger_revision) === currentRevision);
  const latest = currentSnapshots[0] ?? null;
  const previous = currentSnapshots[1] ?? null;

  if (!latest) {
    return (
      <Section className="pb-10 pt-8 sm:pt-10">
        <Container>
          <ButtonLink href="/portfolio" variant="ghost">← {sv ? "Till portföljer" : "Back to portfolios"}</ButtonLink>
          <Card className="mt-5">
            <h1 className="serif text-3xl font-semibold">Portfolio AI</h1>
            <p className="mt-3 text-sm leading-6 text-[#9aa7b8]">{sv ? "Portfolio AI använder bara en snapshot som matchar portföljens aktuella ledger-revision. Uppdatera portföljanalysen först så skapas en verifierad snapshot." : "Portfolio AI only uses a snapshot matching the portfolio's current ledger revision. Refresh the portfolio analysis first to create a verified snapshot."}</p>
            <ButtonLink href="/portfolio" className="mt-4">{sv ? "Uppdatera portföljen" : "Refresh portfolio"}</ButtonLink>
          </Card>
        </Container>
      </Section>
    );
  }

  const analyses = (analysisResult.data ?? []) as AnalysisRow[];
  const latestAnalysisByTicker = new Map<string, AnalysisRow>();
  for (const analysis of analyses) {
    const ticker = analysis.ticker.trim().toUpperCase();
    if (ticker && !latestAnalysisByTicker.has(ticker)) latestAnalysisByTicker.set(ticker, analysis);
  }

  const candidates = [...latestAnalysisByTicker.entries()].map(([ticker, analysis]) => ({
    ticker,
    name: analysis.report?.companyName ?? ticker,
    score: numeric(analysis.score) ?? analysis.report?.score.score ?? null,
    recommendation: analysis.recommendation ?? analysis.report?.recommendation ?? null,
    valuation: dimension(analysis.report, "valuation"),
    growth: dimension(analysis.report, "growth"),
    quality: dimension(analysis.report, "quality"),
    risk: dimension(analysis.report, "risk"),
    momentum: dimension(analysis.report, "momentum"),
    analyzedAt: analysis.created_at,
  }));

  const snapshotHoldings = Array.isArray(latest.holdings) ? latest.holdings : [];
  const holdings = snapshotHoldings.flatMap((holding) => {
    const ticker = holding.ticker?.trim().toUpperCase();
    if (!ticker) return [];
    const analysis = latestAnalysisByTicker.get(ticker);
    return [{
      ticker,
      weight: typeof holding.weight === "number" && Number.isFinite(holding.weight) ? holding.weight : null,
      score: numeric(analysis?.score) ?? analysis?.report?.score.score ?? null,
      recommendation: analysis?.recommendation ?? analysis?.report?.recommendation ?? null,
    }];
  });

  const portfolioSummary = {
    id: portfolio.id,
    name: portfolio.name,
    baseCurrency: portfolio.base_currency,
    portfolioValue: numeric(latest.portfolio_value),
    portfolioScore: numeric(latest.portfolio_score),
    riskScore: numeric(latest.risk_score),
    diversificationScore: numeric(latest.diversification_score),
    largestPosition: latest.analysis_summary?.largestPosition ?? null,
    largestPositionWeight: typeof latest.analysis_summary?.largestPositionWeight === "number"
      ? latest.analysis_summary.largestPositionWeight
      : null,
    snapshotDelta: comparePortfolioSnapshots(snapshotSignal(latest), snapshotSignal(previous)),
    holdings,
  };

  return (
    <Section className="pb-10 pt-8 sm:pt-10">
      <Container>
        <ButtonLink href="/portfolio" variant="ghost">← {sv ? "Till portföljer" : "Back to portfolios"}</ButtonLink>
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#e1cb95]">Portfolio AI</p>
          <h1 className="serif mt-1 text-3xl font-semibold sm:text-4xl">{portfolio.name}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{sv ? "Datagrundat beslutsstöd från dina aktuella StockBox-analyser och den snapshot som matchar nuvarande ledger. Inga order läggs och what-if är inte en avkastningsprognos." : "Data-grounded decision support from your current StockBox analyses and the snapshot matching the current ledger. No orders are placed and what-if is not a return forecast."}</p>
        </div>
        <div className="mt-6">
          <PortfolioAiCoach locale={locale} portfolios={[portfolioSummary]} candidates={candidates} asOf={new Date().toISOString()} />
        </div>
      </Container>
    </Section>
  );
}
