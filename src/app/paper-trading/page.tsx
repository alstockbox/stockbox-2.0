import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDollarSign, History, PauseCircle, ShieldCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";
import {
  PAPER_TRADING_V3_COMMON_CURRENCIES,
  PAPER_TRADING_V3_STARTING_CASH,
  listPaperAccountsV3,
} from "@/lib/paper-trading/accounts-v3";
import { derivePaperTradingLedgerV3, type PaperTradingRejectReasonV3 } from "@/lib/paper-trading/engine-v3";
import { loadPaperAccountStateV3 } from "@/lib/paper-trading/repository-v3";
import { createPaperAccountAction, executePaperOrderAction } from "./actions";

export const metadata: Metadata = { title: "Paper Trading" };

type PageProps = {
  searchParams: Promise<{
    account?: string | string[];
    accountStatus?: string | string[];
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

function rejectReasonLabel(reason: string | null, sv: boolean): string {
  const labels: Record<PaperTradingRejectReasonV3, [string, string]> = {
    INVALID_ORDER: ["Ordern var ogiltig.", "The order was invalid."],
    DUPLICATE_IDEMPOTENCY_KEY: ["Ordern hade redan behandlats.", "The order had already been processed."],
    LEDGER_INVALID: ["Simulatorns historik kunde inte verifieras. Ingen affär genomfördes.", "The simulator ledger could not be verified. No trade was executed."],
    MARKET_NOT_VERIFIED: ["Marknadspriset kunde inte verifieras. Ingen affär genomfördes.", "The market price could not be verified. No trade was executed."],
    MARKET_TICKER_MISMATCH: ["Marknadsdatan matchade inte instrumentet.", "Market data did not match the instrument."],
    MARKET_PRICE_INVALID: ["Ett giltigt marknadspris saknades.", "A valid market price was unavailable."],
    MARKET_CURRENCY_INVALID: ["Marknadsprisets valuta kunde inte verifieras.", "The quote currency could not be verified."],
    MARKET_TIMESTAMP_INVALID: ["Marknadsprisets tidsstämpel kunde inte verifieras.", "The quote timestamp could not be verified."],
    MARKET_OBSERVATION_FUTURE: ["Marknadsprisets tidsstämpel var ogiltig.", "The quote timestamp was invalid."],
    MARKET_OBSERVATION_STALE: ["Marknadspriset var för gammalt för en rättvis simulering.", "The market price was too old for a fair simulation."],
    INSUFFICIENT_CASH: ["Kontot saknar tillräckligt saldo i exakt samma valuta som marknadspriset.", "The account does not have enough cash in the exact quote currency."],
    INSUFFICIENT_POSITION: ["Kontot äger inte tillräckligt många simulerade aktier för försäljningen.", "The account does not own enough simulated shares for the sale."],
  };
  if (!reason || !(reason in labels)) return sv ? "Ordern kunde inte genomföras." : "The order could not be executed.";
  return labels[reason as PaperTradingRejectReasonV3][sv ? 0 : 1];
}

function feedbackCopy(params: Awaited<PageProps["searchParams"]>, sv: boolean): string | null {
  const accountStatus = first(params.accountStatus);
  const tradeStatus = first(params.tradeStatus);
  if (accountStatus === "created") return sv ? "Simulatorkontot skapades." : "The simulation account was created.";
  if (accountStatus === "invalid") return sv ? "Kontouppgifterna var ogiltiga." : "The account details were invalid.";
  if (accountStatus === "error") return sv ? "Kontot kunde inte skapas just nu." : "The account could not be created right now.";
  if (tradeStatus === "filled") return sv ? "Den simulerade ordern fylldes med ett verifierat marknadspris." : "The simulated order filled using a verified market price.";
  if (tradeStatus === "existing") return sv ? "Den här ordern hade redan behandlats. Ingen dubblett skapades." : "This order had already been processed. No duplicate was created.";
  if (tradeStatus === "rejected") return rejectReasonLabel(first(params.reason), sv);
  if (tradeStatus === "paused") return sv ? "Paper Trading är tillfälligt pausat. Ingen affär genomfördes." : "Paper Trading is temporarily paused. No trade was executed.";
  if (tradeStatus === "invalid") return sv ? "Orderuppgifterna var ogiltiga." : "The order details were invalid.";
  if (tradeStatus === "error") return sv ? "Ordern kunde inte verifieras eller sparas just nu. Ingen affär visas som genomförd." : "The order could not be verified or persisted right now. No trade is shown as executed.";
  return null;
}

export default async function PaperTradingPage({ searchParams }: PageProps) {
  if (!isFeatureEnabled("paperTrading")) notFound();

  const [params, user, locale] = await Promise.all([searchParams, requireUser(), getLocale()]);
  const sv = locale === "sv";
  const killed = isKilled("paperTrading");
  const feedback = feedbackCopy(params, sv);
  const accountsResult = await listPaperAccountsV3(user.id);
  const requestedAccountId = first(params.account);
  const selectedAccount = accountsResult.ok
    ? accountsResult.accounts.find((account) => account.id === requestedAccountId)
      ?? accountsResult.accounts.find((account) => account.status === "active")
      ?? accountsResult.accounts[0]
      ?? null
    : null;
  const stateResult = selectedAccount
    ? await loadPaperAccountStateV3(user.id, selectedAccount.id)
    : null;
  const ledger = stateResult?.ok ? derivePaperTradingLedgerV3(stateResult.state.fills) : null;
  const verifiedState = Boolean(stateResult?.ok && ledger?.ok);
  const positions = ledger?.ok
    ? ledger.positions.filter((position) => position.quantity > 1e-9)
    : [];
  const recentFills = stateResult?.ok
    ? [...stateResult.state.fills].sort((left, right) => right.executedAt.localeCompare(left.executedAt)).slice(0, 10)
    : [];
  const recentOrders = stateResult?.ok
    ? [...stateResult.orders].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)).slice(0, 10)
    : [];
  const orderIdempotencyKey = randomUUID();

  return (
    <Section>
      <Container>
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">Paper Trading</p>
          <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">
            {sv ? "Träna beslut med simulerat kapital – aldrig riktiga affärer" : "Practice decisions with simulated capital — never real trades"}
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">
            {sv
              ? "StockBox skickar inga order till en mäklare och använder inga riktiga pengar. Ett marknadspris hämtas endast när du skickar en simulerad order. Om pris, valuta eller providerns tidsstämpel inte kan verifieras fylls ordern inte."
              : "StockBox sends no orders to a broker and uses no real money. A market price is fetched only when you submit a simulated order. If the price, currency or provider timestamp cannot be verified, the order will not fill."}
          </p>
        </div>

        {killed ? (
          <Card className="mt-6 border-amber-300/20 bg-amber-950/20">
            <div className="flex gap-3">
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-100">{sv ? "Simulatorn är tillfälligt pausad" : "The simulator is temporarily paused"}</p>
                <p className="mt-1 text-sm text-amber-100/80">{sv ? "Historik visas fortfarande, men nya konton och simulerade affärer är avstängda av StockBox kill-switch." : "History remains visible, but new accounts and simulated trades are disabled by the StockBox kill switch."}</p>
              </div>
            </div>
          </Card>
        ) : null}

        {feedback ? <p className="mt-5 text-sm text-[#e1cb95]" role="status">{feedback}</p> : null}

        {!accountsResult.ok ? (
          <Card className="mt-7 border-amber-300/20 bg-amber-950/20 text-sm text-amber-100">
            {sv ? "Dina simulatorkonton kunde inte verifieras just nu. StockBox visar därför inga påhittade saldon, positioner eller resultat." : "Your simulation accounts could not be verified right now. StockBox therefore shows no invented balances, positions or results."}
          </Card>
        ) : (
          <>
            <div className="mt-8 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              <Card>
                <div className="flex items-center gap-2">
                  <WalletCards className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                  <h2 className="serif text-xl font-semibold">{sv ? "Simulatorkonton" : "Simulation accounts"}</h2>
                </div>
                {accountsResult.accounts.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {accountsResult.accounts.map((account) => {
                      const selected = selectedAccount?.id === account.id;
                      return (
                        <Link
                          key={account.id}
                          href={`/paper-trading?account=${encodeURIComponent(account.id)}`}
                          className={`rounded-lg border p-3 text-sm transition ${selected ? "border-[#b99b5f]/60 bg-[#b99b5f]/10" : "border-white/10 bg-[#07111f]/60 hover:border-white/20"}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-[#f4efe5]">{account.name}</span>
                            <span className="number text-xs text-[#e1cb95]">{account.baseCurrency}</span>
                          </div>
                          <p className="mt-1 text-xs text-[#8391a4]">{account.status === "active" ? (sv ? "Aktivt" : "Active") : (sv ? "Arkiverat" : "Archived")}</p>
                        </Link>
                      );
                    })}
                  </div>
                ) : <p className="mt-4 text-sm text-[#8391a4]">{sv ? "Du har inget simulatorkonto ännu." : "You do not have a simulation account yet."}</p>}
              </Card>

              {!killed && accountsResult.accounts.length < 20 ? (
                <Card>
                  <h2 className="font-semibold text-[#f4efe5]">{sv ? "Nytt konto" : "New account"}</h2>
                  <p className="mt-2 text-xs leading-5 text-[#8391a4]">
                    {sv ? `Varje konto startar med exakt ${numberLabel(PAPER_TRADING_V3_STARTING_CASH, locale, 0)} enheter i vald valuta. Startkapitalet kan inte ändras.` : `Every account starts with exactly ${numberLabel(PAPER_TRADING_V3_STARTING_CASH, locale, 0)} units of the selected currency. Starting capital cannot be changed.`}
                  </p>
                  <form action={createPaperAccountAction} className="mt-4 space-y-3">
                    <label className="block text-xs text-[#9aa7b8]">
                      {sv ? "Kontonamn" : "Account name"}
                      <input name="name" required maxLength={80} defaultValue={sv ? "Övningskonto" : "Practice account"} className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" />
                    </label>
                    <label className="block text-xs text-[#9aa7b8]">
                      {sv ? "Basvaluta" : "Base currency"}
                      <select name="baseCurrency" defaultValue={sv ? "SEK" : "USD"} className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white">
                        {PAPER_TRADING_V3_COMMON_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    </label>
                    <Button type="submit" className="w-full">{sv ? "Skapa simulatorkonto" : "Create simulation account"}</Button>
                  </form>
                </Card>
              ) : null}
            </div>

            {selectedAccount ? (
              <>
                {!verifiedState ? (
                  <Card className="mt-6 border-amber-300/20 bg-amber-950/20 text-sm text-amber-100">
                    {sv ? "Kontots ledger kunde inte verifieras. StockBox visar därför inga saldon, positioner eller affärsresultat och tillåter inga nya simulerade order från denna vy." : "The account ledger could not be verified. StockBox therefore shows no balances, positions or trade results and permits no new simulated order from this view."}
                  </Card>
                ) : (
                  <>
                    <div className="mt-6 grid gap-4 lg:grid-cols-3">
                      <Card>
                        <p className="text-xs uppercase tracking-wide text-[#8391a4]">{sv ? "Kontant saldo" : "Cash balance"}</p>
                        <div className="mt-3 space-y-2">
                          {stateResult.state.cash.length ? stateResult.state.cash.map((cash) => (
                            <div key={cash.currency} className="flex items-center justify-between gap-3">
                              <span className="text-sm text-[#9aa7b8]">{cash.currency}</span>
                              <span className="number font-semibold text-[#f4efe5]">{numberLabel(cash.amount, locale)}</span>
                            </div>
                          )) : <p className="text-sm text-[#8391a4]">0</p>}
                        </div>
                      </Card>
                      <Card>
                        <p className="text-xs uppercase tracking-wide text-[#8391a4]">{sv ? "Öppna positioner" : "Open positions"}</p>
                        <p className="number mt-3 text-3xl font-semibold text-[#f4efe5]">{positions.length}</p>
                        <p className="mt-2 text-xs text-[#8391a4]">{sv ? "Härledda från den verifierade fill-ledgern." : "Derived from the verified fill ledger."}</p>
                      </Card>
                      <Card>
                        <p className="text-xs uppercase tracking-wide text-[#8391a4]">{sv ? "Livevärde" : "Live value"}</p>
                        <p className="mt-3 font-semibold text-[#f4efe5]">{sv ? "Visas inte" : "Not shown"}</p>
                        <p className="mt-2 text-xs leading-5 text-[#8391a4]">{sv ? "StockBox gissar inte aktuellt portföljvärde eller orealiserad P/L utan verifierade färska priser för varje position." : "StockBox does not guess current portfolio value or unrealized P/L without verified fresh prices for every position."}</p>
                      </Card>
                    </div>

                    {!killed && selectedAccount.status === "active" ? (
                      <Card className="mt-6">
                        <div className="flex items-center gap-2">
                          <CircleDollarSign className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                          <h2 className="serif text-xl font-semibold">{sv ? "Simulerad market order" : "Simulated market order"}</h2>
                        </div>
                        <p className="mt-2 max-w-3xl text-xs leading-5 text-[#8391a4]">
                          {sv ? "Ordern fylls bara om StockBox kan verifiera ett färskt providerpris med riktig tidsstämpel. Ingen automatisk valutaväxling görs: prisvalutan måste ha tillräckligt saldo på kontot." : "The order fills only when StockBox can verify a fresh provider price with a real timestamp. No automatic FX conversion is performed: the quote currency must have enough cash in the account."}
                        </p>
                        <form action={executePaperOrderAction} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_160px_180px_auto] lg:items-end">
                          <input type="hidden" name="accountId" value={selectedAccount.id} />
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
                          <ShieldCheck className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                          <h2 className="serif text-xl font-semibold">{sv ? "Ledgerpositioner" : "Ledger positions"}</h2>
                        </div>
                        {positions.length ? (
                          <div className="mt-4 divide-y divide-white/10">
                            {positions.map((position) => (
                              <div key={`${position.ticker}-${position.currency}`} className="py-3 first:pt-0 last:pb-0">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="font-semibold text-[#e1cb95]">{position.ticker}</span>
                                  <span className="number text-sm">{numberLabel(position.quantity, locale)} {sv ? "st" : "shares"}</span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-[#8391a4]">
                                  <span>{sv ? "Snittkostnad" : "Average cost"}: <span className="number text-[#c9d2df]">{numberLabel(position.averageCost, locale)} {position.currency}</span></span>
                                  <span>{sv ? "Realiserad P/L" : "Realized P/L"}: <span className="number text-[#c9d2df]">{numberLabel(position.realizedProfitLoss, locale)} {position.currency}</span></span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : <p className="mt-4 text-sm text-[#8391a4]">{sv ? "Inga öppna positioner." : "No open positions."}</p>}
                      </Card>

                      <Card>
                        <div className="flex items-center gap-2">
                          <History className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                          <h2 className="serif text-xl font-semibold">{sv ? "Senaste fills" : "Recent fills"}</h2>
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
                    </div>

                    <Card className="mt-6">
                      <h2 className="serif text-xl font-semibold">{sv ? "Senaste orderutfall" : "Recent order outcomes"}</h2>
                      {recentOrders.length ? (
                        <div className="mt-4 divide-y divide-white/10">
                          {recentOrders.map((order) => (
                            <div key={order.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                              <div>
                                <p className="text-sm"><span className="font-semibold text-[#e1cb95]">{order.ticker}</span> · {order.side === "buy" ? (sv ? "Köp" : "Buy") : (sv ? "Sälj" : "Sell")} · <span className="number">{numberLabel(order.quantity, locale)}</span></p>
                                <p className="mt-1 text-xs text-[#8391a4]">{dateLabel(order.submittedAt, locale)}</p>
                              </div>
                              <div className="text-right">
                                <p className={`text-xs font-semibold uppercase tracking-wide ${order.status === "filled" ? "text-emerald-300" : "text-amber-300"}`}>{order.status === "filled" ? (sv ? "Fylld" : "Filled") : (sv ? "Avvisad" : "Rejected")}</p>
                                {order.rejectionReason ? <p className="mt-1 max-w-sm text-xs text-[#8391a4]">{rejectReasonLabel(order.rejectionReason, sv)}</p> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="mt-4 text-sm text-[#8391a4]">{sv ? "Inga orderutfall ännu." : "No order outcomes yet."}</p>}
                    </Card>
                  </>
                )}
              </>
            ) : null}

            <Card className="mt-6 border-white/10 bg-[#07111f]/60">
              <p className="text-xs leading-5 text-[#8391a4]">
                {sv ? "Paper Trading är en utbildnings- och simuleringsfunktion. Den utför aldrig riktiga värdepappersaffärer och är inte ett bevis på framtida avkastning. Konton med olika valutor jämförs inte i någon leaderboard i denna version." : "Paper Trading is an educational simulation feature. It never executes real securities trades and is not evidence of future returns. Accounts in different currencies are not compared on any leaderboard in this version."}
              </p>
            </Card>
          </>
        )}
      </Container>
    </Section>
  );
}
