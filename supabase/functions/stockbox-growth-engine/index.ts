// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isTransientAiStatus, scoreStockboxTopic, selectDailyContent } from "./quality.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const baseHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...baseHeaders, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body: any = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!res.ok) throw new Error(`DB ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

const select = (table: string, query = "") => rest(`${table}?${query}`, { method: "GET" });
const insert = (table: string, rows: unknown, prefer = "return=representation") => rest(table, { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(rows) });
const insertIgnore = (table: string, rows: unknown, onConflict: string) => rest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(rows) });
const upsert = (table: string, rows: unknown, onConflict: string) => rest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) });
const update = (table: string, filters: string, patch: unknown) => rest(`${table}?${filters}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });

function n(value: unknown, fallback = 0) { const x = Number(value); return Number.isFinite(x) ? x : fallback; }
function clamp(value: number, low = 0, high = 100) { return Math.max(low, Math.min(high, value)); }
function compact(value: unknown, max = 280) { const text = String(value || "").replace(/\s+/g, " ").trim(); return text.length <= max ? text : `${text.slice(0, max - 1)}…`; }
function slug(value: unknown) { return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90); }
function dayISO(date = new Date()) { return date.toISOString().slice(0, 10); }
function startOfDayISO(date = new Date()) { const d = new Date(date); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); }
function addDays(date: Date, days: number) { const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d; }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function stripTags(value: string) { return String(value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(); }

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function hashText(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function parseRss(xml: string) {
  const items: any[] = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = re.exec(xml)) && items.length < 30) {
    const block = match[1];
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      if (!m) return "";
      return stripTags(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
    };
    const title = get("title"), link = get("link"), pubDate = get("pubDate"), source = get("source");
    if (title && link) items.push({ title, link, pubDate, source });
  }
  return items;
}

async function loadConfig() {
  const rows = await select("acq_config", "select=key,value,value_type");
  const cfg: Record<string, any> = {};
  for (const row of rows || []) {
    let value: any = row.value;
    if (row.value_type === "number") value = Number(value);
    else if (row.value_type === "json") { try { value = JSON.parse(value); } catch {} }
    else if (row.value_type === "csv") value = String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
    cfg[row.key] = value;
  }
  return cfg;
}

async function logError(source: string, errorType: string, message: unknown, context: Record<string, unknown> = {}) {
  try { await insert("acq_errors", [{ source, error_type: errorType, message: String(message).slice(0, 4000), context }], "return=minimal"); } catch {}
}

async function logRun(workflow: string, status: string, recordsProcessed = 0, errors = 0, detail: Record<string, unknown> = {}) {
  try { await insert("acq_workflow_runs", [{ workflow, status, records_processed: recordsProcessed, errors, detail }], "return=minimal"); } catch {}
}

const EVERGREEN = [
  ["hur analyserar man en aktie", "beginner"],
  ["vad är p/e-tal och när blir det missvisande", "beginner"],
  ["vad är roic och varför är det viktigt", "education"],
  ["hur läser man en årsrapport", "beginner"],
  ["hur värderar man ett bolag", "education"],
  ["vad är fritt kassaflöde", "education"],
  ["hur jämför man två aktier", "education"],
  ["vanliga misstag vid aktieanalys", "beginner"],
  ["hur analyserar man skuldsättning i ett bolag", "education"],
  ["hur analyserar man lönsamhet i ett bolag", "education"],
  ["hur hittar man risker i ett börsbolag", "education"],
  ["checklista före aktieköp", "beginner"],
  ["hur bedömer man kvaliteten i ett bolags tillväxt", "education"],
  ["hur analyserar man utdelningens hållbarhet", "education"],
  ["hur tolkar man marginaler i ett bolag", "education"],
  ["hur analyserar man balansräkningen", "education"],
];

async function discover(cfg: Record<string, any>) {
  const discovered: any[] = [];
  const currentWeek = weekKey();
  for (const [topic, audience] of EVERGREEN) {
    discovered.push({
      dedupe_key: `v2:evergreen:${currentWeek}:${slug(topic)}`,
      type: "evergreen",
      topic,
      market: "SE",
      language: "sv",
      audience,
      source_feed: "stockbox_evergreen_v2",
      status: "discovered",
    });
  }

  const queries = Array.isArray(cfg.engine_news_queries)
    ? cfg.engine_news_queries
    : ["aktie börs rapport Sverige", "börsbolag kvartalsrapport Sverige", "aktie vinstvarning Sverige"];

  let rssUnavailable = false;
  let acceptedNews = 0;
  for (const query of queries.slice(0, 4)) {
    if (rssUnavailable) break;
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=sv&gl=SE&ceid=SE:sv`;
      const response = await fetch(url, { headers: { "User-Agent": "StockBoxGrowth/2.0" } });
      if (!response.ok) {
        if (response.status === 503 || response.status === 429) rssUnavailable = true;
        throw new Error(`RSS ${response.status}`);
      }
      const xml = await response.text();
      for (const item of parseRss(xml).slice(0, 12)) {
        const quality = scoreStockboxTopic({ topic: item.title, type: "news" });
        if (!quality.eligible) continue;
        discovered.push({
          dedupe_key: `v2:news:${await hashText(item.title + "|" + item.link)}`,
          type: "news",
          topic: item.title,
          market: "SE",
          language: "sv",
          audience: "time_poor_investors",
          source_url: item.link,
          source_feed: item.source || `google_news:${query}`,
          status: "discovered",
          score_breakdown: { source_query: query, pub_date: item.pubDate || null, quality_gate: quality },
        });
        acceptedNews++;
      }
    } catch (error) {
      await logError("SB-10-edge-v2", "rss_discovery", error?.message || error, { query, circuit_open: rssUnavailable });
    }
  }

  if (discovered.length) await insertIgnore("acq_opportunities", discovered, "dedupe_key");
  await logRun("SB-10-edge-v2", "success", discovered.length, 0, { evergreen: EVERGREEN.length, accepted_news: acceptedNews, rss_circuit_open: rssUnavailable });
  return { discovered_candidates: discovered.length, evergreen: EVERGREEN.length, accepted_news: acceptedNews, rss_circuit_open: rssUnavailable };
}

