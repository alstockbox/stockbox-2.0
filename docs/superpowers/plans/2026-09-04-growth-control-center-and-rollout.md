# Growth Control Center and Production Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the founder-facing technical growth queue with a simple READY-to-post control center, expose private final assets safely, hide recovered provider failures from the main workflow, and roll v3 from shadow mode to production canary without breaking existing v2 acquisition.

**Architecture:** The admin page reads durable v3 render/package/asset records server-side and exposes assets only through short-lived authenticated download/preview routes. UI components are split by responsibility so the page stays maintainable. Promotion from shadow to READY is feature/config-gated, with explicit database and render canary checks before v2 is de-emphasized.

**Tech Stack:** Next.js 16 App Router, React 19, server actions/routes, Supabase admin client/private Storage, existing admin authentication, Vitest, GitHub Actions, Supabase Edge Functions.

**Spec:** `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md`

## Global Constraints

- Founder workflow: preview/download ready assets, copy platform copy, upload/post, mark published.
- Founder must not need to record, edit, assemble, or troubleshoot the automatic channel.
- READY requires successful QC, required final assets, and platform packages.
- Private assets must never receive permanent public URLs.
- Signed links must be short-lived and admin-authenticated at issuance.
- Recovered Gemini/RSS/provider failures must not appear as top-level red failures.
- Diagnostics remain available but collapsed/separate from the normal action view.
- Existing v2 queue remains available during rollout and is not deleted in this implementation.
- Production rollout must not claim success until actual production deployment and canary verification are observed.

---

## File map

Create:
- `src/lib/growth/admin-growth-data.ts` — one server-side data loader for v3 dashboard view model.
- `src/lib/growth/growth-diagnostics.ts` — classify recovered/degraded/fatal workflow events.
- `src/components/admin/growth/GrowthSummary.tsx`
- `src/components/admin/growth/ReadyVideoCard.tsx`
- `src/components/admin/growth/ReadyAssetCard.tsx`
- `src/components/admin/growth/FounderScriptIdeas.tsx`
- `src/components/admin/growth/GrowthLearningBrief.tsx`
- `src/components/admin/growth/GrowthDiagnostics.tsx`
- `src/app/api/admin/growth/assets/[assetId]/route.ts` — authenticated preview/download redirect or streamed response.
- `tests/growth-admin-data.test.ts`
- `tests/growth-diagnostics.test.ts`
- `tests/growth-ready-policy.test.ts`

Modify:
- `src/app/admin/growth/page.tsx`
- `src/app/admin/growth/actions.ts`
- `src/lib/growth/publishing-package.ts` only if platform-copy view model needs a typed helper; preserve current de-duplication tests.
- `supabase/functions/stockbox-growth-engine/index.ts` — promotion flag/readiness bridge.
- `.github/workflows/growth-quality-ci.yml`

### Task 1: Build a Founder-Facing v3 Dashboard View Model

**Files:**
- Create: `src/lib/growth/admin-growth-data.ts`
- Test: `tests/growth-admin-data.test.ts`

**Interfaces:**
- Produces: `loadGrowthAdminData(client, now?): Promise<GrowthAdminViewModel>`.
- View model contains `summary`, `readyVideos`, `readyAssets`, `founderScripts`, `learningBrief`, `diagnosticsSummary`, and `legacyV2Count`.

- [ ] **Step 1: Write failing view-model tests with a fake DB adapter**

Test these rules:
- only `acq_render_jobs.state='ready'` with a passed `master_video` asset and at least one ready distribution package appears under `readyVideos`;
- no signed URL is stored in the view model;
- monthly spend uses budget-ledger actual/estimated rules;
- founder scripts are separate from automatic ready videos;
- v2 count is informational during migration.

Example assertion:
```ts
expect(view.readyVideos[0]).toMatchObject({
  renderJobId: "job-1",
  title: "Tre risker",
  masterAssetId: "asset-video",
  coverAssetId: "asset-cover",
});
expect(JSON.stringify(view)).not.toContain("token=");
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-admin-data.test.ts
```
Expected: FAIL because loader does not exist.

- [ ] **Step 3: Implement one focused server data loader**

