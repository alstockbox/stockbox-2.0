import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { GrowthCompositionProps } from "./render-adapter";

export function GrowthVideo({ spec }: GrowthCompositionProps) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#07111f",
        color: "#f8fafc",
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: 72,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          lineHeight: 1.05,
          opacity: interpolate(frame, [0, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [0, 12], [40, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      >
        {spec.hook}
      </div>
      <div
        style={{
          marginTop: 40,
          fontSize: 34,
          lineHeight: 1.35,
          maxWidth: 900,
          opacity: interpolate(frame, [10, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {spec.title}
      </div>
    </AbsoluteFill>
  );
}

GrowthVideo.displayName = "GrowthVideo";
