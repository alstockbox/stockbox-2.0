# Growth Provider, Retention, and Visual-Source Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the cross-cutting v3 gaps between media rendering and daily orchestration: explicit job kinds, generic English voice experiments, deterministic StockBox visual sourcing, complete provider-cost accounting, storage retention, and regression protection for the existing SEO/outreach acquisition paths.

**Architecture:** Keep these concerns additive and provider-neutral. The render worker receives an explicit job kind and visual-source manifest, chooses Swedish founder voice or English generic voice through one typed provider interface, reports all metered usage back to Supabase, and removes staging data after completion. Existing SEO and creator-outreach workflows remain in the current Edge engine and are regression-tested rather than rebuilt.

**Tech Stack:** TypeScript, Vitest, Supabase Postgres/Storage/Edge Functions, GitHub Actions render worker, existing Remotion/FFmpeg media layer.

**Spec:** `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md`

## Global Constraints

- Swedish automatic video uses the approved founder voice profile.
- English is occasional experimental content and uses a generic natural English AI voice, not the founder clone.
- English experiments may not consume budget needed for the Swedish core.
- Every chargeable provider operation must have a known projected cost before invocation and an idempotent budget-ledger record afterward.
- Founder voice media is never sent to a generative-video or generic-English-voice provider.
- StockBox visuals may come from structured data, curated branded frames, or controlled product captures; manual screen recording is never required.
- Staging assets are temporary; final ready assets use configurable retention and remain private.
- Existing SEO and creator-outreach acquisition workflows continue operating during v3 rollout.

---

## File map

Create:
- `supabase/migrations/20260904174500_growth_render_job_kind_and_retention_v3.sql`
- `src/lib/growth/voice-provider.ts`
- `src/lib/growth/visual-source.ts`
- `src/lib/growth/retention-policy.ts`
- `tests/growth-voice-provider.test.ts`
- `tests/growth-visual-source.test.ts`
- `tests/growth-retention-policy.test.ts`
- `tests/growth-existing-channel-regression.test.ts`

Modify:
- `scripts/growth/run-render-worker.mjs`
- `supabase/functions/stockbox-growth-worker-api/index.ts`
- `supabase/functions/stockbox-growth-engine/index.ts`
- `.github/workflows/growth-quality-ci.yml`

### Task 1: Make Render Job Kind Explicit

**Files:**
- Create: `supabase/migrations/20260904174500_growth_render_job_kind_and_retention_v3.sql`

**Interfaces:**
- Adds `acq_render_jobs.job_kind` with allowed values `video | carousel | static_image`.
- Later visual-asset work consumes this column directly and must not infer job type from template names.

- [ ] **Step 1: Add the additive migration**

```sql
alter table public.acq_render_jobs
  add column if not exists job_kind text;

update public.acq_render_jobs
set job_kind = 'video'
where job_kind is null;

alter table public.acq_render_jobs
  alter column job_kind set default 'video',
  alter column job_kind set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'acq_render_jobs_job_kind_check'
  ) then
    alter table public.acq_render_jobs
      add constraint acq_render_jobs_job_kind_check
      check (job_kind in ('video','carousel','static_image'));
  end if;
end $$;

create index if not exists acq_render_jobs_kind_state_created_idx
  on public.acq_render_jobs(job_kind, state, created_at);
```

- [ ] **Step 2: Verify migration on a disposable database/branch**

```sql
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='acq_render_jobs' and column_name='job_kind';
```
Expected: non-null column, default `'video'::text`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260904174500_growth_render_job_kind_and_retention_v3.sql
git commit -m "feat: type growth render job kinds"
```

### Task 2: One Voice Provider Interface for Swedish Founder Voice and English Generic Voice

**Files:**
- Create: `src/lib/growth/voice-provider.ts`
- Test: `tests/growth-voice-provider.test.ts`
- Modify: `scripts/growth/run-render-worker.mjs`

**Interfaces:**
- Produces `selectVoiceProvider(input): VoiceProviderDecision`.
- Swedish automatic voice selects `founder_clone` only when an active founder profile exists.
- English selects `generic_english` and never receives founder reference media.

- [ ] **Step 1: Write failing provider-selection tests**

```ts
import { expect, it } from "vitest";
import { selectVoiceProvider } from "@/lib/growth/voice-provider";

