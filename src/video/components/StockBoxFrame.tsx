import { AbsoluteFill, OffthreadVideo, interpolate, useCurrentFrame } from "remotion";
import type { SceneKind } from "../../lib/growth/render-spec";

export type StockBoxFrameProps = {
  kind: SceneKind;
  headline?: string;
  body?: string;
  variantLabel: string;
  visualRef?: string;
  fallbackHeadline?: string;
  fallbackBody?: string;
};

export function StockBoxFrame({
  kind,
  headline,
  body,
  variantLabel,
  visualRef,
  fallbackHeadline,
  fallbackBody,
}: StockBoxFrameProps) {
  const frame = useCurrentFrame();

  if (kind === "generated_micro_scene" && visualRef) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#06111f" }}>
        <OffthreadVideo
          src={visualRef}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <AbsoluteFill
          style={{
            background: "linear-gradient(180deg, rgba(6,17,31,0.18), rgba(6,17,31,0.64))",
            padding: "150px 72px 260px",
            justifyContent: "flex-end",
            color: "#f8fafc",
            fontFamily: "Arial, Helvetica, sans-serif",
          }}
        >
          <div style={{ fontSize: 54, fontWeight: 900, lineHeight: 1.05 }}>
            {headline ?? fallbackHeadline ?? "StockBox"}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const resolvedHeadline =
    kind === "generated_micro_scene" ? fallbackHeadline ?? headline : headline;
  const resolvedBody = kind === "generated_micro_scene" ? fallbackBody ?? body : body;

  return (
    <AbsoluteFill
      style={{
        padding: "150px 72px 260px",
        justifyContent: "center",
        background: "linear-gradient(180deg, #06111f 0%, #0b1728 100%)",
        color: "#f8fafc",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: 2.4,
          textTransform: "uppercase",
          opacity: 0.65,
        }}
      >
        StockBox · {variantLabel}
      </div>
      <div
        style={{
          marginTop: 28,
          fontSize: 68,
          fontWeight: 850,
          lineHeight: 1.03,
          maxWidth: 900,
          opacity: interpolate(frame, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [0, 10], [36, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      >
        {resolvedHeadline ?? "Analysera bolaget, inte bara kursen"}
      </div>
      <div
        style={{
          marginTop: 36,
          borderRadius: 28,
          border: "2px solid rgba(255,255,255,0.14)",
          backgroundColor: "rgba(255,255,255,0.06)",
          padding: 34,
          minHeight: 250,
          fontSize: 34,
          lineHeight: 1.35,
        }}
      >
        {resolvedBody ?? (kind === "stockbox_ui" ? "StockBox-vy" : "Datadriven visualisering")}
      </div>
    </AbsoluteFill>
  );
}

StockBoxFrame.displayName = "StockBoxFrame";
