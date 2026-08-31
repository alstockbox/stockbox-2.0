import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = join(root, "supabase/migrations/20260830213500_giveaway_ambassador_guard.sql");
const adminPage = readFileSync(join(root, "src/app/admin/page.tsx"), "utf8");

describe("giveaway ambassador guard", () => {
  it("requires the campaign owner to be an active affiliate ambassador in the database", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase();
    expect(sql).toContain("join public.profiles p on p.id = a.user_id");
    expect(sql).toContain("p.role = 'affiliate_ambassador'");
    expect(sql).toContain("a.status = 'active'");
    expect(sql).toContain("active affiliate ambassador required");
  });

  it("queries ambassador roles independently of the recent-profile admin list", () => {
    expect(adminPage).toContain("ambassadorProfileResult");
    expect(adminPage).toContain('.eq("role", "affiliate_ambassador")');
    expect(adminPage).toContain("ambassadorUserIds.has(item.user_id)");
    expect(adminPage).not.toContain('profiles.filter((profile) => profile.role === "affiliate_ambassador")');
  });
});
