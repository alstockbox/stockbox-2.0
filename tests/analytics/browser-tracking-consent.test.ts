import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("consent-gated browser analytics", () => {
  it("prepares GA4 and Meta Pixel IDs without loading them by default", () => {
    const env = read("src/lib/env/server.ts");
    const example = read(".env.example");
    expect(env).toContain("NEXT_PUBLIC_GA_ID");
    expect(env).toContain("NEXT_PUBLIC_META_PIXEL_ID");
    expect(example).toContain("NEXT_PUBLIC_GA_ID=");
    expect(example).toContain("NEXT_PUBLIC_META_PIXEL_ID=");
  });

  it("loads browser trackers only after explicit analytics consent", () => {
    const component = read("src/components/analytics/browser-analytics.tsx");
    expect(component).toContain("stockbox_analytics_consent");
    expect(component).toContain('consent === "accepted"');
    expect(component).toContain("googletagmanager.com/gtag/js");
    expect(component).toContain("connect.facebook.net/en_US/fbevents.js");
    expect(component).toContain("Reject analytics");
    expect(component).toContain("Accept analytics");
    expect(read("src/app/layout.tsx")).toContain("<BrowserAnalytics");
    const config = read("next.config.ts");
    expect(config).toContain("https://www.googletagmanager.com");
    expect(config).toContain("https://www.google-analytics.com");
    expect(config).toContain("https://connect.facebook.net");
  });

  it("documents optional consent-based browser analytics in Privacy", () => {
    const privacy = read("src/app/legal/privacy/page.tsx");
    expect(privacy).toContain("Google Analytics 4");
    expect(privacy).toContain("Meta Pixel");
    expect(privacy.toLowerCase()).toContain("consent");
  });
});
