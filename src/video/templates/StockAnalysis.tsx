import type { GrowthCompositionProps } from "../render-adapter";
import { TemplateLayout } from "./TemplateLayout";

export function StockAnalysis(props: GrowthCompositionProps) {
  return <TemplateLayout {...props} variantLabel="Bolagsanalys" />;
}

StockAnalysis.displayName = "StockAnalysis";
