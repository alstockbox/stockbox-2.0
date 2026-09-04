import { describe, expect, it } from "vitest";
import {
  authorizePaidGrowthCall,
  finalizeGrowthSpend,
  monthGrowthSpend,
} from "../supabase/functions/stockbox-growth-engine/v3/provider-budget";

describe("growth v3 provider budget adapter", () => {
  it("uses actual cost when finalized and estimate otherwise", async () => {
    const spend = await monthGrowthSpend(async () => [
      { estimated_sek: 1, actual_sek: 0.8 },
      { estimated_sek: 0.4, actual_sek: null },
    ], new Date("2026-09-04T12:00:00Z"));
    expect(spend).toBe(1.2);
  });

  it("fails closed before RPC when projected provider cost is unknown", async () => {
    let calls = 0;
    const decision = await authorizePaidGrowthCall({
      select: async () => [],
      rpc: async () => { calls += 1; return { allowed: true }; },
      idempotencyKey: "gemini:x",
      provider: "gemini",
      operation: "content_draft",
      projectedCostSek: null,
      optional: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("unknown_cost");
    expect(calls).toBe(0);
  });

  it("uses the serialized budget RPC when the local check allows the call", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const decision = await authorizePaidGrowthCall({
      select: async () => [{ estimated_sek: 10, actual_sek: null }],
      rpc: async (name, args) => { calls.push({ name, args }); return { allowed: true, projected_monthly_sek: 10.2 }; },
      idempotencyKey: "voice:job-1",
      provider: "modal_chatterbox",
      operation: "founder_voice_tts",
      projectedCostSek: 0.2,
      optional: false,
      renderJobId: "job-1",
    });
    expect(decision.allowed).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("acq_authorize_growth_cost_v3");
  });

  it("blocks optional calls above the 50 SEK target without calling RPC", async () => {
    let calls = 0;
    const decision = await authorizePaidGrowthCall({
      select: async () => [{ estimated_sek: 50, actual_sek: null }],
      rpc: async () => { calls += 1; return {}; },
      idempotencyKey: "experiment:1",
      provider: "experimental",
      operation: "micro_scene",
      projectedCostSek: 0.1,
      optional: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("target_exceeded");
    expect(calls).toBe(0);
  });

  it("finalizes known usage through the idempotent ledger RPC", async () => {
    const calls: any[] = [];
    await finalizeGrowthSpend({
      rpc: async (name, args) => { calls.push({ name, args }); return { ok: true }; },
      idempotencyKey: "voice:job-1",
      provider: "modal_chatterbox",
      operation: "founder_voice_tts",
      estimatedSek: 0.2,
      actualSek: 0.18,
      renderJobId: "job-1",
    });
    expect(calls[0].name).toBe("acq_finalize_growth_usage_v3");
    expect(calls[0].args.p_actual_sek).toBe(0.18);
  });
});
