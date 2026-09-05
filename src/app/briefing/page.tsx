import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BellRing, FileText, ShieldCheck, WalletCards } from "lucide-react";
import { presentAnalysisAlertEventV3 } from "@/lib/alerts/presentation-v3";
import type { DailyBriefingFactV3, DailyBriefingOfficialFactV3, DailyBriefingPortfolioFactV3 } from "@/lib/briefing/daily-briefing-v3";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { loadDailyBriefingV3 } from "@/lib/db/daily-briefing-v3";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Daily Briefing" };

function dateLabel(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function numberLabel(value: number | null, locale: string, suffix = "") {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted = new Intl.NumberFormat(locale === "sv" ? "sv-SE" : "en-GB", {
    maximumFractionDigits: 2,
  }).format(value);
  return suffix ? `${formatted} ${suffix}` : formatted;
}

function officialCopy(fact: DailyBriefingOfficialFactV3, sv: boolean) {
  const labels = sv
    ? { insider: "Insiderdata", short_interest: "Blankningsdata", filing: "Bolagsrapportering" }
    : { insider: "Insider data", short_interest: "Short-interest data", filing: "Company filing" };
  return {
    title: `${fact.ticker}: ${labels[fact.kind]}`,
    body: sv
      ? "StockBox registrerade en förändring i den officiella bevakningen. Öppna bevakningssidan för källmetadata och detaljer."
      : "StockBox recorded a change in official monitoring. Open the watchlist page for source metadata and details.",
  };
}

function PortfolioFact({ fact, locale }: { fact: DailyBriefingPortfolioFactV3; locale: string }) {
  const sv = locale === "sv";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#8391a4]">
        <WalletCards className="h-4 w-4 text-[#e1cb95]" aria-hidden="true" />
        <span>{sv ? "Portföljfakta" : "Portfolio facts"}</span><span>·</span><span>{dateLabel(fact.observedAt, locale)}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-white">{sv ? "Senaste sparade portföljbild" : "Latest saved portfolio snapshot"}</p>
      <div className="mt-3 grid gap-2 text-xs text-[#aeb9c8] sm:grid-cols-2 lg:grid-cols-4">
        <span>{sv ? "Värde" : "Value"}: {numberLabel(fact.portfolioValue, locale, fact.baseCurrency)}</span>
        <span>{sv ? "Orealiserat resultat" : "Unrealized P/L"}: {numberLabel(fact.unrealizedPl, locale, fact.baseCurrency)}</span>
        <span>{sv ? "Portföljscore" : "Portfolio score"}: {numberLabel(fact.portfolioScore, locale)}</span>
        <span>{sv ? "Diversifiering" : "Diversification"}: {numberLabel(fact.diversificationScore, locale)}</span>
      </div>
      {fact.completeValuation === false ? (
        <p className="mt-2 text-xs text-amber-300">{sv ? "Portföljvärderingen är ofullständig eftersom minst en position saknar verifierbar pris- eller valutakontext." : "Portfolio valuation is incomplete because at least one position lacks verifiable price or FX context."}</p>
      ) : null}
    </div>
  );
}

function BriefingFact({ fact, locale }: { fact: DailyBriefingFactV3; locale: string }) {
  const sv = locale === "sv";
  if (fact.source === "portfolio_snapshot") return <PortfolioFact fact={fact} locale={locale} />;

  if (fact.source === "official_monitoring") {
    const copy = officialCopy(fact, sv);
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#8391a4]">
          <FileText className="h-4 w-4 text-[#e1cb95]" aria-hidden="true" />
          <span>{fact.ticker}</span><span>·</span><span>{dateLabel(fact.observedAt, locale)}</span>
        </div>
        <p className="mt-2 text-sm font-medium text-white">{copy.title}</p>
        <p className="mt-1 text-sm text-[#aeb9c8]">{copy.body}</p>
      </div>
    );
  }

  const presented = presentAnalysisAlertEventV3({
    ticker: fact.ticker,
    alert_kind: fact.kind,
    severity: fact.severity,
    message_key: fact.messageKey,
    payload: fact.payload,
    observed_at: fact.observedAt,
  }, locale);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#8391a4]">
        <BellRing className="h-4 w-4 text-[#e1cb95]" aria-hidden="true" />
        <span>{fact.ticker}</span><span>·</span><span>{presented.kindLabel}</span><span>·</span><span>{dateLabel(fact.observedAt, locale)}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-white">{presented.title}</p>
      <p className="mt-1 text-sm text-[#aeb9c8]">{presented.body}</p>
    </div>
  );
}

