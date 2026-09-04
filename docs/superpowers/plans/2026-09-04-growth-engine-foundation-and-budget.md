# Growth Engine Foundation and Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the typed contracts, global budget governor, durable media/job data model, private storage foundation, and v2 compatibility layer required by the autonomous StockBox growth engine.

**Architecture:** Keep Supabase as the control plane and preserve the current v2 distribution queue while v3 is introduced in shadow mode. Pure TypeScript modules own budget and media contracts; Postgres owns durable job/package/ledger state and private storage bucket configuration. Nothing in this phase renders real video yet, but every later subsystem must be able to rely on these contracts without changing their interfaces.

**Tech Stack:** TypeScript 5.9, Vitest 4, Zod 4, Next.js 16, Supabase Postgres/Storage, existing `acq_*` growth schema.

**Spec:** `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md`

## Global Constraints

- Primary optimization target: 100 relevant unique visits/day on a rolling 7-day average; this is a target, not a guarantee.
- Total recurring growth-engine spend target: <= 50 SEK/month.
- Absolute growth-engine hard ceiling: 75 SEK/month.
- Swedish is the primary language; automated Swedish video will use the founder voice profile in later phases.
- Automatic output is 0-2 master videos/day based on expected value, quality, and budget.
- Founder voice reference media must remain private and must never enter the public GitHub repository.
- Unknown or unbounded chargeable operations fail closed.
- Existing v2 growth content must remain operational while v3 runs in shadow mode.
- Provider failures must degrade to approved fallbacks rather than break the daily loop when a safe fallback exists.

---

## File map

Create:
- `src/lib/growth/budget-governor.ts` — pure policy for spend authorization and video-count degradation.
- `src/lib/growth/render-spec.ts` — Zod schemas/types for RenderSpec, media assets, render jobs, QC summary, and platform packages.
- `src/lib/growth/asset-paths.ts` — deterministic private storage paths; no signed URLs.
- `src/lib/growth/budget-ledger.ts` — server-side helpers that read/write normalized spend through Supabase.
- `tests/growth-budget-governor.test.ts`
- `tests/growth-render-spec.test.ts`
- `tests/growth-asset-paths.test.ts`
- `tests/growth-budget-ledger.test.ts`
- `supabase/migrations/20260904170000_autonomous_growth_media_foundation_v3.sql`

Modify:
- `.github/workflows/growth-quality-ci.yml` — include the new focused tests and migration paths.
- `src/lib/growth/publishing-package.ts` — expose stable platform identifiers without changing current clean-copy behavior.

### Task 1: Global Budget Governor

**Files:** `src/lib/growth/budget-governor.ts`, `tests/growth-budget-governor.test.ts`.

**Interfaces:** Consumes current monthly spend, projected operation cost, and candidate count. Produces `evaluateBudget(input): BudgetDecision` and `chooseDailyVideoCapacity(input): 0 | 1 | 2`.

- [ ] **Step 1: Write failing budget tests**

```ts
import { describe, expect, it } from "vitest";
import { chooseDailyVideoCapacity, evaluateBudget } from "@/lib/growth/budget-governor";

describe("growth budget governor", () => {
  it("allows a bounded paid call below target", () => {
    expect(evaluateBudget({ monthlySpendSek: 20, projectedCostSek: 5 })).toMatchObject({ allowed: true, mode: "normal" });
  });
  it("removes optional paid generation above target", () => {
    expect(evaluateBudget({ monthlySpendSek: 49, projectedCostSek: 3, optional: true })).toMatchObject({ allowed: false, mode: "free_only" });
  });
  it("never authorizes a call crossing 75 SEK", () => {
    expect(evaluateBudget({ monthlySpendSek: 74, projectedCostSek: 2 })).toMatchObject({ allowed: false, mode: "hard_stop" });
  });
  it("fails closed on unknown paid cost", () => {
    expect(evaluateBudget({ monthlySpendSek: 10, projectedCostSek: null })).toMatchObject({ allowed: false, reason: "unknown_cost" });
  });
  it("reduces daily video capacity under budget pressure", () => {
    expect(chooseDailyVideoCapacity({ monthlySpendSek: 10, qualityCandidates: 2 })).toBe(2);
    expect(chooseDailyVideoCapacity({ monthlySpendSek: 46, qualityCandidates: 2 })).toBe(1);
    expect(chooseDailyVideoCapacity({ monthlySpendSek: 75, qualityCandidates: 2 })).toBe(0);
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-budget-governor.test.ts
```
Expected: module-not-found failure.

