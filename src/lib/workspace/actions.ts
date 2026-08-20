"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const tickerSchema = z.string().trim().min(1).max(16).transform((value) => value.toUpperCase());

export async function addWatchlistItemAction(formData: FormData) {
  const user = await requireUser();
  const ticker = tickerSchema.safeParse(formData.get("ticker"));
  const name = z.string().trim().min(1).max(160).safeParse(formData.get("companyName"));
  if (!ticker.success || !name.success) return;
  const supabase = await createClient();
  await supabase?.from("watchlists").upsert({ user_id: user.id, ticker: ticker.data, company_name: name.data }, { onConflict: "user_id,ticker" });
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
  if (!name.success) return;
  const supabase = await createClient();
  await supabase?.from("portfolios").insert({ user_id: user.id, name: name.data, base_currency: "SEK" });
  revalidatePath("/portfolio");
}

export async function addHoldingAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    portfolioId: z.string().uuid(),
    ticker: tickerSchema,
    quantity: z.coerce.number().positive().max(1_000_000_000),
    averageCost: z.coerce.number().nonnegative().max(1_000_000_000),
  }).safeParse({
    portfolioId: formData.get("portfolioId"),
    ticker: formData.get("ticker"),
    quantity: formData.get("quantity"),
    averageCost: formData.get("averageCost"),
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  const { data: portfolio } = await supabase?.from("portfolios").select("id").eq("id", parsed.data.portfolioId).eq("user_id", user.id).single() ?? { data: null };
  if (!portfolio) return;
  await supabase?.from("holdings").insert({ portfolio_id: portfolio.id, ticker: parsed.data.ticker, quantity: parsed.data.quantity, average_cost: parsed.data.averageCost, currency: "SEK" });
  revalidatePath("/portfolio");
}
