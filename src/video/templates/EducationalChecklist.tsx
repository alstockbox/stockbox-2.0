import type { GrowthCompositionProps } from "../render-adapter";
import { TemplateLayout } from "./TemplateLayout";

export function EducationalChecklist(props: GrowthCompositionProps) {
  return <TemplateLayout {...props} variantLabel="Checklista" />;
}

EducationalChecklist.displayName = "EducationalChecklist";
