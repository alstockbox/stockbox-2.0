import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("public stock SEO performance and previews", () => {
  it("memoizes a public stock snapshot lookup per server render request", () => {
    const snapshots = read("src/lib/seo/public-snapshots.ts");
    expect(snapshots).toContain('import { cache } from "react"');
    expect(snapshots).toContain("getCachedPublicStockSnapshotBySlug");
  });

  it("uses the cached snapshot loader for both metadata and page rendering", () => {
    const page = read("src/app/aktier/[slug]/page.tsx");
    expect(page).toContain("getCachedPublicStockSnapshotBySlug");
    expect(page).not.toContain("getPublicStockSnapshotBySlug(slug)");
  });

  it("generates a dynamic social preview image for every public stock page", () => {
    const image = read("src/app/aktier/[slug]/opengraph-image.tsx");
    expect(image).toContain("ImageResponse");
    expect(image).toContain("StockBox Score");
    expect(image).toContain("snapshot?.companyName");
    expect(image).toContain("snapshot?.ticker");
    expect(image).toContain("1200");
    expect(image).toContain("630");
  });

  it("provides a route-specific Twitter image instead of inheriting the global logo", () => {
    const twitter = read("src/app/aktier/[slug]/twitter-image.tsx");
    expect(twitter).toContain('from "./opengraph-image"');
    expect(twitter).toContain("default");
  });
});
