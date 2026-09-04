import { AbsoluteFill, Sequence } from "remotion";
import type { GrowthCompositionProps } from "../render-adapter";
import { GrowthCta } from "../components/GrowthCta";
import { SafeSubtitles } from "../components/SafeSubtitles";
import { StockBoxFrame } from "../components/StockBoxFrame";

export function TemplateLayout({
  spec,
  fps,
  durationInFrames,
  variantLabel,
}: GrowthCompositionProps & { variantLabel: string }) {
  const ctaFrames = Math.min(120, durationInFrames);
  const ctaStart = Math.max(0, durationInFrames - ctaFrames);

  return (
    <AbsoluteFill style={{ backgroundColor: "#06111f" }}>
      {spec.scenes.map((scene) => {
        const from = Math.floor((scene.startMs / 1000) * fps);
        const end = Math.ceil((scene.endMs / 1000) * fps);
        const duration = Math.max(1, end - from);
        return (
          <Sequence key={scene.id} from={from} durationInFrames={duration}>
            <StockBoxFrame
              kind={scene.kind}
              headline={scene.headline}
              body={scene.body}
              visualRef={scene.visualRef}
              fallbackHeadline={scene.fallbackHeadline}
              fallbackBody={scene.fallbackBody}
              variantLabel={variantLabel}
            />
          </Sequence>
        );
      })}
      <SafeSubtitles subtitles={spec.subtitles} fps={fps} />
      <Sequence from={ctaStart} durationInFrames={ctaFrames}>
        <GrowthCta text={spec.cta.text} />
      </Sequence>
    </AbsoluteFill>
  );
}

TemplateLayout.displayName = "TemplateLayout";
