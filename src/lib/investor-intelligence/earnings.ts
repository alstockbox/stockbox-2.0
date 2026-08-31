export type EarningsIntelligenceInput = {
  reportedRevenue: number | null;
  estimatedRevenue: number | null;
  reportedEps: number | null;
  estimatedEps: number | null;
  operatingMargin: number | null;
  priorOperatingMargin: number | null;
  freeCashFlow: number | null;
  priorFreeCashFlow: number | null;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function surprise(reported: number | null, estimated: number | null) {
  if (!finite(reported) || !finite(estimated) || estimated === 0) return null;
  return reported / Math.abs(estimated) - Math.sign(estimated);
}

export function buildEarningsIntelligence(input: EarningsIntelligenceInput) {
  const revenueSurprise = surprise(input.reportedRevenue, input.estimatedRevenue);
  const epsSurprise = surprise(input.reportedEps, input.estimatedEps);
  const operatingMarginChangeBps = finite(input.operatingMargin) && finite(input.priorOperatingMargin)
    ? (input.operatingMargin - input.priorOperatingMargin) * 10_000 : null;
  const freeCashFlowChange = finite(input.freeCashFlow) && finite(input.priorFreeCashFlow) && input.priorFreeCashFlow !== 0
    ? input.freeCashFlow / Math.abs(input.priorFreeCashFlow) - Math.sign(input.priorFreeCashFlow) : null;
  const statements: string[] = [];
  if (revenueSurprise !== null) statements.push(`Revenue was ${(Math.abs(revenueSurprise)*100).toFixed(1)}% ${revenueSurprise >= 0 ? "above" : "below"} the available consensus estimate.`);
  if (epsSurprise !== null) statements.push(`EPS was ${(Math.abs(epsSurprise)*100).toFixed(1)}% ${epsSurprise >= 0 ? "above" : "below"} the available consensus estimate.`);
  if (operatingMarginChangeBps !== null) statements.push(`Operating margin ${operatingMarginChangeBps >= 0 ? "expanded" : "contracted"} by ${Math.round(Math.abs(operatingMarginChangeBps))} bps versus the comparable prior period.`);
  if (freeCashFlowChange !== null) statements.push(`Free cash flow changed ${(freeCashFlowChange*100).toFixed(1)}% versus the comparable prior period.`);
  return { revenueSurprise, epsSurprise, operatingMarginChangeBps, freeCashFlowChange, statements };
}
