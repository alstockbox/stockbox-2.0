import type { GrowthCompositionProps } from "../render-adapter";
import { TemplateLayout } from "./TemplateLayout";

export function CompanyComparison(props: GrowthCompositionProps) {
  return <TemplateLayout {...props} variantLabel="Jämförelse" />;
}

CompanyComparison.displayName = "CompanyComparison";
