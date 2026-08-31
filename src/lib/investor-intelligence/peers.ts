import { readSnapshotMetric } from "./metrics";
import type { ScreenerCompany } from "./screener";

export type PeerCandidateShape = {
  ticker: string;
  sector: string | null;
  archetype: string | null;
  marketCap: number | null;
  country?: string | null;
  industry?: string | null;
};

function marketCapSimilarity(target: number | null, candidate: number | null) {
  if (!target || !candidate || target <= 0 || candidate <= 0) return 0;
  const ratio = Math.max(target, candidate) / Math.min(target, candidate);
  if (ratio <= 1.5) return 3;
  if (ratio <= 3) return 2;
  if (ratio <= 5) return 1;
  return -2;
}

export function rankPeerCandidates<T extends PeerCandidateShape>(target: PeerCandidateShape, candidates: T[]) {
  return candidates.filter((candidate) => candidate.ticker !== target.ticker).map((candidate) => {
    let score = 0;
    const reasons: string[] = [];
    if (target.industry && candidate.industry && target.industry === candidate.industry) { score += 6; reasons.push("same industry"); }
    if (target.sector && candidate.sector && target.sector === candidate.sector) { score += 4; reasons.push("same sector"); }
    else score -= 5;
    if (target.archetype && candidate.archetype && target.archetype === candidate.archetype) { score += 4; reasons.push("same business archetype"); }
    else if (target.archetype && candidate.archetype) score -= 2;
    const capScore = marketCapSimilarity(target.marketCap, candidate.marketCap);
    score += capScore;
    if (capScore > 0) reasons.push("comparable market cap");
    if (target.country && candidate.country && target.country === candidate.country) { score += 1; reasons.push("same country"); }
    return { ...candidate, score, reasons };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
}

export function selectComparablePeers(target: ScreenerCompany, candidates: ScreenerCompany[], limit = 5) {
  const ranked = rankPeerCandidates(target, candidates);
  const map = new Map(candidates.map((candidate) => [candidate.ticker, candidate]));
  return ranked.slice(0, Math.max(1, Math.min(limit, 10))).map((rankedPeer) => ({ ...map.get(rankedPeer.ticker)!, peerScore: rankedPeer.score, peerReasons: rankedPeer.reasons }));
}

export const PEER_METRICS = [
  { key: "fundamentals.revenueGrowth", label: "Revenue growth", higherIsBetter: true },
  { key: "fundamentals.epsGrowth", label: "EPS growth", higherIsBetter: true },
  { key: "fundamentals.fcfGrowth", label: "FCF growth", higherIsBetter: true },
  { key: "fundamentals.grossMargin", label: "Gross margin", higherIsBetter: true },
  { key: "fundamentals.operatingMargin", label: "Operating margin", higherIsBetter: true },
  { key: "fundamentals.netMargin", label: "Net margin", higherIsBetter: true },
  { key: "fundamentals.roic", label: "ROIC", higherIsBetter: true },
  { key: "fundamentals.roe", label: "ROE", higherIsBetter: true },
  { key: "fundamentals.netDebtToEbitda", label: "Net debt / EBITDA", higherIsBetter: false },
  { key: "valuation.pe", label: "P/E", higherIsBetter: false },
  { key: "valuation.ps", label: "P/S", higherIsBetter: false },
  { key: "valuation.evSales", label: "EV/Sales", higherIsBetter: false },
  { key: "valuation.evEbitda", label: "EV/EBITDA", higherIsBetter: false },
  { key: "valuation.fcfYield", label: "FCF yield", higherIsBetter: true },
  { key: "score", label: "StockBox Score", higherIsBetter: true },
] as const;

function median(values: number[]) {
  const sorted = [...values].sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
}

export function buildPeerComparison(target: ScreenerCompany, peers: ScreenerCompany[]) {
  return PEER_METRICS.map((metric) => {
    const companyValue = readSnapshotMetric(target.snapshot, metric.key);
    const peerValues = peers.map((peer) => ({ ticker: peer.ticker, value: readSnapshotMetric(peer.snapshot, metric.key) })).filter((item): item is { ticker: string; value: number } => item.value !== null);
    const peerMedian = median(peerValues.map((item)=>item.value));
    const peerAverage = peerValues.length ? peerValues.reduce((sum,item)=>sum+item.value,0)/peerValues.length : null;
    const ordered = companyValue === null ? [] : [{ ticker: target.ticker, value: companyValue }, ...peerValues].sort((a,b)=>metric.higherIsBetter ? b.value-a.value : a.value-b.value);
    const rank = companyValue === null ? null : ordered.findIndex((item)=>item.ticker===target.ticker)+1;
    return {
      ...metric,
      companyValue,
      peerMedian,
      peerAverage,
      premiumDiscount: companyValue !== null && peerMedian !== null && peerMedian !== 0 ? companyValue / Math.abs(peerMedian) - Math.sign(peerMedian) : null,
      rank: rank && rank > 0 ? rank : null,
      rankOf: ordered.length || null,
      peerObservationCount: peerValues.length,
    };
  });
}
