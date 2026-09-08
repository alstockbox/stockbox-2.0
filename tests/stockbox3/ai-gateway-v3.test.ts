import { describe, expect, it } from "vitest";
import {
  createStockBoxAiGateway,
  type StockBoxAiProvider,
  type StockBoxAiRequest,
} from "@/lib/ai/stockbox-ai-gateway";

const request: StockBoxAiRequest = {
  task: "decision_summary",
  locale: "en",
  evidence: [
    { id: "score", text: "StockBox score is 82/100." },
    { id: "valuation", text: "Verified valuation upside is 18%." },
  ],
  context: { ticker: "TEST" },
};

function provider(name: string, response: unknown, shouldFail = false): StockBoxAiProvider {
  return {
    name,
    supports: () => true,
    generate: async () => {
      if (shouldFail) throw new Error(`${name} failed`);
      return response;
    },
  };
}

describe("StockBox AI gateway v3", () => {
  it("falls back to the next provider when the preferred provider fails", async () => {
    const gateway = createStockBoxAiGateway([
      provider("primary", null, true),
      provider("backup", {
        summary: "Attractive risk/reward based on verified evidence.",
        why: ["Valuation support is positive."],
        whyNot: ["The model remains uncertain."],
        bullCase: "Upside can expand if execution improves.",
        baseCase: "The current thesis remains intact.",
        bearCase: "The thesis weakens if fundamentals deteriorate.",
        evidenceIds: ["score", "valuation"],
      }),
    ]);

    const result = await gateway.generateDecisionSummary(request);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.provider).toBe("backup");
  });

  it("rejects unsupported evidence references instead of surfacing ungrounded output", async () => {
    const gateway = createStockBoxAiGateway([
      provider("bad", {
        summary: "Unsupported claim.",
        why: [],
        whyNot: [],
        bullCase: "Bull.",
        baseCase: "Base.",
        bearCase: "Bear.",
        evidenceIds: ["invented_fact"],
      }),
    ]);

    const result = await gateway.generateDecisionSummary(request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("all_providers_failed_validation");
  });

  it("fails closed when the provider response does not match the decision schema", async () => {
    const gateway = createStockBoxAiGateway([provider("malformed", { text: "free-form answer" })]);
    const result = await gateway.generateDecisionSummary(request);
    expect(result.ok).toBe(false);
  });
});
