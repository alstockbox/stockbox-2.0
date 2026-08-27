import type { Metadata } from "next";
import { BriefcaseBusiness, Plus, Save, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";
import {
  addHoldingAction,
  createPortfolioAction,
  deletePortfolioAction,
  removeHoldingAction,
  updateHoldingAction,
} from "@/lib/workspace/actions";

export const metadata: Metadata = { title: "Portfolio" };

type PageProps = {
  searchParams: Promise<{ limit?: string; error?: string }>;
};

export default async function PortfolioPage({ searchParams }: PageProps) {
  const [params, user, locale] = await Promise.all([searchParams, getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).portfolio;
  const supabase = user ? await createClient() : null;
  const { data: portfolios } = supabase
    ? await supabase.from("portfolios").select("id,name,base_currency,created_at").order("created_at")
    : { data: [] };
  const ids = portfolios?.map((item) => item.id) ?? [];
  const { data: holdings } = supabase && ids.length
    ? await supabase.from("holdings")
      .select("id,portfolio_id,ticker,quantity,average_cost,currency")
      .in("portfolio_id", ids)
    : { data: [] };

  const feedback = params.limit
    ? copy.limit
    : params.error
      ? copy.error
      : null;

  return (
    <Section>
      <Container>
        <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
        <h1 className="serif mt-2 text-3xl font-semibold">{copy.title}</h1>
        {!user ? (
          <Card className="mt-8">
            <p className="text-sm text-[#c9d2df]">{copy.loginCopy}</p>
            <ButtonLink href="/auth/login" className="mt-4">{copy.login}</ButtonLink>
          </Card>
        ) : (
          <>
            {feedback ? <p className="mt-5 text-sm text-[#e1cb95]" role="status">{feedback}</p> : null}
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <Card>
                <h2 className="font-semibold">{copy.createPortfolio}</h2>
                <form action={createPortfolioAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_92px_auto]">
                  <label className="sr-only" htmlFor="portfolio-name">{copy.portfolioName}</label>
                  <input id="portfolio-name" name="name" required maxLength={80} placeholder={copy.namePlaceholder} className="h-10 min-w-0 rounded-md border border-white/12 bg-[#07111f] px-3" />
                  <label className="sr-only" htmlFor="portfolio-currency">{copy.baseCurrency}</label>
                  <input id="portfolio-currency" name="baseCurrency" required defaultValue="SEK" maxLength={3} pattern="[A-Za-z]{3}" aria-label={copy.baseCurrency} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
                  <Button><Plus className="h-4 w-4" aria-hidden="true" />{copy.create}</Button>
                </form>
              </Card>
              <Card>
                <h2 className="font-semibold">{copy.addHolding}</h2>
                {portfolios?.length ? (
                  <form action={addHoldingAction} className="mt-4 grid gap-2 sm:grid-cols-2">
                    <select name="portfolioId" required aria-label={copy.portfolio} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3">
                      {portfolios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <input name="ticker" required maxLength={16} placeholder={copy.ticker} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
                    <input name="quantity" required type="number" min="0.000001" step="any" placeholder={copy.quantity} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" />
                    <input name="averageCost" required type="number" min="0" step="any" placeholder={copy.averageCost} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" />
                    <input name="currency" required defaultValue="SEK" maxLength={3} pattern="[A-Za-z]{3}" aria-label={copy.currency} placeholder={copy.currency} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
                    <Button className="sm:col-span-2"><Plus className="h-4 w-4" aria-hidden="true" />{copy.addHoldingButton}</Button>
                  </form>
                ) : (
                  <p className="mt-3 text-sm text-[#9aa7b8]">{copy.createFirst}</p>
                )}
              </Card>
            </div>
            <div className="mt-6 grid gap-5">
              {portfolios?.length ? portfolios.map((portfolio) => {
                const portfolioHoldings = holdings?.filter((holding) => holding.portfolio_id === portfolio.id) ?? [];
                return (
                  <Card key={portfolio.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-semibold">{portfolio.name}</h2>
                        <p className="mt-1 text-xs text-[#9aa7b8]">{copy.baseCurrency}: {portfolio.base_currency}</p>
                      </div>
                      <form action={deletePortfolioAction}>
                        <input type="hidden" name="id" value={portfolio.id} />
                        <Button variant="ghost" title={copy.deletePortfolio}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />{copy.deletePortfolio}
                        </Button>
                      </form>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {portfolioHoldings.length ? portfolioHoldings.map((holding) => (
                        <div key={holding.id} className="rounded-md border border-white/10 bg-[#0d1c2e]/70 p-3">
                          <div className="flex flex-wrap items-start gap-2">
                            <form action={updateHoldingAction} className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[100px_1fr_1fr_90px_auto]">
                              <input type="hidden" name="id" value={holding.id} />
                              <span className="flex h-10 items-center font-semibold text-[#e1cb95]">{holding.ticker}</span>
                              <input name="quantity" required type="number" min="0.000001" step="any" defaultValue={String(holding.quantity)} aria-label={`${holding.ticker} ${copy.quantity}`} className="h-10 min-w-0 rounded-md border border-white/12 bg-[#07111f] px-3" />
                              <input name="averageCost" required type="number" min="0" step="any" defaultValue={String(holding.average_cost)} aria-label={`${holding.ticker} ${copy.averageCost}`} className="h-10 min-w-0 rounded-md border border-white/12 bg-[#07111f] px-3" />
                              <input name="currency" required maxLength={3} pattern="[A-Za-z]{3}" defaultValue={holding.currency} aria-label={`${holding.ticker} ${copy.currency}`} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
                              <Button title={copy.save}><Save className="h-4 w-4" aria-hidden="true" />{copy.save}</Button>
                            </form>
                            <form action={removeHoldingAction}>
                              <input type="hidden" name="id" value={holding.id} />
                              <Button variant="ghost" className="h-10" title={`${copy.remove} ${holding.ticker}`}>
                                <Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{copy.remove} {holding.ticker}</span>
                              </Button>
                            </form>
                          </div>
                        </div>
                      )) : (
                        <p className="text-sm text-[#9aa7b8]">{copy.noHoldings}</p>
                      )}
                    </div>
                  </Card>
                );
              }) : (
                <Card className="text-center">
                  <BriefcaseBusiness className="mx-auto h-8 w-8 text-[#e1cb95]" aria-hidden="true" />
                  <h2 className="mt-3 font-semibold">{copy.noPortfolios}</h2>
                  <p className="mt-2 text-sm text-[#9aa7b8]">
                    {copy.emptyCopy}
                  </p>
                </Card>
              )}
            </div>
          </>
        )}
      </Container>
    </Section>
  );
}
