import { AbsoluteFill, Sequence } from "remotion";
import type { RenderSpec } from "../../lib/growth/render-spec";

export function SafeSubtitles({ subtitles, fps }: { subtitles: RenderSpec["subtitles"]; fps: number }) {
  return (
    <AbsoluteFill style={{ pointerEvents: "none", justifyContent: "flex-end", padding: "0 70px 180px" }}>
      {subtitles.map((subtitle, index) => {
        const from = Math.floor((subtitle.startMs / 1000) * fps);
        const end = Math.ceil((subtitle.endMs / 1000) * fps);
        return (
          <Sequence key={`${subtitle.startMs}-${index}`} from={from} durationInFrames={Math.max(1, end - from)} layout="none">
            <div
              style={{
                alignSelf: "center",
                maxWidth: 880,
                borderRadius: 18,
                backgroundColor: "rgba(0,0,0,0.72)",
                color: "white",
                padding: "15px 22px",
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: 38,
                fontWeight: 800,
                lineHeight: 1.18,
                textAlign: "center",
              }}
            >
              {subtitle.text}
            </div>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

SafeSubtitles.displayName = "SafeSubtitles";
