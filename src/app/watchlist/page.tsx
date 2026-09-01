import type { Metadata } from "next";
import { Bell, BellRing, Plus, Radar, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { addWatchlistItemAction, removeWatchlistItemAction, updateWatchlistMonitoringAction } from "@/lib/workspace/actions";

export const metadata: Metadata = { title: "Watchlist" };
type PageProps = { searchParams: Promise<{ limit?: string; error?: string }> };

type WatchItem = {
  id: string;
  ticker: string;
  company_name: string;
  created_at: string;
  monitoring_enabled?: boolean;
  monitoring_frequency?: "daily" | "weekly";
  alert_preferences?: { insider?: boolean; shortInterest?: boolean; filing?: boolean } | null;
  last_checked_at?: string | null;
  next_check_at?: string | null;
  last_monitor_error?: string | null;
};

type MonitoringEvent = {
  id: string;
  ticker: string;
  signal_kind: string;
  severity: string;
  title: string;
  body: string;
  data_as_of: string | null;
  created_at: string;
};

function dateLabel(value: string | null | undefined, locale: string) {
  if (!value) return locale === "sv" ? "Inte ännu" : "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function WatchlistPage({ searchParams }: PageProps) {
  const [params, user, locale] = await Promise.all([searchParams, getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).watchlist;
  const sv = locale === "sv";
  const supabase = user ? await createClient() : null;
  const [{ data: items }, { data: events }] = supabase
    ? await Promise.all([
      supabase.from("watchlists").select("id,ticker,company_name,created_at,monitoring_enabled,monitoring_frequency,alert_preferences,last_checked_at,next_check_at,last_monitor_error").order("created_at", { ascending: false }),
      supabase.from("monitoring_events").select("id,ticker,signal_kind,severity,title,body,data_as_of,created_at").order("created_at", { ascending: false }).limit(10),
    ])
    : [{ data: [] }, { data: [] }];
  const feedback = params.limit ? copy.limit : params.error ? copy.error : null;

  return (
    <Section><Container>
      <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
      <h1 className="serif mt-2 text-3xl font-semibold">{copy.title}</h1>
      <p className="mt-3 max-w-3xl text-sm text-[#9aa7b8]">
        {sv
          ? "StockBox bevakar officiella förändringar i bolagen du följer. Första körningen skapar en baseline; därefter får du bara signaler när data faktiskt förändras."
          : "StockBox monitors official changes in the companies you follow. The first run creates a baseline; after that you only receive signals when the underlying data changes."}
      </p>
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

        <div className="mt-6 grid gap-4">
          {(items as WatchItem[] | null)?.length ? (items as WatchItem[]).map((item) => {
            const preferences = item.alert_preferences ?? {};
            return (
              <Card key={item.id} className="p-0 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#e1cb95]">{item.ticker}</span>
                      <span className="text-sm text-[#d6deea]">{item.company_name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[#8391a4]">
                      {item.monitoring_enabled !== false ? <Radar className="h-3.5 w-3.5" aria-hidden="true" /> : <Bell className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span>{item.monitoring_enabled !== false ? (sv ? "Bevakning aktiv" : "Monitoring active") : (sv ? "Bevakning pausad" : "Monitoring paused")}</span>
                      <span>·</span>
                      <span>{sv ? "Senast kontrollerad" : "Last checked"}: {dateLabel(item.last_checked_at, locale)}</span>
                    </div>
                    {item.last_monitor_error ? <p className="mt-2 text-xs text-amber-300">{sv ? "Senaste kontrollen hade ett tillfälligt fel." : "The latest check had a temporary error."}</p> : null}
                  </div>
                  <form action={removeWatchlistItemAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <Button variant="ghost" className="w-10 px-0" title={copy.remove}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">{copy.remove}</span>
                    </Button>
                  </form>
                </div>
                <form action={updateWatchlistMonitoringAction} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                  <input type="hidden" name="id" value={item.id} />
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-[#d6deea]">
                      <input type="checkbox" name="monitoringEnabled" defaultChecked={item.monitoring_enabled !== false} />
                      {sv ? "Automatisk bevakning" : "Automatic monitoring"}
                    </label>
                    <label className="block text-xs text-[#8391a4]">
                      {sv ? "Frekvens" : "Frequency"}
                      <select name="frequency" defaultValue={item.monitoring_frequency ?? "daily"} className="mt-1 block h-9 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white">
                        <option value="daily">{sv ? "Dagligen" : "Daily"}</option>
                        <option value="weekly">{sv ? "Veckovis" : "Weekly"}</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-2 text-sm text-[#d6deea] sm:grid-cols-3 lg:grid-cols-1">
                    <label className="flex items-center gap-2"><input type="checkbox" name="insiderAlerts" defaultChecked={preferences.insider !== false} />{sv ? "Insider" : "Insider"}</label>
                    <label className="flex items-center gap-2"><input type="checkbox" name="shortInterestAlerts" defaultChecked={preferences.shortInterest !== false} />{sv ? "Blankning" : "Short interest"}</label>
                    <label className="flex items-center gap-2"><input type="checkbox" name="filingAlerts" defaultChecked={preferences.filing !== false} />{sv ? "Årsredovisningar" : "Filings"}</label>
                  </div>
                  <Button type="submit">{sv ? "Spara bevakning" : "Save monitoring"}</Button>
                </form>
              </Card>
            );
          }) : (
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]">
              <Bell className="h-5 w-5" aria-hidden="true" />{copy.empty}
            </div>
          )}
        </div>

        <Card className="mt-8">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <h2 className="serif text-xl font-semibold">{sv ? "Senaste bevakningssignaler" : "Latest monitoring signals"}</h2>
          </div>
          {(events as MonitoringEvent[] | null)?.length ? (
            <div className="mt-4 divide-y divide-white/10">
              {(events as MonitoringEvent[]).map((event) => (
                <div key={event.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#8391a4]">
                    <span className="font-semibold text-[#e1cb95]">{event.ticker}</span>
                    <span>{event.signal_kind.replace("_", " ")}</span>
                    <span>·</span>
                    <span>{dateLabel(event.data_as_of ?? event.created_at, locale)}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-white">{event.title}</p>
                  <p className="mt-1 text-sm text-[#aeb9c8]">{event.body}</p>
                </div>
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-[#8391a4]">{sv ? "Inga förändringssignaler ännu. Baselines skapas automatiskt vid första kontrollen." : "No change signals yet. Baselines are created automatically on the first check."}</p>}
        </Card>
      </>}
    </Container></Section>
  );
}
