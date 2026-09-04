import type { GrowthCompositionProps } from "../render-adapter";
import { TemplateLayout } from "./TemplateLayout";

export function StockBoxDemo(props: GrowthCompositionProps) {
  return <TemplateLayout {...props} variantLabel="StockBox-demo" />;
}

StockBoxDemo.displayName = "StockBoxDemo";
