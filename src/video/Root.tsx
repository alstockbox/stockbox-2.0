import { Composition, type CalculateMetadataFunction } from "remotion";
import { GrowthVideo } from "./GrowthVideo";
import {
  toGrowthCompositionProps,
  type GrowthCompositionProps,
} from "./render-adapter";

const calculateGrowthMetadata: CalculateMetadataFunction<GrowthCompositionProps> = ({ props }) => {
  const derived = toGrowthCompositionProps(props.spec);
  return {
    durationInFrames: derived.durationInFrames,
    fps: derived.fps,
    width: derived.width,
    height: derived.height,
    props: {
      ...derived,
      voiceAudioSrc: props.voiceAudioSrc,
    },
  };
};

export function RemotionRoot() {
  return (
    <Composition
      id="GrowthVideo"
      component={GrowthVideo}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
      calculateMetadata={calculateGrowthMetadata}
      defaultProps={{
        spec: {
          version: "v3",
          contentId: "preview-content",
          renderJobId: "preview-job",
          language: "sv",
          template: "educational_checklist",
          title: "Tre saker att kontrollera innan du köper en aktie",
          hook: "Tre varningssignaler på 30 sekunder",
          script: "Första punkten är skuldsättningen.",
          voiceMode: "educational",
          scenes: [
            {
              id: "preview-scene",
              kind: "stockbox_ui",
              startMs: 0,
              endMs: 30000,
              headline: "Kontrollera risken",
            },
          ],
          subtitles: [],
          cta: {
            text: "Analysera bolaget i StockBox",
            url: "https://www.getstockbox.app/",
          },
        },
        fps: 30,
        width: 1080,
        height: 1920,
        durationInFrames: 900,
      }}
    />
  );
}
