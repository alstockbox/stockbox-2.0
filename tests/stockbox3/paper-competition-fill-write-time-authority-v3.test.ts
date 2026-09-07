import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260907141500_paper_competition_fill_write_time_authority_v3.sql";

describe("Paper Trading V3 competition fill write-time authority", () => {
  it("atomically revalidates competition state and the half-open trading window using the DB clock at fill persistence", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("create or replace function private.enforce_paper_competition_fill_window_v3()");
    expect(sql).toContain("clock_timestamp()");
    expect(sql).toContain("from public.paper_competitions_v3");
    expect(sql).toContain("for update");
    expect(sql).toContain("v_competition.status <> 'active'");
    expect(sql).toContain("v_now < v_competition.starts_at");
    expect(sql).toContain("v_now >= v_competition.ends_at");
    expect(sql).toContain("new.executed_at < v_competition.starts_at");
    expect(sql).toContain("new.executed_at >= v_competition.ends_at");
    expect(sql).toContain("new.market_observed_at < v_competition.starts_at");
    expect(sql).toContain("new.market_observed_at >= v_competition.ends_at");
    expect(sql).toContain("if v_account_type <> 'competition' then");
    expect(sql).toContain("return new;");
    expect(sql).toContain("paper competition fill outside official window");
    expect(sql).not.toContain("p_now");
    expect(sql).not.toContain("p_status");
    expect(sql).not.toContain("p_starts_at");
    expect(sql).not.toContain("p_ends_at");
  });
});
