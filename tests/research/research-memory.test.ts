import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("investor research memory", () => {
  it("stores private theses, assumptions, invalidation triggers and evidence", () => {
    const migration = source("supabase/migrations/20260901153843_investor_research_memory.sql");
    expect(migration).toContain("create table if not exists public.investment_theses");
    expect(migration).toContain("invalidation_triggers jsonb");
    expect(migration).toContain("create table if not exists public.thesis_evidence_events");
    expect(migration).toContain("investment_theses_active_ticker_idx");
    expect(migration).toContain("investment_theses_select_own");
  });

  it("exposes thesis lifecycle actions and a dedicated research workspace", () => {
    const actions = source("src/lib/research/actions.ts");
    const page = source("src/app/research/page.tsx");
    expect(actions).toContain("createInvestmentThesisAction");
    expect(actions).toContain("updateInvestmentThesisAction");
    expect(actions).toContain("setInvestmentThesisStatusAction");
    expect(page).toContain("Investment thesis");
    expect(page).toContain("Invalidation triggers");
    expect(page).toContain("Evidence timeline");
  });
});
