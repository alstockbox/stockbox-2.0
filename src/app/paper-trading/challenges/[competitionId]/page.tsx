import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History, PauseCircle, ShieldCheck, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";
import { loadPaperChallengeWorkspaceV3 } from "@/lib/paper-trading/competition-repository-v3";
import { derivePaperTradingLedgerV3 } from "@/lib/paper-trading/engine-v3";
import { loadPaperAccountStateV3 } from "@/lib/paper-trading/repository-v3";
import { executePaperChallengeOrderAction } from "../../actions";

export const metadata: Metadata = { title: "Paper Trading Challenge" };

type PageProps = {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<{
    tradeStatus?: string | string[];
    reason?: string | string[];
  }>;
};

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function numberLabel(value: number, locale: string, maximumFractionDigits = 8): string {
  return new Intl.NumberFormat(locale === "sv" ? "sv-SE" : "en-US", {
    maximumFractionDigits,
  }).format(value);
}

function dateLabel(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "sv" ? "Okänd tid" : "Unknown time";
  return new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function feedbackLabel(status: string | null, sv: boolean): string | null {
  if (status === "filled") return sv ? "Den simulerade ordern fylldes med ett verifierat marknadspris." : "The simulated order filled using a verified market price.";
  if (status === "existing") return sv ? "Ordern hade redan behandlats. Ingen dubblett skapades." : "The order had already been processed. No duplicate was created.";
  if (status === "rejected") return sv ? "Den simulerade ordern avvisades av den verifierade ordermotorn." : "The simulated order was rejected by the verified order engine.";
  if (status === "paused") return sv ? "Paper Trading är pausat. Ingen order genomfördes." : "Paper Trading is paused. No order was executed.";
  if (status === "invalid") return sv ? "Orderuppgifterna var ogiltiga." : "The order details were invalid.";
  if (status === "unavailable") return sv ? "Challenge-kontot eller tävlingsfönstret kunde inte verifieras för handel." : "The challenge account or trading window could not be verified for trading.";
  if (status === "error") return sv ? "Ordern kunde inte verifieras eller sparas. Ingen affär visas som genomförd." : "The order could not be verified or persisted. No trade is shown as executed.";
  return null;
}

export default async function PaperTradingChallengeWorkspacePage({ params, searchParams }: PageProps) {
  if (!isFeatureEnabled("paperTrading") || !isFeatureEnabled("challenges")) notFound();

  const user = await requireUser();
  const [{ competitionId: rawCompetitionId }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  const competitionId = rawCompetitionId.trim();
  if (!competitionId) notFound();

  const workspaceResult = await loadPaperChallengeWorkspaceV3(user.id, competitionId);
  if (!workspaceResult.ok) notFound();
  const workspace = workspaceResult.workspace;

  const stateResult = await loadPaperAccountStateV3(user.id, workspace.accountId);
  const ledger = stateResult?.ok ? derivePaperTradingLedgerV3(stateResult.state.fills) : null;
  const verifiedState = stateResult?.ok && ledger?.ok ? stateResult.state : null;
  const positions = ledger?.ok ? ledger.positions.filter((position) => position.quantity > 1e-9) : [];
  const recentFills = stateResult?.ok
    ? [...stateResult.state.fills].sort((left, right) => right.executedAt.localeCompare(left.executedAt)).slice(0, 10)
    : [];
  const recentOrders = stateResult?.ok
    ? [...stateResult.orders].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)).slice(0, 10)
    : [];

  const sv = locale === "sv";
  const killed = isKilled("paperTrading");
  const nowMs = Date.now();
  const startsAtMs = Date.parse(workspace.competition.startsAt);
  const endsAtMs = Date.parse(workspace.competition.endsAt);
  const tradingWindowOpen = nowMs >= startsAtMs && nowMs <= endsAtMs;
  const tradingEnabled = !killed && tradingWindowOpen && workspace.accountStatus === "active" && verifiedState !== null;
  const statusAllowsTrading = workspace.competition.status === "open" || workspace.competition.status === "active";
  const orderFormEnabled = tradingEnabled && statusAllowsTrading;
  const orderIdempotencyKey = randomUUID();
  const feedback = feedbackLabel(first(query.tradeStatus), sv);

  const phaseCopy = killed
    ? (sv ? "Paper Trading är tillfälligt pausat. Challenge-historiken är read-only." : "Paper Trading is temporarily paused. Challenge history is read-only.")
    : workspace.accountStatus !== "active"
      ? (sv ? "Challenge-kontot är arkiverat och kan bara läsas." : "The challenge account is archived and read-only.")
      : workspace.competition.status === "cancelled"
        ? (sv ? "Utmaningen är avbruten. Inga nya simulerade order tillåts." : "The challenge is cancelled. No new simulated orders are allowed.")
        : workspace.competition.status === "completed" || nowMs > endsAtMs
          ? (sv ? "Utmaningen är avslutad. Resultat och ledger visas endast som historik." : "The challenge has ended. Results and ledger are shown as history only.")
          : nowMs < startsAtMs
            ? (sv ? "Du är registrerad. Simulerad handel öppnar först när det officiella starttiden nås." : "You are registered. Simulated trading opens only when the official start time is reached.")
            : verifiedState === null
              ? (sv ? "Kontots ledger kunde inte verifieras. Ingen handel tillåts och inga påhittade saldon visas." : "The account ledger could not be verified. Trading is disabled and no invented balances are shown.")
              : (sv ? "Challenge-fönstret är öppet för verifierade simulerade order." : "The challenge window is open for verified simulated orders.");

  return (
    <Section>
      <Container>
        <Link href="/paper-trading/challenges" className="inline-flex items-center gap-2 text-sm text-[#9aa7b8] transition hover:text-[#f4efe5]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {sv ? "Tillbaka till challenges" : "Back to challenges"}
        </Link>

        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">Paper Trading Challenge</p>
          </div>
          <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">{workspace.competition.name}</h1>
          <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">
            {sv
              ? "Det här är en simulerad tävlingsmiljö. StockBox skickar aldrig riktiga värdepappersorder och historisk eller simulerad avkastning är inte bevis på framtida avkastning."
              : "This is a simulated competition environment. StockBox never sends real securities orders, and historical or simulated returns are not evidence of future returns."}
          </p>
        </div>

        <Card className={`mt-6 ${orderFormEnabled ? "border-emerald-300/15 bg-emerald-950/10" : "border-amber-300/15 bg-amber-950/10"}`}>
          <div className="flex gap-3">
            {killed ? <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" /> : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />}
            <div>
              <p className="font-semibold text-[#f4efe5]">{orderFormEnabled ? (sv ? "Verifierat handelsfönster öppet" : "Verified trading window open") : (sv ? "Read-only" : "Read-only")}</p>
              <p className="mt-1 text-sm text-[#9aa7b8]">{phaseCopy}</p>
            </div>
          </div>
        </Card>

        {feedback ? <p className="mt-5 text-sm text-[#e1cb95]" role="status">{feedback}</p> : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <p className="text-xs uppercase tracking-wide text-[#8391a4]">{sv ? "Startkapital" : "Starting capital"}</p>
            <p className="mt-2 number text-lg font-semibold text-[#f4efe5]">{numberLabel(workspace.competition.startingCash, locale, 0)} {workspace.competition.baseCurrency}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-[#8391a4]">{sv ? "Start" : "Starts"}</p>
            <p className="mt-2 text-sm font-semibold text-[#f4efe5]">{dateLabel(workspace.competition.startsAt, locale)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-[#8391a4]">{sv ? "Slut" : "Ends"}</p>
            <p className="mt-2 text-sm font-semibold text-[#f4efe5]">{dateLabel(workspace.competition.endsAt, locale)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-[#8391a4]">Status</p>
            <p className="mt-2 text-sm font-semibold uppercase text-[#e1cb95]">{workspace.competition.status}</p>
          </Card>
        </div>

        {!verifiedState ? (
          <Card className="mt-6 border-amber-300/20 bg-amber-950/20 text-sm text-amber-100">
            {sv
              ? "Challenge-kontots ledger kunde inte verifieras. StockBox visar därför inga saldon, positioner eller affärsresultat från kontot."
              : "The challenge account ledger could not be verified. StockBox therefore shows no balances, positions, or trade results from the account."}
          </Card>
        ) : (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card>
                <h2 className="serif text-xl font-semibold text-[#f4efe5]">{sv ? "Kontant saldo" : "Cash balance"}</h2>
                <div className="mt-4 space-y-2">
                  {verifiedState.cash.length ? verifiedState.cash.map((cash) => (
                    <div key={cash.currency} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-[#9aa7b8]">{cash.currency}</span>
                      <span className="number font-semibold text-[#f4efe5]">{numberLabel(cash.amount, locale)}</span>
                    </div>
                  )) : <p className="text-sm text-[#8391a4]">0</p>}
                </div>
              </Card>

              <Card>
                <h2 className="serif text-xl font-semibold text-[#f4efe5]">{sv ? "Öppna ledgerpositioner" : "Open ledger positions"}</h2>
                {positions.length ? (
                  <div className="mt-4 divide-y divide-white/10">
                    {positions.map((position) => (
                      <div key={`${position.ticker}-${position.currency}`} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-semibold text-[#e1cb95]">{position.ticker}</span>
                          <span className="number">{numberLabel(position.quantity, locale)} {sv ? "st" : "shares"}</span>
                        </div>
                        <p className="mt-1 text-xs text-[#8391a4]">
                          {sv ? "Snittkostnad" : "Average cost"}: <span className="number text-[#c9d2df]">{numberLabel(position.averageCost, locale)} {position.currency}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-4 text-sm text-[#8391a4]">{sv ? "Inga öppna positioner." : "No open positions."}</p>}
              </Card>
            </div>

            {orderFormEnabled ? (
              <Card className="mt-6">
                <h2 className="serif text-xl font-semibold text-[#f4efe5]">{sv ? "Simulerad challenge-order" : "Simulated challenge order"}</h2>
                <p className="mt-2 text-xs leading-5 text-[#8391a4]">
                  {sv
                    ? "Ordern fylls endast om StockBox kan verifiera ett färskt providerpris med riktig tidsstämpel. Challenge-kontot väljs av servern från ditt registrerade deltagande."
                    : "The order fills only when StockBox can verify a fresh provider price with a real timestamp. The challenge account is selected by the server from your registered entry."}
                </p>
                <form action={executePaperChallengeOrderAction} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_160px_180px_auto] lg:items-end">
                  <input type="hidden" name="competitionId" value={workspace.competition.id} />
                  <input type="hidden" name="idempotencyKey" value={orderIdempotencyKey} />
                  <label className="text-xs text-[#9aa7b8]">
                    Ticker
                    <input name="ticker" required maxLength={32} autoCapitalize="characters" placeholder="AAPL" className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm uppercase text-white" />
                  </label>
                  <label className="text-xs text-[#9aa7b8]">
                    {sv ? "Sida" : "Side"}
                    <select name="side" defaultValue="buy" className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white">
                      <option value="buy">{sv ? "Köp" : "Buy"}</option>
                      <option value="sell">{sv ? "Sälj" : "Sell"}</option>
                    </select>
                  </label>
                  <label className="text-xs text-[#9aa7b8]">
                    {sv ? "Antal" : "Quantity"}
                    <input type="number" name="quantity" required min="0.00000001" max="1000000000" step="0.00000001" defaultValue="1" className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" />
                  </label>
                  <Button type="submit">{sv ? "Simulera order" : "Simulate order"}</Button>
                </form>
              </Card>
            ) : null}

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <Card>
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                  <h2 className="serif text-xl font-semibold">{sv ? "Senaste verifierade fills" : "Recent verified fills"}</h2>
                </div>
                {recentFills.length ? (
                  <div className="mt-4 divide-y divide-white/10">
                    {recentFills.map((fill) => (
                      <div key={fill.fillId} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span><span className="font-semibold text-[#e1cb95]">{fill.ticker}</span> · {fill.side === "buy" ? (sv ? "Köp" : "Buy") : (sv ? "Sälj" : "Sell")}</span>
                          <span className="number">{numberLabel(fill.quantity, locale)} × {numberLabel(fill.price, locale)} {fill.currency}</span>
                        </div>
                        <p className="mt-1 text-xs text-[#8391a4]">{dateLabel(fill.executedAt, locale)} · {fill.provider}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-4 text-sm text-[#8391a4]">{sv ? "Inga verifierade fills ännu." : "No verified fills yet."}</p>}
              </Card>

              <Card>
                <h2 className="serif text-xl font-semibold">{sv ? "Senaste orderutfall" : "Recent order outcomes"}</h2>
                {recentOrders.length ? (
                  <div className="mt-4 divide-y divide-white/10">
                    {recentOrders.map((order) => (
                      <div key={order.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div>
                          <p className="text-sm"><span className="font-semibold text-[#e1cb95]">{order.ticker}</span> · {order.side === "buy" ? (sv ? "Köp" : "Buy") : (sv ? "Sälj" : "Sell")} · <span className="number">{numberLabel(order.quantity, locale)}</span></p>
                          <p className="mt-1 text-xs text-[#8391a4]">{dateLabel(order.submittedAt, locale)}</p>
                        </div>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${order.status === "filled" ? "text-emerald-300" : "text-amber-300"}`}>{order.status}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-4 text-sm text-[#8391a4]">{sv ? "Inga orderutfall ännu." : "No order outcomes yet."}</p>}
              </Card>
            </div>
          </>
        )}

        <Card className="mt-6 border-white/10 bg-[#07111f]/60">
          <p className="text-xs leading-5 text-[#8391a4]">
            {sv
              ? "Leaderboard visas inte från denna vy. En framtida ranking får bara byggas från samma verifierade värderingstidpunkt för alla deltagare; workspace-ledgern används inte som en genväg till jämförbara avkastningssiffror."
              : "No leaderboard is shown from this view. Any future ranking must use the same verified evaluation cutoff for every participant; the workspace ledger is not used as a shortcut to comparable return figures."}
          </p>
        </Card>
      </Container>
    </Section>
  );
}
