import { describe, expect, it } from "vitest";
import {
  describeLearning,
  enqueueV3Renders,
  generateFounderScriptsV3,
  type GrowthDbAdapter,
} from "../supabase/functions/stockbox-growth-engine/v3/orchestration";

type GrowthRow = Record<string, unknown>;

function asRow(value: unknown): GrowthRow {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as GrowthRow
    : {};
}

function fakeDb(): GrowthDbAdapter & { rows: Record<string, GrowthRow[]> } {
  const rows: Record<string, GrowthRow[]> = {
    acq_content: [
      { id: "c1", title: "Tre risker att kontrollera", topic: "hur hittar man risker i ett börsbolag", body: "Börja med skulden. Kontrollera kassaflödet. Jämför riskerna över tid.", language: "sv", cta: "Analysera i StockBox", utm_url: "https://www.getstockbox.app/?utm_content=c1", status: "repurposed", updated_at: "2026-09-04T10:00:00Z" },
      { id: "c2", title: "Så analyserar du lönsamhet", topic: "hur analyserar man lönsamhet i ett bolag", body: "Titta på marginaler. Jämför avkastning på kapital. Bedöm stabiliteten över tid.", language: "sv", cta: "Analysera i StockBox", utm_url: "https://www.getstockbox.app/?utm_content=c2", status: "repurposed", updated_at: "2026-09-04T09:00:00Z" },
      { id: "c3", title: "Kassaflöde steg för steg", topic: "vad är fritt kassaflöde", body: "Jämför kassaflöde med vinst. Se investeringarna. Följ trenden.", language: "sv", cta: "Analysera i StockBox", utm_url: "https://www.getstockbox.app/?utm_content=c3", status: "draft", updated_at: "2026-09-04T08:00:00Z" },
    ],
    acq_events: [
      { id: "e1", anonymous_id: "u1", utm_content: "c1" },
      { id: "e2", anonymous_id: "u2", utm_content: "c1" },
      { id: "e3", anonymous_id: "u1", utm_content: "c1" },
      { id: "e4", anonymous_id: "u3", utm_content: "c2" },
    ],
    acq_voice_profiles: [{ id: "voice-1", language: "sv", status: "active" }],
    acq_render_jobs: [],
    acq_manual_script_ideas: [],
  };
  return {
    rows,
    async select(table) { return structuredClone(rows[table] || []); },
    async insertIgnore(table, payload, onConflict) {
      const incoming = (Array.isArray(payload) ? payload : [payload]).map(asRow);
      rows[table] ||= [];
      const inserted: GrowthRow[] = [];
      for (const item of incoming) {
        const key = item[onConflict];
        if (rows[table].some((existing) => existing[onConflict] === key)) continue;
        rows[table].push(structuredClone(item));
        inserted.push(structuredClone(item));
      }
      return inserted;
    },
  };
}

const scoreTopic = () => ({ eligible: true, score: 94, flags: [] });
const cfg = {
  growth_render_shadow_mode: "true",
  growth_voice_estimated_sek_per_job: "0.2",
  growth_v3_quality_floor: 72,
  growth_v3_allocation_slots: 6,
  growth_allocation_exploit_ratio: .7,
  growth_allocation_explore_ratio: .2,
  growth_allocation_longshot_ratio: .1,
  growth_founder_scripts_per_day: 2,
};

describe("growth v3 orchestration", () => {
  it("enqueues 0-2 shadow render jobs idempotently", async () => {
    const db = fakeDb();
    const input = { db, cfg, monthlySpendSek: 0, scoreTopic, now: new Date("2026-09-04T12:00:00Z") };
    const first = await enqueueV3Renders(input);
    const second = await enqueueV3Renders(input);
    expect(first.created).toBeGreaterThanOrEqual(1);
    expect(first.created).toBeLessThanOrEqual(2);
    expect(first.shadowMode).toBe(true);
    expect(second.created).toBe(0);
    expect(db.rows.acq_render_jobs).toHaveLength(first.created);
    expect(db.rows.acq_render_jobs.every((row) => asRow(row.metadata).expose_to_ready === false)).toBe(true);
  });

  it("selects zero paid video jobs at the 75 SEK hard cap", async () => {
    const db = fakeDb();
    const result = await enqueueV3Renders({ db, cfg, monthlySpendSek: 75, scoreTopic, now: new Date("2026-09-04T12:00:00Z") });
    expect(result.created).toBe(0);
    expect(result.capacity).toBe(0);
  });

  it("still creates optional founder scripts when video capacity is zero", async () => {
    const db = fakeDb();
    const video = await enqueueV3Renders({ db, cfg, monthlySpendSek: 75, scoreTopic, now: new Date("2026-09-04T12:00:00Z") });
    const scripts = await generateFounderScriptsV3({ db, cfg, monthlySpendSek: 75, scoreTopic, now: new Date("2026-09-04T12:00:00Z") });
    expect(video.created).toBe(0);
    expect(scripts.created).toBe(2);
    expect(db.rows.acq_manual_script_ideas.every((row) => row.automatic_render === false)).toBe(true);
  });

  it("describes tiny attribution samples cautiously", () => {
    const learning = describeLearning({ byContent: { risk: 3, valuation: 1 }, minSample: 12, labels: { risk: "riskanalys" } });
    expect(learning.confidence).toBe("low_sample");
    expect(learning.summary).toMatch(/lilla datamaterialet/i);
  });
});