- [ ] **Step 3: Implement minimal pure policy**

```ts
export const GROWTH_BUDGET_TARGET_SEK = 50;
export const GROWTH_BUDGET_HARD_CAP_SEK = 75;
export type BudgetMode = "normal" | "conserve" | "free_only" | "hard_stop";

export function evaluateBudget(input: { monthlySpendSek: number; projectedCostSek: number | null; optional?: boolean }) {
  if (input.projectedCostSek === null || !Number.isFinite(input.projectedCostSek)) {
    return { allowed: false, mode: "free_only" as const, projectedMonthlySek: null, reason: "unknown_cost" as const };
  }
  const projected = input.monthlySpendSek + Math.max(0, input.projectedCostSek);
  if (projected > 75 || input.monthlySpendSek >= 75) return { allowed: false, mode: "hard_stop" as const, projectedMonthlySek: projected, reason: "hard_cap" as const };
  if (projected > 50 && input.optional) return { allowed: false, mode: "free_only" as const, projectedMonthlySek: projected, reason: "target_exceeded" as const };
  if (projected > 40) return { allowed: true, mode: "conserve" as const, projectedMonthlySek: projected, reason: "conserve" as const };
  return { allowed: true, mode: "normal" as const, projectedMonthlySek: projected, reason: "within_budget" as const };
}

export function chooseDailyVideoCapacity(input: { monthlySpendSek: number; qualityCandidates: number }): 0 | 1 | 2 {
  if (input.monthlySpendSek >= 75 || input.qualityCandidates <= 0) return 0;
  if (input.monthlySpendSek >= 40) return 1;
  return Math.min(2, input.qualityCandidates) as 0 | 1 | 2;
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/growth-budget-governor.test.ts
git add src/lib/growth/budget-governor.ts tests/growth-budget-governor.test.ts
git commit -m "feat: add global growth budget governor"
```

### Task 2: Render and Package Contracts

**Files:** `src/lib/growth/render-spec.ts`, `tests/growth-render-spec.test.ts`, `src/lib/growth/publishing-package.ts`.

**Interfaces:** Produces `RenderSpecSchema`, `RenderSpec`, `RenderJobState`, `MediaAssetKind`, `QcSummarySchema`, `DistributionPlatform`.

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from "vitest";
import { RenderSpecSchema } from "@/lib/growth/render-spec";

const baseSpec = {
  version: "v3" as const, contentId: "content-1", renderJobId: "job-1", language: "sv" as const,
  template: "educational_checklist" as const, title: "Tre saker att kontrollera",
  hook: "Tre varningssignaler på 30 sekunder", script: "Första punkten är skuldsättningen.",
  voiceMode: "educational" as const,
  scenes: [{ id: "scene-1", kind: "stockbox_ui" as const, startMs: 0, endMs: 4000, headline: "1. Skuld" }],
  subtitles: [{ startMs: 0, endMs: 1800, text: "Tre varningssignaler" }],
  cta: { text: "Analysera bolaget i StockBox", url: "https://www.getstockbox.app/" },
};

