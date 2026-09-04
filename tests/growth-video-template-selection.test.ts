import { describe, expect, it } from "vitest";
import { selectGrowthTemplate } from "../src/video/templates/select-template";

describe("growth video template selection", () => {
  it("maps every approved template to one stable StockBox component", () => {
    expect(selectGrowthTemplate("educational_checklist").displayName).toBe("EducationalChecklist");
    expect(selectGrowthTemplate("stock_analysis").displayName).toBe("StockAnalysis");
    expect(selectGrowthTemplate("investor_warning").displayName).toBe("InvestorWarning");
    expect(selectGrowthTemplate("stockbox_demo").displayName).toBe("StockBoxDemo");
    expect(selectGrowthTemplate("company_comparison").displayName).toBe("CompanyComparison");
  });
});
