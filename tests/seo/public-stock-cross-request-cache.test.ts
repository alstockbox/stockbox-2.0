import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("public stock cross-request SEO cache", () => {
  it("persists public stock snapshot reads across requests with a bounded cache", () => {
    const snapshots = read("src/lib/seo/public-snapshots.ts");
    expect(snapshots).toContain('unstable_cache');
    expect(snapshots).toContain('PUBLIC_STOCK_CACHE_SECONDS');
    expect(snapshots).toContain('public-stock-snapshot');
  });

  it("keeps React request memoization on top of the persistent data cache", () => {
    const snapshots = read("src/lib/seo/public-snapshots.ts");
    expect(snapshots).toContain('cache(getPersistedPublicStockSnapshotBySlug)');
  });

  it("keeps an individual stock cache independent from the global listing tag", () => {
    const snapshots = read("src/lib/seo/public-snapshots.ts");
    const start = snapshots.indexOf("const getPersistedSnapshot = unstable_cache");
    const end = snapshots.indexOf("return getPersistedSnapshot();", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const stockCacheBlock = snapshots.slice(start, end);
    expect(stockCacheBlock).toContain('`public-stock-snapshot:${normalizedSlug}`');
    expect(stockCacheBlock).not.toContain("PUBLIC_STOCK_LIST_TAG");
  });

  it("invalidates the affected stock and listing caches after publication", () => {
    const route = read("src/app/api/admin/seo/publish/route.ts");
    expect(route).toContain('revalidateTag');
    expect(route).toContain('public-stock-snapshot:');
    expect(route).toContain('public-stock-list');
    expect(route).toContain('revalidatePath(`/aktier/${published.snapshot.slug}`)');
    expect(route).toContain('revalidatePath("/aktier")');
  });
});
