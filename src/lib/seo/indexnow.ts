import { getServerEnv } from "@/lib/env/server";

export type IndexNowPayload = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

export function buildIndexNowPayload(
  urls: string[],
  baseUrl: string,
  key: string
): IndexNowPayload {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const urlList: string[] = [];

  for (const rawUrl of urls) {
    try {
      const url = new URL(rawUrl, base);
      if (url.hostname !== base.hostname) continue;
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      url.hash = "";
      const normalized = url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      urlList.push(normalized);
    } catch {
      continue;
    }
  }

  return {
    host: base.host,
    key,
    keyLocation: new URL("/api/indexnow/key", base).toString(),
    urlList,
  };
}

export async function notifyIndexNow(urls: string[]): Promise<void> {
  const env = getServerEnv();
  const key = env.INDEXNOW_KEY?.trim();
  if (!key) return;

  const payload = buildIndexNowPayload(urls, env.NEXT_PUBLIC_APP_URL, key);
  if (payload.urlList.length === 0) return;

  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    // Search-engine notification is best-effort and must never block publication.
  }
}
