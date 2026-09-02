import { ImageResponse } from "next/og";
import { getCachedPublicStockSnapshotBySlug } from "@/lib/seo/public-snapshots";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "StockBox aktieanalys";

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getCachedPublicStockSnapshotBySlug(slug);

  const companyName = snapshot?.companyName ?? "StockBox aktieanalys";
  const ticker = snapshot?.ticker ?? slug.toUpperCase();
  const score = snapshot?.score;
  const updated = snapshot?.dataAsOf
    ? new Date(snapshot.dataAsOf).toLocaleDateString("sv-SE")
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #050b13 0%, #071a2d 55%, #10273d 100%)",
          color: "#f4efe5",
          padding: "64px 72px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 14,
                border: "2px solid #e1cb95",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#e1cb95",
                fontSize: 26,
                fontWeight: 800,
              }}
            >
              S
            </div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>StockBox</div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#a8b5c5", letterSpacing: "0.08em" }}>
            AKTIEANALYS
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 820 }}>
            <div style={{ display: "flex", color: "#e1cb95", fontSize: 28, fontWeight: 700, marginBottom: 18 }}>
              {ticker}
            </div>
            <div style={{ display: "flex", fontSize: companyName.length > 34 ? 56 : 68, lineHeight: 1.05, fontWeight: 800 }}>
              {companyName}
            </div>
            <div style={{ display: "flex", marginTop: 22, color: "#c9d2df", fontSize: 25 }}>
              Värdering · tillväxt · lönsamhet · risk · källor
            </div>
            {updated ? (
              <div style={{ display: "flex", marginTop: 14, color: "#8190a2", fontSize: 19 }}>Data t.o.m. {updated}</div>
            ) : null}
          </div>

          <div
            style={{
              width: 220,
              minHeight: 190,
              borderRadius: 28,
              border: "2px solid rgba(225,203,149,0.45)",
              background: "rgba(8,24,41,0.78)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", color: "#a8b5c5", fontSize: 19, letterSpacing: "0.06em" }}>StockBox Score</div>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 12, color: "#e1cb95" }}>
              <span style={{ fontSize: 70, fontWeight: 800 }}>{typeof score === "number" ? Math.round(score) : "—"}</span>
              <span style={{ fontSize: 27, marginLeft: 4 }}>/100</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", color: "#7f8b9b", fontSize: 18 }}>
          <span>Verifierbara datakällor · modellbaserad research</span>
          <span>getstockbox.app</span>
        </div>
      </div>
    ),
    size,
  );
}
