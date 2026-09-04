import type { GrowthCompositionProps } from "../render-adapter";
import { TemplateLayout } from "./TemplateLayout";

export function InvestorWarning(props: GrowthCompositionProps) {
  return <TemplateLayout {...props} variantLabel="Varningssignal" />;
}

InvestorWarning.displayName = "InvestorWarning";
