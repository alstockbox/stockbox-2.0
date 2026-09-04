import { evaluateBudget, type BudgetDecision } from "./budget-governor";

export type GrowthBudgetLedgerRow = {
  idempotency_key: string;
  estimated_sek: number | string | null;
  actual_sek: number | string | null;
  created_at: string;
};

export type GrowthBudgetEntry = {
  idempotencyKey: string;
  provider: string;
  operation: string;
  estimatedSek: number;
  actualSek?: number | null;
  originalCurrency?: string | null;
  originalAmount?: number | null;
  contentId?: string | null;
  renderJobId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type GrowthBudgetRequest = {
  projectedCostSek: number | null;
  optional?: boolean;
};

export type GrowthBudgetInsertResult = "inserted" | "duplicate";

export interface GrowthBudgetDb {
  listSpendSince(sinceIso: string): Promise<GrowthBudgetLedgerRow[]>;
  insertSpend(entry: GrowthBudgetEntry): Promise<GrowthBudgetInsertResult>;
}

function asNonNegativeFinite(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function monthStartUtc(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error("now must be a valid date");
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getCurrentGrowthSpend(
  client: GrowthBudgetDb,
  now = new Date(),
): Promise<number> {
  const rows = await client.listSpendSince(monthStartUtc(now));
  return rows.reduce((total, row) => {
    const actual = asNonNegativeFinite(row.actual_sek);
    const estimated = asNonNegativeFinite(row.estimated_sek);
    return total + (actual ?? estimated ?? 0);
  }, 0);
}

function validateEntry(entry: GrowthBudgetEntry) {
  if (!entry.idempotencyKey.trim()) throw new Error("idempotencyKey is required");
  if (!entry.provider.trim()) throw new Error("provider is required");
  if (!entry.operation.trim()) throw new Error("operation is required");

  const estimated = asNonNegativeFinite(entry.estimatedSek);
  if (estimated === null) throw new Error("estimatedSek must be a non-negative finite number");

  if (entry.actualSek !== undefined && entry.actualSek !== null) {
    const actual = asNonNegativeFinite(entry.actualSek);
    if (actual === null) throw new Error("actualSek must be a non-negative finite number when supplied");
  }

  if (entry.originalAmount !== undefined && entry.originalAmount !== null) {
    const originalAmount = asNonNegativeFinite(entry.originalAmount);
    if (originalAmount === null) {
      throw new Error("originalAmount must be a non-negative finite number when supplied");
    }
  }
}

export async function appendGrowthSpend(
  client: GrowthBudgetDb,
  entry: GrowthBudgetEntry,
): Promise<void> {
  validateEntry(entry);
  await client.insertSpend(entry);
}

export async function authorizeGrowthOperation(
  client: GrowthBudgetDb,
  request: GrowthBudgetRequest,
  now = new Date(),
): Promise<BudgetDecision> {
  const monthlySpendSek = await getCurrentGrowthSpend(client, now);
  return evaluateBudget({
    monthlySpendSek,
    projectedCostSek: request.projectedCostSek,
    optional: request.optional,
  });
}
