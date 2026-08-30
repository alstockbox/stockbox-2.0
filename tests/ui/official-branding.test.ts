import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const logoComponentPath = join(root, "src/components/brand/stockbox-logo.tsx");
const logoAssetPath = join(root, "public/images/stockbox-logo.png");
const logoComponent = existsSync(logoComponentPath) ? readFileSync(logoComponentPath, "utf8") : "";
const nav = read("src/components/app-shell/nav.tsx");
const home = read("src/app/page.tsx");
const authShell = read("src/components/auth/auth-shell.tsx");
const layout = read("src/app/layout.tsx");
const reportView = read("src/components/analysis/report-view.tsx");
const receiptDownload = read("src/app/withdraw/receipt/[id]/download/route.ts");

describe("official StockBox branding", () => {
  it("defines one canonical logo asset and reusable component", () => {
    expect(existsSync(logoAssetPath)).toBe(true);
    expect(logoComponent).toContain('/images/stockbox-logo.png');
  });

  it("replaces the placeholder SB mark in the global navigation", () => {
    expect(nav).toContain("StockBoxLogo");
    expect(nav).not.toContain(">SB<");
  });

  it("brands the hero and authentication surfaces", () => {
    expect(home).toContain("StockBoxLogo");
    expect(authShell).toContain("StockBoxLogo");
  });

  it("uses the official logo for browser metadata and analysis reports", () => {
    expect(layout).toContain('/images/stockbox-logo.png');
    expect(reportView).toContain("StockBoxLogo");
    expect(reportView).toContain("data-report-brand");
  });

  it("keeps withdrawal downloads text-only while the page uses the global shell", () => {
    expect(layout).toContain("<AppNav />");
    expect(receiptDownload).toContain('"Content-Type": "text/plain; charset=utf-8"');
    expect(receiptDownload).not.toContain("stockbox-logo.png");
  });
});
