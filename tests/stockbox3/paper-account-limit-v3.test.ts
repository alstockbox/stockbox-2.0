import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260905223200_paper_account_limit_v3.sql", "utf8");
const accounts = readFileSync("src/lib/paper-trading/accounts-v3.ts", "utf8");

describe("Paper Trading V3 account cap", () => {
  it("serializes account creation per user before counting", () => {
    const lock = migration.indexOf("pg_advisory_xact_lock");
    const count = migration.indexOf("select count(*)::integer");
    const insert = migration.indexOf("insert into public.paper_accounts_v3");
    expect(lock).toBeGreaterThan(0);
    expect(count).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(count);
    expect(migration).toContain("pg_catalog.hashtext(p_user_id::text)");
  });

  it("caps every account state at the same bound used by the list query", () => {
    expect(migration).toContain("if v_account_count >= 20 then");
    expect(migration).toContain("paper account limit reached");
    expect(accounts).toContain(".limit(20)");
    expect(migration).not.toContain("status = 'active'");
  });

  it("keeps account creation service-role only after replacing the RPC", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.create_paper_account_v3(uuid,text,text,numeric) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.create_paper_account_v3(uuid,text,text,numeric) to service_role");
  });
});
