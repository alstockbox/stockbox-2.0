"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { captureServerEvent } from "@/lib/analytics/events";
import { requireUser } from "@/lib/auth/session";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { searchCompanies } from "@/lib/data/provider";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const tickerSchema = z.string().trim().min(1).max(16).transform((value) => value.toUpperCase());
const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());
const transactionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && time <= Date.now() + 86_400_000;
});

async function resolveWorkspaceCompany(ticker: string, name?: string) {
  try {
    const candidates = await searchCompanies(ticker);
    const resolution = resolveCanonicalCompanySelection({ ticker, canonicalTicker: ticker, name: name ?? ticker }, candidates);
    return resolution.ok ? resolution.company : null;
  } catch {
    return null;
  }
}

async function userOwnsPortfolio(userId: string, portfolioId: string) {
  const supabase = await createClient();
  const { data } = await supabase?.from("portfolios").select("id").eq("id", portfolioId).eq("user_id", userId).maybeSingle() ?? { data: null };
  return Boolean(data);
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

  const v3Enabled = isFeatureEnabled("watchlistV3") && isFeatureEnabled("alerts");
  const optionalPrice = z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? null : value,
    z.coerce.number().finite().nonnegative().max(1_000_000_000).nullable(),
  );
  const v3 = z.object({
    convictionDropMinimum: z.coerce.number().int().min(1).max(100),
    dataQualityDropMinimum: z.coerce.number().int().min(1).max(100),
    priceAbove: optionalPrice,
    priceBelow: optionalPrice,
  }).safeParse({
    convictionDropMinimum: formData.get("convictionDropMinimum") ?? 20,
    dataQualityDropMinimum: formData.get("dataQualityDropMinimum") ?? 15,
    priceAbove: formData.get("priceAbove") ?? null,
    priceBelow: formData.get("priceBelow") ?? null,
  });
  if (v3Enabled && !v3.success) redirect("/watchlist?error=monitoring_input");

  const supabase = await createClient();
  if (!supabase) redirect("/watchlist?error=configuration");
  const { data: existing } = await supabase
    .from("watchlists")
    .select("alert_preferences")
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const currentPreferences = existing?.alert_preferences && typeof existing.alert_preferences === "object" && !Array.isArray(existing.alert_preferences)
    ? existing.alert_preferences as Record<string, unknown>
    : {};
  const alertPreferences: Record<string, unknown> = {
    ...currentPreferences,
    insider: formData.get("insiderAlerts") === "on",
    shortInterest: formData.get("shortInterestAlerts") === "on",
    filing: formData.get("filingAlerts") === "on",
  };
  if (v3Enabled && v3.success) {
    Object.assign(alertPreferences, {
      recommendationChanges: formData.get("recommendationAlerts") === "on",
      convictionDropMinimum: v3.data.convictionDropMinimum,
      dataQualityDropMinimum: v3.data.dataQualityDropMinimum,
      priceAbove: v3.data.priceAbove,
      priceBelow: v3.data.priceBelow,
    });
  }

  await supabase.from("watchlists").update({
    monitoring_enabled: formData.get("monitoringEnabled") === "on",
    monitoring_frequency: parsed.data.frequency,
    alert_preferences: alertPreferences,
    next_check_at: formData.get("monitoringEnabled") === "on" ? new Date().toISOString() : null,
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
  captureServerEvent("portfolio_created", { userId: user.id });
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
    purchaseDate: transactionDateSchema,
    fees: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  }).safeParse({
    portfolioId: formData.get("portfolioId"),
    ticker: formData.get("ticker"),
    quantity: formData.get("quantity"),
    averageCost: formData.get("averageCost"),
    currency: formData.get("currency"),
    purchaseDate: formData.get("purchaseDate"),
    fees: formData.get("fees") || 0,
  });
  if (!parsed.success) redirect("/portfolio?error=transaction_input");
  if (!await userOwnsPortfolio(user.id, parsed.data.portfolioId)) return;
  const company = await resolveWorkspaceCompany(parsed.data.ticker);
  if (!company) redirect("/portfolio?error=holding_identity");
  const supabase = await createClient();
  const { error } = await supabase?.rpc("record_portfolio_transaction", {
    p_portfolio_id: parsed.data.portfolioId,
    p_ticker: company.canonicalTicker ?? company.ticker,
    p_transaction_type: "buy",
    p_quantity: parsed.data.quantity,
    p_price: parsed.data.averageCost,
    p_currency: parsed.data.currency,
    p_executed_at: parsed.data.purchaseDate,
    p_fees: parsed.data.fees,
    p_cash_amount: null,
    p_security_id: company.securityId ?? null,
    p_notes: null,
  }) ?? { error: new Error("Supabase unavailable") };
  if (error) redirect("/portfolio?error=transaction_save");
  revalidatePath("/portfolio");
}