function scoreOpportunity(row: any) {
  const quality = scoreStockboxTopic(row);
  if (!quality.eligible) return { ...quality, priority_score: 0, status: "rejected" };
  const ageHours = Math.max(0, (Date.now() - new Date(row.created_at || Date.now()).getTime()) / 3600000);
  const freshness = row.type === "news" ? clamp(100 - ageHours * 2.5, 20, 100) : 76;
  const traffic = clamp(quality.score * 0.72 + (/hur|vad|checklista|vanliga/.test(String(row.topic || "").toLowerCase()) ? 20 : 8));
  const competition = row.type === "news" ? 58 : 40;
  const priority = clamp(quality.score * 0.52 + freshness * 0.18 + traffic * 0.24 + (100 - competition) * 0.06);
  return {
    stockbox_relevance: quality.score,
    freshness: Math.round(freshness),
    traffic_potential: Math.round(traffic),
    competition_proxy: competition,
    estimated_effort: row.type === "news" ? 34 : 24,
    priority_score: Math.round(priority),
    score_breakdown: { quality_gate: quality, weights: { relevance: .52, freshness: .18, traffic: .24, competition: .06 } },
    status: "scored",
  };
}

async function scoreAndSelect(cfg: Record<string, any>) {
  const discovered = await select("acq_opportunities", "select=*&status=eq.discovered&dedupe_key=like.v2*&order=created_at.desc&limit=160");
  let scored = 0, rejected = 0;
  for (const row of discovered || []) {
    const result = scoreOpportunity(row);
    const status = result.status;
    const patch = { ...result, status, updated_at: new Date().toISOString() };
    delete patch.eligible;
    delete patch.flags;
    await update("acq_opportunities", `id=eq.${encodeURIComponent(row.id)}`, patch);
    if (status === "scored") scored++; else rejected++;
  }

  const limit = n(cfg.engine_daily_content_limit, 6);
  const selectedExisting = await select("acq_opportunities", "select=id&status=eq.selected&dedupe_key=like.v2*&limit=100");
  const need = Math.max(0, limit - (selectedExisting || []).length);
  let selected = 0;
  if (need > 0) {
    const floor = n(cfg.priority_threshold, 60);
    const candidates = await select("acq_opportunities", `select=*&status=eq.scored&dedupe_key=like.v2*&priority_score=gte.${floor}&order=priority_score.desc&limit=100`);
    const picks = (candidates || []).slice(0, need);
    for (const row of picks) {
      await update("acq_opportunities", `id=eq.${encodeURIComponent(row.id)}`, { status: "selected", channel_fit: "quality_v2", updated_at: new Date().toISOString() });
      selected++;
    }
  }
  await logRun("SB-11/12-edge-v2", "success", scored + rejected + selected, 0, { scored, rejected, selected });
  return { scored, rejected, selected, selected_backlog: (selectedExisting || []).length + selected };
}

async function monthAiSpend() {
  const d = new Date(); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0);
  const rows = await select("acq_ai_usage", `select=estimated_cost_sek&created_at=gte.${encodeURIComponent(d.toISOString())}`);
  return (rows || []).reduce((sum: number, row: any) => sum + n(row.estimated_cost_sek), 0);
}

async function logAiUsage(data: any) {
  try {
    await insertIgnore("acq_ai_usage", [{
      idempotency_key: data.idempotencyKey,
      workflow: "stockbox-growth-engine-v2",
      task_type: data.taskType,
      provider: data.provider,
      model: data.model,
      input_tokens: data.inputTokens || 0,
      output_tokens: data.outputTokens || 0,
      total_tokens: (data.inputTokens || 0) + (data.outputTokens || 0),
      estimated_cost_sek: data.costSek || 0,
      estimated_cost: data.costSek || 0,
      priority: data.priority || 0,
      tier: data.tier || "free",
      budget_tier: data.tier || "free",
      route_reason: data.reason || "",
      content_id: data.contentId || null,
      metadata: data.metadata || {},
    }], "idempotency_key");
  } catch {}
}

async function geminiGenerate(prompt: string, cfg: Record<string, any>, meta: any) {
  if (!GEMINI_API_KEY) return null;
  const model = cfg.gemini_model || "gemini-3.5-flash-lite";
  const attempts = Math.max(1, Math.min(4, n(cfg.gemini_retry_attempts, 3)));
  let lastError = "unknown";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: .48, responseMimeType: "application/json" } }),
      });
      const body = await response.json();
      if (!response.ok) {
        lastError = `Gemini ${response.status}: ${JSON.stringify(body).slice(0, 900)}`;
        if (attempt < attempts && isTransientAiStatus(response.status)) {
          await sleep([700, 1700, 3400][attempt - 1] || 3400);
          continue;
        }
        throw new Error(lastError);
      }
      const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
      const usage = body?.usageMetadata || {};
      await logAiUsage({ ...meta, provider: "gemini", model, inputTokens: n(usage.promptTokenCount), outputTokens: n(usage.candidatesTokenCount), costSek: 0, tier: "free", reason: attempt > 1 ? `gemini_retry_success_${attempt}` : "gemini_primary" });
      return { text, provider: "gemini", model, attempts: attempt };
    } catch (error) {
      lastError = error?.message || String(error);
      if (attempt >= attempts) break;
    }
  }
  await logError("SB-AI-edge-v2", "gemini_failure", lastError, { taskType: meta.taskType, priority: meta.priority, attempts });
  return null;
}

