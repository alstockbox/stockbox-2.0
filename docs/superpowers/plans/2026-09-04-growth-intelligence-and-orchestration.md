# Growth Intelligence and Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing StockBox growth engine learn from performance, allocate 70/20/10 exploit/explore/long-shot capacity, choose 0-2 automatic videos/day under the global budget, generate 1-2 optional founder scripts, enqueue render jobs, and produce platform-specific ready packages without breaking v2 fallbacks.

**Architecture:** Preserve the current Supabase Edge growth engine as the daily orchestrator but move policy into small testable modules shared with the app where practical. The orchestrator records normalized spend, selects a diversified portfolio of opportunities, creates RenderSpecs/jobs in shadow mode, keeps v2 queue generation active during rollout, and only later promotes v3 packages to the founder READY queue.

**Tech Stack:** TypeScript, Vitest, Supabase Edge Functions (Deno), Supabase Postgres, existing quality-v2 modules and acquisition metrics.

**Spec:** `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md`

## Global Constraints

- Initial allocation policy is 70% exploit, 20% explore, 10% long-shot/diversification.
- Weak channels are down-weighted, not permanently killed, unless unsafe/unsupported/materially wasteful.
- Optimize useful traffic and downstream customer value, not raw views.
- 100 relevant unique visits/day rolling-7d is the target, not a guarantee.
- Automatic master-video output is 0-2/day.
- 1-2 founder-recorded script ideas/day are independent bonus output and may not block automation.
- Total recurring spend target <= 50 SEK/month; hard cap 75 SEK/month.
- Existing deterministic content fallback and evergreen discovery must remain functional.
- v3 begins in shadow mode; v2 queue remains the production compatibility path until rollout acceptance.

---

## File map

Create:
- `src/lib/growth/explore-exploit.ts`
- `src/lib/growth/growth-score.ts`
- `src/lib/growth/storyboard.ts`
- `src/lib/growth/manual-script-ideas.ts`
- `src/lib/growth/render-job-policy.ts`
- `tests/growth-explore-exploit.test.ts`
- `tests/growth-growth-score.test.ts`
- `tests/growth-storyboard.test.ts`
- `tests/growth-manual-script-ideas.test.ts`
- `tests/growth-render-job-policy.test.ts`

Mirror for Edge where imports cannot safely reuse Next-path aliases:
- `supabase/functions/stockbox-growth-engine/v3/explore-exploit.ts`
- `supabase/functions/stockbox-growth-engine/v3/storyboard.ts`
- `supabase/functions/stockbox-growth-engine/v3/budget.ts`

Modify:
- `supabase/functions/stockbox-growth-engine/index.ts`
- `supabase/functions/stockbox-growth-engine/quality.ts` only if a shared contract import is needed; do not weaken current quality rules.
- `.github/workflows/growth-quality-ci.yml`

### Task 1: Explore/Exploit/Long-Shot Allocator

**Files:**
- Create: `src/lib/growth/explore-exploit.ts`
- Test: `tests/growth-explore-exploit.test.ts`

**Interfaces:**
- Consumes scored candidates with `candidateId`, `topicKey`, `channel`, `expectedGrowthScore`, `noveltyScore`, `costSek`, and `qualityScore`.
- Produces `allocateGrowthCandidates(candidates, slots, ratios): AllocationPick[]` with bucket `exploit | explore | longshot`.

- [ ] **Step 1: Write failing tests for policy and diversity**

