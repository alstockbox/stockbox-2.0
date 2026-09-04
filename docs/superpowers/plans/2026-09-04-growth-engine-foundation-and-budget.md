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
- `supabase/migrations/20260904170000_autonomous_growth_media_foundation_v3.sql`

Modify:
- `.github/workflows/growth-quality-ci.yml` — include the new focused tests and migration paths.
- `src/lib/growth/publishing-package.ts` — expose stable platform identifiers without changing current clean-copy behavior.

### Task 1: Global Budget Governor

**Files:**
- Create: `src/lib/growth/budget-governor.ts`
- Test: `tests/growth-budget-governor.test.ts`

**Interfaces:**
- Consumes: current monthly spend in SEK, projected operation cost in SEK, optional requested master-video count.
- Produces: `evaluateBudget(input): BudgetDecision` and `chooseDailyVideoCapacity(input): 0 | 1 | 2`.

- [ ] **Step 1: Write the failing budget tests**

```ts
import { describe, expect, it } from "vitest";
import { chooseDailyVideoCapacity, evaluateBudget } from "@/lib/growth/budget-governor";

describe("growth budget governor", () => {
  it("allows a bounded paid call while projected spend stays below target", () => {
    expect(evaluateBudget({ monthlySpendSek: 20, projectedCostSek: 5 })).toMatchObject({
      allowed: true,
      mode: "normal",
    });
  });

  it("removes optional paid generation above the target budget", () => {
    expect(evaluateBudget({ monthlySpendSek: 49, projectedCostSek: 3, optional: true })).toMatchObject({
      allowed: false,
      mode: "free_only",
    });
  });

  it("never authorizes a call that could cross the 75 SEK hard ceiling", () => {
    expect(evaluateBudget({ monthlySpendSek: 74, projectedCostSek: 2 })).toMatchObject({
      allowed: false,
      mode: "hard_stop",
    });
  });

  it("fails closed when projected paid cost is unknown", () => {
    expect(evaluateBudget({ monthlySpendSek: 10, projectedCostSek: null })).toMatchObject({
      allowed: false,
      reason: "unknown_cost",
    });
  });

  it("reduces daily video capacity as budget pressure rises", () => {
    expect(chooseDailyVideoCapacity({ monthlySpendSek: 10, qualityCandidates: 2 })).toBe(2);
    expect(chooseDailyVideoCapacity({ monthlySpendSek: 46, qualityCandidates: 2 })).toBe(1);
    expect(chooseDailyVideoCapacity({ monthlySpendSek: 75, qualityCandidates: 2 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:
```bash
npm test -- tests/growth-budget-governor.test.ts
```
Expected: FAIL because `@/lib/growth/budget-governor` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

```ts
export const GROWTH_BUDGET_TARGET_SEK = 50;
export const GROWTH_BUDGET_HARD_CAP_SEK = 75;

export type BudgetMode = "normal" | "conserve" | "free_only" | "hard_stop";
export type BudgetDecision = {
  allowed: boolean;
  mode: BudgetMode;
  projectedMonthlySek: number | null;
  reason: "within_budget" | "conserve" | "target_exceeded" | "hard_cap" | "unknown_cost";
};

export function evaluateBudget(input: {
  monthlySpendSek: number;
  projectedCostSek: number | null;
  optional?: boolean;
}): BudgetDecision {
  if (input.projectedCostSek === null || !Number.isFinite(input.projectedCostSek)) {
    return { allowed: false, mode: "free_only", projectedMonthlySek: null, reason: "unknown_cost" };
  }
  const projected = input.monthlySpendSek + Math.max(0, input.projectedCostSek);
  if (projected > GROWTH_BUDGET_HARD_CAP_SEK || input.monthlySpendSek >= GROWTH_BUDGET_HARD_CAP_SEK) {
    return { allowed: false, mode: "hard_stop", projectedMonthlySek: projected, reason: "hard_cap" };
  }
  if (projected > GROWTH_BUDGET_TARGET_SEK && input.optional) {
    return { allowed: false, mode: "free_only", projectedMonthlySek: projected, reason: "target_exceeded" };
  }
  if (projected > 40) {
    return { allowed: true, mode: "conserve", projectedMonthlySek: projected, reason: "conserve" };
  }
  return { allowed: true, mode: "normal", projectedMonthlySek: projected, reason: "within_budget" };
}