Query in bounded batches:
- latest metrics / founder brief;
- current-month budget ledger;
- ready render jobs;
- passed media assets for those jobs;
- ready distribution packages;
- current non-expired manual script ideas;
- recent workflow runs/errors for diagnostics classification.

Do not issue storage signed URL calls here; asset links point to the authenticated app route by asset ID.

- [ ] **Step 4: Run test and typecheck**

```bash
npm test -- tests/growth-admin-data.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/growth/admin-growth-data.ts tests/growth-admin-data.test.ts
git commit -m "feat: load founder growth dashboard data"
```

### Task 2: Classify Diagnostics as Healthy, Degraded, or Fatal

**Files:**
- Create: `src/lib/growth/growth-diagnostics.ts`
- Test: `tests/growth-diagnostics.test.ts`

**Interfaces:**
- Produces `classifyGrowthRun({ run, relatedErrors }): GrowthDiagnosticState`.
- States: `healthy | degraded_recovered | action_required`.

- [ ] **Step 1: Write failing tests for the exact current failure pattern**

```ts
it("treats Gemini 503 plus successful deterministic workflow as recovered", () => {
  expect(classifyGrowthRun({
    run: { workflow: "SB-13-edge-v2", status: "success", detail: { ai: 0, deterministic: 2 } },
    relatedErrors: [{ source: "SB-AI-edge-v2", error_type: "gemini_failure", message: "Gemini 503" }],
  }).state).toBe("degraded_recovered");
});

it("requires action when render job failed with no fallback", () => {
  expect(classifyGrowthRun({
    run: { workflow: "SB-15-render-v3", status: "failed", detail: {} },
    relatedErrors: [{ source: "render-worker", error_type: "render_failed", message: "ffmpeg failed" }],
  }).state).toBe("action_required");
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-diagnostics.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement classification rules**

Rules:
- workflow `status=success` + fallback counters >0 -> `degraded_recovered`;
- provider timeout/503 alone never overrides a later successful workflow;
- failed render/storage/QC with no ready replacement -> `action_required`;
- clean success -> `healthy`;
- return one short Swedish founder-facing sentence and preserve raw technical details only for expanded diagnostics.

- [ ] **Step 4: Run tests and commit**

```bash
npm test -- tests/growth-diagnostics.test.ts
git add src/lib/growth/growth-diagnostics.ts tests/growth-diagnostics.test.ts
git commit -m "feat: classify recovered growth provider failures"
```

### Task 3: Add Authenticated Private Asset Preview/Download Route

**Files:**
- Create: `src/app/api/admin/growth/assets/[assetId]/route.ts`
- Test: `tests/growth-asset-route-policy.test.ts`

**Interfaces:**
- `GET /api/admin/growth/assets/:assetId?download=1` requires admin auth.
- Looks up `acq_media_assets` by ID and issues a short-lived signed URL from the stored private bucket/path.
- Never accepts a caller-provided bucket/path.

- [ ] **Step 1: Write failing policy/helper tests**

Extract a pure helper:
```ts
resolveGrowthAssetAccess(asset, requestedDownload): {
  bucket: "growth-ready-assets";
  path: string;
  expiresIn: 120;
  disposition: "inline" | "attachment";
}
```

Tests reject:
- `qc_status !== 'passed'`;
- staging/voice-reference asset kinds;
- bucket other than `growth-ready-assets`;
- path traversal.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-asset-route-policy.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement route**

Flow:
1. `requireAdmin()`;
2. fetch media asset by ID with server-side admin client;
3. run access helper;
4. create signed URL with 120-second TTL;
5. redirect with `Cache-Control: private, no-store` or stream if redirect headers cannot enforce disposition reliably;
6. return 404 for unauthorized asset type/path without revealing private bucket contents.

- [ ] **Step 4: Run focused test/typecheck**

```bash
npm test -- tests/growth-asset-route-policy.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/growth/assets tests/growth-asset-route-policy.test.ts
git commit -m "feat: serve private growth assets to admins"
```

### Task 4: Split Growth Control Center into Action-Focused Components

**Files:**
- Create component files under `src/components/admin/growth/` listed above.
- Modify: `src/app/admin/growth/page.tsx`

**Interfaces:**
- Page remains server-rendered and calls only `loadGrowthAdminData()` plus existing admin auth.
- Components receive serializable view-model props and perform no direct DB queries.

- [ ] **Step 1: Replace the technical top section with GrowthSummary**

Show exactly these founder metrics when available:
```text
Besök idag
7-dagarssnitt
Mål: 100/dag
Förändring mot föregående 7 dagar
Budget: X / 50 kr (hard cap 75 kr)
```

If metrics are missing, show `—` rather than fake zero unless the underlying metric explicitly equals zero.

- [ ] **Step 2: Add READY video cards**

Each `ReadyVideoCard` contains:
- rank / title / topic;
- video preview using authenticated asset route;
- `Ladda ner MP4`;
- `Ladda ner cover`;
- separate copy controls for Instagram, Facebook, TikTok, YouTube;
- recommended time;
- `Jag har publicerat` and `Hoppa över`.

No card may instruct the founder to record voice, open CapCut, or assemble scenes.

- [ ] **Step 3: Add image/carousel ready cards**

For carousels expose individual slide previews plus a ZIP asset when available. For static image/text packages expose the final image/text, not production instructions.

- [ ] **Step 4: Add optional FounderScriptIdeas**

Heading must make optionality explicit, e.g. `Om du själv vill spela in idag`. Provide 1-2 scripts with copy button. Do not mix these with READY automatic videos.

- [ ] **Step 5: Add GrowthLearningBrief and collapsed diagnostics**

Main view shows the learning sentence. Diagnostics start collapsed and summarize `healthy/degraded/action required`; raw provider messages are only visible after expansion.

- [ ] **Step 6: Remove old "video-kit" instructions from the primary v3 READY path**

Keep legacy v2 card section behind a temporary `Legacy v2` or fallback area only while v3 rollout is incomplete.

- [ ] **Step 7: Run build/typecheck**

```bash
npm run typecheck
npm run build
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/growth/page.tsx src/components/admin/growth
git commit -m "feat: make growth center ready to post"
```

### Task 5: Update Server Actions for v3 Packages

**Files:**
- Modify: `src/app/admin/growth/actions.ts`
- Test: `tests/growth-ready-policy.test.ts`

**Interfaces:**
- Produces `setDistributionPackageStatusAction(formData)` for `ready | posted | deferred` package transitions.
- Existing `setDistributionStatusAction` remains for legacy v2 until final cleanup in a later project.

- [ ] **Step 1: Write failing transition-policy tests**

Pure policy must allow:
```text
ready -> posted
ready -> deferred
deferred -> ready (manual restore)
```
and reject:
```text
failed -> posted
draft -> posted
unknown status
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-ready-policy.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement transition helper and server action**

