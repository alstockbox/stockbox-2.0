import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const nav = readFileSync(join(process.cwd(), "src/components/app-shell/nav.tsx"), "utf8");
const settings = readFileSync(join(process.cwd(), "src/app/settings/page.tsx"), "utf8");
const security = readFileSync(join(process.cwd(), "src/app/settings/security/page.tsx"), "utf8");

describe("release navigation and settings", () => {
  it("keeps account controls inside one profile menu", () => {
    expect(nav).toContain("<details");
    expect(nav).toContain('href="/settings"');
    expect(nav).toContain('href="/settings/profile"');
    expect(nav).toContain('href="/settings/billing"');
    expect(nav).toContain('href="/settings/security"');
    expect(nav).toContain('href="/feedback"');
    expect(nav).toContain('href="/contact"');
  });

  it("shows role-specific workspaces without exposing them to normal users", () => {
    expect(nav).toContain('user?.role === "affiliate_ambassador"');
    expect(nav).toContain('href="/affiliate"');
    expect(nav).toContain('user?.role === "admin"');
  });

  it("provides one settings hub and in-app password changes", () => {
    expect(settings).toContain("Profile");
    expect(settings).toContain("Language");
    expect(settings).toContain("Billing");
    expect(settings).toContain("Security");
    expect(security).toContain("updatePasswordAction");
    expect(security).toContain("AuthForm");
  });
});