export function chooseDailyVideoCapacity(input: {
  monthlySpendSek: number;
  qualityCandidates: number;
}): 0 | 1 | 2 {
  if (input.monthlySpendSek >= GROWTH_BUDGET_HARD_CAP_SEK || input.qualityCandidates <= 0) return 0;
  if (input.monthlySpendSek >= 40) return 1;
  return Math.min(2, input.qualityCandidates) as 0 | 1 | 2;
}
```

- [ ] **Step 4: Run focused tests**

Run:
```bash
npm test -- tests/growth-budget-governor.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/growth/budget-governor.ts tests/growth-budget-governor.test.ts
git commit -m "feat: add global growth budget governor"
```

### Task 2: Render and Package Contracts

**Files:**
- Create: `src/lib/growth/render-spec.ts`
- Test: `tests/growth-render-spec.test.ts`
- Modify: `src/lib/growth/publishing-package.ts`

**Interfaces:**
- Produces: `RenderSpecSchema`, `RenderSpec`, `RenderJobState`, `MediaAssetKind`, `QcSummarySchema`, `DistributionPlatform`.
- Later media workers must consume only validated `RenderSpec` objects.

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from "vitest";
import { RenderSpecSchema } from "@/lib/growth/render-spec";

const baseSpec = {
  version: "v3" as const,
  contentId: "content-1",
  renderJobId: "job-1",
  language: "sv" as const,
  template: "educational_checklist" as const,
  title: "Tre saker att kontrollera",
  hook: "Tre varningssignaler på 30 sekunder",
  script: "Första punkten är skuldsättningen.",
  voiceMode: "educational" as const,
  scenes: [{ id: "scene-1", kind: "stockbox_ui" as const, startMs: 0, endMs: 4000, headline: "1. Skuld" }],
  subtitles: [{ startMs: 0, endMs: 1800, text: "Tre varningssignaler" }],
  cta: { text: "Analysera bolaget i StockBox", url: "https://www.getstockbox.app/" },
};

describe("RenderSpec", () => {
  it("accepts a valid Swedish template render", () => {
    expect(RenderSpecSchema.parse(baseSpec).contentId).toBe("content-1");
  });

  it("rejects non-positive scene duration", () => {
    expect(() => RenderSpecSchema.parse({ ...baseSpec, scenes: [{ ...baseSpec.scenes[0], endMs: 0 }] })).toThrow();
  });

  it("rejects more than 60 seconds for the v3 short-form factory", () => {
    expect(() => RenderSpecSchema.parse({ ...baseSpec, scenes: [{ ...baseSpec.scenes[0], endMs: 61000 }] })).toThrow();
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:
```bash
npm test -- tests/growth-render-spec.test.ts
```
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the schemas and stable enums**

Use Zod discriminated values for:
```ts
export const DistributionPlatformSchema = z.enum([
  "instagram_reel",
  "facebook_reel",
  "tiktok",
  "youtube_short",
  "instagram_carousel",
  "linkedin",
  "facebook",
]);

export const RenderTemplateSchema = z.enum([
  "educational_checklist",
  "stock_analysis",
  "investor_warning",
  "stockbox_demo",
  "company_comparison",
]);

export const SceneKindSchema = z.enum([
  "stockbox_ui",
  "motion_graphic",
  "chart",
  "generated_micro_scene",
  "cta",
]);
```

`RenderSpecSchema.superRefine()` must enforce:
- every `endMs > startMs`;
- last scene end <= 60_000 ms;
- subtitle intervals are positive and end <= video end;
- Swedish automatic renders require `voiceMode` in `hook | educational | serious_analysis`;
- `generated_micro_scene` may be present but never required.

Add a `DistributionPlatform` export and use it in `publishing-package.ts` instead of free-form internal platform strings without changing existing output behavior.

- [ ] **Step 4: Run both publishing and render contract tests**

Run:
```bash
npm test -- tests/growth-render-spec.test.ts tests/growth-publishing-package.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/growth/render-spec.ts src/lib/growth/publishing-package.ts tests/growth-render-spec.test.ts
git commit -m "feat: define growth render contracts"
```

### Task 3: Deterministic Private Asset Paths

**Files:**
- Create: `src/lib/growth/asset-paths.ts`
- Test: `tests/growth-asset-paths.test.ts`

**Interfaces:**
- Produces: `buildGrowthAssetPath({ date, contentId, renderJobId, kind, extension }): string`.
- Paths contain IDs only; never titles, scripts, signed query parameters, or voice sample contents.

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, it } from "vitest";
import { buildGrowthAssetPath } from "@/lib/growth/asset-paths";

it("creates deterministic ID-only growth asset paths", () => {
  expect(buildGrowthAssetPath({
    date: "2026-09-04",
    contentId: "content_123",
    renderJobId: "job_456",
    kind: "master_video",
    extension: "mp4",
  })).toBe("2026-09-04/content_123/job_456/master_video.mp4");
});

it("rejects unsafe path segments", () => {
  expect(() => buildGrowthAssetPath({
    date: "2026-09-04",
    contentId: "../secret",
    renderJobId: "job_456",
    kind: "voice_audio",
    extension: "wav",
  })).toThrow();
});
```