it("uses active founder clone for Swedish", () => {
  expect(selectVoiceProvider({ language: "sv", founderProfileActive: true, englishEnabled: true })).toMatchObject({ providerKind: "founder_clone", allowed: true });
});

it("never sends founder reference to English generic voice", () => {
  expect(selectVoiceProvider({ language: "en", founderProfileActive: true, englishEnabled: true })).toMatchObject({ providerKind: "generic_english", includeFounderReference: false });
});

it("defers Swedish automatic voice when founder profile is unavailable", () => {
  expect(selectVoiceProvider({ language: "sv", founderProfileActive: false, englishEnabled: true })).toMatchObject({ allowed: false, reason: "founder_voice_unavailable" });
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-voice-provider.test.ts
```

- [ ] **Step 3: Implement the pure selector**

```ts
export type VoiceProviderDecision = {
  allowed: boolean;
  providerKind: "founder_clone" | "generic_english" | null;
  includeFounderReference: boolean;
  reason: "ok" | "founder_voice_unavailable" | "english_disabled";
};
```

Rules: Swedish never silently substitutes generic voice; English never includes founder reference; disabled English experiment is skipped rather than blocking Swedish production.

- [ ] **Step 4: Wire the worker to two endpoint adapters**

Worker environment names:
```text
GROWTH_VOICE_ENDPOINT
GROWTH_VOICE_WORKER_TOKEN
GROWTH_ENGLISH_VOICE_ENDPOINT
GROWTH_ENGLISH_VOICE_TOKEN
```

Both calls must first receive a budget authorization created by orchestration. If the English provider has unknown cost, skip the English experiment rather than send a request.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/growth-voice-provider.test.ts
git add src/lib/growth/voice-provider.ts scripts/growth/run-render-worker.mjs tests/growth-voice-provider.test.ts
git commit -m "feat: route Swedish and English growth voices safely"
```

### Task 3: Deterministic StockBox Visual Source Manifest

**Files:**
- Create: `src/lib/growth/visual-source.ts`
- Test: `tests/growth-visual-source.test.ts`
- Modify: `scripts/growth/run-render-worker.mjs`

**Interfaces:**
- Produces `resolveVisualSources(scene, availableAssets): VisualSourceDecision`.
- Priority order: structured StockBox visual -> curated branded frame -> controlled captured product frame when supplied -> motion-graphic fallback.

- [ ] **Step 1: Write failing source-selection tests**

Test that structured chart/UI data wins over generic fallback, a supplied controlled capture can be used, and missing assets still produce a deterministic motion-graphic source rather than an invalid scene.

```ts
expect(resolveVisualSources(
  { kind: "chart", metricKey: "net_debt_to_ebitda" },
  { structured: { net_debt_to_ebitda: { value: 2.1 } }, captures: {}, curated: {} },
).kind).toBe("structured_chart");
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-visual-source.test.ts
```

- [ ] **Step 3: Implement source resolver with no network side effects**

```ts
export type VisualSourceDecision =
  | { kind: "structured_chart"; payload: Record<string, unknown> }
  | { kind: "curated_frame"; assetId: string }
  | { kind: "controlled_capture"; assetId: string }
  | { kind: "motion_fallback"; headline: string; body?: string };
```

The resolver receives only asset IDs/structured data; signed URLs are supplied later by the authenticated worker API.

- [ ] **Step 4: Wire render worker manifest resolution**

Before rendering, each scene receives one resolved visual source. If a controlled capture is unavailable/expired, convert that scene to `motion_fallback`; do not require manual screen recording or fail the entire job.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/growth-visual-source.test.ts
git add src/lib/growth/visual-source.ts scripts/growth/run-render-worker.mjs tests/growth-visual-source.test.ts
git commit -m "feat: resolve StockBox growth visuals deterministically"
```

### Task 4: Record Voice and Generative Usage in the Global Budget Ledger

**Files:**
- Modify: `supabase/functions/stockbox-growth-worker-api/index.ts`
- Modify: `scripts/growth/run-render-worker.mjs`
- Test: `tests/growth-worker-contract.test.ts`

**Interfaces:**
- Worker completion includes `usage[]` entries with provider, operation, estimated SEK, optional actual SEK, and idempotency key.
- Worker API records these entries in `acq_budget_ledger` before package promotion.

- [ ] **Step 1: Extend worker-contract tests**

Completion payload fixture:
```ts
usage: [
  { idempotencyKey: "job-1:voice", provider: "voice-worker", operation: "voice_sv", estimatedSek: 0.2, actualSek: 0.18 },
  { idempotencyKey: "job-1:gen:s3", provider: "gen-video", operation: "micro_scene", estimatedSek: 0.4, actualSek: 0.4 },
]
```

Assert duplicate completion cannot double-count budget rows and unknown/negative monetary values are rejected.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-worker-contract.test.ts
```

- [ ] **Step 3: Implement completion accounting**

Within the authenticated completion transaction/logical RPC:
1. validate usage schema;
2. insert ledger rows using unique `idempotency_key` with ignore-on-conflict;
3. then upsert media assets/QC;
4. then update render job state.

A paid operation without a corresponding authorization/usage record may complete its raw render upload but may not be promoted to founder READY.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/growth-worker-contract.test.ts
git add supabase/functions/stockbox-growth-worker-api scripts/growth/run-render-worker.mjs tests/growth-worker-contract.test.ts
git commit -m "feat: account for growth media provider spend"
```

### Task 5: Staging Cleanup and Ready-Asset Retention

**Files:**
- Create: `src/lib/growth/retention-policy.ts`
- Test: `tests/growth-retention-policy.test.ts`
- Modify: `supabase/functions/stockbox-growth-engine/index.ts`

**Interfaces:**
- Produces `selectRetentionActions(input): RetentionAction[]`.
- Staging intermediates are deleted after successful/finally-failed jobs; ready assets expire by configured days only when not required by an active/published package.

- [ ] **Step 1: Write failing retention tests**

Test:
- completed job staging WAV/intermediates -> delete;
- failed job older than 24h staging -> delete;
- ready asset younger than configured 60d -> keep;
- published package-linked ready asset -> keep even if old;
- unlinked ready asset older than retention -> delete;
- voice profile reference -> never selected by generic retention cleanup.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-retention-policy.test.ts
```

- [ ] **Step 3: Implement pure policy**

Retention input includes asset kind, bucket, createdAt, render state, package status, and configured ready retention days. `growth-voice-private` is explicitly excluded from this generic cleanup.

- [ ] **Step 4: Add daily cleanup stage to the growth Edge function**

The stage lists only known `acq_media_assets` rows eligible by policy, deletes storage objects by stored bucket/path, then marks/deletes metadata consistently. Log aggregate counts only; do not log signed URLs or voice paths.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/growth-retention-policy.test.ts
git add src/lib/growth/retention-policy.ts supabase/functions/stockbox-growth-engine/index.ts tests/growth-retention-policy.test.ts
git commit -m "feat: clean growth staging and expired assets"
```

### Task 6: Regression-Protect Existing SEO and Creator Outreach

**Files:**
- Create: `tests/growth-existing-channel-regression.test.ts`
- Modify: `.github/workflows/growth-quality-ci.yml`

**Interfaces:**
- Confirms v3 additions do not remove the existing SEO, creator-outreach, metrics, optimization, or brief run modes from `stockbox-growth-engine`.

- [ ] **Step 1: Add source-contract regression tests**

Test/fixture must assert the engine still exposes or routes these modes:
```text
seo
creators
metrics
optimize
brief
full
```

Also assert v3 shadow enqueue is additive and does not replace the existing v2 repurpose/distribution path during rollout.

- [ ] **Step 2: Run focused regression test**

```bash
npm test -- tests/growth-existing-channel-regression.test.ts
```
Expected: PASS after any needed non-behavioral extraction of run-mode constants.

- [ ] **Step 3: Add this test to Growth Quality CI**

The focused CI command must include `tests/growth-existing-channel-regression.test.ts` together with the other v3 tests.

- [ ] **Step 4: Commit**

```bash
git add tests/growth-existing-channel-regression.test.ts .github/workflows/growth-quality-ci.yml
git commit -m "test: preserve existing growth acquisition channels"
```

## Hardening acceptance gate

Before production rollout:
- render jobs have explicit `job_kind`;
- Swedish and English voice paths are intentionally distinct;
- English generic voice never receives founder reference audio;
- every scene has an automatic StockBox/structured/curated/capture/fallback visual source;
- voice/generative metered usage is idempotently represented in the global budget ledger;
- staging files are cleaned automatically and final retention is bounded/configurable;
- voice profile storage is excluded from generic retention cleanup;
- existing SEO and creator-outreach workflows remain covered and operational.
