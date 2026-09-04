import { allocateGrowthCandidates } from "./explore-exploit.ts";
import { calculateGrowthScore } from "./growth-score.ts";
import { buildGrowthStoryboard } from "./storyboard.ts";
import { chooseDailyVideoCapacity, evaluateBudget } from "./budget.ts";

export type GrowthDbAdapter = {
  select: (table: string, query?: string) => Promise<any[]>;
  insertIgnore: (table: string, rows: unknown, onConflict: string) => Promise<any[]>;
};

export type TopicQualityResult = { eligible: boolean; score: number; flags?: string[] };
export type TopicScorer = (input: any) => TopicQualityResult;

export type GrowthV3Context = {
  db: GrowthDbAdapter;
  cfg: Record<string, any>;
  now?: Date;
  monthlySpendSek: number;
  scoreTopic: TopicScorer;
  baseUrl?: string;
};

export type FounderEnhancer = (input: {
  contentId: string | null;
  topicKey: string;
  title: string;
  hook: string;
  script: string;
  caption: string;
  cta: string;
}) => Promise<Partial<{ hook: string; script: string; caption: string; cta: string }> | null>;

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function clamp(value: number, low = 0, high = 100) { return Math.max(low, Math.min(high, value)); }
function clean(value: unknown, fallback = "", max = 1600) {
  const text = String(value || "").replace(/\s+/g, " ").trim() || fallback;
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}
function dayISO(date: Date) { return date.toISOString().slice(0, 10); }
function startOfDayISO(date: Date) { const d = new Date(date); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); }
function addDays(date: Date, days: number) { const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d; }
function configBool(value: unknown, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}
function projectedVoiceCost(cfg: Record<string, any>, language: "sv" | "en") {
  const raw = language === "sv" ? cfg.growth_voice_estimated_sek_per_job : cfg.growth_english_voice_estimated_sek_per_job;
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function visitorIdentity(event: any) {
  return event.user_id || event.anonymous_id || event.session_id || event.id || null;
}

export async function aggregateAttributedGrowth(ctx: Pick<GrowthV3Context, "db" | "now">) {
  const now = ctx.now ?? new Date();
  const since = startOfDayISO(addDays(now, -27));
  const events = await ctx.db.select(
    "acq_events",
    `select=id,user_id,anonymous_id,session_id,utm_content,utm_source,event_name,occurred_at&occurred_at=gte.${encodeURIComponent(since)}&is_bot=eq.false&is_internal=eq.false&limit=20000`,
  );
  const identities = new Map<string, Set<string>>();
  for (const event of events || []) {
    const contentId = String(event.utm_content || "").trim();
    const identity = visitorIdentity(event);
    if (!contentId || !identity) continue;
    if (!identities.has(contentId)) identities.set(contentId, new Set());
    identities.get(contentId)!.add(String(identity));
  }
  const byContent: Record<string, number> = {};
  let total = 0;
  for (const [contentId, ids] of identities) { byContent[contentId] = ids.size; total += ids.size; }
  return { since, byContent, totalAttributedQualifiedVisits: total };
}

function normalizeTrafficScore(visits: number, maxVisits: number) {
  if (maxVisits <= 0) return 50;
  return clamp((visits / maxVisits) * 100);
}

export async function enqueueV3Renders(ctx: GrowthV3Context) {
  const now = ctx.now ?? new Date();
  const date = dayISO(now);
  const qualityFloor = n(ctx.cfg.growth_v3_quality_floor, 72);
  const slots = Math.max(1, Math.min(12, Math.floor(n(ctx.cfg.growth_v3_allocation_slots, 6))));
  const shadowMode = configBool(ctx.cfg.growth_render_shadow_mode, configBool(ctx.cfg.growth_v3_shadow_mode, true));
  const ratios = {
    exploit: n(ctx.cfg.growth_allocation_exploit_ratio, .70),
    explore: n(ctx.cfg.growth_allocation_explore_ratio, .20),
    longshot: n(ctx.cfg.growth_allocation_longshot_ratio, .10),
  };

  const [contentRows, attribution, profiles] = await Promise.all([
    ctx.db.select("acq_content", "select=id,title,body,topic,language,cta,utm_url,status,updated_at&campaign_id=eq.auto_growth_v2&status=in.(draft,repurposed)&order=updated_at.desc&limit=36"),
    aggregateAttributedGrowth(ctx),
    ctx.db.select("acq_voice_profiles", "select=id,language,status,updated_at&status=eq.active&language=eq.sv&order=updated_at.desc&limit=1"),
  ]);
  const activeFounderProfileId = profiles?.[0]?.id ?? null;
  const maxVisits = Math.max(0, ...(contentRows || []).map((row: any) => n(attribution.byContent[String(row.id)], 0)));

  const candidates = (contentRows || []).map((row: any) => {
    const gate = ctx.scoreTopic({ topic: row.topic || row.title, type: "evergreen" });
    const qualityScore = n(gate.score);
    const language = row.language === "en" ? "en" as const : "sv" as const;
    const visits = n(attribution.byContent[String(row.id)], 0);
    const cost = projectedVoiceCost(ctx.cfg, language);
    const costEfficiency = cost === null ? undefined : clamp(100 - Math.min(100, cost * 20));
    const growth = calculateGrowthScore({
      qualifiedVisits: normalizeTrafficScore(visits, maxVisits),
      engagement: qualityScore,
      costEfficiency,
    });
    return {
      row,
      gate,
      candidateId: String(row.id),
      topicKey: clean(row.topic || row.title || row.id, String(row.id), 120).toLowerCase(),
      channel: "short_video",
      expectedGrowthScore: growth.score,
      noveltyScore: visits === 0 ? 95 : clamp(82 - visits * 6, 20, 90),
      costSek: cost ?? 9_999,
      projectedCostSek: cost,
      qualityScore,
      language,
      visits,
      growth,
    };
  }).filter((candidate: any) => candidate.gate.eligible && candidate.qualityScore >= qualityFloor);

  const allocated = allocateGrowthCandidates(candidates, Math.min(slots, candidates.length), ratios, date);
  const allocatedById = new Map(allocated.map((item) => [item.candidateId, item]));
  const ordered = [...candidates]
    .filter((candidate) => allocatedById.has(candidate.candidateId))
    .sort((a, b) => {
      if (a.language !== b.language) return a.language === "sv" ? -1 : 1;
      const aa = allocatedById.get(a.candidateId)!;
      const bb = allocatedById.get(b.candidateId)!;
      const bucketOrder = { exploit: 0, explore: 1, longshot: 2 } as const;
      return bucketOrder[aa.bucket] - bucketOrder[bb.bucket] || b.expectedGrowthScore - a.expectedGrowthScore;
    });

  const capacity = chooseDailyVideoCapacity({ monthlySpendSek: ctx.monthlySpendSek, qualityCandidates: ordered.length });
  let projectedSpend = ctx.monthlySpendSek;
  const selected: any[] = [];
  let skippedBudget = 0;
  let englishCount = 0;
  for (const candidate of ordered) {
    if (selected.length >= capacity) break;
    if (candidate.language === "en" && englishCount >= 1) continue;
    const decision = evaluateBudget({
      monthlySpendSek: projectedSpend,
      projectedCostSek: candidate.projectedCostSek,
      optional: candidate.language === "en",
    });
    if (!decision.allowed) { skippedBudget += 1; continue; }
    selected.push({ candidate, decision, allocation: allocatedById.get(candidate.candidateId)! });
    projectedSpend = decision.projectedMonthlySek ?? projectedSpend;
    if (candidate.language === "en") englishCount += 1;
  }

  let created = 0;
  for (const item of selected) {
    const { candidate, allocation } = item;
    const row = candidate.row;
    const template = "educational_checklist" as const;
    const idempotencyKey = `v3:${date}:${row.id}:${template}:${candidate.language}`;
    const renderSpec = buildGrowthStoryboard({
      contentId: String(row.id),
      renderJobId: `pending:${idempotencyKey}`,
      language: candidate.language,
      template,
      title: clean(row.title || row.topic, "Aktieanalys", 220),
      hook: clean(row.title || row.topic, "Tre saker att kontrollera", 500),
      script: clean(row.body || row.title, "Titta på helheten, jämför utvecklingen över tid och sätt siffrorna i sitt sammanhang.", 5_500),
      ctaText: clean(row.cta, "Analysera bolaget i StockBox", 220).replace(/https?:\/\/\S+/g, "").trim() || "Analysera bolaget i StockBox",
      ctaUrl: row.utm_url || `${(ctx.baseUrl || "https://www.getstockbox.app").replace(/\/$/, "")}/`,
      allowGeneratedScene: configBool(ctx.cfg.growth_generative_provider_enabled, false),
      preferredVisualRefs: [],
    });
    const inserted = await ctx.db.insertIgnore("acq_render_jobs", [{
      idempotency_key: idempotencyKey,
      content_id: row.id,
      voice_profile_id: candidate.language === "sv" ? activeFounderProfileId : null,
      state: "queued",
      template,
      language: candidate.language,
      job_kind: "video",
      render_spec: renderSpec,
      metadata: {
        v3_intelligence: true,
        shadow_mode: shadowMode,
        expose_to_ready: !shadowMode,
        allocation_bucket: allocation.bucket,
        expected_growth_score: candidate.expectedGrowthScore,
        attributed_qualified_visits_28d: candidate.visits,
        score_inputs: candidate.growth,
      },
    }], "idempotency_key");
    if (inserted?.length) created += 1;
  }

  return {
    selected: selected.length,
    created,
    shadowMode,
    capacity,
    skippedBudget,
    skippedQuality: Math.max(0, (contentRows || []).length - candidates.length),
    attributedQualifiedVisits28d: attribution.totalAttributedQualifiedVisits,
    allocation: selected.map((item) => ({ contentId: item.candidate.candidateId, bucket: item.allocation.bucket, expectedGrowthScore: item.candidate.expectedGrowthScore })),
  };
}

const FOUNDER_FALLBACK_TOPICS = [
  "hur analyserar man skuldsättning i ett bolag",
  "hur analyserar man lönsamhet i ett bolag",
  "hur hittar man risker i ett börsbolag",
  "hur tolkar man marginaler i ett bolag",
];

function founderFallback(topic: string, title?: string) {
  const resolvedTitle = clean(title || topic, "En snabb aktieanalys", 160);
  return {
    hook: `Det här missar många när de analyserar: ${resolvedTitle}`,
    script: `Här är ett snabbt sätt att tänka kring ${resolvedTitle.toLowerCase()}. Börja med utvecklingen över tid, jämför sedan siffran med bolagets kvalitet och risk och avsluta med att fråga vad som faktiskt skulle kunna ändra din slutsats. Poängen är att få en strukturerad helhetsbild i stället för att fastna i en ensam siffra. StockBox är byggt för att göra den kontrollen snabbare och tydligare.`,
    screenDirections: "Börja 2-3 sekunder mot kameran. Visa sedan StockBox eller ett relevant nyckeltal på skärmen. Avsluta med StockBox och en enkel CTA.",
    caption: `${resolvedTitle} — en snabb checklista för en mer strukturerad aktieanalys.`,
    cta: "Testa analysen själv i StockBox.",
  };
}

export async function generateFounderScriptsV3(ctx: GrowthV3Context, enhance?: FounderEnhancer) {
  const now = ctx.now ?? new Date();
  const date = dayISO(now);
  const max = Math.max(1, Math.min(2, Math.floor(n(ctx.cfg.growth_founder_scripts_per_day, 2))));
  const contents = await ctx.db.select("acq_content", "select=id,title,topic,body,status,updated_at&campaign_id=eq.auto_growth_v2&status=in.(draft,repurposed)&order=updated_at.desc&limit=24");
  const candidates: Array<{ contentId: string | null; topic: string; title: string }> = [];
  for (const row of contents || []) {
    const gate = ctx.scoreTopic({ topic: row.topic || row.title, type: "evergreen" });
    if (!gate.eligible || n(gate.score) < n(ctx.cfg.growth_v3_quality_floor, 72)) continue;
    candidates.push({ contentId: row.id ?? null, topic: clean(row.topic || row.title, "aktieanalys", 160), title: clean(row.title || row.topic, "Aktieanalys", 180) });
    if (candidates.length >= max) break;
  }
  for (const topic of FOUNDER_FALLBACK_TOPICS) {
    if (candidates.length >= max) break;
    const gate = ctx.scoreTopic({ topic, type: "evergreen" });
    if (gate.eligible && n(gate.score) >= n(ctx.cfg.growth_v3_quality_floor, 72)) candidates.push({ contentId: null, topic, title: topic });
  }

  let created = 0, aiEnhanced = 0, deterministic = 0;
  for (const candidate of candidates.slice(0, max)) {
    const base = founderFallback(candidate.topic, candidate.title);
    const topicKey = clean(candidate.topic, candidate.title, 120).toLowerCase();
    let final = base;
    if (enhance) {
      try {
        const enhanced = await enhance({ contentId: candidate.contentId, topicKey, title: candidate.title, ...base });
        if (enhanced) {
          final = {
            ...base,
            hook: clean(enhanced.hook, base.hook, 220),
            script: clean(enhanced.script, base.script, 1800),
            caption: clean(enhanced.caption, base.caption, 800),
            cta: clean(enhanced.cta, base.cta, 220),
          };
          aiEnhanced += 1;
        } else deterministic += 1;
      } catch { deterministic += 1; }
    } else deterministic += 1;

    const key = `founder:v3:${date}:${candidate.contentId || topicKey}`;
    const inserted = await ctx.db.insertIgnore("acq_manual_script_ideas", [{
      idempotency_key: key,
      content_id: candidate.contentId,
      suggested_for_date: date,
      language: "sv",
      hook: final.hook,
      script: final.script,
      screen_directions: final.screenDirections,
      caption: final.caption,
      cta: final.cta,
      recommended_platform: "instagram_reel",
      status: "suggested",
      automatic_render: false,
      expires_at: addDays(now, 3).toISOString(),
      metadata: { v3_intelligence: true, topic_key: topicKey, ai_enhanced: Boolean(enhance && final !== base) },
    }], "idempotency_key");
    if (inserted?.length) created += 1;
  }
  return { created, candidates: candidates.length, aiEnhanced, deterministic };
}

export function describeLearning(input: { byContent: Record<string, number>; minSample: number; labels?: Record<string, string> }) {
  const ranked = Object.entries(input.byContent).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((sum, [, value]) => sum + value, 0);
  if (!ranked.length || total === 0) return { sample: 0, confidence: "none" as const, summary: "Ingen attribuerad contenttrafik ännu; motorn fortsätter samla data och behåller bred exploration." };
  const [winner, visits] = ranked[0];
  const label = input.labels?.[winner] || winner;
  const confidence = total >= input.minSample ? "directional" as const : "low_sample" as const;
  const prefix = confidence === "low_sample" ? "I det lilla datamaterialet" : "I den senaste attribuerade trafiken";
  return { sample: total, confidence, winnerContentId: winner, summary: `${prefix} gav ${label} mest kvalificerad trafik (${visits} besök). Motorn ökar liknande innehåll försiktigt utan att sluta testa andra teman.` };
}
