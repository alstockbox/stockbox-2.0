import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole, PauseCircle, ShieldCheck, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";
import { derivePaperTradingLedgerV3 } from "@/lib/paper-trading/engine-v3";
import { loadPaperPrivateLeagueLeaderboardReadModelV3 } from "@/lib/paper-trading/private-league-leaderboard-read-model-v3";
import { loadPrivatePaperLeagueWorkspaceV3 } from "@/lib/paper-trading/private-league-read-repository-v3";
import { loadPaperAccountStateV3 } from "@/lib/paper-trading/repository-v3";
import { paperTradingServerNowMsV3 } from "@/lib/paper-trading/server-clock-v3";
import { executePrivatePaperLeagueOrderAction as executePrivatePaperLeagueOrderServerAction } from "../../actions";

export const metadata: Metadata = { title: "Private Paper Trading League" };

type PageProps = {
  params: Promise<{ competitionId: string }>;
};

async function executePrivatePaperLeagueOrderAction(formData: FormData): Promise<void> {
  "use server";
  await executePrivatePaperLeagueOrderServerAction(formData);
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

function roleLabel(role: "owner" | "admin" | "member", sv: boolean): string {
  if (role === "owner") return sv ? "Ägare" : "Owner";
  if (role === "admin") return "Admin";
  return sv ? "Medlem" : "Member";
}

export default async function PrivatePaperLeagueWorkspacePage({ params }: PageProps) {
  if (!isFeatureEnabled("paperTrading") || !isFeatureEnabled("privateLeagues")) notFound();

  const user = await requireUser();
  const [{ competitionId: rawCompetitionId }, locale] = await Promise.all([params, getLocale()]);
  const competitionId = rawCompetitionId.trim();
  if (!competitionId) notFound();

  const workspaceResult = await loadPrivatePaperLeagueWorkspaceV3(user.id, competitionId);
  if (!workspaceResult.ok) notFound();
  const workspace = workspaceResult.workspace;

  const leaderboardsEnabled = isFeatureEnabled("leaderboards");
  const leaderboardResult = leaderboardsEnabled
    ? await loadPaperPrivateLeagueLeaderboardReadModelV3({
        competitionId: workspace.competition.id,
        viewerUserId: user.id,
      })
    : null;

  const stateResult = await loadPaperAccountStateV3(user.id, workspace.accountId);
  const ledger = stateResult?.ok ? derivePaperTradingLedgerV3(stateResult.state.fills) : null;
  const verifiedState = stateResult?.ok && ledger?.ok ? stateResult.state : null;
  const positions = ledger?.ok ? ledger.positions.filter((position) => position.quantity > 1e-9) : [];

  const sv = locale === "sv";
  const killed = isKilled("paperTrading");
  const nowMs = paperTradingServerNowMsV3();
  const startsAtMs = Date.parse(workspace.competition.startsAt);
  const endsAtMs = Date.parse(workspace.competition.endsAt);
  const tradingWindowOpen = nowMs >= startsAtMs && nowMs <= endsAtMs;
  const statusAllowsTrading = workspace.competition.status === "open" || workspace.competition.status === "active";
  const tradingEnabled = !killed
    && tradingWindowOpen
    && workspace.accountStatus === "active"
    && statusAllowsTrading
    && verifiedState !== null;
  const orderIdempotencyKey = randomUUID();

  const phaseCopy = killed
    ? (sv ? "Paper Trading är pausat. Den privata ligan är read-only." : "Paper Trading is paused. This private league is read-only.")
    : workspace.accountStatus !== "active"
      ? (sv ? "Ligakontot är arkiverat och kan bara läsas." : "The league account is archived and read-only.")
      : workspace.competition.status === "cancelled"
        ? (sv ? "Ligan är avbruten. Inga nya simulerade order tillåts." : "The league is cancelled. No new simulated orders are allowed.")
        : workspace.competition.status === "completed" || nowMs > endsAtMs
          ? (sv ? "Ligan är avslutad. Ledger och verifierade resultat visas endast som historik." : "The league has ended. Ledger and verified results are shown as history only.")
          : nowMs < startsAtMs
            ? (sv ? "Du är medlem. Simulerad handel öppnar först vid den officiella starttiden." : "You are a member. Simulated trading opens only at the official start time.")
            : verifiedState === null
              ? (sv ? "Kontots ledger kunde inte verifieras. Handel är avstängd och inga påhittade saldon visas." : "The account ledger could not be verified. Trading is disabled and no invented balances are shown.")
              : (sv ? "Det verifierade handelsfönstret är öppet för simulerade order." : "The verified trading window is open for simulated orders.");

  return (
    <Section>
      <Container>
        <Link href="/paper-trading/private-leagues" className="inline-flex items-center gap-2 text-sm text-[#9aa7b8] transition hover:text-[#f4efe5]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {sv ? "Tillbaka till privata ligor" : "Back to private leagues"}
        </Link>

        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">Private Paper Trading League</p>
          </div>
          <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">{workspace.competition.name}</h1>
          <p className="mt-3 text-sm text-[#e1cb95]">{sv ? "Roll" : "Role"}: {roleLabel(workspace.role, sv)}</p>
          <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">
            {sv
              ? "Det här är en privat, simulerad och medlemsbegränsad miljö. StockBox skickar aldrig riktiga värdepappersorder och ligan är inte publikt sökbar."
              : "This is a private, simulated, member-only environment. StockBox never sends real securities orders and the league is not publicly discoverable."}
          </p>
        </div>

        <Card className={`mt-6 ${tradingEnabled ? "border-emerald-300/15 bg-emerald-950/10" : "border-amber-300/15 bg-amber-950/10"}`}>
          <div className="flex gap-3">
            {killed ? <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" /> : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />}
            <div>
              <p className="font-semibold text-[#f4efe5]">{tradingEnabled ? (sv ? "Verifierat handelsfönster öppet" : "Verified trading window open") : "Read-only"}</p>
              <p className="mt-1 text-sm text-[#9aa7b8]">{phaseCopy}</p>
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              ? "Ligakontots ledger kunde inte verifieras. StockBox visar därför inga saldon eller positioner från kontot."
              : "The league account ledger could not be verified. StockBox therefore shows no balances or positions from the account."}
          </Card>
        ) : (
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
                        <span className="number text-[#f4efe5]">{numberLabel(position.quantity, locale)} {sv ? "st" : "shares"}</span>
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
        )}

        {tradingEnabled ? (
          <Card className="mt-6">
            <h2 className="serif text-xl font-semibold text-[#f4efe5]">{sv ? "Simulerad ligaorder" : "Simulated league order"}</h2>
            <p className="mt-2 text-xs leading-5 text-[#8391a4]">
              {sv
                ? "Browsern skickar endast ligaidentitet och orderavsikt. Det faktiska tävlingskontot väljs och verifieras av servern innan den simulerade ordern kan köras."
                : "The browser submits only league identity and order intent. The actual competition account is selected and verified by the server before the simulated order can execute."}
            </p>
            <form action={executePrivatePaperLeagueOrderAction} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_160px_180px_auto] lg:items-end">
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
                <input name="quantity" required inputMode="decimal" min="0.000000001" step="any" className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" />
              </label>
              <Button type="submit">{sv ? "Skicka simulerad order" : "Submit simulated order"}</Button>
            </form>
          </Card>
        ) : null}

        <div className="mt-6">
          {!leaderboardsEnabled ? (
            <Card>
              <div className="flex gap-3">
                <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-[#f4efe5]">{sv ? "Topplista är inte aktiverad" : "Leaderboard is not enabled"}</p>
                  <p className="mt-2 text-xs leading-5 text-[#8391a4]">
                    {sv ? "Ingen ranking visas förrän den separata leaderboard-funktionen är aktiverad." : "No ranking is shown until the separate leaderboard feature is enabled."}
                  </p>
                </div>
              </div>
            </Card>
          ) : leaderboardResult && leaderboardResult.status === "VERIFIED" ? (
            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                    <h2 className="serif text-xl font-semibold text-[#f4efe5]">{sv ? "Verifierad topplista" : "Verified leaderboard"}</h2>
                  </div>
                  <p className="mt-2 text-xs text-[#8391a4]">
                    {leaderboardResult.final ? (sv ? "Slutresultat" : "Final standings") : (sv ? "Verifierat mellanresultat" : "Verified interim standings")}
                    {" · "}{sv ? "Värderad" : "Evaluated"} {dateLabel(leaderboardResult.evaluationCutoff, locale)}
                  </p>
                </div>
                <span className="text-xs text-[#9aa7b8]">{leaderboardResult.baseCurrency}</span>
              </div>

              <div className="mt-5 overflow-x-auto">
                <div className="min-w-[520px] divide-y divide-white/10">
                  {leaderboardResult.standings.map((standing, index) => (
                    <div key={`${standing.rank}-${index}`} className="grid grid-cols-[70px_1fr_120px_150px] items-center gap-3 py-3 text-sm">
                      <span className="number font-semibold text-[#e1cb95]">#{standing.rank}</span>
                      <span className="font-semibold text-[#f4efe5]">
                        {standing.isViewer
                          ? (sv ? "Du" : "You")
                          : `${sv ? "Deltagare" : "Participant"} ${index + 1}`}
                      </span>
                      <span className="number text-right text-[#c9d2df]">{numberLabel(standing.returnPercent, locale, 2)}%</span>
                      <span className="number text-right text-[#f4efe5]">{numberLabel(standing.equity, locale, 2)} {leaderboardResult.baseCurrency}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="border-amber-300/20 bg-amber-950/20">
              <p className="font-semibold text-amber-100">{sv ? "Topplistan är inte verifierad" : "Leaderboard unavailable"}</p>
              <p className="mt-2 text-xs leading-5 text-amber-100/80">
                {sv
                  ? "StockBox visar ingen delvis eller uppskattad ranking när gemensam verifierad värdering saknas."
                  : "StockBox shows no partial or estimated ranking when common verified valuation evidence is unavailable."}
              </p>
            </Card>
          )}
        </div>

        <Card className="mt-6">
          <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Liga-integritet" : "League integrity"}</p>
          <p className="mt-2 text-xs leading-5 text-[#8391a4]">
            {sv
              ? "Medlemskap, konto, valuta och tidsfönster verifieras på servern. Topplistan använder endast ett gemensamt persistat verifierat värderingstillfälle och aldrig browservalda konto-ID:n."
              : "Membership, account, currency, and timing are verified on the server. The leaderboard uses only a common persisted verified evaluation cutoff and never browser-selected account IDs."}
          </p>
        </Card>
      </Container>
    </Section>
  );
}
