import type { GrowthCompositionProps } from "./render-adapter";
import { selectGrowthTemplate } from "./templates/select-template";

export function GrowthVideo(props: GrowthCompositionProps) {
  const Template = selectGrowthTemplate(props.spec.template);
  return <Template {...props} />;
}

GrowthVideo.displayName = "GrowthVideo";