```ts
import { describe, expect, it } from "vitest";
import { allocateGrowthCandidates } from "@/lib/growth/explore-exploit";

const candidates = [
  { candidateId: "a", topicKey: "risk", channel: "reel", expectedGrowthScore: 95, noveltyScore: 10, costSek: 0, qualityScore: 100 },
  { candidateId: "b", topicKey: "debt", channel: "reel", expectedGrowthScore: 90, noveltyScore: 20, costSek: 0, qualityScore: 100 },
  { candidateId: "c", topicKey: "cashflow", channel: "carousel", expectedGrowthScore: 60, noveltyScore: 95, costSek: 0, qualityScore: 95 },
  { candidateId: "d", topicKey: "valuation", channel: "reel", expectedGrowthScore: 35, noveltyScore: 80, costSek: 0, qualityScore: 90 },
];

it("keeps exploratory capacity instead of taking only highest historic score", () => {
  const picks = allocateGrowthCandidates(candidates, 4, { exploit: .7, explore: .2, longshot: .1 });
  expect(picks.some((pick) => pick.bucket === "explore")).toBe(true);
});

it("never selects candidates below quality floor", () => {
  const picks = allocateGrowthCandidates([...candidates, { ...candidates[0], candidateId: "bad", qualityScore: 40 }], 4, { exploit: .7, explore: .2, longshot: .1 });
  expect(picks.map((x) => x.candidateId)).not.toContain("bad");
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-explore-exploit.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement deterministic allocation**

Rules:
- filter quality `<72` before bucket logic;
- calculate slot counts by largest-remainder allocation, guaranteeing at least one explore slot when `slots >= 4` and candidates exist;
- exploit sorts primarily by expectedGrowthScore/cost efficiency;
- explore sorts primarily by novelty then expected score;
- long-shot samples deterministically from low-history but quality-approved candidates using date/content hash seed supplied by caller;
- avoid duplicate `topicKey` until each available topic has had a chance.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/growth-explore-exploit.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/growth/explore-exploit.ts tests/growth-explore-exploit.test.ts
git commit -m "feat: add growth explore exploit allocator"
```

### Task 2: Configurable Growth Score

**Files:**
- Create: `src/lib/growth/growth-score.ts`
- Test: `tests/growth-growth-score.test.ts`

**Interfaces:**
- Produces `calculateGrowthScore(metrics, weights): GrowthScoreResult`.
- Missing metrics are excluded and remaining weights renormalized; missing data is not treated as zero performance.

- [ ] **Step 1: Write failing tests**

Cover:
- traffic/CTR dominate initial sparse-data weights;
- signup/activation/paid signals increase score when present;
- missing impression data does not zero the asset;
- cost penalty lowers otherwise equal candidates;
- score remains 0-100.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-growth-score.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement weighted normalized scoring**

Default early-stage weights:
```ts
export const EARLY_GROWTH_WEIGHTS = {
  qualifiedVisits: 0.30,
  ctr: 0.25,
  signupConversion: 0.20,
  engagement: 0.10,
  activationConversion: 0.10,
  costEfficiency: 0.05,
} as const;
```

Expose weights as input so later production config can shift toward activation/revenue without code changes.

- [ ] **Step 4: Run tests and commit**

```bash
npm test -- tests/growth-growth-score.test.ts
git add src/lib/growth/growth-score.ts tests/growth-growth-score.test.ts
git commit -m "feat: score growth content by customer value"
```

### Task 3: Deterministic Storyboard Builder

**Files:**
- Create: `src/lib/growth/storyboard.ts`
- Test: `tests/growth-storyboard.test.ts`

**Interfaces:**
- Consumes title/hook/script/template plus optional structured StockBox visual references.
- Produces a complete validated `RenderSpec` with scene timings, subtitles, CTA, and optional generated-scene slots.

- [ ] **Step 1: Write failing tests**

Assert:
- 30-40 second educational script creates hook, body, CTA scenes;
- CTA occupies final 3-5 seconds;
- no generated scene is required;
- missing StockBox screenshot references turn into motion-graphic scenes rather than invalid spec;
- result passes `RenderSpecSchema`.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-storyboard.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement a deterministic scene planner**

Use sentence/chunk boundaries rather than LLM timing. A typical 35-second video should allocate:
```text
0-2.5s hook
2.5-10s body scene 1
10-18s body scene 2
18-27s body scene 3
27-31s optional visual/motion scene
31-35s CTA
```

