import type { GrowthCompositionProps } from "./render-adapter";
import { CompanyComparison } from "./templates/CompanyComparison";
import { EducationalChecklist } from "./templates/EducationalChecklist";
import { InvestorWarning } from "./templates/InvestorWarning";
import { StockAnalysis } from "./templates/StockAnalysis";
import { StockBoxDemo } from "./templates/StockBoxDemo";

export function GrowthVideo(props: GrowthCompositionProps) {
  switch (props.spec.template) {
    case "educational_checklist":
      return <EducationalChecklist {...props} />;
    case "stock_analysis":
      return <StockAnalysis {...props} />;
    case "investor_warning":
      return <InvestorWarning {...props} />;
    case "stockbox_demo":
      return <StockBoxDemo {...props} />;
    case "company_comparison":
      return <CompanyComparison {...props} />;
    default: {
      const exhaustiveTemplate: never = props.spec.template;
      return exhaustiveTemplate;
    }
  }
}

GrowthVideo.displayName = "GrowthVideo";