describe("RenderSpec", () => {
  it("accepts a valid Swedish template render", () => expect(RenderSpecSchema.parse(baseSpec).contentId).toBe("content-1"));
  it("rejects non-positive scene duration", () => expect(() => RenderSpecSchema.parse({ ...baseSpec, scenes: [{ ...baseSpec.scenes[0], endMs: 0 }] })).toThrow());
  it("rejects more than 60 seconds", () => expect(() => RenderSpecSchema.parse({ ...baseSpec, scenes: [{ ...baseSpec.scenes[0], endMs: 61000 }] })).toThrow());
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-render-spec.test.ts
```

- [ ] **Step 3: Implement stable enums and validation**

```ts
export const DistributionPlatformSchema = z.enum(["instagram_reel","facebook_reel","tiktok","youtube_short","instagram_carousel","linkedin","facebook"]);
export const RenderTemplateSchema = z.enum(["educational_checklist","stock_analysis","investor_warning","stockbox_demo","company_comparison"]);
export const SceneKindSchema = z.enum(["stockbox_ui","motion_graphic","chart","generated_micro_scene","cta"]);
```

`RenderSpecSchema.superRefine()` enforces positive scene/subtitle intervals, max final scene end 60,000 ms, subtitle end <= video end, approved Swedish voice modes, and optional-only generated scenes. Use `DistributionPlatform` in `publishing-package.ts` without changing current copy behavior.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/growth-render-spec.test.ts tests/growth-publishing-package.test.ts
git add src/lib/growth/render-spec.ts src/lib/growth/publishing-package.ts tests/growth-render-spec.test.ts
git commit -m "feat: define growth render contracts"
```

### Task 3: Deterministic Private Asset Paths

**Files:** `src/lib/growth/asset-paths.ts`, `tests/growth-asset-paths.test.ts`.

- [ ] **Step 1: Write failing tests**

```ts
expect(buildGrowthAssetPath({ date: "2026-09-04", contentId: "content_123", renderJobId: "job_456", kind: "master_video", extension: "mp4" }))
  .toBe("2026-09-04/content_123/job_456/master_video.mp4");
expect(() => buildGrowthAssetPath({ date: "2026-09-04", contentId: "../secret", renderJobId: "job_456", kind: "voice_audio", extension: "wav" })).toThrow();
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-asset-paths.test.ts
```

- [ ] **Step 3: Implement strict ID/date/extension validation**

Allow `[A-Za-z0-9_-]+` IDs/kinds, exact `YYYY-MM-DD`, and extension enum `mp4 | jpg | png | wav | json | zip | txt`. This module never contains URLs.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/growth-asset-paths.test.ts
git add src/lib/growth/asset-paths.ts tests/growth-asset-paths.test.ts
git commit -m "feat: add deterministic growth asset paths"
```

### Task 4: Durable v3 Database and Private Storage Foundation

**Files:** `supabase/migrations/20260904170000_autonomous_growth_media_foundation_v3.sql`.

**Interfaces:** Creates `acq_voice_profiles`, `acq_render_jobs`, `acq_media_assets`, `acq_distribution_packages`, `acq_budget_ledger`, `acq_manual_script_ideas`; creates private buckets `growth-voice-private`, `growth-render-staging`, `growth-ready-assets`; preserves `acq_distribution_queue`.

- [ ] **Step 1: Create tables with explicit constraints**

`acq_render_jobs` starts as video-oriented in this foundation phase; Plan 3 adds the explicit multi-kind `job_kind` column before carousel/static jobs are enqueued.

```sql
create table if not exists public.acq_render_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  content_id uuid not null references public.acq_content(id) on delete cascade,
  state text not null check (state in ('queued','storyboarding','voicing','rendering','qc','ready','failed','superseded')),
  template text not null check (template in ('educational_checklist','stock_analysis','investor_warning','stockbox_demo','company_comparison')),
  language text not null check (language in ('sv','en')),
  render_spec jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  failure_reason text,
  worker_id text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`acq_budget_ledger` requires unique idempotency key, provider, operation, optional content/render FK, non-negative estimated/actual SEK, original currency/amount, JSON metadata, created timestamp. The remaining four tables require typed states/statuses and FKs described in the approved design.

- [ ] **Step 2: Add worker/UI indexes**

```sql
create index if not exists acq_render_jobs_state_created_idx on public.acq_render_jobs(state, created_at);
create index if not exists acq_media_assets_job_kind_idx on public.acq_media_assets(render_job_id, kind);
create index if not exists acq_distribution_packages_status_rank_idx on public.acq_distribution_packages(status, daily_rank, created_at desc);
create index if not exists acq_budget_ledger_created_idx on public.acq_budget_ledger(created_at);
create index if not exists acq_manual_script_ideas_date_idx on public.acq_manual_script_ideas(suggested_for_date desc);
```

- [ ] **Step 3: Create private buckets idempotently**

```sql
insert into storage.buckets (id,name,public) values
('growth-voice-private','growth-voice-private',false),
('growth-render-staging','growth-render-staging',false),
('growth-ready-assets','growth-ready-assets',false)
on conflict (id) do update set public=false;
```
No anonymous/public read policies.

- [ ] **Step 4: Seed config without overriding operator choices**

Use `on conflict (key) do nothing` for target 50, hard cap 75, shadow mode true, daily master max 2, max attempts 2, signed TTL 600s, ready retention 60d, and 0.70/0.20/0.10 allocation ratios.

- [ ] **Step 5: Verify migration on disposable Supabase database/branch**

Assert six tables exist, all three buckets are private, config values exist, and existing `acq_distribution_queue` still exists.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260904170000_autonomous_growth_media_foundation_v3.sql
git commit -m "feat: add autonomous growth media data model"
```

### Task 5: Normalized Budget Ledger Helper

**Files:** `src/lib/growth/budget-ledger.ts`, `tests/growth-budget-ledger.test.ts`.

- [ ] **Step 1: Write fake-adapter tests**

Test monthly actual-over-estimated selection, idempotency key behavior, unknown projected-cost denial, and hard-cap denial.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-budget-ledger.test.ts
```

- [ ] **Step 3: Implement narrow server helper**

```ts
export async function getCurrentGrowthSpend(client: GrowthBudgetDb, now = new Date()): Promise<number>;
export async function appendGrowthSpend(client: GrowthBudgetDb, entry: GrowthBudgetEntry): Promise<void>;
export async function authorizeGrowthOperation(client: GrowthBudgetDb, request: GrowthBudgetRequest): Promise<BudgetDecision>;
```

Use dependency injection; do not import browser Supabase clients. Authorization delegates to the pure Budget Governor rather than copying thresholds.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/growth-budget-governor.test.ts tests/growth-budget-ledger.test.ts
git add src/lib/growth/budget-ledger.ts tests/growth-budget-ledger.test.ts
git commit -m "feat: normalize growth spend ledger"
```

### Task 6: Expand Focused Growth CI

**Files:** `.github/workflows/growth-quality-ci.yml`.

- [ ] **Step 1: Extend path filters and test command**

Include new `src/lib/growth/**`, focused growth tests, v3 growth migrations, admin growth/API growth paths, and Edge growth function paths.

- [ ] **Step 2: Run exact feature gate locally**

```bash
npm test -- tests/growth-content-quality.test.ts tests/growth-publishing-package.test.ts tests/growth-budget-governor.test.ts tests/growth-budget-ledger.test.ts tests/growth-render-spec.test.ts tests/growth-asset-paths.test.ts
npm run typecheck
npm run build
```
Expected: targeted growth tests, typecheck, and production build all PASS.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/growth-quality-ci.yml
git commit -m "ci: cover autonomous growth foundation"
```

## Foundation acceptance gate

Before Plan 2:
- budget policy blocks unknown-cost and >75 SEK operations;
- RenderSpec rejects invalid durations/unsafe values;
- three private buckets exist and are not public;
- all six v3 tables exist with idempotency constraints;
- existing v2 distribution queue remains intact;
- focused growth CI passes tests + typecheck + build;
- no voice sample, signed URL, service-role key, or provider credential is present in Git history.