Subtitles are generated from the same script chunks so the video and copy cannot drift to a different topic.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/growth-storyboard.test.ts tests/growth-render-spec.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/growth/storyboard.ts tests/growth-storyboard.test.ts
git commit -m "feat: build deterministic growth storyboards"
```

### Task 4: Optional Founder Script Ideas

**Files:**
- Create: `src/lib/growth/manual-script-ideas.ts`
- Test: `tests/growth-manual-script-ideas.test.ts`

**Interfaces:**
- Produces `buildFounderScriptIdeas(selectedTopics, max=2): FounderScriptIdea[]`.
- These ideas are never inserted into automatic render jobs.

- [ ] **Step 1: Write failing tests**

Test that:
- output count is 1-2 when eligible topics exist;
- each item has `hook`, `script`, `screenDirections`, `caption`, `cta`, `recommendedPlatform`;
- `automaticRender=false` is immutable in returned type;
- no idea is emitted for an irrelevant/quality-rejected topic.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-manual-script-ideas.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement template-backed fallback output**

The function accepts already generated AI copy when available but can build a deterministic Swedish fallback from topic/category. It must never depend on the voice/render worker.

- [ ] **Step 4: Run test and commit**

```bash
npm test -- tests/growth-manual-script-ideas.test.ts
git add src/lib/growth/manual-script-ideas.ts tests/growth-manual-script-ideas.test.ts
git commit -m "feat: add optional founder growth scripts"
```

### Task 5: Render Job Selection Policy

**Files:**
- Create: `src/lib/growth/render-job-policy.ts`
- Test: `tests/growth-render-job-policy.test.ts`

**Interfaces:**
- Consumes quality-approved content candidates, current monthly spend, projected voice/render costs, and render shadow-mode flag.
- Produces `selectAutomaticRenderJobs(input): RenderJobCandidate[]`, count 0-2.

- [ ] **Step 1: Write failing tests**

Cover:
- two strong candidates + low spend -> max 2;
- 46 SEK monthly spend -> max 1;
- 75 SEK -> 0 paid-render jobs;
- no candidate quality >=72 -> 0;
- shadow mode still selects/enqueues jobs but marks `exposeToReady=false`;
- English experiment cannot displace all Swedish core capacity.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-render-job-policy.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement using existing Budget Governor**

Do not duplicate thresholds. Call `chooseDailyVideoCapacity()` and `evaluateBudget()` from the foundation plan. Prefer Swedish candidates first, then allow at most one English experiment when budget and explore allocation permit.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/growth-render-job-policy.test.ts tests/growth-budget-governor.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/growth/render-job-policy.ts tests/growth-render-job-policy.test.ts
git commit -m "feat: select daily automatic render jobs"
```

### Task 6: Mirror Pure v3 Policy into the Edge Function

**Files:**
- Create: `supabase/functions/stockbox-growth-engine/v3/explore-exploit.ts`
- Create: `supabase/functions/stockbox-growth-engine/v3/storyboard.ts`
- Create: `supabase/functions/stockbox-growth-engine/v3/budget.ts`
- Modify: `supabase/functions/stockbox-growth-engine/index.ts`

**Interfaces:**
- Edge mirrors must expose the same input/output JSON shapes as app modules.
- No Next.js aliases/imports in Deno Edge source.

- [ ] **Step 1: Add contract parity fixtures**

Create shared JSON fixtures under:
```text
tests/fixtures/growth-v3/allocation.json
tests/fixtures/growth-v3/storyboard.json
```

Add a Vitest test that app policy outputs match stored expected JSON. Add a Deno-side self-test function or unit script that runs the mirror with the same fixture when the Edge environment supports tests.

- [ ] **Step 2: Copy policy, not infrastructure**

Mirror only pure logic. DB access, logging, and provider calls stay in `index.ts`. Add a comment referencing the app module and fixture contract so later changes update both deliberately.

- [ ] **Step 3: Run app parity tests and Edge type/lint checks available in repo**

At minimum:
```bash
npm test -- tests/growth-explore-exploit.test.ts tests/growth-storyboard.test.ts tests/growth-render-job-policy.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/stockbox-growth-engine/v3 tests/fixtures/growth-v3
git commit -m "feat: mirror growth v3 policy to edge"
```

### Task 7: Retrofit Gemini/AI Spend into the Global Budget Ledger

