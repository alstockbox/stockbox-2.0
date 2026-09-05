import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260905223300_paper_starting_capital_integrity_v3.sql",
  "utf8",
);
const accountService = readFileSync("src/lib/paper-trading/accounts-v3.ts", "utf8");
const actions = readFileSync("src/app/paper-trading/actions.ts", "utf8");

describe("Paper Trading V3 fixed starting capital", () => {
  it("persists starting capital on the account itself", () => {
    expect(migration).toContain("add column if not exists starting_cash numeric(30,10)");
    expect(migration).toContain("alter column starting_cash set not null");
    expect(migration).toContain("paper_accounts_v3_starting_cash_fixed");
    expect(migration).toContain("check (starting_cash = 100000)");
  });

  it("rejects any RPC starting capital other than exactly 100000", () => {
    expect(migration).toContain("p_starting_cash <> 100000");
    expect(migration).toContain("paper starting cash must equal 100000");
    expect(migration).toContain("values (p_user_id, v_name, v_currency, 100000)");
    expect(migration).toContain("values (v_account.id, p_user_id, v_currency, 100000)");
  });

  it("retains serialized account creation and the twenty-account cap", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_account_count >= 20");
    expect(migration).toContain("paper account limit reached");
  });

  it("keeps the application-layer starting capital aligned with the DB invariant", () => {
    expect(accountService).toContain("PAPER_TRADING_V3_STARTING_CASH = 100_000");
    expect(actions).toContain("PAPER_TRADING_V3_STARTING_CASH");
    expect(actions).not.toContain('formData.get("startingCash")');
  });

  it("keeps account creation service-role only", () => {
    expect(migration).toContain(
      "revoke all on function public.create_paper_account_v3(uuid,text,text,numeric) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.create_paper_account_v3(uuid,text,text,numeric) to service_role",
    );
  });
});