export default async function DailyBriefingPage() {
  if (!isFeatureEnabled("dailyBriefing")) notFound();
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const sv = locale === "sv";

  if (!user) {
    return (
      <Section><Container>
        <p className="text-sm font-semibold text-[#e1cb95]">Daily Briefing</p>
        <h1 className="serif mt-2 text-3xl font-semibold">{sv ? "Ditt senaste dygn i StockBox" : "Your latest 24 hours in StockBox"}</h1>
        <Card className="mt-8">
          <p className="text-sm text-[#c9d2df]">{sv ? "Logga in för att se din briefing från sparade analyser, bevakningar och portföljdata." : "Sign in to see your briefing from saved analyses, monitoring and portfolio data."}</p>
          <ButtonLink href="/auth/login" className="mt-4">{sv ? "Logga in" : "Sign in"}</ButtonLink>
        </Card>
      </Container></Section>
    );
  }

  const result = await loadDailyBriefingV3({ userId: user.id, hours: 24 });
  if (result.status === "disabled") notFound();

  return (
    <Section><Container>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#e1cb95]">Daily Briefing</p>
          <h1 className="serif mt-2 text-3xl font-semibold">{sv ? "Det viktigaste från senaste 24 timmarna" : "What mattered in the last 24 hours"}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{sv ? "Bygger endast på redan sparade StockBox-fakta. Briefingen startar inga nya analyser, använder ingen LLM och din investerarprofil ändrar aldrig objektiva ratingar." : "Built only from already-saved StockBox facts. The briefing starts no new analyses, uses no LLM, and your investor profile never changes objective ratings."}</p>
        </div>
        <ButtonLink href="/watchlist">{sv ? "Öppna bevakning" : "Open watchlist"}</ButtonLink>
      </div>

      {result.status === "unconfigured" ? (
        <Card className="mt-8"><p className="text-sm text-[#c9d2df]">{sv ? "Briefingen är tillfälligt otillgänglig eftersom serverlagringen inte är konfigurerad." : "The briefing is temporarily unavailable because server storage is not configured."}</p></Card>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            <Card><ShieldCheck className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{sv ? "Viktiga signaler" : "Important signals"}</p><p className="number mt-1 text-3xl font-semibold">{result.briefing.counts.important}</p></Card>
            <Card><BellRing className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">StockBox</p><p className="number mt-1 text-3xl font-semibold">{result.briefing.counts.stockbox}</p></Card>
            <Card><FileText className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{sv ? "Officiella ändringar" : "Official changes"}</p><p className="number mt-1 text-3xl font-semibold">{result.briefing.counts.official}</p></Card>
            <Card><WalletCards className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{sv ? "Portföljbilder" : "Portfolio snapshots"}</p><p className="number mt-1 text-3xl font-semibold">{result.briefing.counts.portfolio}</p></Card>
          </div>

          {result.degradedSources.length ? (
            <p className="mt-5 text-xs text-amber-300" role="status">{sv ? "En eller flera datakällor kunde inte läsas. Briefingen visar endast verifierbara delar och fyller inte i det som saknas." : "One or more stored-data sources could not be read. The briefing shows only verifiable parts and does not fill in missing information."}</p>
          ) : null}

          <Card className="mt-8">
            {result.briefing.facts.length ? (
              <div className="divide-y divide-white/10">
                {result.briefing.facts.map((fact) => (
                  <div key={`${fact.source}:${fact.sourceId}`} className="py-5 first:pt-0 last:pb-0"><BriefingFact fact={fact} locale={locale} /></div>
                ))}
              </div>
            ) : (
              <div className="py-2">
                <ShieldCheck className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-white">{sv ? "Inga verifierade förändringssignaler senaste 24 timmarna" : "No verified change signals in the last 24 hours"}</p>
                <p className="mt-1 text-sm text-[#8391a4]">{sv ? "StockBox hittar inte på en briefing när underlaget är tomt." : "StockBox does not invent a briefing when the evidence set is empty."}</p>
              </div>
            )}
          </Card>
        </>
      )}
    </Container></Section>
  );
}