**Files:**
- Modify: `supabase/functions/stockbox-growth-engine/index.ts`

**Interfaces:**
- Existing `acq_ai_usage` remains raw telemetry.
- Every successful/attempted metered growth AI call also records one idempotent normalized `acq_budget_ledger` row.
- All new paid calls must be authorized against aggregate ledger spend before invocation.

- [ ] **Step 1: Characterize current behavior before edit**

Run/search current Edge source and capture tests for:
- current `monthAiSpend()` behavior;
- `logAiUsage()` idempotency key;
- Gemini retry/fallback behavior.

Do not remove deterministic fallback.

- [ ] **Step 2: Add Edge helpers**

Implement:
```ts
async function monthGrowthSpend(): Promise<number>
async function authorizePaidGrowthCall(projectedCostSek: number | null, optional: boolean): Promise<BudgetDecision>
async function logGrowthSpend(entry: { idempotencyKey: string; provider: string; operation: string; estimatedSek: number; actualSek?: number | null; contentId?: string; renderJobId?: string }): Promise<void>
```

`monthGrowthSpend()` reads `actual_sek` when set, else `estimated_sek` from `acq_budget_ledger` since UTC month start.

- [ ] **Step 3: Gate Gemini calls before network invocation**

Flow:
```text
known projected cost -> authorize -> call provider -> log raw acq_ai_usage + normalized ledger
unknown projected cost -> skip provider -> deterministic fallback
hard cap -> skip provider -> deterministic fallback
```

A provider 503 remains a degraded provider event, not a failed full workflow if fallback succeeds.

- [ ] **Step 4: Preserve existing AI usage telemetry**

Do not delete or repurpose `acq_ai_usage`; maintain it for debugging/model usage while decisions move to `acq_budget_ledger`.

- [ ] **Step 5: Run focused growth tests/typecheck**

```bash
npm test -- tests/growth-budget-governor.test.ts tests/growth-budget-ledger.test.ts tests/growth-content-quality.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/stockbox-growth-engine/index.ts
git commit -m "feat: govern growth AI with global budget ledger"
```

### Task 8: Enqueue v3 Render Jobs in Shadow Mode

**Files:**
- Modify: `supabase/functions/stockbox-growth-engine/index.ts`

**Interfaces:**
- Adds a v3 stage after content selection/production and before final brief.
- Writes `acq_render_jobs` idempotently.
- Current v2 `acq_distribution_queue` repurposing remains active.

- [ ] **Step 1: Add `enqueueV3Renders(cfg)`**

Algorithm:
1. load today/high-priority v2-quality content candidates;
2. load current global spend;
3. calculate performance/growth score from available metrics;
4. allocate exploit/explore/long-shot candidates;
5. choose 0-2 automatic render jobs;
6. build deterministic RenderSpec/storyboard;
7. insert render job with idempotency key `v3:<YYYY-MM-DD>:<content_id>:<template>:<language>`;
8. set `state='queued'` and `render_spec`;
9. do not expose to READY while `growth_render_shadow_mode=true`.

- [ ] **Step 2: Ensure repeated full runs are idempotent**

Invoke the stage twice in a controlled test environment and assert the second run inserts zero duplicate `acq_render_jobs` rows for the same day/content/template/language.

- [ ] **Step 3: Keep v2 distribution behavior unchanged**

Run existing growth quality/publishing tests and verify the six-post v2 rebalance function remains untouched.

- [ ] **Step 4: Add workflow logging**

Record one `acq_workflow_runs` event such as `SB-15-render-enqueue-v3` with:
```json
{
  "selected": 2,
  "shadow_mode": true,
  "budget_mode": "normal",
  "skipped_budget": 0,
  "skipped_quality": 0
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/stockbox-growth-engine/index.ts
git commit -m "feat: enqueue shadow growth video renders"
```

### Task 9: Generate and Persist 1-2 Optional Founder Scripts Daily

**Files:**
- Modify: `supabase/functions/stockbox-growth-engine/index.ts`

