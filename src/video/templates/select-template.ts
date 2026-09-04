import type { ComponentType } from "react";
import type { RenderTemplate } from "../../lib/growth/render-spec";
import type { GrowthCompositionProps } from "../render-adapter";
import { CompanyComparison } from "./CompanyComparison";
import { EducationalChecklist } from "./EducationalChecklist";
import { InvestorWarning } from "./InvestorWarning";
import { StockAnalysis } from "./StockAnalysis";
import { StockBoxDemo } from "./StockBoxDemo";

const TEMPLATES: Record<RenderTemplate, ComponentType<GrowthCompositionProps>> = {
  educational_checklist: EducationalChecklist,
  stock_analysis: StockAnalysis,
  investor_warning: InvestorWarning,
  stockbox_demo: StockBoxDemo,
  company_comparison: CompanyComparison,
};

export function selectGrowthTemplate(template: RenderTemplate) {
  return TEMPLATES[template];
}
