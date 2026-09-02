import { getServerEnv } from "@/lib/env/server";
import { isValidIndexNowKey } from "@/lib/seo/indexnow";

export function GET() {
  const key = getServerEnv().INDEXNOW_KEY?.trim();
  if (!key || !isValidIndexNowKey(key)) return new Response("Not configured", { status: 404 });

  return new Response(key, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
