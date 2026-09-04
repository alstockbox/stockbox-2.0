import React from "react";
import { ImageResponse } from "next/og";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function clean(value: unknown, max = 180) {
  const text = String(value ?? "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await context.params;
  const supabase = createAdminClient();
  if (!supabase) return new Response("Supabase unavailable", { status: 503 });

  const { data: queue } = await supabase
    .from("acq_distribution_queue")
    .select("id,content_id,platform,caption,asset_copy,quality_score")
    .eq("id", id)
    .maybeSingle();

  if (!queue) return new Response("Asset not found", { status: 404 });

  const { data: content } = queue.content_id
    ? await supabase.from("acq_content").select("title,topic").eq("id", queue.content_id).maybeSingle()
    : { data: null };

  const asset = (queue.asset_copy ?? {}) as Record<string, unknown>;
  const headline = clean(asset.headline ?? content?.title ?? content?.topic ?? "Aktieanalys", 110);
  const rawBullets = Array.isArray(asset.bullets) ? asset.bullets : [];
  const bullets = rawBullets.map((item) => clean(item, 120)).filter(Boolean).slice(0, 3);
  if (bullets.length === 0) {
    bullets.push(...String(queue.caption ?? "").split(/(?<=[.!?])\s+/).map((item) => clean(item, 120)).filter((item) => item.length > 24).slice(0, 3));
  }

  const vertical = ["tiktok", "instagram_reel", "youtube_short"].includes(queue.platform);
  const width = 1080;
  const height = vertical ? 1920 : 1350;
  const h = React.createElement;

  const root = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: vertical ? "110px 88px" : "84px 82px",
        background: "linear-gradient(145deg,#07111f 0%,#0c1a2a 58%,#101f31 100%)",
        color: "#f4efe5",
        fontFamily: "Arial, sans-serif",
      },
    },
    h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
      h("div", { style: { display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: "0.02em" } }, "STOCKBOX"),
      h("div", { style: { display: "flex", fontSize: 22, color: "#caa85f", textTransform: "uppercase", letterSpacing: "0.12em" } }, clean(queue.platform, 30)),
    ),
    h("div", { style: { display: "flex", flexDirection: "column", gap: vertical ? 46 : 34 } },
      h("div", { style: { display: "flex", width: vertical ? "94%" : "96%", fontSize: vertical ? 74 : 62, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.035em" } }, headline),
      h("div", { style: { display: "flex", width: 120, height: 8, borderRadius: 999, background: "#caa85f" } }),
      h("div", { style: { display: "flex", flexDirection: "column", gap: vertical ? 30 : 24 } },
        ...bullets.map((bullet, index) => h("div", { key: `${index}-${bullet}`, style: { display: "flex", alignItems: "flex-start", gap: 20, fontSize: vertical ? 34 : 30, lineHeight: 1.28, color: "#d8dee8" } },
          h("div", { style: { display: "flex", color: "#caa85f", fontWeight: 800 } }, `${index + 1}.`),
          h("div", { style: { display: "flex", flex: 1 } }, bullet),
        )),
      ),
    ),
    h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,.15)", paddingTop: 28 } },
      h("div", { style: { display: "flex", fontSize: 26, color: "#caa85f", fontWeight: 700 } }, "getstockbox.app"),
      h("div", { style: { display: "flex", fontSize: 20, color: "#8fa0b4" } }, `Kvalitet ${Number(queue.quality_score ?? 0)}/100`),
    ),
  );

  return new ImageResponse(root, {
    width,
    height,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename=stockbox-${queue.platform}-${id}.png`,
    },
  });
}
