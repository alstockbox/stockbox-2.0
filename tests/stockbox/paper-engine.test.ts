import { describe, expect, it } from "vitest";
import {
  QUANTITY_SCALE,
  applyPaperBuy,
  applyPaperSell,
  averageCostOre,
  tradeValueOre,
  unrealizedPnlOre,
  type PaperPosition
} from "../../src/lib/stockbox/paper-engine";

const share = (count: number) => BigInt(count) * QUANTITY_SCALE;

describe("stockbox paper trading engine", () => {
  it("opens a paper position and reduces cash by trade value plus fee", () => {
    const result = applyPaperBuy(null, {
      symbol: "AAPL",
      quantityMicros: share(10),
      executionPriceOre: 19_000n,
      feeOre: 100n
    });

    expect(result.cashDeltaOre).toBe(-190_100n);
    expect(result.position).toEqual({
      symbol: "AAPL",
      quantityMicros: share(10),
      costBasisOre: 190_100n,
      realizedPnlOre: 0n
    });
    expect(averageCostOre(result.position!)).toBe(19_010n);
  });

  it("adds to an existing position and preserves weighted cost basis", () => {
    const first = applyPaperBuy(null, {
      symbol: "MSFT",
      quantityMicros: share(2),
      executionPriceOre: 30_000n
    }).position;
    const second = applyPaperBuy(first, {
      symbol: "MSFT",
      quantityMicros: share(3),
      executionPriceOre: 40_000n
    });

    expect(second.position?.quantityMicros).toBe(share(5));
    expect(second.position?.costBasisOre).toBe(180_000n);
    expect(averageCostOre(second.position!)).toBe(36_000n);
  });

  it("handles a partial sell with realized P/L and remaining cost basis", () => {
    const position: PaperPosition = {
      symbol: "NVDA",
      quantityMicros: share(10),
      costBasisOre: 1_000_000n,
      realizedPnlOre: 0n
    };
    const result = applyPaperSell(position, {
      quantityMicros: share(4),
      executionPriceOre: 120_000n,
      feeOre: 200n
    });

    expect(result.cashDeltaOre).toBe(479_800n);
    expect(result.relievedCostBasisOre).toBe(400_000n);
    expect(result.realizedPnlDeltaOre).toBe(79_800n);
    expect(result.position).toEqual({
      symbol: "NVDA",
      quantityMicros: share(6),
      costBasisOre: 600_000n,
      realizedPnlOre: 79_800n
    });
  });

  it("closes a position on full sell", () => {
    const position: PaperPosition = {
      symbol: "SHOP",
      quantityMicros: share(5),
      costBasisOre: 250_000n,
      realizedPnlOre: 0n
    };

    const result = applyPaperSell(position, {
      quantityMicros: share(5),
      executionPriceOre: 60_000n
    });

    expect(result.position).toBeNull();
    expect(result.realizedPnlDeltaOre).toBe(50_000n);
  });

  it("rejects overselling and computes unrealized P/L from current price", () => {
    const position: PaperPosition = {
      symbol: "TSLA",
      quantityMicros: share(2),
      costBasisOre: 100_000n,
      realizedPnlOre: 0n
    };

    expect(() => applyPaperSell(position, { quantityMicros: share(3), executionPriceOre: 55_000n })).toThrow(
      "Cannot sell more"
    );
    expect(unrealizedPnlOre(position, 60_000n)).toBe(20_000n);
    expect(tradeValueOre(500_000n, 10_001n)).toBe(5_001n);
  });
});