async function openAiGenerate(prompt: string, cfg: Record<string, any>, meta: any) {
  if (!OPENAI_API_KEY) return null;
  const spend = await monthAiSpend();
  const hard = n(cfg.ai_hard_internal_limit_sek, 50), soft = n(cfg.ai_soft_limit_sek, 40), emergency = n(cfg.ai_emergency_limit_sek, 48);
  const threshold = spend >= emergency ? 95 : spend >= soft ? 82 : 74;
  if (spend >= hard || n(meta.priority) < threshold) return null;
  try {
    const model = cfg.openai_model || "gpt-5.4-nano";
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` }, body: JSON.stringify({ model, input: prompt, max_output_tokens: 900 }) });
    const body = await response.json();
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${JSON.stringify(body).slice(0, 900)}`);
    const text = body.output_text || body?.output?.flatMap((x: any) => x.content || []).map((x: any) => x.text || "").join("") || "";
    const inputTokens = n(body?.usage?.input_tokens), outputTokens = n(body?.usage?.output_tokens);
    const costSek = (inputTokens / 1e6) * n(cfg.openai_input_sek_per_million, 2) + (outputTokens / 1e6) * n(cfg.openai_output_sek_per_million, 12);
    await logAiUsage({ ...meta, provider: "openai", model, inputTokens, outputTokens, costSek, tier: spend >= soft ? "restricted" : "normal", reason: "premium_fallback" });
    return { text, provider: "openai", model, attempts: 1 };
  } catch (error) {
    await logError("SB-AI-edge-v2", "openai_failure", error?.message || error, { taskType: meta.taskType, priority: meta.priority });
    return null;
  }
}

function parseJsonText(text: string) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function fallbackMaster(opp: any, baseUrl: string) {
  const topic = compact(opp.topic || "aktieanalys", 160);
  const lower = topic.toLowerCase();
  let title = `Så analyserar du ${topic}`;
  let body = "Börja med att formulera vad du faktiskt behöver förstå. Titta sedan på affärsmodell, lönsamhet, tillväxt, balansräkning, kassaflöde, värdering och risker. Poängen är inte att samla flest siffror, utan att koppla siffrorna till hur bolaget tjänar pengar och vilka antaganden som måste hålla. Jämför gärna flera år och relevanta konkurrenter innan du drar slutsatser. StockBox hjälper dig att samla analysen i ett mer strukturerat flöde.";
  if (lower.includes("skuld")) {
    title = "Skuldsättning: fyra saker att kontrollera";
    body = "När du granskar skuldsättning, börja med nettoskulden och sätt den i relation till bolagets intjäning och kassaflöde. Titta därefter på räntetäckning, skuldens förfallostruktur och om bolaget brukar finansiera tillväxt med ny skuld. En hög skuld är inte automatiskt dålig, men den blir farligare när kassaflödet är svagt eller räntorna stiger. Jämför också med liknande bolag i samma sektor. StockBox kan hjälpa dig att få dessa delar samlade i en analys.";
  } else if (lower.includes("lönsam") || lower.includes("roic") || lower.includes("marginal")) {
    title = "Lönsamhet: titta längre än vinstmarginalen";
    body = "Lönsamhet handlar inte bara om hur stor vinsten är. Titta på rörelsemarginal, avkastning på investerat kapital och hur stabila marginalerna är över tid. Försök också förstå om förbättringar kommer från en starkare affär eller bara tillfälliga kostnadsbesparingar. Ett kvalitetsbolag kan ofta återinvestera kapital med god avkastning under lång tid. Jämför därför flera år och relevanta konkurrenter. StockBox hjälper dig att strukturera jämförelsen.";
  } else if (lower.includes("p/e")) {
    title = "P/E-tal: när ett lågt tal kan lura dig";
    body = "P/E visar priset i relation till vinsten, men talet säger inte om vinsten är hållbar. Kontrollera om resultatet är ovanligt högt eller lågt, om bolaget är cykliskt och om skuldsättningen påverkar riskbilden. Jämför också värderingen med bolagets egen historik och med relevanta konkurrenter. Ett lågt P/E kan vara billigt, men det kan också spegla en vinst som marknaden tror ska falla. StockBox hjälper dig att sätta nyckeltalet i ett större sammanhang.";
  } else if (lower.includes("kassaflöde")) {
    title = "Fritt kassaflöde: vad blir faktiskt kvar?";
    body = "Fritt kassaflöde visar hur mycket pengar som återstår efter den löpande verksamheten och nödvändiga investeringar. Jämför kassaflödet med redovisad vinst och undersök varför de skiljer sig åt. Titta också på hur stabilt kassaflödet är över flera år och hur bolaget använder pengarna: återinvesteringar, skuld, utdelning eller återköp. StockBox hjälper dig att se kassaflödet tillsammans med resten av analysen.";
  } else if (lower.includes("jämför")) {
    title = "Jämför två aktier utan att fastna i hundra nyckeltal";
    body = "Börja med att jämföra samma fem områden för båda bolagen: tillväxt, lönsamhet, balansräkning, värdering och risk. Lägg sedan till sektorspecifika nyckeltal där de faktiskt behövs. Viktigast är att förstå varför bolagen skiljer sig åt, inte bara vilket som har högst eller lägst siffra. En strukturerad jämförelse gör det lättare att se vilka antaganden du egentligen betalar för. StockBox är byggt för just den typen av överblick.";
  } else if (lower.includes("utdelning")) {
    title = "Utdelning: bedöm hållbarheten, inte bara direktavkastningen";
    body = "En hög direktavkastning är inte automatiskt attraktiv. Kontrollera utdelningshistorik, utdelningsandel, kassaflöde, skuldsättning och om bolagets vinst är stabil nog att bära utdelningen även under svagare år. Titta också på kapitalbehovet i verksamheten. En utdelning är starkast när den finansieras av ett hållbart kassaflöde och inte av ökad skuld. StockBox hjälper dig att samla de här delarna i samma analys.";
  }
  return { title, body, cta: `Analysera själv i StockBox: ${baseUrl}`, hook_type: "decision_clarity", pillar: "education" };
}

