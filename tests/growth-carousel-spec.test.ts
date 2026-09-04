import { describe, expect, it } from "vitest";
import { CarouselSpecSchema } from "../src/lib/growth/carousel-spec";

describe("growth carousel spec", () => {
  it("accepts a complete five-slide StockBox carousel", () => {
    const value = CarouselSpecSchema.parse({
      version: "v3",
      contentId: "content-1",
      title: "Fyra saker att kontrollera i balansräkningen",
      slides: [
        { index: 1, headline: "Börja med skulden", body: "Jämför nettoskuld med kassaflödet.", visualKind: "metric" },
        { index: 2, headline: "Titta på räntan", body: "Dyrare finansiering kan pressa resultatet.", visualKind: "chart" },
        { index: 3, headline: "Kontrollera likviditeten", body: "Kortfristiga skulder måste kunna hanteras.", visualKind: "stockbox_ui" },
        { index: 4, headline: "Se trenden", body: "En nivå säger mindre än utvecklingen över tid.", visualKind: "chart" },
        { index: 5, headline: "Samla analysen", body: "StockBox hjälper dig se helheten.", visualKind: "cta" },
      ],
      caption: "Fyra kontroller som gör balansräkningen enklare.",
      cta: "Analysera bolaget i StockBox",
    });

    expect(value.slides).toHaveLength(5);
  });

  it("rejects empty/incomplete slide sets", () => {
    expect(() =>
      CarouselSpecSchema.parse({
        version: "v3",
        contentId: "x",
        title: "x",
        slides: [],
        caption: "x",
        cta: "x",
      }),
    ).toThrow();
  });

  it("requires continuous indexes starting at one", () => {
    expect(() =>
      CarouselSpecSchema.parse({
        version: "v3",
        contentId: "content-1",
        title: "Balansräkning steg för steg",
        slides: [
          { index: 1, headline: "Börja med skulden", body: "Kontrollera nettoskulden.", visualKind: "metric" },
          { index: 3, headline: "Se trenden över tid", body: "Jämför flera perioder.", visualKind: "chart" },
          { index: 4, headline: "Samla analysen", body: "StockBox hjälper dig se helheten.", visualKind: "cta" },
        ],
        caption: "En enkel checklista.",
        cta: "Analysera bolaget i StockBox",
      }),
    ).toThrow(/index/i);
  });
});
