import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("affiliate ambassador database role", () => {
  it("adds the role without allowing authenticated users to update profile roles", () => {
    expect(sql).toContain("affiliate_ambassador");
    expect(sql).toContain("revoke update on public.profiles from authenticated");
    expect(sql).toContain("grant update (email, experience, ui_mode, investment_profile, locale, updated_at) on public.profiles to authenticated");
  });

  it("grants exactly 100 total monthly analyses through the reservation rpc", () => {
    expect(sql).toContain("v_role = 'affiliate_ambassador'");
    expect(sql).toContain("v_monthly_limit := 100");
    expect(sql).toContain("v_deep_limit := 100");
  });
});


describe("affiliate ambassador admin mutation", () => {
  it("updates the role and writes the audit record in one service-role-only rpc", () => {
    expect(sql).toContain("create or replace function public.set_affiliate_ambassador_role");
    expect(sql).toContain("insert into public.audit_logs");
    expect(sql).toContain("for update");
    expect(sql).toContain("revoke all on function public.set_affiliate_ambassador_role(uuid, uuid, boolean) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.set_affiliate_ambassador_role(uuid, uuid, boolean) to service_role");
  });
});