async function aiGenerateMaster(opp: any, cfg: Record<string, any>, baseUrl: string) {
  const prompt = `Du skriver högkvalitativt svenskt content för StockBox, en aktieanalysplattform. Ämnet måste vara tydligt relevant för aktieanalys och aldrig glida över till allmän privatekonomi. Ge inga köp/sälj-råd, lova ingen avkastning och hitta inte på siffror. Skriv konkret och användbart för en investerare med ont om tid.\n\nÄmne: ${opp.topic || ""}\nTyp: ${opp.type || ""}\nBolag: ${opp.company || ""}\nTicker: ${opp.ticker || ""}\n\nReturnera ENDAST JSON med title, body, cta, hook_type, pillar. Body ska vara cirka 110-180 ord, innehålla konkreta saker att kontrollera och leda naturligt till StockBox. CTA ska peka till ${baseUrl}.`;
  const meta = { taskType: "content_draft", priority: n(opp.priority_score, 50), idempotencyKey: `v2:master:${opp.id}` };
  return (await geminiGenerate(prompt, cfg, meta)) || (await openAiGenerate(prompt, cfg, meta));
}

async function generateContent(cfg: Record<string, any>) {
  const limit = n(cfg.engine_daily_content_limit, 6), baseUrl = cfg.base_url || "https://www.getstockbox.app";
  const selectedRows = await select("acq_opportunities", `select=*&status=eq.selected&dedupe_key=like.v2*&order=priority_score.desc&limit=${limit}`);
  let created = 0, ai = 0, deterministic = 0, skipped = 0;
  for (const opp of selectedRows || []) {
    const gate = scoreStockboxTopic(opp);
    if (!gate.eligible) {
      await update("acq_opportunities", `id=eq.${encodeURIComponent(opp.id)}`, { status: "rejected", updated_at: new Date().toISOString() });
      skipped++;
      continue;
    }
    const dedupe = `master:v2:${opp.id}`;
    const existing = await select("acq_content", `select=id&dedupe_key=eq.${encodeURIComponent(dedupe)}&limit=1`);
    if (existing?.length) {
      await update("acq_opportunities", `id=eq.${encodeURIComponent(opp.id)}`, { status: "produced", updated_at: new Date().toISOString() });
      continue;
    }
    const fallback = fallbackMaster(opp, baseUrl);
    const result = await aiGenerateMaster(opp, cfg, baseUrl);
    const parsed = parseJsonText(result?.text || "");
    const master = parsed?.title && parsed?.body
      ? { title: compact(parsed.title, 180), body: String(parsed.body).slice(0, 5000), cta: compact(parsed.cta || fallback.cta, 400), hook_type: compact(parsed.hook_type || fallback.hook_type, 80), pillar: compact(parsed.pillar || fallback.pillar, 80) }
      : fallback;
    if (parsed?.title && parsed?.body) ai++; else deterministic++;
    const utm = `${baseUrl.replace(/\/$/, "")}/?utm_source=stockbox_growth&utm_medium=organic&utm_campaign=auto_growth_v2&utm_content=${encodeURIComponent(opp.id)}`;
    await insertIgnore("acq_content", [{
      dedupe_key: dedupe,
      opportunity_id: opp.id,
      campaign_id: "auto_growth_v2",
      platform: "master",
      topic: opp.topic,
      ticker: opp.ticker,
      company: opp.company,
      audience: opp.audience || "time_poor_investors",
      hook_type: master.hook_type,
      format: "master",
      cta: master.cta,
      language: opp.language || "sv",
      pillar: master.pillar,
      title: master.title,
      body: master.body,
      utm_url: utm,
      status: "draft",
      updated_at: new Date().toISOString(),
    }], "dedupe_key");
    await update("acq_opportunities", `id=eq.${encodeURIComponent(opp.id)}`, { status: "produced", updated_at: new Date().toISOString() });
    created++;
  }
  await logRun("SB-13-edge-v2", "success", created + skipped, 0, { ai, deterministic, skipped });
  return { created, ai_generated: ai, deterministic_fallback: deterministic, skipped_irrelevant: skipped };
}

function sentenceParts(body: string) {
  const parts = String(body || "").split(/(?<=[.!?])\s+/).map((x) => compact(x, 170)).filter((x) => x.length > 25);
  return parts.length ? parts : [compact(body, 170)];
}

