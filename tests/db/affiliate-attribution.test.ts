import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const sql = () => readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("affiliate attribution persistence", () => {
  it("stores privacy-minimal clicks and first-touch signup attribution", () => {
    const source = sql();
    expect(source).toContain("create table if not exists public.affiliate_clicks");
    expect(source).toContain("create table if not exists public.affiliate_attributions");
    expect(source).toContain("referred_user_id uuid not null unique");
    expect(source).toContain("record_affiliate_click");
    expect(source).toContain("attribute_affiliate_signup");
    expect(source).toContain("self_referral");
    expect(source).toContain("first_touch_preserved");
  });
  it("provisions an affiliate identity when ambassador access is granted", () => {
    const source = sql();
    expect(source).toContain("insert into public.affiliates");
    expect(source).toContain("commission_basis_points");
    expect(source).toContain("affiliate_ambassador_granted");
    expect(source).toContain("set status = 'inactive'");
  });
});