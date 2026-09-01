import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const nav = readFileSync(join(process.cwd(), "src/components/app-shell/nav.tsx"), "utf8");
const transientMenu = readFileSync(join(process.cwd(), "src/components/app-shell/transient-menu.tsx"), "utf8");
const settings = readFileSync(join(process.cwd(), "src/app/settings/page.tsx"), "utf8");
const security = readFileSync(join(process.cwd(), "src/app/settings/security/page.tsx"), "utf8");

describe("release navigation and settings", () => {
  it("keeps signed-out navigation compact through tablet widths", () => {
    expect(nav).toContain('nav className="ml-6 hidden flex-1 items-center gap-1 lg:flex"');
    expect(nav).toContain('className={user ? "xl:hidden" : "lg:hidden"}');
    expect(nav).toContain('div className="hidden items-center gap-2 lg:flex"');
  });

  it("keeps account controls inside one transient profile menu", () => {
    expect(nav).toContain("TransientMenu");
    expect(nav).not.toContain("<details");
    expect(nav).toContain('href="/settings"');
    expect(nav).toContain('href="/settings/profile"');
    expect(nav).toContain('href="/settings/billing"');
    expect(nav).toContain('href="/settings/security"');
    expect(nav).toContain('href="/feedback"');
    expect(nav).toContain('href="/contact"');
    expect(transientMenu).toContain('aria-haspopup="menu"');
    expect(transientMenu).toContain('event.key === "Escape"');
    expect(transientMenu).toContain('document.addEventListener("pointerdown"');
  });

  it("shows role-specific workspaces without exposing them to normal users", () => {
    expect(nav).toMatch(/user(?:\?\.|\.)role === "affiliate_ambassador"/);
    expect(nav).toContain('href="/affiliate"');
    expect(nav).toMatch(/user(?:\?\.|\.)role === "admin"/);
    expect(nav).toContain('href="/admin"');
  });

  it("keeps the authenticated transient menu available until the xl workspace navigation takes over", () => {
    expect(nav).toContain('className={user ? "xl:hidden" : "lg:hidden"}');
    expect(nav).toContain('hidden flex-1 items-center gap-0.5 xl:flex');
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