function platformVariant(content: any, platform: string, baseUrl: string) {
  const title = compact(content.title || content.topic || "Aktieanalys", 100);
  const body = String(content.body || "").trim();
  const parts = sentenceParts(body);
  const link = `${baseUrl.replace(/\/$/, "")}/?utm_source=${encodeURIComponent(platform)}&utm_medium=organic_social&utm_campaign=auto_growth_v2&utm_content=${encodeURIComponent(content.id)}`;
  const cta = `Testa StockBox: ${link}`;
  const hook = platform === "linkedin" ? `Ett snabbare sätt att förstå: ${title}` : title;
  const slides = [title, parts[0] || title, parts[1] || "Titta på flera år, inte bara senaste kvartalet.", parts[2] || "Jämför med relevanta konkurrenter.", parts[3] || "Koppla nyckeltalen till affärsmodellen.", "Samla analysen på ett ställe med StockBox."];
  const scenes = ["0-3s: Visa hooken stort på skärmen.", "3-12s: Visa StockBox-sök eller analyssida medan första poängen läses.", "12-28s: Byt mellan 2-3 nyckelpoänger med text-overlay.", "Sista 3-5s: Visa StockBox + tydlig CTA."];
  const voiceover = compact(`${hook}. ${body} ${cta}`, 950);
  let caption = `${hook}\n\n${compact(body, platform === "linkedin" || platform === "facebook" ? 850 : 520)}\n\n${cta}`;
  let script = "";
  let assetKind = "social_card";
  let mediaInstructions = "Färdig StockBox-bild kan öppnas direkt från Growth Control Center.";
  if (["tiktok", "instagram_reel", "youtube_short"].includes(platform)) {
    assetKind = "video_kit";
    script = voiceover;
    caption = platform === "tiktok" ? `${hook} #aktier #börsen #aktieanalys ${cta}` : `${hook}\n\n${cta}`;
    mediaInstructions = `FÄRDIGT VIDEO-KIT\nVoiceover: ${voiceover}\nScener:\n${scenes.join("\n")}\nCover-bild finns i Growth Control Center.`;
  } else if (platform === "instagram_carousel") {
    assetKind = "carousel_kit";
    mediaInstructions = `FÄRDIG CAROUSEL-TEXT\n${slides.map((slide, i) => `Slide ${i + 1}: ${slide}`).join("\n")}\nFörsta bilden kan öppnas som färdig StockBox-bild i Growth Control Center.`;
  }
  const topicQuality = scoreStockboxTopic({ topic: content.topic, type: "evergreen", company: content.company, ticker: content.ticker });
  let qualityScore = clamp(topicQuality.score + (body.length >= 350 ? 8 : 3) + (link.includes("utm_") ? 4 : 0));
  const flags = [...topicQuality.flags, "complete_copy", "tracked_utm"];
  if (/garanterad avkastning|säker vinst|köp nu|sälj nu/i.test(`${caption} ${script}`)) { qualityScore -= 35; flags.push("unsafe_financial_claim"); }
  return {
    hook, caption, script, media_instructions: mediaInstructions, cta, utm_url: link,
    recommended_time: "18:30 Europe/Stockholm",
    quality_score: Math.round(clamp(qualityScore)), quality_flags: flags,
    asset_kind: assetKind,
    asset_copy: { headline: title, bullets: parts.slice(0, 4), slides, scenes, voiceover, cta },
  };
}

async function repurpose(cfg: Record<string, any>) {
  const baseUrl = cfg.base_url || "https://www.getstockbox.app";
  const platforms = Array.isArray(cfg.engine_platforms) ? cfg.engine_platforms : ["tiktok", "instagram_reel", "instagram_carousel", "youtube_short", "linkedin", "facebook"];
  const queueLimit = n(cfg.engine_daily_queue_limit, 6), minQuality = n(cfg.engine_min_quality_score, 72), version = String(cfg.engine_content_version || "v2");
  const currentPending = await select("acq_distribution_queue", `select=id&status=eq.pending_approval&generation_version=eq.${encodeURIComponent(version)}&limit=100`);
  const remaining = Math.max(0, queueLimit - (currentPending || []).length);
  const masters = await select("acq_content", "select=*&campaign_id=eq.auto_growth_v2&platform=eq.master&status=in.(draft,repurposed)&order=created_at.desc&limit=18");
  const candidates: any[] = [];
  let variantsCreated = 0;

  for (const content of masters || []) {
    const gate = scoreStockboxTopic({ topic: content.topic, type: "evergreen", company: content.company, ticker: content.ticker });
    if (!gate.eligible) continue;
    for (const platform of platforms) {
      const variant = platformVariant(content, platform, baseUrl);
      const vkey = `variant:v2:${content.id}:${platform}`;
      let existing = await select("acq_content_variants", `select=id&dedupe_key=eq.${encodeURIComponent(vkey)}&limit=1`);
      let variantId = existing?.[0]?.id;
      if (!variantId) {
        const inserted = await insertIgnore("acq_content_variants", [{ dedupe_key: vkey, content_id: content.id, platform, hook: variant.hook, caption: variant.caption, script: variant.script, media_instructions: variant.media_instructions, cta: variant.cta, utm_url: variant.utm_url, recommended_time: variant.recommended_time, status: "ready" }], "dedupe_key");
        variantId = inserted?.[0]?.id;
        if (variantId) variantsCreated++;
      }
      if (!variantId) continue;
      const qkey = `queue:v2:${content.id}:${platform}`;
      const queueExisting = await select("acq_distribution_queue", `select=id&dedupe_key=eq.${encodeURIComponent(qkey)}&limit=1`);
      if (queueExisting?.length) continue;
      candidates.push({
        id: variantId,
        platform,
        contentId: content.id,
        qualityScore: variant.quality_score,
        qkey,
        variant,
      });
    }
    await update("acq_content", `id=eq.${encodeURIComponent(content.id)}`, { status: "repurposed", updated_at: new Date().toISOString() });
  }

  const picks = remaining > 0 ? selectDailyContent(candidates, { limit: remaining, minQuality }) : [];
  const pickedIds = new Map(picks.map((item: any, index: number) => [item.id, index + 1 + (currentPending || []).length]));
  let queued = 0, deferred = 0;
  for (const candidate of candidates) {
    const rank = pickedIds.get(candidate.id) || null;
    const status = rank ? "pending_approval" : "deferred";
    const row = candidate.variant;
    const inserted = await insertIgnore("acq_distribution_queue", [{
      dedupe_key: candidate.qkey,
      variant_id: candidate.id,
      content_id: candidate.contentId,
      platform: candidate.platform,
      caption: row.caption,
      script: row.script,
      media_instructions: row.media_instructions,
      cta: row.cta,
      utm_url: row.utm_url,
      recommended_time: row.recommended_time,
      status,
      quality_score: row.quality_score,
      quality_flags: row.quality_flags,
      daily_rank: rank,
      generation_version: version,
      asset_kind: row.asset_kind,
      asset_copy: row.asset_copy,
    }], "dedupe_key");
    if (inserted?.length) { if (status === "pending_approval") queued++; else deferred++; }
  }
  await logRun("SB-14-edge-v2", "success", variantsCreated + queued + deferred, 0, { variants_created: variantsCreated, queued, deferred, current_pending: currentPending?.length || 0, queue_limit: queueLimit, min_quality: minQuality });
  return { variants_created: variantsCreated, daily_picks_queued: queued, low_priority_deferred: deferred, pending_total: (currentPending?.length || 0) + queued };
}

