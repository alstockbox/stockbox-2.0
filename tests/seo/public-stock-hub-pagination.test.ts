import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("public stock hub pagination", () => {
  it("uses paged snapshot queries instead of hard-capping the public hub", () => {
    const page = read("src/app/aktier/page.tsx");
    expect(page).toContain("countPublicStockSnapshots");
    expect(page).toContain("listPublicStockSnapshotsPage");
    expect(page).toContain("PUBLIC_STOCK_HUB_PAGE_SIZE");
    expect(page).not.toContain("listPublicStockSnapshots(100)");
  });

  it("exposes crawlable previous and next links and self-canonical metadata", () => {
    const page = read("src/app/aktier/page.tsx");
    expect(page).toContain("generateMetadata");
    expect(page).toContain('canonical: pageNumber === 1 ? "/aktier" : `/aktier?page=${pageNumber}`');
    expect(page).toContain('href={pageNumber > 2 ? `/aktier?page=${pageNumber - 1}` : "/aktier"}');
    expect(page).toContain('href={`/aktier?page=${pageNumber + 1}`}');
  });

  it("keeps ItemList positions stable across pagination", () => {
    const page = read("src/app/aktier/page.tsx");
    expect(page).toContain("position: pageOffset + index + 1");
  });
});