When posting:
- set package `status='posted'`, `published_at=now()`;
- do not change master asset QC state;
- maintain platform-specific package rows separately even when they share one MP4.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/growth-ready-policy.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/growth/actions.ts tests/growth-ready-policy.test.ts
git commit -m "feat: manage v3 distribution package status"
```

### Task 6: Build Platform Packages from One Master MP4

**Files:**
- Modify: `supabase/functions/stockbox-growth-engine/index.ts`
- Modify: `src/lib/growth/publishing-package.ts`
- Test: `tests/growth-publishing-package.test.ts`

**Interfaces:**
- One ready master render creates/upserts four video distribution packages:
  - `instagram_reel`
  - `facebook_reel`
  - `tiktok`
  - `youtube_short`
- Each package has its own UTM URL/copy and references the same master video asset ID.

- [ ] **Step 1: Extend tests for four-platform master reuse**

Assert:
- exactly one URL occurrence in each final copy package;
- UTM source differs by platform;
- YouTube gets title + description;
- Instagram/Facebook/TikTok get platform-appropriate captions;
- master asset ID can be shared without sharing the platform package ID.

- [ ] **Step 2: Implement package upsert after render completion**

Use unique idempotency key:
```text
v3:<render_job_id>:<platform>
```

Package status is:
- `draft` in shadow mode;
- `ready` only after promotion is enabled and render/QC required assets pass.

- [ ] **Step 3: Preserve current v2 copy cleaning behavior**

Run:
```bash
npm test -- tests/growth-publishing-package.test.ts
```
Expected: all old and new tests PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/stockbox-growth-engine/index.ts src/lib/growth/publishing-package.ts tests/growth-publishing-package.test.ts
git commit -m "feat: package master growth videos per platform"
```

