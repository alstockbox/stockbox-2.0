import type { MetadataRoute } from "next";
import {
  getPublicStockSnapshotSitemapIds,
  listPublicStockSnapshotsPage,
} from "@/lib/seo/public-snapshots";

export async function generateSitemaps() {
  const ids = await getPublicStockSnapshotSitemapIds();
  return ids.map((id) => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const page = Number(await id);
  if (!Number.isInteger(page) || page < 0) return [];

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app").replace(/\/$/, "");
  const snapshots = await listPublicStockSnapshotsPage(page);

  return snapshots.map((snapshot) => ({
    url: `${base}/aktier/${snapshot.slug}`,
    lastModified: new Date(snapshot.updatedAt),
    changeFrequency: "weekly",
    priority: 0.8,
  }));
}