- [ ] **Step 2: Run and verify RED**

Run:
```bash
npm test -- tests/growth-asset-paths.test.ts
```
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement a strict segment validator and path builder**

Allow only `[A-Za-z0-9_-]+` for IDs/kinds, `YYYY-MM-DD` for date, and a small extension enum (`mp4`, `jpg`, `png`, `wav`, `json`, `zip`, `txt`). Do not include URLs in this module.

- [ ] **Step 4: Run test**

Run:
```bash
npm test -- tests/growth-asset-paths.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/growth/asset-paths.ts tests/growth-asset-paths.test.ts
git commit -m "feat: add deterministic growth asset paths"
```

### Task 4: Durable v3 Database and Private Storage Foundation

**Files:**
- Create: `supabase/migrations/20260904170000_autonomous_growth_media_foundation_v3.sql`

**Interfaces:**
- Produces durable tables: `acq_voice_profiles`, `acq_render_jobs`, `acq_media_assets`, `acq_distribution_packages`, `acq_budget_ledger`, `acq_manual_script_ideas`.
- Produces private buckets: `growth-voice-private`, `growth-render-staging`, `growth-ready-assets`.
- Existing `acq_distribution_queue` remains untouched as a v2 compatibility source.

- [ ] **Step 1: Write the migration with explicit constraints**

The migration must contain these minimum constraints rather than loose JSON-only storage:

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