### Task 7: Add Voice Profile Upload/Activation Admin Flow

**Files:**
- Create: `src/app/admin/growth/voice/page.tsx`
- Create: `src/app/admin/growth/voice/actions.ts`
- Create: `src/lib/growth/voice-profile.ts`
- Test: `tests/growth-voice-profile.test.ts`

**Interfaces:**
- One-time founder flow uploads 5-10 minutes of Swedish reference audio to `growth-voice-private` and creates/activates one `acq_voice_profiles` row.
- No public URL and no GitHub artifact is produced.

- [ ] **Step 1: Write failing validation tests**

Accept only configured audio MIME types (`audio/wav`, `audio/mpeg`, `audio/mp4`, `audio/x-m4a` where browser/runtime reports it), max 25 MB, Swedish profile language, and explicit consent checkbox.

Reject upload when consent is false.

- [ ] **Step 2: Implement server-side upload action**

Flow:
1. require admin;
2. validate file size/type and consent;
3. store at ID-only private path, e.g. `profiles/<profile_uuid>/reference.<ext>`;
4. insert metadata row with `consent_at=now()`, `status='pending'`;
5. never write raw file bytes or signed URL to logs.

- [ ] **Step 3: Add activation smoke action**

An admin-only action requests a short test synthesis such as a fixed StockBox sentence through the approved voice worker and stores the sample in staging. Founder can listen and explicitly set profile `active`; failed sample sets profile `failed` with non-sensitive reason.

- [ ] **Step 4: Run tests/build**

```bash
npm test -- tests/growth-voice-profile.test.ts
npm run typecheck
npm run build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/growth/voice src/lib/growth/voice-profile.ts tests/growth-voice-profile.test.ts
git commit -m "feat: add private founder voice profile setup"
```

### Task 8: Shadow-to-Canary Promotion Gate

**Files:**
- Modify: `supabase/functions/stockbox-growth-engine/index.ts`
- Create: `tests/growth-promotion-policy.test.ts`

**Interfaces:**
- `canPromoteRenderToReady(input): { allowed: boolean; reasons: string[] }`.
- Promotion requires config + QC + assets + active Swedish voice profile for Swedish automatic videos + budget telemetry.

- [ ] **Step 1: Write failing promotion tests**

Promotion must be false if any is true:
- `growth_render_shadow_mode=true`;
- render not `ready`;
- master/cover assets missing or QC failed;
- Swedish video has no active founder voice profile;
- budget ledger telemetry missing for a paid operation;
- package copy missing tracked URL.

Promotion true only when all gates pass.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-promotion-policy.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement policy and wire it before package `ready` status**

