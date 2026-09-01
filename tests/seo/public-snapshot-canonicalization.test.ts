import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolvePublicSnapshotSlug } from "@/lib/seo/public-snapshots";

const migration = () => readFileSync("supabase/migrations/20260901213000_public_stock_snapshots.sql", "utf8");

describe("public stock canonicalization", () => {
  it("preserves the established canonical slug when a ticker is republished", () => {
    expect(resolvePublicSnapshotSlug({
      companyName: "Mycronic AB",
      ticker: "MYCR.ST",
      requestedSlug: "mycronic-new",
      existingTickerSlug: "mycronic",
      slugOwnerTicker: null,
    })).toBe("mycronic");
  });

  it("disambiguates two securities that would otherwise claim the same company slug", () => {
    expect(resolvePublicSnapshotSlug({
      companyName: "Atlas Copco AB",
      ticker: "ATCO-B.ST",
      existingTickerSlug: null,
      slugOwnerTicker: "ATCO-A.ST",
    })).toBe("atlas-copco-ab-atco-b-dot-st");
  });

  it("keeps the clean company slug when no conflict exists", () => {
    expect(resolvePublicSnapshotSlug({
      companyName: "Mycronic AB",
      ticker: "MYCR.ST",
      existingTickerSlug: null,
      slugOwnerTicker: null,
    })).toBe("mycronic-ab");
  });

  it("enforces one public snapshot row per normalized ticker idempotently", () => {
    const sql = migration();
    expect(sql).toContain("create unique index if not exists public_stock_snapshots_ticker_unique_idx");
    expect(sql).toContain("on public.public_stock_snapshots (ticker)");
  });

  it("upserts published snapshots by ticker instead of creating competing URLs", () => {
    const repository = readFileSync("src/lib/seo/public-snapshots.ts", "utf8");
    expect(repository).toContain('onConflict: "ticker"');
    expect(repository).toContain("existingTickerSlug");
  });
});
