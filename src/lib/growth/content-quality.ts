export type TopicInput = {
  topic?: string | null;
  type?: string | null;
  company?: string | null;
  ticker?: string | null;
};

export type TopicScore = {
  score: number;
  eligible: boolean;
  flags: string[];
};

export type DailyCandidate = {
  id: string;
  platform: string;
  contentId: string;
  qualityScore: number;
};

const STRONG_STOCK_TERMS = [
  "aktie",
  "börs",
  "börsen",
  "bolag",
  "kvartalsrapport",
  "årsrapport",
  "rapport",
  "resultat",
  "utdelning",
  "värdering",
  "nyckeltal",
  "p/e",
  "roic",
  "kassaflöde",
  "marginal",
  "skuldsättning",
  "omsättning",
  "vinst",
  "investmentbolag",
  "balansräkning",
  "lönsamhet",
  "earnings",
  "revenue",
  "cash flow",
  "valuation",
];

const SUPPORTING_TERMS = [
  "investering",
  "investerare",
  "analys",
  "risk",
  "tillväxt",
  "finans",
  "marknad",
  "sektor",
  "industri",
  "kapital",
];

const PRIVATE_FINANCE_PHRASES = [
  "förskott på arv",
  "bostadsrättsköp",
  "bostadsrätt",
  "bolån",
  "sparkonto",
  "barnbidrag",
  "privatekonomi",
  "familjeekonomi",
  "arv gynna",
];

const CLEARLY_OFF_TOPIC_PHRASES = [
  "farliga batterier dumpas",
  "recept",
  "matlagning",
  "relationstips",
  "semesterresa",
  "bostadsköp",
];

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text: string, terms: string[]) {
  return terms.filter((term) => text.includes(normalize(term)));
}

export function scoreStockboxTopic(input: TopicInput): TopicScore {
  const topic = normalize(input.topic);
  const type = normalize(input.type);
  const company = normalize(input.company);
  const ticker = normalize(input.ticker);
  const flags: string[] = [];

  const privateFinanceHits = containsAny(topic, PRIVATE_FINANCE_PHRASES);
  const offTopicHits = containsAny(topic, CLEARLY_OFF_TOPIC_PHRASES);
  if (privateFinanceHits.length > 0) flags.push("off_topic_private_finance");
  if (offTopicHits.length > 0) flags.push("off_topic_general");

  const strongHits = containsAny(topic, STRONG_STOCK_TERMS);
  const supportingHits = containsAny(topic, SUPPORTING_TERMS);
  const hasEntity = Boolean(company || ticker);
  const evergreen = type === "evergreen";
  const news = type === "news";

  let score = 22;
  score += Math.min(48, strongHits.length * 16);
  score += Math.min(18, supportingHits.length * 6);
  if (hasEntity) score += 22;
  if (evergreen) score += 22;
  if (news && !hasEntity && strongHits.length === 0) score -= 28;
  if (privateFinanceHits.length > 0) score -= 65;
  if (offTopicHits.length > 0) score -= 60;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const eligible =
    score >= 72 &&
    privateFinanceHits.length === 0 &&
    offTopicHits.length === 0 &&
    (!news || hasEntity || strongHits.length > 0);

  if (!eligible && flags.length === 0) flags.push("insufficient_stockbox_relevance");
  if (eligible) flags.push("stockbox_relevant");

  return { score, eligible, flags };
}

export function selectDailyContent(
  candidates: DailyCandidate[],
  options: { limit: number; minQuality: number },
) {
  const limit = Math.max(0, Math.floor(options.limit));
  const minQuality = Number.isFinite(options.minQuality) ? options.minQuality : 72;
  const eligible = candidates
    .filter((item) => item.qualityScore >= minQuality)
    .sort((a, b) => b.qualityScore - a.qualityScore || a.id.localeCompare(b.id));

  const selected: DailyCandidate[] = [];
  const usedPlatforms = new Set<string>();
  const usedIds = new Set<string>();

  for (const item of eligible) {
    if (selected.length >= limit) break;
    if (usedPlatforms.has(item.platform)) continue;
    selected.push(item);
    usedPlatforms.add(item.platform);
    usedIds.add(item.id);
  }

  for (const item of eligible) {
    if (selected.length >= limit) break;
    if (usedIds.has(item.id)) continue;
    selected.push(item);
    usedIds.add(item.id);
  }

  return selected;
}

export function isTransientAiStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