create table if not exists public.acq_budget_ledger (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  provider text not null,
  operation text not null,
  content_id uuid references public.acq_content(id) on delete set null,
  render_job_id uuid references public.acq_render_jobs(id) on delete set null,
  estimated_sek numeric(12,4) not null check (estimated_sek >= 0),
  actual_sek numeric(12,4) check (actual_sek is null or actual_sek >= 0),
  original_currency text,
  original_amount numeric(14,6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

Also create the four remaining tables with:
- foreign keys to `acq_content`/`acq_render_jobs` where relevant;
- unique idempotency constraints for jobs/assets/packages;
- package statuses `draft | ready | posted | deferred | failed`;
- asset QC statuses `pending | passed | failed`;
- voice profile status `pending | active | disabled | failed` and `consent_at`;
- manual script status `suggested | used | skipped | expired`.

- [ ] **Step 2: Add indexes for worker and UI access paths**

At minimum:
```sql
create index if not exists acq_render_jobs_state_created_idx on public.acq_render_jobs(state, created_at);
create index if not exists acq_media_assets_job_kind_idx on public.acq_media_assets(render_job_id, kind);
create index if not exists acq_distribution_packages_status_rank_idx on public.acq_distribution_packages(status, daily_rank, created_at desc);
create index if not exists acq_budget_ledger_created_idx on public.acq_budget_ledger(created_at);
create index if not exists acq_manual_script_ideas_date_idx on public.acq_manual_script_ideas(suggested_for_date desc);
```

- [ ] **Step 3: Create private storage buckets idempotently**

```sql
insert into storage.buckets (id, name, public)
values
  ('growth-voice-private', 'growth-voice-private', false),
  ('growth-render-staging', 'growth-render-staging', false),
  ('growth-ready-assets', 'growth-ready-assets', false)
on conflict (id) do update set public = false;
```

Do not add anonymous/public read policies. Server-side service-role operations remain the default access path; signed URLs are generated only by authenticated server/worker endpoints in the media plan.

- [ ] **Step 4: Seed v3 config values without overriding existing operator choices**

Use `on conflict (key) do nothing` for:
```text
growth_monthly_target_sek=50
growth_monthly_hard_cap_sek=75
growth_render_shadow_mode=true
growth_daily_master_video_max=2
growth_render_worker_max_attempts=2
growth_voice_signed_url_ttl_seconds=600
growth_ready_asset_retention_days=60
growth_exploit_ratio=0.70
growth_explore_ratio=0.20
growth_longshot_ratio=0.10
```

- [ ] **Step 5: Validate migration locally or against a disposable Supabase branch before production**

Preferred command when Supabase CLI is available:
```bash
supabase db reset
```
Expected: migration applies cleanly and all existing growth migrations still apply.

If execution environment uses a Supabase development branch instead, run SQL assertions:
```sql
select to_regclass('public.acq_render_jobs');
select id, public from storage.buckets where id like 'growth-%';
select key, value from acq_config where key like 'growth_%' order by key;
```
Expected: tables exist, all three buckets have `public=false`, and v3 config is present.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260904170000_autonomous_growth_media_foundation_v3.sql
git commit -m "feat: add autonomous growth media data model"
```

### Task 5: Normalized Budget Ledger Helper

**Files:**
- Create: `src/lib/growth/budget-ledger.ts`
- Test: `tests/growth-budget-ledger.test.ts`

**Interfaces:**
- Produces: `getCurrentGrowthSpend(supabase, now?)`, `appendGrowthSpend(supabase, entry)`, `authorizeGrowthOperation(supabase, request)`.
- `authorizeGrowthOperation` delegates policy to `evaluateBudget`; it does not duplicate threshold logic.

- [ ] **Step 1: Write tests against a tiny fake Supabase adapter**

Test that:
- monthly spend uses `actual_sek` when present, otherwise `estimated_sek`;
- entries are idempotent by `idempotency_key`;
- unknown projected cost returns `allowed=false` before a provider call;
- 75 SEK can never be exceeded by authorization.

- [ ] **Step 2: Run and verify RED**

Run:
```bash
npm test -- tests/growth-budget-ledger.test.ts
```
Expected: FAIL because `budget-ledger.ts` does not exist.

- [ ] **Step 3: Implement the helper with dependency injection**

Keep the exported surface narrow:
```ts
export async function getCurrentGrowthSpend(client: GrowthBudgetDb, now = new Date()): Promise<number>;
export async function appendGrowthSpend(client: GrowthBudgetDb, entry: GrowthBudgetEntry): Promise<void>;
export async function authorizeGrowthOperation(client: GrowthBudgetDb, request: GrowthBudgetRequest): Promise<BudgetDecision>;
```

The DB adapter only needs `from("acq_budget_ledger")`; do not import browser Supabase clients.

- [ ] **Step 4: Run focused tests**

Run:
```bash
npm test -- tests/growth-budget-governor.test.ts tests/growth-budget-ledger.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/growth/budget-ledger.ts tests/growth-budget-ledger.test.ts
git commit -m "feat: normalize growth spend ledger"
```

### Task 6: Expand Focused Growth CI

**Files:**
- Modify: `.github/workflows/growth-quality-ci.yml`

**Interfaces:**
- Produces one feature-focused CI gate that includes all v3 pure modules without relying on the unrelated broad analysis-engine suite.

- [ ] **Step 1: Extend path filters**

Add:
```yaml
      - "tests/growth-budget-*.test.ts"
      - "tests/growth-render-spec.test.ts"
      - "tests/growth-asset-paths.test.ts"
      - "supabase/migrations/*growth*"
```

- [ ] **Step 2: Extend the focused test command**

Use:
```yaml
      - run: npm test -- tests/growth-content-quality.test.ts tests/growth-publishing-package.test.ts tests/growth-budget-governor.test.ts tests/growth-budget-ledger.test.ts tests/growth-render-spec.test.ts tests/growth-asset-paths.test.ts
      - run: npm run typecheck
      - run: npm run build
```

- [ ] **Step 3: Run the same commands locally**

```bash
npm test -- tests/growth-content-quality.test.ts tests/growth-publishing-package.test.ts tests/growth-budget-governor.test.ts tests/growth-budget-ledger.test.ts tests/growth-render-spec.test.ts tests/growth-asset-paths.test.ts
npm run typecheck
npm run build
```
Expected: all targeted growth tests, typecheck, and Next production build pass.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/growth-quality-ci.yml
git commit -m "ci: cover autonomous growth foundation"
```

## Foundation acceptance gate

Before moving to the media-factory plan, verify all of the following:
- budget policy blocks unknown-cost and >75 SEK operations;
- v3 typed RenderSpec rejects invalid durations and unsafe values;
- private buckets exist and are not public;
- all six v3 tables exist with idempotency constraints;
- existing `acq_distribution_queue` remains intact;
- focused growth CI passes tests + typecheck + build;
- no voice sample, signed URL, service-role key, or provider credential is present in Git history.
