import { describe, expect, it } from "vitest";
import { buildPublishingPackage } from "../src/lib/growth/publishing-package";

describe("buildPublishingPackage", () => {
  const url = "https://www.getstockbox.app/?utm_source=youtube_short&utm_medium=organic_social&utm_campaign=auto_growth_v2&utm_content=abc123";

  it("keeps the tracked URL exactly once for a YouTube Short", () => {
    const result = buildPublishingPackage({
      platform: "youtube_short",
      title: "Så hittar du riskerna i ett börsbolag",
      caption: `Så hittar du riskerna i ett börsbolag\n\nTesta StockBox: ${url}`,
      script: `Här är manuset. Testa StockBox: ${url}`,
      utmUrl: url,
    });

    expect(result.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBe(1);
    expect(result).toContain("RUBRIK:");
    expect(result).toContain("MANUS:");
    expect(result).toContain("BESKRIVNING:");
    expect(result).toContain("LÄNK:");
  });

  it("removes duplicated StockBox CTA/link fragments from copied text", () => {
    const result = buildPublishingPackage({
      platform: "tiktok",
      title: "Fyra saker att kontrollera",
      caption: `Fyra saker att kontrollera. Testa StockBox: ${url}`,
      script: `Fyra saker att kontrollera. Testa StockBox: ${url}`,
      utmUrl: url,
    });

    expect(result).not.toContain(`Testa StockBox: ${url}`);
    expect(result.split(url)).toHaveLength(2);
  });

  it("gives text platforms a simple post-copy layout", () => {
    const result = buildPublishingPackage({
      platform: "linkedin",
      title: "Lönsamhet bortom marginalen",
      caption: "Titta på ROIC, kassaflöde och marginaltrend.",
      script: null,
      utmUrl: url,
    });

    expect(result).toContain("INLÄGG:");
    expect(result).toContain("LÄNK:");
    expect(result).not.toContain("MANUS:");
  });
});
