import { AbsoluteFill } from "remotion";

export function StaticGrowthCard({
  headline,
  body,
  cta,
}: {
  headline: string;
  body: string;
  cta: string;
}) {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #07111f 0%, #0c1d33 58%, #102842 100%)",
        color: "#f8fafc",
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: 80,
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 1.6 }}>STOCKBOX</div>
      <div>
        <div style={{ fontSize: 78, lineHeight: 1.03, fontWeight: 900, letterSpacing: -2 }}>{headline}</div>
        <div style={{ marginTop: 34, fontSize: 38, lineHeight: 1.35, color: "#d9e7f7" }}>{body}</div>
      </div>
      <div
        style={{
          borderRadius: 28,
          padding: "28px 34px",
          background: "#e0f2fe",
          color: "#082f49",
          fontSize: 30,
          fontWeight: 900,
        }}
      >
        {cta}
      </div>
    </AbsoluteFill>
  );
}

StaticGrowthCard.displayName = "StaticGrowthCard";
