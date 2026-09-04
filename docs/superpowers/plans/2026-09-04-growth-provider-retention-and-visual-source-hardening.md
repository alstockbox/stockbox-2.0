# Growth Provider, Retention, and Visual-Source Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the cross-cutting v3 gaps between media rendering and daily orchestration: generic English voice experiments, deterministic StockBox visual sourcing, complete provider-cost accounting, storage retention, and regression protection for the existing SEO/outreach acquisition paths.

**Architecture:** Keep these concerns additive and provider-neutral. The render worker consumes the explicit `job_kind` introduced by the visual-assets plan, receives a visual-source manifest, chooses Swedish founder voice or English generic voice through one typed provider interface, reports all metered usage back to Supabase, and removes staging data after completion. Existing SEO and creator-outreach workflows remain in the current Edge engine and are regression-tested rather than rebuilt.

**Tech Stack:** TypeScript, Vitest, Supabase Postgres/Storage/Edge Functions, GitHub Actions render worker, existing Remotion/FFmpeg media layer.

**Spec:** `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md`

## Global Constraints

- `acq_render_jobs.job_kind` already exists before this plan and is restricted to `video | carousel | static_image`.
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
- `src/lib/growth/voice-provider.ts`
- `src/lib/growth/visual-source.ts`
- `src/lib/growth/retention-policy.ts`
- `tests/growth-job-kind-contract.test.ts`
- `tests/growth-voice-provider.test.ts`
- `tests/growth-visual-source.test.ts`
- `tests/growth-retention-policy.test.ts`
- `tests/growth-existing-channel-regression.test.ts`

Modify:
- `scripts/growth/run-render-worker.mjs`
- `supabase/functions/stockbox-growth-worker-api/index.ts`
- `supabase/functions/stockbox-growth-engine/index.ts`
- `.github/workflows/growth-quality-ci.yml`

### Task 1: Lock the Render Job Kind Contract

**Files:** `tests/growth-job-kind-contract.test.ts`, current render-job policy/worker source.

**Interfaces:** Every producer and consumer uses only `video | carousel | static_image`; no code infers job type from the template string.

- [ ] **Step 1: Write the contract test**

Test that the typed job-kind enum contains exactly three values and that worker dispatch maps each value to one explicit handler. Also assert an unknown value is rejected before rendering.

- [ ] **Step 2: Run the focused test**

```bash
npm test -- tests/growth-job-kind-contract.test.ts
```
Expected: PASS after the visual-assets plan has completed. If it fails, fix the producer/consumer contract before continuing; do not add a second schema migration here.

- [ ] **Step 3: Commit any contract-test/extraction change**

```bash
git add tests/growth-job-kind-contract.test.ts scripts/growth/run-render-worker.mjs src/lib/growth
git commit -m "test: lock growth render job kinds"
```

### Task 2: One Voice Provider Interface for Swedish Founder Voice and English Generic Voice

**Files:** `src/lib/growth/voice-provider.ts`, `tests/growth-voice-provider.test.ts`, `scripts/growth/run-render-worker.mjs`.

**Interfaces:** Produces `selectVoiceProvider(input): VoiceProviderDecision`. Swedish automatic voice selects `founder_clone` only when an active founder profile exists. English selects `generic_english` and never receives founder reference media.

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

Swedish never silently substitutes generic voice. English never includes founder reference. Disabled English experiments are skipped rather than blocking Swedish production.

- [ ] **Step 4: Wire the worker to two endpoint adapters**

Worker secret names:
```text
GROWTH_VOICE_ENDPOINT
GROWTH_VOICE_WORKER_TOKEN
GROWTH_ENGLISH_VOICE_ENDPOINT
GROWTH_ENGLISH_VOICE_TOKEN
```

Both calls require prior budget authorization. If the English provider has unknown cost, skip the English experiment.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/growth-voice-provider.test.ts
git add src/lib/growth/voice-provider.ts scripts/growth/run-render-worker.mjs tests/growth-voice-provider.test.ts
git commit -m "feat: route Swedish and English growth voices safely"
```

### Task 3: Deterministic StockBox Visual Source Manifest

**Files:** `src/lib/growth/visual-source.ts`, `tests/growth-visual-source.test.ts`, `scripts/growth/run-render-worker.mjs`.

**Interfaces:** Produces `resolveVisualSources(scene, availableAssets): VisualSourceDecision`. Priority: structured StockBox visual -> curated branded frame -> supplied controlled capture -> motion fallback.

- [ ] **Step 1: Write failing source-selection tests**

Test that structured chart/UI data wins over generic fallback, supplied controlled capture can be used, and missing assets still resolve to a motion graphic.

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

- [ ] **Step 3: Implement the no-network source resolver**

```ts
export type VisualSourceDecision =
  | { kind: "structured_chart"; payload: Record<string, unknown> }
  | { kind: "curated_frame"; assetId: string }
  | { kind: "controlled_capture"; assetId: string }
  | { kind: "motion_fallback"; headline: string; body?: string };