function keywordCandidates(row: any) {
  const out: string[] = [], company = row.company || "", ticker = row.ticker || "", topic = row.topic || "";
  if (company) out.push(`${company} aktie analys`, `${company} värdering`, `${company} nyckeltal`, `${company} risker`);
  if (ticker) out.push(`${ticker} aktie analys`);
  if (topic) out.push(topic, `${topic} förklaring`);
  return [...new Set(out.map((x) => compact(x, 140)).filter((x) => x.length > 4))];
}

function scoreKeyword(keyword: string) {
  const lower = keyword.toLowerCase();
  const relevance = clamp(55 + (/aktie|värdering|nyckeltal|analys|risk|kassaflöde|skuld/.test(lower) ? 30 : 12));
  const traffic = clamp(45 + (/hur|vad|analys/.test(lower) ? 20 : 8));
  const evergreen = /vad|hur|förklaring|nyckeltal|risk/.test(lower) ? 88 : 68;
  const click = clamp(45 + (/aktie|analys|värdering/.test(lower) ? 25 : 10));
  const competition = /aktie analys|värdering/.test(lower) ? 60 : 40;
  const score = Math.round(relevance * .30 + traffic * .25 + evergreen * .20 + click * .20 + (100 - competition) * .05);
  return { stockbox_relevance: relevance, traffic_potential: traffic, competition_proxy: competition, evergreen_value: evergreen, click_potential: click, score, score_breakdown: { quality_v2: true } };
}

async function seo() {
  const opportunities = await select("acq_opportunities", "select=*&dedupe_key=like.v2*&status=in.(scored,selected,produced)&order=priority_score.desc&limit=60");
  const rows: any[] = [];
  for (const row of opportunities || []) {
    const gate = scoreStockboxTopic(row); if (!gate.eligible) continue;
    for (const keyword of keywordCandidates(row)) rows.push({ keyword, intent: /hur|vad|förklaring/.test(keyword.toLowerCase()) ? "informational" : "commercial_investigation", cluster: row.company || row.ticker || row.type || "investing", market: row.market || "SE", language: row.language || "sv", ...scoreKeyword(keyword), status: "scored" });
  }
  if (rows.length) await upsert("acq_keywords", rows, "keyword");
  const top = await select("acq_keywords", "select=*&status=eq.scored&order=score.desc&limit=20");
  let pages = 0;
  for (const keyword of top || []) {
    const pageSlug = slug(keyword.keyword); if (!pageSlug) continue;
    const brief = `Skapa en tydlig svensk guide för “${keyword.keyword}”. Förklara hur en investerare kan analysera ämnet, vilka nyckeltal eller frågor som är relevanta och hur StockBox hjälper till att strukturera arbetet. Ingen hype och inga avkastningslöften.`;
    const result = await upsert("acq_seo_pages", [{ slug: pageSlug, template: "educational_analysis", keyword: keyword.keyword, title: `${keyword.keyword} – guide och analys | StockBox`, brief, status: "planned" }], "slug");
    if (result?.length) pages++;
  }
  await logRun("SB-20/21/22-edge-v2", "success", rows.length, 0, { pages_planned: pages });
  return { keyword_candidates: rows.length, seo_pages_planned: pages };
}

function scoreCreator(c: any) {
  const topic = String(c.topic || "").toLowerCase(), platform = String(c.platform || "").toLowerCase();
  const stockboxFit = clamp(45 + (/aktie|börs|invest|finans|spar/.test(topic) ? 40 : 5));
  const audienceFit = clamp(45 + ((c.country || "SE") === "SE" ? 25 : 10) + ((c.language || "sv") === "sv" ? 20 : 5));
  const engagement = clamp(n(c.engagement_proxy, c.audience_size && c.audience_size < 50000 ? 65 : 50));
  const reply = clamp(35 + (n(c.audience_size) > 0 && n(c.audience_size) < 50000 ? 25 : 5) + (/tiktok|instagram|youtube/.test(platform) ? 10 : 0));
  const traffic = clamp(stockboxFit * .45 + audienceFit * .25 + engagement * .20 + Math.min(10, Math.log10(Math.max(10, n(c.audience_size, 10))) * 2));
  const affiliate = clamp(stockboxFit * .45 + audienceFit * .35 + reply * .20);
  const creatorScore = Math.round(stockboxFit * .30 + audienceFit * .25 + engagement * .15 + reply * .10 + traffic * .15 + affiliate * .05);
  return { stockbox_fit: Math.round(stockboxFit), audience_fit: Math.round(audienceFit), estimated_reply_probability: Math.round(reply), traffic_potential: Math.round(traffic), affiliate_fit: Math.round(affiliate), creator_score: creatorScore, score_breakdown: { quality_v2: true, engagement_proxy: engagement } };
}

async function creators(cfg: Record<string, any>) {
  const rows = await select("acq_creators", "select=*&status=in.(discovered,scored)&limit=200");
  const suppression = await select("acq_suppression", "select=identifier");
  const suppressed = new Set((suppression || []).map((x: any) => String(x.identifier || "").toLowerCase()));
  let scored = 0, outreach = 0;
  for (const creator of rows || []) {
    const score = scoreCreator(creator);
    await update("acq_creators", `id=eq.${encodeURIComponent(creator.id)}`, { ...score, status: "scored", updated_at: new Date().toISOString() });
    scored++;
    const contact = String(creator.contact_method || "").trim();
    if (score.creator_score >= 65 && contact && !suppressed.has(contact.toLowerCase()) && outreach < n(cfg.outreach_limit_per_day, 10)) {
      const message = `Hej ${creator.name || ""}! Jag driver StockBox, ett verktyg som hjälper investerare att analysera bolag snabbare och mer strukturerat. Din publik verkar passa bra med det vi bygger. Skulle du vara öppen för att testa StockBox och, om du gillar det, prata om ett enkelt affiliate- eller innehållssamarbete? Ingen press – jag skickar gärna mer info.`;
      const result = await insertIgnore("acq_creator_outreach", [{ dedupe_key: `creator:${creator.id}:initial`, creator_id: creator.id, channel: creator.platform || "unknown", message, offer: "free_access_affiliate", followup_number: 0, status: "queued" }], "dedupe_key");
      if (result?.length) outreach++;
    }
  }
  await logRun("SB-30/31/32-edge-v2", "success", scored, 0, { outreach_queued: outreach });
  return { creators_scored: scored, outreach_queued: outreach };
}

