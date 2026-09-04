import { Still } from "remotion";
import { CarouselSlide } from "./CarouselSlide";
import { StaticGrowthCard } from "./StaticGrowthCard";

const defaultSlide = {
  index: 1,
  headline: "Analysera bolaget",
  body: "Se de viktigaste delarna i StockBox.",
  visualKind: "stockbox_ui" as const,
};

export function CarouselRoot() {
  return (
    <>
      <Still
        id="GrowthCarouselSlide"
        component={CarouselSlide}
        width={1080}
        height={1350}
        defaultProps={{ slide: defaultSlide, title: "StockBox", totalSlides: 3 }}
      />
      <Still
        id="GrowthStaticCard"
        component={StaticGrowthCard}
        width={1080}
        height={1350}
        defaultProps={{
          headline: "Analysera smartare",
          body: "StockBox samlar analysen på ett ställe.",
          cta: "Analysera i StockBox",
        }}
      />
    </>
  );
}