export async function sellHoldingAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    portfolioId: z.string().uuid(),
    ticker: tickerSchema,
    quantity: z.coerce.number().positive().max(1_000_000_000),
    salePrice: z.coerce.number().nonnegative().max(1_000_000_000),
    currency: currencySchema,
    saleDate: transactionDateSchema,
    fees: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  }).safeParse({
    portfolioId: formData.get("portfolioId"),
    ticker: formData.get("ticker"),
    quantity: formData.get("quantity"),
    salePrice: formData.get("salePrice"),
    currency: formData.get("currency"),
    saleDate: formData.get("saleDate"),
    fees: formData.get("fees") || 0,
  });
  if (!parsed.success) redirect("/portfolio?error=transaction_input");
  if (!await userOwnsPortfolio(user.id, parsed.data.portfolioId)) return;

  const supabase = await createClient();
  if (!supabase) redirect("/portfolio?error=configuration");
  const { data: holding } = await supabase
    .from("holdings")
    .select("ticker,currency,quantity")
    .eq("portfolio_id", parsed.data.portfolioId)
    .eq("ticker", parsed.data.ticker)
    .eq("currency", parsed.data.currency)
    .maybeSingle();
  const availableQuantity = typeof holding?.quantity === "number"
    ? holding.quantity
    : typeof holding?.quantity === "string"
      ? Number(holding.quantity)
      : Number.NaN;
  if (!holding || !Number.isFinite(availableQuantity) || parsed.data.quantity > availableQuantity) {
    redirect("/portfolio?error=transaction_sell_quantity");
  }

  const { error } = await supabase.rpc("record_portfolio_transaction", {
    p_portfolio_id: parsed.data.portfolioId,
    p_ticker: holding.ticker,
    p_transaction_type: "sell",
    p_quantity: parsed.data.quantity,
    p_price: parsed.data.salePrice,
    p_currency: holding.currency,
    p_executed_at: parsed.data.saleDate,
    p_fees: parsed.data.fees,
    p_cash_amount: null,
    p_security_id: null,
    p_notes: null,
  });
  if (error) redirect("/portfolio?error=transaction_save");
  revalidatePath("/portfolio");
}

export async function updatePortfolioTransactionAction(formData: FormData) {
  await requireUser();
  const parsed = z.object({
    id: z.string().uuid(),
    quantity: z.coerce.number().positive().max(1_000_000_000),
    price: z.coerce.number().nonnegative().max(1_000_000_000),
    currency: currencySchema,
    purchaseDate: transactionDateSchema,
    fees: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  }).safeParse({
    id: formData.get("id"),
    quantity: formData.get("quantity"),
    price: formData.get("price"),
    currency: formData.get("currency"),
    purchaseDate: formData.get("purchaseDate"),
    fees: formData.get("fees") || 0,
  });
  if (!parsed.success) redirect("/portfolio?error=transaction_input");
  const supabase = await createClient();
  const { data, error } = await supabase?.rpc("update_portfolio_transaction", {
    p_transaction_id: parsed.data.id,
    p_quantity: parsed.data.quantity,
    p_price: parsed.data.price,
    p_currency: parsed.data.currency,
    p_executed_at: parsed.data.purchaseDate,
    p_fees: parsed.data.fees,
  }) ?? { data: false, error: new Error("Supabase unavailable") };
  if (error || data !== true) redirect("/portfolio?error=transaction_save");
  revalidatePath("/portfolio");
}

export async function removePortfolioTransactionAction(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase?.rpc("delete_portfolio_transaction", { p_transaction_id: id.data }) ?? { data: false, error: new Error("Supabase unavailable") };
  if (error || data !== true) redirect("/portfolio?error=transaction_delete");
  revalidatePath("/portfolio");
}

export async function deletePortfolioAction(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase?.from("portfolios").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/portfolio");
}