async function metrics() {
  const now = new Date(), start = startOfDayISO(now), end = startOfDayISO(addDays(now, 1));
  const events = await select("acq_events", `select=*&occurred_at=gte.${encodeURIComponent(start)}&occurred_at=lt.${encodeURIComponent(end)}&is_bot=eq.false&is_internal=eq.false&order=occurred_at.asc&limit=10000`);
  const ids = new Map<string, boolean>(), sourceById = new Map<string, string>();
  let pageViews = 0;
  for (const event of events || []) {
    const id = event.user_id || event.anonymous_id || event.session_id || event.id; if (!id) continue;
    ids.set(id, true);
    const source = event.utm_source || event.source || event.channel || "direct";
    if (!sourceById.has(id)) sourceById.set(id, source);
    if (event.event_name === "page_view" || event.event_name === "landing_page_view") pageViews++;
  }
  const unique = ids.size, bySource: Record<string, number> = {};
  for (const source of sourceById.values()) bySource[source] = (bySource[source] || 0) + 1;
  const attributed = [...sourceById.values()].filter((x) => x && x !== "direct").length;
  const attribution = unique ? Math.round(attributed / unique * 10000) / 100 : 0;
  const priorStart = startOfDayISO(addDays(now, -30));
  const prior = await select("acq_events", `select=user_id,anonymous_id,session_id,id&occurred_at=gte.${encodeURIComponent(priorStart)}&occurred_at=lt.${encodeURIComponent(start)}&is_bot=eq.false&is_internal=eq.false&limit=20000`);
  const priorIds = new Set((prior || []).map((e: any) => e.user_id || e.anonymous_id || e.session_id || e.id).filter(Boolean));
  const returning = [...ids.keys()].filter((id) => priorIds.has(id)).length;
  const date = dayISO(now);
  const priorMetrics = await select("acq_daily_metrics", `select=metric_date,qualified_unique_visitors&metric_date=gte.${dayISO(addDays(now, -6))}&metric_date=lte.${date}&order=metric_date.asc`);
  const values = (priorMetrics || []).filter((r: any) => r.metric_date !== date).map((r: any) => n(r.qualified_unique_visitors)); values.push(unique);
  const rolling = values.length ? Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length * 100) / 100 : unique;
  await upsert("acq_daily_metrics", [{ metric_date: date, unique_visitors: unique, qualified_unique_visitors: unique, website_clicks: pageViews, returning_visitors: returning, rolling_7d_avg: rolling, attribution_rate: attribution, by_source: bySource }], "metric_date");
  for (const [channel, count] of Object.entries(bySource)) await upsert("acq_channel_metrics", [{ metric_date: date, channel, unique_visitors: count, clicks: count }], "metric_date,channel");
  await logRun("SB-80-edge-v2", "success", events?.length || 0, 0, { unique, rolling, attribution });
  return { metric_date: date, unique_visitors: unique, qualified_unique_visitors: unique, returning_visitors: returning, rolling_7d_avg: rolling, attribution_rate: attribution, by_source: bySource };
}

async function optimize(cfg: Record<string, any>) {
  const target = n(cfg.target_daily_visitors, 100), since = dayISO(addDays(new Date(), -13));
  const channels = await select("acq_channel_metrics", `select=metric_date,channel,unique_visitors&metric_date=gte.${since}&order=metric_date.asc&limit=5000`);
  const sums: Record<string, number> = {};
  for (const row of channels || []) sums[row.channel] = (sums[row.channel] || 0) + n(row.unique_visitors);
  const ranked = Object.entries(sums).sort((a, b) => b[1] - a[1]);
  const today = (await select("acq_daily_metrics", `select=*&metric_date=eq.${dayISO(new Date())}&limit=1`))?.[0] || {};
  const rolling = n(today.rolling_7d_avg), decisions: any[] = [];
  if (ranked.length) decisions.push({ decision: `Lägg mer vikt på innehåll som liknar trafik från ${ranked[0][0]}`, reason: `${ranked[0][0]} är starkast uppmätta källan de senaste 14 dagarna.`, supporting_metrics: { channels: Object.fromEntries(ranked.slice(0, 8)), rolling_7d_avg: rolling, target }, confidence: ranked[0][1] >= 20 ? .75 : .4, expected_effect: "Mer trafik från bevisad kanal utan att sluta testa nya." });
  if (rolling < target) decisions.push({ decision: "Behåll hög experimenttakt men publicera bara content som klarar kvalitetsgränsen", reason: `7-dagarssnittet är ${rolling} mot målet ${target}.`, supporting_metrics: { rolling_7d_avg: rolling, target, gap: Math.max(0, target - rolling) }, confidence: .9, expected_effect: "Fler relevanta tester utan att fylla flödet med lågkvalitativt content." });
  for (const decision of decisions) await insert("acq_growth_decisions", [decision], "return=minimal");
  await logRun("SB-90-edge-v2", "success", decisions.length, 0, { rolling, target });
  return { decisions: decisions.map((x) => x.decision), rolling_7d_avg: rolling, target };
}

