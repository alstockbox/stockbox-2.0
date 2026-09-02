import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = () => readFileSync("src/app/aktier/[slug]/page.tsx", "utf8");

describe("public stock answerability for search and AI retrieval", () => {
  it("targets company plus stock intent in the document title", () => {
    expect(page()).toContain('aktie – analys, värdering & StockBox Score');
  });

  it("exposes a concise factual answer block from the published snapshot", () => {
    const source = page();
    expect(source).toContain("Snabbfakta om");
    expect(source).toContain("Analysdatum");
    expect(source).toContain("Största styrka");
    expect(source).toContain("Viktigaste risk");
    expect(source).toContain("Ingen explicit styrka i snapshoten");
    expect(source).toContain("Ingen explicit risk i snapshoten");
  });

  it("links the Article entity to the route-specific social preview image", () => {
    const source = page();
    expect(source).toContain('image: `${url}/opengraph-image`');
  });
});
