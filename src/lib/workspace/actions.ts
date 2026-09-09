"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { CompanySearchResult } from "@/lib/analysis/types";
import { captureServerEvent } from "@/lib/analytics/events";
import { requireUser } from "@/lib/auth/session";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { searchCompanies } from "@/lib/data/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const tickerSchema = z.string().trim().min(1).max(16).transform((value) => value.toUpperCase());
const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());
const optionalIdentitySchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
  z.string().max(256).optional(),
);
const transactionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && time <= Date.now() + 86_400_000;
});

async function resolveWorkspaceCompany(
  ticker: string,
  name?: string,
  identity: Partial<CompanySearchResult> = {},
) {
  try {
    const candidates = await searchCompanies(ticker);
    const resolution = resolveCanonicalCompanySelection({
      ticker,
      canonicalTicker: ticker,
      name: name ?? ticker,
      ...identity,
    }, candidates);
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

async function ownedHolding(userId: string, holdingId: string) {
  const supabase = await createClient();
  const { data: holding } = await supabase?.from("holdings").select("id,portfolio_id").eq("id", holdingId).maybeSingle() ?? { data: null };
  if (!holding) return null;
  return await userOwnsPortfolio(userId, holding.portfolio_id) ? holding : null;
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
  const parsed = z.object({ id: z.string().uuid(), frequency: z.enum(["daily", "weekly"]) }).safeParse({
    id: formData.get("id"),
    frequency: formData.get("frequency") ?? "daily",
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase?.from("watchlists").update({
    monitoring_enabled: formData.get("monitoringEnabled") === "on",
    monitoring_frequency: parsed.data.frequency,
    alert_preferences: {
      insider: formData.get("insiderAlerts") === "on",
      shortInterest: formData.get("shortInterestAlerts") === "on",
      filing: formData.get("filingAlerts") === "on",
    },
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
    companyName: z.string().trim().min(1).max(160),
    securityId: optionalIdentitySchema,
    issuerId: optionalIdentitySchema,
    entityId: optionalIdentitySchema,
    isin: optionalIdentitySchema,
    figi: optionalIdentitySchema,
    lei: optionalIdentitySchema,
    cik: optionalIdentitySchema,
    quantity: z.coerce.number().positive().max(1_000_000_000),
    averageCost: z.coerce.number().nonnegative().max(1_000_000_000),
    currency: currencySchema,
    purchaseDate: transactionDateSchema,
    fees: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  }).safeParse({
    portfolioId: formData.get("portfolioId"),
    ticker: formData.get("ticker"),
    companyName: formData.get("companyName"),
    securityId: formData.get("securityId"),
    issuerId: formData.get("issuerId"),
    entityId: formData.get("entityId"),
    isin: formData.get("isin"),
    figi: formData.get("figi"),
    lei: formData.get("lei"),
    cik: formData.get("cik"),
    quantity: formData.get("quantity"),
    averageCost: formData.get("averageCost"),
    currency: formData.get("currency"),
    purchaseDate: formData.get("purchaseDate"),
    fees: formData.get("fees") || 0,
  });
  if (!parsed.success) {
    redirect("/portfolio?error=transaction_input");
    return;
  }
  if (!await userOwnsPortfolio(user.id, parsed.data.portfolioId)) return;
  const company = await resolveWorkspaceCompany(parsed.data.ticker, parsed.data.companyName, {
    securityId: parsed.data.securityId,
    issuerId: parsed.data.issuerId,
    entityId: parsed.data.entityId,
    isin: parsed.data.isin,
    figi: parsed.data.figi,
    lei: parsed.data.lei,
    cik: parsed.data.cik,
  });
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

export async function recordPortfolioSaleAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    portfolioId: z.string().uuid(),
    ticker: tickerSchema,
    quantity: z.coerce.number().positive().max(1_000_000_000),
    price: z.coerce.number().nonnegative().max(1_000_000_000),
    currency: currencySchema,
    saleDate: transactionDateSchema,
    fees: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  }).safeParse({
    portfolioId: formData.get("portfolioId"),
    ticker: formData.get("ticker"),
    quantity: formData.get("quantity"),
    price: formData.get("price"),
    currency: formData.get("currency"),
    saleDate: formData.get("saleDate"),
    fees: formData.get("fees") || 0,
  });

  if (!parsed.success) {
    redirect("/portfolio?error=transaction_input");
    return;
  }
  if (!await userOwnsPortfolio(user.id, parsed.data.portfolioId)) return;

  const supabase = await createClient();
  if (!supabase) {
    redirect("/portfolio?error=configuration");
    return;
  }

  const { data: holding } = await supabase
    .from("holdings")
    .select("id,quantity")
    .eq("portfolio_id", parsed.data.portfolioId)
    .eq("ticker", parsed.data.ticker)
    .eq("currency", parsed.data.currency)
    .maybeSingle();
  const ownedQuantity = holding ? Number(holding.quantity) : Number.NaN;
  if (!holding || !Number.isFinite(ownedQuantity) || parsed.data.quantity > ownedQuantity) {
    redirect("/portfolio?error=sell_quantity");
    return;
  }

  const { error } = await supabase.rpc("record_portfolio_transaction", {
    p_portfolio_id: parsed.data.portfolioId,
    p_ticker: parsed.data.ticker,
    p_transaction_type: "sell",
    p_quantity: parsed.data.quantity,
    p_price: parsed.data.price,
    p_currency: parsed.data.currency,
    p_executed_at: parsed.data.saleDate,
    p_fees: parsed.data.fees,
    p_cash_amount: null,
    p_security_id: null,
    p_notes: null,
  });
  if (error) {
    const message = typeof error === "object" && error && "message" in error ? String(error.message) : "";
    if (message.includes("Sell quantity exceeds owned quantity")) {
      redirect("/portfolio?error=sell_quantity");
      return;
    }
    redirect("/portfolio?error=transaction_save");
    return;
  }
  revalidatePath("/portfolio");
}

async function recordPortfolioCashFlowAction(formData: FormData, transactionType: "dividend" | "fee") {
  const user = await requireUser();
  const parsed = z.object({
    portfolioId: z.string().uuid(),
    ticker: tickerSchema,
    amount: z.coerce.number().positive().max(1_000_000_000),
    currency: currencySchema,
    transactionDate: transactionDateSchema,
  }).safeParse({
    portfolioId: formData.get("portfolioId"),
    ticker: formData.get("ticker"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    transactionDate: formData.get("transactionDate"),
  });
  if (!parsed.success) {
    redirect("/portfolio?error=transaction_input");
    return;
  }
  if (!await userOwnsPortfolio(user.id, parsed.data.portfolioId)) return;

  const supabase = await createClient();
  if (!supabase) {
    redirect("/portfolio?error=configuration");
    return;
  }
  const { data: priorTransaction } = await supabase
    .from("portfolio_transactions")
    .select("id")
    .eq("portfolio_id", parsed.data.portfolioId)
    .eq("ticker", parsed.data.ticker)
    .eq("currency", parsed.data.currency)
    .limit(1)
    .maybeSingle();
  if (!priorTransaction) {
    redirect("/portfolio?error=holding_identity");
    return;
  }

  const { error } = await supabase.rpc("record_portfolio_transaction", {
    p_portfolio_id: parsed.data.portfolioId,
    p_ticker: parsed.data.ticker,
    p_transaction_type: transactionType,
    p_quantity: null,
    p_price: null,
    p_currency: parsed.data.currency,
    p_executed_at: parsed.data.transactionDate,
    p_fees: 0,
    p_cash_amount: parsed.data.amount,
    p_security_id: null,
    p_notes: null,
  });
  if (error) {
    redirect("/portfolio?error=transaction_save");
    return;
  }
  revalidatePath("/portfolio");
}

export async function recordPortfolioDividendAction(formData: FormData) {
  return recordPortfolioCashFlowAction(formData, "dividend");
}

export async function recordPortfolioFeeAction(formData: FormData) {
  return recordPortfolioCashFlowAction(formData, "fee");
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

export async function updateHoldingAction(formData: FormData) {
  const user = await requireUser();
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
  if (!parsed.success || !await ownedHolding(user.id, parsed.data.id)) return;
  const supabase = await createClient();
  await supabase?.from("holdings").update({ quantity: parsed.data.quantity, average_cost: parsed.data.averageCost, currency: parsed.data.currency }).eq("id", parsed.data.id);
  revalidatePath("/portfolio");
}

export async function removeHoldingAction(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success || !await ownedHolding(user.id, id.data)) return;
  const supabase = await createClient();
  await supabase?.from("holdings").delete().eq("id", id.data);
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
