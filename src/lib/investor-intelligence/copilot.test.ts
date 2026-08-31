import { describe, expect, it } from "vitest";
import { parseCopilotAlertAction, resolveCopilotIntent } from "./copilot";

describe("StockBox Copilot intents",()=>{
  it("recognizes watchlist valuation and thesis questions",()=>{
    expect(resolveCopilotIntent("Which company on my watchlist trades cheapest relative to its 10-year valuation?")).toBe("watchlist_historical_cheapest");
    expect(resolveCopilotIntent("Which companies currently violate my investment thesis?")).toBe("thesis_violations");
  });
  it("parses safe monitoring alert actions",()=>{
    expect(parseCopilotAlertAction("Alert me if MSFT P/E goes below 22")).toMatchObject({ticker:"MSFT",metricKey:"valuation.pe",operator:"below",displayThreshold:22});
  });
});
