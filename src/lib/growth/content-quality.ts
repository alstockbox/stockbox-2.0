export type TopicInput = { topic?: string | null; type?: string | null; company?: string | null; ticker?: string | null };
export type TopicScore = { score: number; eligible: boolean; flags: string[] };
export type DailyCandidate = { id: string; platform: string; contentId: string; qualityScore: number };

export function scoreStockboxTopic(_input: TopicInput): TopicScore {
  return { score: 50, eligible: true, flags: [] };
}

export function selectDailyContent(candidates: DailyCandidate[], _options: { limit: number; minQuality: number }) {
  return candidates;
}

export function isTransientAiStatus(_status: number) {
  return false;
}
