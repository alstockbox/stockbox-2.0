import { evaluateBudget } from "./budget.ts";

export type ProviderBudgetSelect = (table: string, query?: string) => Promise<any[]>;
export type ProviderBudgetRpc = (name: string, args: Record<string, unknown>) => Promise<any>;

function monthStartIso(now: Date) {
  const date = new Date(now);
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function validMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function monthGrowthSpend(select: ProviderBudgetSelect, now = new Date()) {
  const rows = await select(
    "acq_budget_ledger",
    `select=estimated_sek,actual_sek,created_at&created_at=gte.${encodeURIComponent(monthStartIso(now))}&limit=10000`,
  );
  return Number((rows || []).reduce((sum: number, row: any) => {
    const actual = validMoney(row.actual_sek);
    const estimated = validMoney(row.estimated_sek) ?? 0;
    return sum + (actual ?? estimated);
  }, 0).toFixed(6));
}

export async function authorizePaidGrowthCall(input: {
  select: ProviderBudgetSelect;
  rpc: ProviderBudgetRpc;
  idempotencyKey: string;
  provider: string;
  operation: string;
  projectedCostSek: number | null;
  optional: boolean;
  contentId?: string | null;
  renderJobId?: string | null;
  now?: Date;
}) {
  const monthlySpendSek = await monthGrowthSpend(input.select, input.now);
  const localDecision = evaluateBudget({
    monthlySpendSek,
    projectedCostSek: input.projectedCostSek,
    optional: input.optional,
  });
  if (!localDecision.allowed) return { ...localDecision, authorization: null };

  const authorization = await input.rpc("acq_authorize_growth_cost_v3", {
    p_idempotency_key: input.idempotencyKey,
    p_provider: input.provider,
    p_operation: input.operation,
    p_estimated_sek: input.projectedCostSek,
    p_content_id: input.contentId ?? null,
    p_render_job_id: input.renderJobId ?? null,
    p_optional: input.optional,
  });
  const allowed = authorization?.allowed === true;
  return {
    allowed,
    mode: localDecision.mode,
    projectedMonthlySek: authorization?.projected_monthly_sek ?? localDecision.projectedMonthlySek,
    reason: allowed ? localDecision.reason : String(authorization?.reason || "authorization_rejected"),
    authorization,
  };
}

export async function finalizeGrowthSpend(input: {
  rpc: ProviderBudgetRpc;
  idempotencyKey: string;
  provider: string;
  operation: string;
  estimatedSek: number;
  actualSek?: number | null;
  renderJobId?: string | null;
}) {
  const estimated = validMoney(input.estimatedSek);
  const actual = input.actualSek === null || input.actualSek === undefined ? null : validMoney(input.actualSek);
  if (estimated === null || (input.actualSek !== null && input.actualSek !== undefined && actual === null)) {
    throw new Error("invalid_growth_usage_cost");
  }
  return input.rpc("acq_finalize_growth_usage_v3", {
    p_idempotency_key: input.idempotencyKey,
    p_provider: input.provider,
    p_operation: input.operation,
    p_estimated_sek: estimated,
    p_actual_sek: actual,
    p_render_job_id: input.renderJobId ?? null,
  });
}
