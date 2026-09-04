import { RenderSpecSchema, type RenderSpec } from "../lib/growth/render-spec";

export type GrowthCompositionProps = {
  spec: RenderSpec;
  fps: 30;
  width: 1080;
  height: 1920;
  durationInFrames: number;
  voiceAudioSrc?: string;
};

export function toGrowthCompositionProps(input: unknown): GrowthCompositionProps {
  const spec = RenderSpecSchema.parse(input);
  const endMs = Math.max(...spec.scenes.map((scene) => scene.endMs));

  return {
    spec,
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: Math.ceil((endMs / 1000) * 30),
  };
}
