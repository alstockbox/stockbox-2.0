import { QUANTITY_SCALE, applyPaperBuy, applyPaperSell, unrealizedPnlOre } from "./paper-engine";
import { calculateInvestorScore } from "./investor-score";
import { sampleStockAnalysis } from "./sample-analysis";

const share = (count: number) => BigInt(count) * QUANTITY_SCALE;

const initialCashOre = 500_000_00n;
const firstBuy = applyPaperBuy(null, {
  symbol: sampleStockAnalysis.company.ticker,
  quantityMicros: share(120),
  executionPriceOre: 27_450n,
  feeOre: 900n
});
const addBuy = applyPaperBuy(firstBuy.position, {
  symbol: sampleStockAnalysis.company.ticker,
  quantityMicros: share(40),
  executionPriceOre: 25_800n,
  feeOre: 900n
});
const partialSell = applyPaperSell(addBuy.position!, {
  quantityMicros: share(35),
  executionPriceOre: 30_200n,
  feeOre: 900n
});

const cashOre = initialCashOre + firstBuy.cashDeltaOre + addBuy.cashDeltaOre + partialSell.cashDeltaOre;
const currentPriceOre = 29_650n;
const activePosition = partialSell.position!;
const marketValueOre = (activePosition.quantityMicros * currentPriceOre) / QUANTITY_SCALE;
const unrealizedOre = unrealizedPnlOre(activePosition, currentPriceOre);
const investorScore = calculateInvestorScore({
  thesisClarity: 78,
  riskAwareness: 69,
  valuationDiscipline: 73,
  positionSizing: 75,
  reviewDiscipline: 61,
  learningConsistency: 70,
  outcomeQuality: 66,
  sampleSize: 6
});

export const stockBoxDemo = {
  portfolio: {
    name: "V2 Paper Portfolio",
    currency: "SEK",
    initialCashOre,
    cashOre,
    marketValueOre,
    realizedPnlOre: partialSell.position?.realizedPnlOre ?? 0n,
    unrealizedPnlOre: unrealizedOre,
    totalEquityOre: cashOre + marketValueOre
  },
  positions: [
    {
      symbol: sampleStockAnalysis.company.ticker,
      company: sampleStockAnalysis.company.name,
      quantity: "125",
      entryPriceOre: 26_450n,
      currentPriceOre,
      marketValueOre,
      unrealizedPnlOre: unrealizedOre,
      thesisStatus: "Intakt",
      confidence: 72,
      nextReview: "2026-09-18",
      stockboxScore: sampleStockAnalysis.score.overall,
      thesis: "Kvalitet, marginalstyrka och stark kassakonvertering ska motivera en premiumvärdering även om förväntningsrisken är förhöjd."
    },
    {
      symbol: "INVE B",
      company: "Investor",
      quantity: "80",
      entryPriceOre: 31_200n,
      currentPriceOre: 32_050n,
      marketValueOre: 2_564_00n,
      unrealizedPnlOre: 68_000n,
      thesisStatus: "Behöver review",
      confidence: 64,
      nextReview: "2026-09-06",
      stockboxScore: 74,
      thesis: "Substansrabatt och högkvalitativa onoterade innehav ger asymmetri över tre år."
    }
  ],
  trades: [
    { side: "Sell", symbol: sampleStockAnalysis.company.ticker, quantity: "35", priceOre: 30_200n, date: "2026-09-01", pnlOre: 126_965n },
    { side: "Buy", symbol: sampleStockAnalysis.company.ticker, quantity: "40", priceOre: 25_800n, date: "2026-08-28", pnlOre: null },
    { side: "Buy", symbol: "INVE B", quantity: "80", priceOre: 31_200n, date: "2026-08-24", pnlOre: null }
  ],
  upcomingReviews: [
    { symbol: "INVE B", due: "2026-09-06", reason: "Substansrabatten har minskat, kontrollera om tesen fortfarande har edge." },
    { symbol: sampleStockAnalysis.company.ticker, due: "2026-09-18", reason: "Jämför värderingspremium och marginaltrend mot entry snapshot." }
  ],
  score: {
    processScore: investorScore.processScore ?? 0,
    reliability: investorScore.reliability === "early" ? "Tidigt underlag" : investorScore.reliability,
    sampleSize: 6,
    focus: investorScore.explanation[1],
    dimensions: [
      { label: "Thesis clarity", value: investorScore.dimensions.thesisClarity },
      { label: "Risk awareness", value: investorScore.dimensions.riskAwareness },
      { label: "Valuation discipline", value: investorScore.dimensions.valuationDiscipline },
      { label: "Review discipline", value: investorScore.dimensions.reviewDiscipline }
    ]
  }
};
