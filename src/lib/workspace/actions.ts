"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { searchCompanies } from "@/lib/data/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const tickerSchema = z.string().trim().min(1).max(16).transform((value) => value.toUpperCase());
const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());

async function resolveWorkspaceCompany(ticker: string, name?: string) {
  try {
    const candidates = await searchCompanies(ticker);
    const resolution = resolveCanonicalCompanySelection({ ticker, canonicalTicker: ticker, name: name ?? ticker }, candidates);
    return resolution.ok ? resolution.company : null;
  } catch {
    return null;
  }
}

export async function addWatchlistItemAction(formData: FormData) {
  const user = await requireUser();
  const ticker = tickerSchema.safeParse(formData.get("ticker"));
  const name = z.string().trim().min(1).max(160).safeParse(formData.get("companyName"));
  if (!ticker.success || !name.success) return;
  const company = await resolveWorkspaceCompany(ticker.data, name.data);
  if (!company) redirect("/watchlist?error=identity");
  const supabase = createAdminClient();
  if (!supabase) redirect("/watchlist?error=configuration");
  const { data: outcome, error } = await supabase.rpc("upsert_watchlist_item_with_entitlement", {
    p_user_id: user.id,
    p_ticker: company.canonicalTicker ?? company.ticker,
    p_company_name: company.name,
  });
  if (error) redirect("/watchlist?error=save");
  if (!(outcome as { allowed?: boolean } | null)?.allowed) redirect("/watchlist?limit=1");
  revalidatePath("/watchlist");
}

export async function updateWatchlistMonitoringAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    id: z.string().uuid(),
    frequency: z.enum(["daily", "weekly"]),
  }).safeParse({
    id: formData.get("id"),
    frequency: formData.get("frequency") ?? "daily",
  });
  if (!parsed.success) return;
  const monitoringEnabled = formData.get("monitoringEnabled") === "on";
  const alertPreferences = {
    insider: formData.get("insiderAlerts") === "on",
    shortInterest: formData.get("shortInterestAlerts") === "on",
    filing: formData.get("filingAlerts") === "on",
  };
  const supabase = await createClient();
  await supabase?.from("watchlists").update({
    monitoring_enabled: monitoringEnabled,
    monitoring_frequency: parsed.data.frequency,
    alert_preferences: alertPreferences,
    next_check_at: monitoringEnabled ? new Date().toISOString() : null,
    last_monitor_error: null,
  }).eq("id", parsed.data.id).eq("user_id", user.id);
  revalidatePath("/watchlist");
}

export async function removeWatchlistItemAction(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase?.from("watchlists").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/watchlist");
}

export async function createPortfolioAction(formData: FormData) {
  const user = await requireUser();
  const name = z.string().trim().min(1).max(80).safeParse(formData.get("name"));
  const baseCurrency = currencySchema.safeParse(formData.get("baseCurrency") ?? "SEK");
  if (!name.success || !baseCurrency.success) return;
  const supabase = createAdminClient();
  if (!supabase) redirect("/portfolio?error=configuration");
  const { data: outcome, error } = await supabase.rpc("create_portfolio_with_entitlement", {
    p_user_id: user.id,
    p_name: name.data,
    p_base_currency: baseCurrency.data,
  });
  if (error) redirect("/portfolio?error=save");
  if (!(outcome as { allowed?: boolean } | null)?.allowed) redirect("/portfolio?limit=1");
  revalidatePath("/portfolio");
}

export async function addHoldingAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    portfolioId: z.string().uuid(),
    ticker: tickerSchema,
    quantity: z.coerce.number().positive().max(1_000_000_000),
    averageCost: z.coerce.number().nonnegative().max(1_000_000_000),
    currency: currencySchema,
  }).safeParse({
    portfolioId: formData.get("portfolioId"),
    ticker: formData.get("ticker"),
    quantity: formData.get("quantity"),
    averageCost: formData.get("averageCost"),
    currency: formData.get("currency"),
  });
  if (!parsed.success) return;
  const company = await resolveWorkspaceCompany(parsed.data.ticker);
  if (!company) redirect("/portfolio?error=holding_identity");
  const supabase = await createClient();
  const { data: portfolio } = await supabase?.from("portfolios").select("id").eq("id", parsed.data.portfolioId).eq("user_id", user.id).single() ?? { data: null };
  if (!portfolio) return;
  await supabase?.from("holdings").insert({ portfolio_id: portfolio.id, ticker: company.canonicalTicker ?? company.ticker, quantity: parsed.data.quantity, average_cost: parsed.data.averageCost, currency: parsed.data.currency });
  revalidatePath("/portfolio");
}
export async function updateHoldingAction(formData: FormData) {
  await requireUser();
  const parsed = z.object({
    id: z.string().uuid(),
    quantity: z.coerce.number().positive().max(1_000_000_000),
    averageCost: z.coerce.number().nonnegative().max(1_000_000_000),
    currency: currencySchema,
  }).safeParse({
    id: formData.get("id"),
    quantity: formData.get("quantity"),
    averageCost: formData.get("averageCost"),
    currency: formData.get("currency"),
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase?.from("holdings").update({
    quantity: parsed.data.quantity,
    average_cost: parsed.data.averageCost,
    currency: parsed.data.currency,
  }).eq("id", parsed.data.id);
  revalidatePath("/portfolio");
}

export async function removeHoldingAction(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase?.from("holdings").delete().eq("id", id.data);
  revalidatePath("/portfolio");
}
export async function deletePortfolioAction(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase?.from("portfolios")
    .delete()
    .eq("id", id.data)
    .eq("user_id", user.id);
  revalidatePath("/portfolio");
}