```

The resolver receives asset IDs/structured data only; signed URLs are supplied later by the authenticated worker API.

- [ ] **Step 4: Wire manifest resolution into rendering**

Every scene receives one resolved visual source. If a controlled capture is unavailable or expired, convert to motion fallback. Manual screen recording is never a prerequisite.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/growth-visual-source.test.ts
git add src/lib/growth/visual-source.ts scripts/growth/run-render-worker.mjs tests/growth-visual-source.test.ts
git commit -m "feat: resolve StockBox growth visuals deterministically"
```

### Task 4: Record Voice and Generative Usage in the Global Budget Ledger

**Files:** `supabase/functions/stockbox-growth-worker-api/index.ts`, `scripts/growth/run-render-worker.mjs`, `tests/growth-worker-contract.test.ts`.

**Interfaces:** Worker completion includes `usage[]` with provider, operation, estimated SEK, optional actual SEK, and idempotency key. Worker API records the entries before package promotion.

- [ ] **Step 1: Extend worker-contract tests**

```ts
usage: [
  { idempotencyKey: "job-1:voice", provider: "voice-worker", operation: "voice_sv", estimatedSek: 0.2, actualSek: 0.18 },
  { idempotencyKey: "job-1:gen:s3", provider: "gen-video", operation: "micro_scene", estimatedSek: 0.4, actualSek: 0.4 },
]
```

Assert duplicate completion cannot double-count budget rows and negative/non-finite monetary values are rejected.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-worker-contract.test.ts
```

- [ ] **Step 3: Implement completion accounting**

Inside authenticated completion logic: validate usage; insert ledger rows with unique idempotency keys; upsert media/QC; then update job state. A chargeable operation lacking required accounting may upload a raw asset but cannot be promoted to founder READY.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/growth-worker-contract.test.ts
git add supabase/functions/stockbox-growth-worker-api scripts/growth/run-render-worker.mjs tests/growth-worker-contract.test.ts
git commit -m "feat: account for growth media provider spend"
```

### Task 5: Staging Cleanup and Ready-Asset Retention

**Files:** `src/lib/growth/retention-policy.ts`, `tests/growth-retention-policy.test.ts`, `supabase/functions/stockbox-growth-engine/index.ts`.

**Interfaces:** Produces `selectRetentionActions(input): RetentionAction[]`. Staging intermediates are deleted after successful/finally-failed jobs; ready assets expire by configured days only when not required by an active/published package.

- [ ] **Step 1: Write failing retention tests**

Test: completed-job staging intermediates -> delete; failed job older than 24h staging -> delete; ready asset younger than 60d -> keep; published-package-linked ready asset -> keep; unlinked ready asset older than retention -> delete; voice profile reference -> never selected by generic cleanup.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-retention-policy.test.ts
```

- [ ] **Step 3: Implement pure retention policy**

Input includes asset kind, bucket, createdAt, render state, package status, and configured ready-retention days. `growth-voice-private` is explicitly excluded from generic cleanup.

- [ ] **Step 4: Add daily cleanup stage to the Edge engine**

List only known media rows eligible by policy, delete storage objects by stored bucket/path, then update metadata consistently. Log aggregate counts only; never log signed URLs or voice paths.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/growth-retention-policy.test.ts
git add src/lib/growth/retention-policy.ts supabase/functions/stockbox-growth-engine/index.ts tests/growth-retention-policy.test.ts
git commit -m "feat: clean growth staging and expired assets"
```

### Task 6: Regression-Protect Existing SEO and Creator Outreach

**Files:** `tests/growth-existing-channel-regression.test.ts`, `.github/workflows/growth-quality-ci.yml`.

**Interfaces:** Confirms v3 additions do not remove existing SEO, creator-outreach, metrics, optimization, or brief run modes from `stockbox-growth-engine`.

- [ ] **Step 1: Add source-contract regression tests**

Assert the engine still routes:
```text
seo
creators
metrics
optimize
brief
full
```
Also assert v3 shadow enqueue is additive and does not replace the existing v2 repurpose/distribution path during rollout.

- [ ] **Step 2: Run regression test**

```bash
npm test -- tests/growth-existing-channel-regression.test.ts
```
Expected: PASS after any needed non-behavioral extraction of run-mode constants.

- [ ] **Step 3: Add test to focused CI and commit**

```bash
git add tests/growth-existing-channel-regression.test.ts .github/workflows/growth-quality-ci.yml
git commit -m "test: preserve existing growth acquisition channels"
```

## Hardening acceptance gate

Before daily orchestration consumes these integrations:
- render-job kind contract is exact and shared by producers/worker;
- Swedish and English voice paths are intentionally distinct;
- English generic voice never receives founder reference audio;
- every scene has an automatic structured/curated/captured/fallback visual source;
- voice/generative metered usage is idempotently represented in the global budget ledger;
- staging files are cleaned automatically and final retention is bounded/configurable;
- voice-profile storage is excluded from generic retention cleanup;
- existing SEO and creator-outreach workflows remain covered and operational.
