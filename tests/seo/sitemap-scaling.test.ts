import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("SEO sitemap scaling", () => {
  it("keeps the root sitemap focused on static canonical pages", () => {
    const root = read("src/app/sitemap.ts");
    expect(root).not.toContain("listPublicStockSnapshots(5000)");
    expect(root).not.toContain("/aktier/${snapshot.slug}");
  });

  it("shards public stock URLs with Next.js generateSitemaps", () => {
    const stocks = read("src/app/aktier/sitemap.ts");
    expect(stocks).toContain("generateSitemaps");
    expect(stocks).toContain("getPublicStockSnapshotSitemapIds");
    expect(stocks).toContain("listPublicStockSnapshotsPage");
    expect(stocks).toContain("lastModified");
  });

  it("discovers every generated stock sitemap from robots.txt", () => {
    const robots = read("src/app/robots.ts");
    expect(robots).toContain("getPublicStockSnapshotSitemapIds");
    expect(robots).toContain("/aktier/sitemap/${id}.xml");
    expect(robots).toContain("sitemap:");
  });

  it("provides paginated sitemap access instead of a hard 5000 row ceiling", () => {
    const repository = read("src/lib/seo/public-snapshots.ts");
    expect(repository).toContain("countPublicStockSnapshots");
    expect(repository).toContain("listPublicStockSnapshotsPage");
    expect(repository).toContain("getPublicStockSnapshotSitemapIds");
    expect(repository).toContain(".range(");
  });
});