async function founderBrief(cfg: Record<string, any>) {
  const date = dayISO(new Date()), metric = (await select("acq_daily_metrics", `select=*&metric_date=eq.${date}&limit=1`))?.[0] || {};
  const pending = await select("acq_distribution_queue", "select=id,platform,quality_score,daily_rank&status=eq.pending_approval&generation_version=eq.v2&order=daily_rank.asc&limit=20");
  const spend = await monthAiSpend();
  const decisions = await select("acq_growth_decisions", "select=decision,created_at&order=created_at.desc&limit=4");
  const errors = await select("acq_errors", `select=id&occurred_at=gte.${encodeURIComponent(startOfDayISO(addDays(new Date(), -1)))}&limit=500`);
  const bySource = metric.by_source || {}, target = n(cfg.target_daily_visitors, 100), rolling = n(metric.rolling_7d_avg), progress = target ? Math.round(rolling / target * 1000) / 10 : 0;
  const sourceText = Object.entries(bySource).sort((a: any, b: any) => b[1] - a[1]).map(([key, value]) => `${key}: ${value}`).join(", ") || "Ingen trafik ännu";
  const picksText = (pending || []).map((row: any) => `${row.daily_rank || "-"}. ${row.platform} — kvalitet ${row.quality_score}/100`).join("\n") || "Inga poster klarade kvalitetsgränsen ännu.";
  const summary = `STOCKBOX TRAFFIC REPORT — ${date}\n\nBesökare idag: ${n(metric.qualified_unique_visitors)}\n7-dagarssnitt: ${rolling}/dag\nMål: ${target}/dag (${progress}% av målet)\nÅterkommande: ${n(metric.returning_visitors)}\nAttribution: ${n(metric.attribution_rate)}%\n\nKällor: ${sourceText}\n\nDAGENS PRIORITERADE CONTENT (${pending?.length || 0})\n${picksText}\n\nAI-kostnad denna månad: ${Math.round(spend * 100) / 100} / ${n(cfg.ai_monthly_budget_sek, 50)} kr\nFel senaste 24h: ${errors?.length || 0}\n\nNästa beslut:\n${(decisions || []).length ? decisions.map((x: any, i: number) => `${i + 1}. ${x.decision}`).join("\n") : "1. Fortsätt samla data och publicera endast dagens kvalitetsgodkända content."}`;
  const payload = { date, qualified_unique_visitors: n(metric.qualified_unique_visitors), rolling_7d_avg: rolling, target, progress_pct: progress, by_source: bySource, returning_visitors: n(metric.returning_visitors), attribution_rate: n(metric.attribution_rate), pending_content: pending?.length || 0, ai_spend_sek: Math.round(spend * 100) / 100, ai_budget_sek: n(cfg.ai_monthly_budget_sek, 50), errors_last_24h: errors?.length || 0, decisions: (decisions || []).map((x: any) => x.decision) };
  await upsert("acq_founder_briefs", [{ brief_date: date, summary, payload }], "brief_date");
  await logRun("SB-92-edge-v2", "success", 1, 0, { pending_content: pending?.length || 0 });
  return { summary, payload };
}

async function statusSnapshot(cfg: Record<string, any>) {
  const opps = await select("acq_opportunities", "select=status&dedupe_key=like.v2*&limit=5000");
  const content = await select("acq_content", "select=status&campaign_id=eq.auto_growth_v2&limit=5000");
  const queue = await select("acq_distribution_queue", "select=status,platform,quality_score,daily_rank&generation_version=eq.v2&limit=5000");
  const latestBrief = await select("acq_founder_briefs", "select=brief_date,summary,payload&order=brief_date.desc&limit=1");
  const count = (rows: any[]) => rows.reduce((acc: any, row: any) => { acc[row.status || "unknown"] = (acc[row.status || "unknown"] || 0) + 1; return acc; }, {});
  return { target_daily_visitors: n(cfg.target_daily_visitors, 100), opportunities: count(opps || []), content: count(content || []), distribution: count(queue || []), latest_brief: latestBrief?.[0] || null, ai: { gemini_configured: Boolean(GEMINI_API_KEY), openai_configured: Boolean(OPENAI_API_KEY) } };
}

async function runMode(mode: string, cfg: Record<string, any>) {
  if (mode === "discover") return discover(cfg);
  if (mode === "score_select") return scoreAndSelect(cfg);
  if (mode === "content") return generateContent(cfg);
  if (mode === "repurpose") return repurpose(cfg);
  if (mode === "seo") return seo();
  if (mode === "creators") return creators(cfg);
  if (mode === "metrics") return metrics();
  if (mode === "optimize") return optimize(cfg);
  if (mode === "brief") return founderBrief(cfg);
  if (mode === "status") return statusSnapshot(cfg);
  if (mode === "full") {
    const result: any = {};
    result.discover = await discover(cfg);
    result.score_select = await scoreAndSelect(cfg);
    result.content = await generateContent(cfg);
    result.repurpose = await repurpose(cfg);
    result.seo = await seo();
    result.creators = await creators(cfg);
    result.metrics = await metrics();
    result.optimize = await optimize(cfg);
    result.brief = await founderBrief(cfg);
    return result;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,x-stockbox-token" } });
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "server_not_configured" }, 500);
    const cfg = await loadConfig();
    const expected = String(cfg.engine_orchestrator_token || ""), supplied = req.headers.get("x-stockbox-token") || "";
    if (!expected || supplied !== expected) return json({ error: "unauthorized" }, 401);
    let body: any = {};
    if (req.method !== "GET") { try { body = await req.json(); } catch {} }
    const url = new URL(req.url), mode = body.mode || url.searchParams.get("mode") || "full", started = Date.now();
    const result = await runMode(mode, cfg);
    return json({ ok: true, mode, duration_ms: Date.now() - started, result, ai: { gemini_configured: Boolean(GEMINI_API_KEY), openai_configured: Boolean(OPENAI_API_KEY) }, version: "quality-v2" });
  } catch (error) {
    await logError("stockbox-growth-engine-v2", "unhandled", error?.message || error, { stack: String(error?.stack || "").slice(0, 5000) });
    return json({ ok: false, error: error?.message || String(error), version: "quality-v2" }, 500);
  }
});
