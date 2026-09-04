import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export function GrowthCta({ text }: { text: string }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 72,
        backgroundColor: "rgba(5,12,24,0.96)",
        color: "white",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: 3,
          textTransform: "uppercase",
          opacity: 0.65,
        }}
      >
        StockBox
      </div>
      <div
        style={{
          marginTop: 28,
          maxWidth: 900,
          fontSize: 68,
          fontWeight: 900,
          lineHeight: 1.05,
          textAlign: "center",
          opacity: interpolate(frame, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [0, 12], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {text}
      </div>
      <div style={{ marginTop: 38, fontSize: 30, opacity: 0.8 }}>getstockbox.app</div>
    </AbsoluteFill>
  );
}

GrowthCta.displayName = "GrowthCta";
