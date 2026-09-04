import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radar, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { getHiddenGems } from "@/lib/alpha/repository";
import type {
  HiddenGemsCategory,
  HiddenGemsHorizon,
  HiddenGemsRiskBand,
} from "@/lib/alpha/hidden-gems";
import type { MarketCapBand } from "@/lib/alpha/market-cap";

export const metadata: Metadata = {
  title: "Hidden Gems | StockBox",
  description: "StockBox Alpha rankings for undervaluation, inflection, small-cap asymmetry and breakout setups.",
};

type PageSearchParams = Record<string, string | string[] | undefined>;

const CATEGORIES: HiddenGemsCategory[] = [
  "highest_breakout",
  "undervalued",
  "small_cap",
  "earnings_inflection",
  "growth_acceleration",
  "catalyst",
  "most_improved",
];
const HORIZONS: HiddenGemsHorizon[] = ["oneMonth", "threeMonths", "sixMonths", "twelveMonths"];
const SIZE_BANDS: Array<MarketCapBand | "all"> = ["all", "micro", "small", "mid", "large", "mega"];
const RISK_BANDS: Array<HiddenGemsRiskBand | "all"> = ["all", "low", "medium", "high"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function categoryLabel(category: HiddenGemsCategory, sv: boolean) {
  const labels: Record<HiddenGemsCategory, [string, string]> = {
    highest_breakout: ["Highest Breakout Probability", "Högst breakout-potential"],
    undervalued: ["Top Undervalued", "Mest undervärderade"],
    small_cap: ["Small-Cap Opportunities", "Small-cap möjligheter"],
    earnings_inflection: ["Earnings Inflections", "Resultatvändningar"],
    growth_acceleration: ["Growth Accelerators", "Tillväxtacceleratorer"],
    catalyst: ["Catalyst Opportunities", "Katalysatormöjligheter"],
    most_improved: ["Most Improved", "Mest förbättrade"],
  };
  return labels[category][sv ? 1 : 0];
}

function horizonLabel(horizon: HiddenGemsHorizon) {
  return ({ oneMonth: "1M", threeMonths: "3M", sixMonths: "6M", twelveMonths: "12M" })[horizon];
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function score(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}`;
}

export default async function HiddenGemsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const [user, locale, params] = await Promise.all([getCurrentUser(), getLocale(), searchParams]);
  const sv = locale === "sv";

  if (!user) {
    return (
      <Section>
        <Container>
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-semibold text-[#e1cb95]">StockBox Alpha</p>
            <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">Hidden Gems</h1>
            <Card className="mt-8">
              <h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Logga in för Alpha-rankingen" : "Sign in for Alpha rankings"}</h2>
              <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">
                {sv ? "Hidden Gems jämför StockBox Alpha-signaler separat från den fundamentala StockBox Score." : "Hidden Gems compares StockBox Alpha signals separately from the fundamental StockBox Score."}
              </p>
              <ButtonLink href="/auth/login" className="mt-5">{sv ? "Logga in" : "Sign in"} <ArrowRight className="h-4 w-4" aria-hidden="true" /></ButtonLink>
            </Card>
          </div>
        </Container>
      </Section>
    );
  }

  const category = oneOf(first(params.category), CATEGORIES, "highest_breakout");
  const horizon = oneOf(first(params.horizon), HORIZONS, "sixMonths");
  const marketCapBand = oneOf(first(params.size), SIZE_BANDS, "all");
  const riskBand = oneOf(first(params.risk), RISK_BANDS, "all");

  const result = await getHiddenGems({
    category,
    horizon,
    marketCapBand,
    riskBand,
    limit: 30,
  });

  return (
    <Section>
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#e1cb95]"><Radar className="h-4 w-4" aria-hidden="true" />StockBox Alpha</div>
            <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">Hidden Gems</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9aa7b8]">
              {sv
                ? "Separat discovery-motor för värderingsasymmetri, fundamental acceleration, resultatvändningar, katalysatorer och breakout-setups. Alpha Score ändrar aldrig den fundamentala StockBox Score."
                : "A separate discovery engine for valuation asymmetry, fundamental acceleration, earnings inflections, catalysts and breakout setups. Alpha Score never changes the fundamental StockBox Score."}
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[#c9d2df]">
            {sv ? "Analyserat universum" : "Analyzed universe"}: <span className="font-semibold text-[#f4efe5]">{result.universeSize}</span>
          </div>
        </div>

        <Card className="mt-8">
          <form className="grid gap-4 md:grid-cols-4" method="get">
            <label className="text-xs font-semibold text-[#c9d2df]">
              {sv ? "Ranking" : "Ranking"}
              <select name="category" defaultValue={category} className="mt-2 w-full rounded-md border border-white/10 bg-[#081522] px-3 py-2 text-sm text-[#f4efe5]">
                {CATEGORIES.map((value) => <option key={value} value={value}>{categoryLabel(value, sv)}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#c9d2df]">
              {sv ? "Tidshorisont" : "Horizon"}
              <select name="horizon" defaultValue={horizon} className="mt-2 w-full rounded-md border border-white/10 bg-[#081522] px-3 py-2 text-sm text-[#f4efe5]">
                {HORIZONS.map((value) => <option key={value} value={value}>{horizonLabel(value)}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#c9d2df]">
              {sv ? "Bolagsstorlek" : "Market-cap band"}
              <select name="size" defaultValue={marketCapBand} className="mt-2 w-full rounded-md border border-white/10 bg-[#081522] px-3 py-2 text-sm text-[#f4efe5]">
                {SIZE_BANDS.map((value) => <option key={value} value={value}>{value === "all" ? (sv ? "Alla" : "All") : value.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#c9d2df]">
              {sv ? "Risk" : "Risk"}
              <select name="risk" defaultValue={riskBand} className="mt-2 w-full rounded-md border border-white/10 bg-[#081522] px-3 py-2 text-sm text-[#f4efe5]">
                {RISK_BANDS.map((value) => <option key={value} value={value}>{value === "all" ? (sv ? "Alla" : "All") : value}</option>)}
              </select>
            </label>
            <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#e1cb95] px-4 text-sm font-semibold text-[#081522] md:col-span-4 md:w-fit">
              {sv ? "Uppdatera ranking" : "Update ranking"}
            </button>
          </form>
        </Card>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card><Sparkles className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{sv ? "Aktiv ranking" : "Active ranking"}</p><p className="mt-1 text-lg font-semibold text-[#f4efe5]">{categoryLabel(category, sv)}</p></Card>
          <Card><TrendingUp className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{sv ? "Horisont" : "Horizon"}</p><p className="number mt-1 text-2xl font-semibold text-[#f4efe5]">{horizonLabel(horizon)}</p></Card>
          <Card><ShieldAlert className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{sv ? "Modellprincip" : "Model principle"}</p><p className="mt-1 text-sm font-semibold text-[#f4efe5]">Risk-gated · point-in-time</p></Card>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-white/10 bg-[#081522]/65">
          {result.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-[#9aa7b8]">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">{sv ? "Bolag" : "Company"}</th>
                    <th className="px-4 py-3">Alpha</th>
                    <th className="px-4 py-3">StockBox</th>
                    <th className="px-4 py-3">Breakout</th>
                    <th className="px-4 py-3">P(+25%) {horizonLabel(horizon)}</th>
                    <th className="px-4 py-3">{sv ? "Risk" : "Risk"}</th>
                    <th className="px-4 py-3">{sv ? "Förändring" : "Change"}</th>
                    <th className="px-4 py-3">{sv ? "Starkaste signal" : "Top signal"}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, index) => {
                    const scannerOrigin = row.originType === "universe";
                    return (
                      <tr key={row.id} className="border-b border-white/8 last:border-0 hover:bg-white/[0.035]">
                        <td className="number px-4 py-4 text-[#9aa7b8]">{index + 1}</td>
                        <td className="px-4 py-4">
                          {row.analysisId ? (
                            <Link href={`/analysis/${row.analysisId}`} className="font-semibold text-[#e1cb95] hover:text-white">{row.ticker}</Link>
                          ) : (
                            <span className="font-semibold text-[#e1cb95]">{row.ticker}</span>
                          )}
                          <p className="mt-1 max-w-[240px] truncate text-xs text-[#9aa7b8]">{row.companyName} · {row.marketCapBand}{scannerOrigin ? " · scanner" : ""}</p>
                        </td>
                        <td className="number px-4 py-4 font-semibold text-[#f4efe5]">{score(row.alphaScore)}/100</td>
                        <td className="number px-4 py-4 text-[#c9d2df]">{score(row.fundamentalScore)}{row.fundamentalScore === null ? "" : "/100"}</td>
                        <td className="number px-4 py-4 text-[#f4efe5]">{score(row.breakoutScore)}/100</td>
                        <td className="number px-4 py-4 text-[#e1cb95]">{pct(row.probabilities[horizon].up25)}</td>
                        <td className="number px-4 py-4 text-[#c9d2df]">{score(row.risk.overall)}/100</td>
                        <td className="number px-4 py-4 text-[#c9d2df]">{row.alphaChange === null ? "—" : `${row.alphaChange > 0 ? "+" : ""}${row.alphaChange}`}</td>
                        <td className="px-4 py-4 text-xs text-[#c9d2df]">{row.strongestSignals[0] ?? (sv ? "Ingen stark signal" : "No strong signal")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Ingen ranking tillgänglig ännu" : "No ranking available yet"}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#9aa7b8]">
                {sv
                  ? "Hidden Gems visar bara verkliga point-in-time Alpha-snapshots från sparade analyser eller den serverägda scannern. Om datalagret inte är aktiverat visas inga fabricerade resultat."
                  : "Hidden Gems only shows real point-in-time Alpha snapshots from saved analyses or the server-owned scanner. If the data layer is not active, no fabricated results are shown."}
              </p>
              <ButtonLink href="/analyze" className="mt-5">{sv ? "Analysera bolag" : "Analyze companies"} <ArrowRight className="h-4 w-4" aria-hidden="true" /></ButtonLink>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-amber-200/15 bg-amber-200/[0.035] px-4 py-3 text-xs leading-5 text-[#9aa7b8]">
          <strong className="text-[#e1cb95]">{sv ? "Viktigt:" : "Important:"}</strong>{" "}
          {sv
            ? "Sannolikheterna är modellimplicerade ranking-signaler, inte garanterade prognoser. Den automatiska universumskällan täcker amerikanska börsnoterade instrument från Nasdaq Traders officiella symbolkatalog och filtreras till scanner-berättigade stamaktier. Nordic/global fullmarknadstäckning ska inte påstås förrän en motsvarande tillförlitlig källa är inkopplad."
            : "Probabilities are model-implied ranking signals, not guaranteed forecasts. The automated universe source covers US-listed instruments from Nasdaq Trader's official symbol directory and is filtered to scanner-eligible common equities. Nordic/global full-market coverage must not be claimed until an equivalent reliable source is connected."}
        </div>
      </Container>
    </Section>
  );
}