Do not let UI code decide promotion. The orchestrator/database package state is authoritative.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/growth-promotion-policy.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/stockbox-growth-engine/index.ts tests/growth-promotion-policy.test.ts
git commit -m "feat: gate growth render promotion"
```

### Task 9: Production Canary Procedure

**Files:**
- Modify: `.github/workflows/growth-quality-ci.yml` if new tests are not already included.
- Update: `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md` only if implementation discoveries require an explicit approved clarification; otherwise leave spec unchanged.

- [ ] **Step 1: Run complete focused feature verification**

Run all growth tests plus:
```bash
npm run typecheck
npm run build
GROWTH_WORKER_FAKE=1 node scripts/growth/run-render-worker.mjs
```
Expected: PASS.

- [ ] **Step 2: Apply database migration to production only after migration verification**

Verify immediately:
```sql
select count(*) from acq_render_jobs;
select id, public from storage.buckets where id in ('growth-voice-private','growth-render-staging','growth-ready-assets');
select key,value from acq_config where key in ('growth_monthly_target_sek','growth_monthly_hard_cap_sek','growth_render_shadow_mode');
```
Expected: three private buckets, budget target 50, hard cap 75, shadow mode true.

- [ ] **Step 3: Deploy worker API and updated growth Edge function in shadow mode**

Run one controlled full engine invocation. Verify:
- legacy v2 queue still populated/usable;
- one or two v3 render jobs can be created;
- GitHub worker claims and completes a canary;
- final assets are private and QC passed;
- distribution packages remain `draft` while shadow mode=true.

- [ ] **Step 4: Complete the one-time founder voice setup**

The only required founder setup step for automatic Swedish voice:
1. open `/admin/growth/voice`;
2. upload the approved 5-10 minute clean Swedish recording;
3. listen to the generated private test sample;
4. activate profile if it is recognizably the founder and content-appropriate.

Do not ask the founder to paste audio or provider secrets into chat.

- [ ] **Step 5: Enable one-video canary**

Set config atomically:
```text
growth_render_shadow_mode=false
growth_daily_master_video_max=1
```
Then run one scheduled/controlled cycle.

Expected in Growth Control Center:
- exactly the QC-passing canary video is READY;
- playable preview;
- downloadable MP4/cover;
- four copy packages;
- optional founder scripts separate;
- recovered provider failures not presented as fatal.

- [ ] **Step 6: Verify actual spend and privacy before increasing to 0-2 mode**

Check:
```sql
select sum(coalesce(actual_sek, estimated_sek)) from acq_budget_ledger where created_at >= date_trunc('month', now());
select bucket_id, count(*) from storage.objects where bucket_id like 'growth-%' group by bucket_id;
```
Confirm no bucket is public, no signed URL is persisted in metadata/logs, and projected monthly spend remains compatible with 50 SEK target/75 SEK hard cap.

- [ ] **Step 7: Raise daily max from 1 to 2 only after two successful canaries**

Set `growth_daily_master_video_max=2`. Capacity policy may still choose 0 or 1 based on quality/budget.

- [ ] **Step 8: Verify production frontend deployment independently**

Because Vercel has previously hit build-rate limits, check the actual production deployment for the commit containing Growth Control Center v3. Do not infer production UI from GitHub merge success.

- [ ] **Step 9: Commit any rollout documentation/config-as-code changes**

```bash
git add .github/workflows/growth-quality-ci.yml
git commit -m "chore: finalize autonomous growth rollout gates"
```

### Task 10: Final Acceptance Review Against the Approved Spec

- [ ] **Step 1: Check each numbered acceptance criterion in the design spec**

Record evidence for all 14 criteria, including:
- scheduled cloud run;
- playable vertical MP4 with cloned voice/subtitles/cover;
- no founder editing/recording required;
- same master reused across four platforms with distinct UTMs;
- 0-2 automatic video policy;
- 1-2 optional founder scripts;
- generative scene fallback;
- provider fallbacks;
- budget target/hard cap;
- voice privacy;
- READY only after QC;
- simple control center;
- learning feeds allocation;
- laptop-off operation.

- [ ] **Step 2: Run security scan for forbidden artifacts**

Search repository history/current tree for:
```text
voice recordings
signed Supabase storage URLs
SUPABASE_SERVICE_ROLE_KEY values
GROWTH_WORKER_TOKEN values
GROWTH_VOICE_WORKER_TOKEN values
Modal tokens
```
Expected: no secret/media values committed.

- [ ] **Step 3: Run final targeted verification and capture results**

```bash
npm test -- tests/growth-*.test.ts
npm run typecheck
npm run build
```
Also require latest Growth Render Worker smoke to be green.

- [ ] **Step 4: Only then declare v3 ready-to-post production complete**

Do not equate the 100-visits/day optimization target with implementation completion. Report actual rolling-7d traffic separately from software readiness.

## Control-center/rollout acceptance gate

The project is ready for normal use when:
- the founder opens Growth Control Center and sees finished assets rather than editing instructions;
- MP4/cover/carousel assets can be previewed/downloaded through admin-authenticated short-lived access;
- four platform packages are distinct and tracked;
- Swedish automatic video uses the approved active founder voice profile;
- recovered provider errors are summarized as degraded/recovered rather than alarming failures;
- one-video canary and then 0-2 production mode have passed real cloud rendering/QC;
- global budget and private storage are verified in production;
- latest frontend is verified as actually deployed, not merely merged.
