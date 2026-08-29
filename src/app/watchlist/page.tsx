import type { Metadata } from "next";
import { Bell, Plus, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { addWatchlistItemAction, removeWatchlistItemAction } from "@/lib/workspace/actions";

export const metadata: Metadata = { title: "Watchlist" };
type PageProps = { searchParams: Promise<{ limit?: string; error?: string }> };

export default async function WatchlistPage({ searchParams }: PageProps) {
  const [params, user, locale] = await Promise.all([searchParams, getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).watchlist;
  const supabase = user ? await createClient() : null;
  const { data: items } = supabase
    ? await supabase.from("watchlists").select("id,ticker,company_name,created_at").order("created_at", { ascending: false })
    : { data: [] };
  const feedback = params.limit ? copy.limit : params.error ? copy.error : null;

  return (
    <Section><Container>
      <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
      <h1 className="serif mt-2 text-3xl font-semibold">{copy.title}</h1>
      {feedback ? <p className="mt-5 text-sm text-[#e1cb95]" role="status">{feedback}</p> : null}
      {!user ? (
        <Card className="mt-8">
          <p className="text-sm text-[#c9d2df]">{copy.loginCopy}</p>
          <ButtonLink href="/auth/login" className="mt-4">{copy.login}</ButtonLink>
        </Card>
      ) : <>
        <Card className="mt-8">
          <form action={addWatchlistItemAction} className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
            <label className="sr-only" htmlFor="watch-ticker">{copy.ticker}</label>
            <input id="watch-ticker" name="ticker" placeholder={copy.ticker} required maxLength={16} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" />
            <label className="sr-only" htmlFor="watch-name">{copy.company}</label>
            <input id="watch-name" name="companyName" placeholder={copy.company} required maxLength={160} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" />
            <Button><Plus className="h-4 w-4" aria-hidden="true" />{copy.add}</Button>
          </form>
        </Card>
        <div className="mt-6 overflow-hidden rounded-lg border border-white/10">
          {items?.length ? items.map((item) => (
            <div key={item.id} className="grid grid-cols-[80px_1fr_auto] items-center gap-3 border-b border-white/10 bg-[#0d1c2e]/70 px-4 py-3 last:border-0">
              <span className="font-semibold text-[#e1cb95]">{item.ticker}</span>
              <span className="text-sm text-[#d6deea]">{item.company_name}</span>
              <form action={removeWatchlistItemAction}>
                <input type="hidden" name="id" value={item.id} />
                <Button variant="ghost" className="w-10 px-0" title={copy.remove}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{copy.remove}</span>
                </Button>
              </form>
            </div>
          )) : (
            <div className="flex items-center gap-3 bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]">
              <Bell className="h-5 w-5" aria-hidden="true" />{copy.empty}
            </div>
          )}
        </div>
      </>}
    </Container></Section>
  );
}
