import { createAdminClient } from "@/lib/supabase/admin";
import type { PaperAccountRowV3 } from "./repository-v3";

export const PAPER_TRADING_V3_STARTING_CASH = 100_000;

export const PAPER_TRADING_V3_COMMON_CURRENCIES = [
  "SEK",
  "USD",
  "EUR",
  "GBP",
  "NOK",
  "DKK",
  "CHF",
  "CAD",
  "AUD",
  "JPY",
  "HKD",
  "SGD",
] as const;

type JsonRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapAccount(row: JsonRow): PaperAccountRowV3 | null {
  const id = text(row.id);
  const userId = text(row.user_id);
  const name = text(row.name);
  const baseCurrency = text(row.base_currency)?.toUpperCase() ?? null;
  const status = row.status === "active" || row.status === "archived" ? row.status : null;
  const createdAt = text(row.created_at);
  const updatedAt = text(row.updated_at);
  if (!id || !userId || !name || !baseCurrency || !/^[A-Z]{3}$/.test(baseCurrency) || !status || !createdAt || !updatedAt) return null;
  return { id, userId, name, baseCurrency, status, createdAt, updatedAt };
}

export type PaperAccountListResultV3 =
  | { ok: true; accounts: PaperAccountRowV3[] }
  | { ok: false; error: string; accounts: [] };

export async function listPaperAccountsV3(userId: string): Promise<PaperAccountListResultV3> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return { ok: false, error: "PAPER_USER_ID_REQUIRED", accounts: [] };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED", accounts: [] };

  try {
    const { data, error } = await supabase
      .from("paper_accounts_v3")
      .select("id,user_id,name,base_currency,status,created_at,updated_at")
      .eq("user_id", normalizedUserId)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) return { ok: false, error: error.message, accounts: [] };

    const mapped = (data ?? []).map((row) => mapAccount(row as JsonRow));
    if (mapped.some((row) => row === null)) return { ok: false, error: "PAPER_ACCOUNT_LIST_INVALID", accounts: [] };
    return { ok: true, accounts: mapped.filter((row): row is PaperAccountRowV3 => row !== null) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PAPER_ACCOUNT_LIST_FAILED", accounts: [] };
  }
}
