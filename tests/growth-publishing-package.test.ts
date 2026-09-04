import { describe, expect, it } from "vitest";
import { buildMasterVideoDistributionPackages, buildPublishingPackage } from "../src/lib/growth/publishing-package";

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

describe("buildMasterVideoDistributionPackages", () => {
  it("reuses one master video across four separately tracked platforms", () => {
    const packages = buildMasterVideoDistributionPackages({
      renderJobId: "job-1",
      contentId: "content-1",
      masterAssetId: "asset-1",
      title: "Tre varningssignaler i balansräkningen",
      caption: "Kontrollera skuld, räntetäckning och kassaflöde innan du drar slutsatser.",
      baseUrl: "https://www.getstockbox.app",
      shadowMode: false,
    });

    expect(packages).toHaveLength(4);
    expect(new Set(packages.map((item) => item.masterAssetId))).toEqual(new Set(["asset-1"]));
    expect(new Set(packages.map((item) => item.idempotencyKey)).size).toBe(4);
    expect(new Set(packages.map((item) => new URL(item.utmUrl).searchParams.get("utm_source"))).size).toBe(4);
    expect(packages.every((item) => item.status === "ready")).toBe(true);

    const youtube = packages.find((item) => item.platform === "youtube_short")!;
    expect(youtube.title).toContain("Tre varningssignaler");
    expect(youtube.description).toContain(youtube.utmUrl);

    for (const item of packages) {
      const copy = item.platform === "youtube_short" ? item.description : item.caption;
      expect(copy?.split(item.utmUrl)).toHaveLength(2);
    }
  });

  it("keeps all four packages draft while render shadow mode is active", () => {
    const packages = buildMasterVideoDistributionPackages({
      renderJobId: "job-shadow",
      contentId: "content-shadow",
      masterAssetId: "asset-shadow",
      title: "Riskanalys",
      caption: "Tre saker att kontrollera.",
      baseUrl: "https://www.getstockbox.app",
      shadowMode: true,
    });
    expect(packages.every((item) => item.status === "draft")).toBe(true);
  });
});