**Interfaces:**
- Writes `acq_manual_script_ideas` independently of render jobs.
- Uses same topic quality gate but separate idempotency key/day.

- [ ] **Step 1: Add deterministic fallback first**

If Gemini is unavailable or budget-blocked, still create 1-2 useful Swedish founder scripts from quality-approved evergreen topics.

- [ ] **Step 2: Add optional AI enhancement only when authorized**

AI may improve hook/naturalness but cannot be required for the daily script ideas.

- [ ] **Step 3: Test independence from automatic videos**

In a test/shadow run where video capacity=0 due budget, assert manual script ideas are still created because their deterministic path costs 0.

- [ ] **Step 4: Log one workflow result**

Use `SB-16-founder-scripts-v3` with counts `created`, `ai_enhanced`, `deterministic`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/stockbox-growth-engine/index.ts
git commit -m "feat: generate optional founder scripts daily"
```

### Task 10: Learn from Attribution and Update the Daily Brief

**Files:**
- Modify: `supabase/functions/stockbox-growth-engine/index.ts`

**Interfaces:**
- Brief must state what changed in content allocation using measured data, while distinguishing low-sample inference from robust learning.

- [ ] **Step 1: Add performance aggregation by content/package ID**

Join or aggregate existing `acq_events`/metrics using UTM content IDs. Do not require platform impression data when unavailable.

- [ ] **Step 2: Compute configurable Growth Scores**

Persist score inputs/weights in `acq_growth_decisions.detail` or equivalent existing JSON field so decisions are auditable.

- [ ] **Step 3: Add cautious learning copy**

Examples:
```text
"Riskanalys gav högre kvalificerad trafik än värderingscontent i det lilla datamaterialet; motorn ökar därför risk-teman försiktigt idag."
```
Do not claim causality or strong learning from tiny sample sizes.

- [ ] **Step 4: Keep provider errors out of founder-facing success summary**

If Gemini/RSS failed but fallback completed, brief reports the workflow as completed with fallback. Detailed error rows stay in diagnostics.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/stockbox-growth-engine/index.ts
git commit -m "feat: feed growth performance into daily allocation"
```

### Task 11: Expand Focused CI and Run Shadow Canary

**Files:**
- Modify: `.github/workflows/growth-quality-ci.yml`

- [ ] **Step 1: Add all new pure-policy tests to Growth Quality CI**

Run:
```bash
npm test -- tests/growth-content-quality.test.ts tests/growth-publishing-package.test.ts tests/growth-budget-governor.test.ts tests/growth-budget-ledger.test.ts tests/growth-render-spec.test.ts tests/growth-explore-exploit.test.ts tests/growth-growth-score.test.ts tests/growth-storyboard.test.ts tests/growth-manual-script-ideas.test.ts tests/growth-render-job-policy.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 2: Deploy Edge function to a non-production/canary target when available**

Run status/discover/full in shadow mode. Expected:
- v2 queue still works;
- v3 render jobs are created but not shown READY;
- global budget ledger receives normalized Gemini rows;
- hard-cap simulation blocks paid calls;
- manual founder scripts appear even if video capacity is zero.

- [ ] **Step 3: Verify no production READY promotion yet**

SQL assertion:
```sql
select count(*) from acq_distribution_packages where status = 'ready';
```
Expected during pure shadow canary: `0` unless a deliberate test package was isolated and cleaned.

- [ ] **Step 4: Commit CI change**

```bash
git add .github/workflows/growth-quality-ci.yml
git commit -m "ci: verify growth intelligence v3"
```

## Intelligence/orchestration acceptance gate

Before UI/rollout work:
- 70/20/10 allocation is deterministic and quality-gated;
- Growth Score handles sparse metrics without treating missing data as failure;
- 0-2 render jobs/day is enforced through the global budget policy;
- v3 job creation is idempotent;
- v2 queue continues to operate unchanged;
- 1-2 founder scripts/day work even with video capacity zero;
- normalized spend includes current LLM usage;
- provider failures that fall back do not mark the whole engine failed;
- shadow canary creates render jobs without exposing unverified assets as READY.
