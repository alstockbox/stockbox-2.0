# StockBox Intelligence Engine v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, explainable Mispricing, Inflection and profile-aware Opportunity assessments without weakening the existing StockBox Core Score.

**Architecture:** New intelligence modules consume the already reconciled `AnalysisReport` / financial metrics and return separate typed assessments with strict coverage/confidence gates. The canonical Core Score remains unchanged; `OpportunityAssessment` is a presentation layer that combines available components according to the active Analysis Lens. Data-provider migration is guarded separately so production is not degraded before a commercially licensed market-data source is configured.

**Tech Stack:** TypeScript, Next.js, Vitest, existing StockBox analysis engine and report components.

**Spec:** `docs/superpowers/specs/2026-09-01-stockbox-intelligence-engine-v3-design.md`

## Global Constraints

- Raw facts are immutable inputs; intelligence outputs are derived only.
- Missing data is never converted to zero.
- No high Inflection score from a single signal family.
- Core Score stays independent from Mispricing and Inflection.
- Critical/high financial-risk evidence must be able to cap or penalize opportunity signals.
- Existing archetype rules remain authoritative.
- No new market-data provider is activated without explicit commercial rights.
- No production claim of predictive hit rate without point-in-time out-of-sample evidence.

---

### Task 1: Intelligence types and shared scoring primitives

**Files:**
- Modify: `src/lib/analysis/types.ts`
- Create: `src/lib/analysis/intelligence-common.ts`
- Test: `tests/analysis/intelligence-common.test.ts`

**Interfaces:**
- Produces `IntelligenceEvidence`, `IntelligencePillar`, `MispricingAssessment`, `InflectionAssessment`, `OpportunityAssessment`.
- Produces helpers for weighted scoring that exclude unavailable inputs, enforce minimum coverage, and clamp to 0–100.

- [ ] Write failing tests that verify unavailable evidence is excluded rather than scored as zero, coverage is weight-based, and minimum-coverage failure returns `score: null`.
- [ ] Run targeted Vitest and confirm RED.
- [ ] Implement types and shared helpers.
- [ ] Run targeted Vitest and confirm GREEN.
- [ ] Commit.

### Task 2: Mispricing Engine

**Files:**
- Create: `src/lib/analysis/mispricing.ts`
- Test: `tests/analysis/mispricing.test.ts`

**Interfaces:**
- Consumes `AnalysisReport`.
- Produces `computeMispricingAssessment(report): MispricingAssessment`.

- [ ] Write failing tests for: high-quality discounted company; cheap deteriorating value trap; unavailable DCF; historical discount with weak earnings quality; stale/source-conflicted data reducing confidence; archetype-inappropriate multiples excluded.
- [ ] Run targeted tests and confirm RED.
- [ ] Implement four evidence pillars: intrinsic value, historical self-valuation, peer-relative valuation when available, earnings/cash-flow power.
- [ ] Implement value-trap penalties from growth deterioration, cash conversion/earnings quality, leverage/coverage, dilution, red flags, source conflicts and data freshness.
- [ ] Require sufficient independent pillar coverage before a directional label stronger than `uncertain`.
- [ ] Run targeted tests and confirm GREEN.
- [ ] Commit.

### Task 3: Inflection Engine

**Files:**
- Create: `src/lib/analysis/inflection.ts`
- Test: `tests/analysis/inflection.test.ts`

**Interfaces:**
- Consumes `AnalysisReport` including historical financials, market performance, forward estimates/revisions and research evidence when present.
- Produces `computeInflectionAssessment(report): InflectionAssessment`.

- [ ] Write failing tests for: multi-factor early inflection; momentum-only false positive; fundamental acceleration with no market confirmation; fragile cash/debt case; dilution penalty; upward analyst revisions; missing estimates lowering coverage but not score; overextended name classified `extended`.
- [ ] Run targeted tests and confirm RED.
- [ ] Implement fundamental acceleration signals from growth/margin/FCF/returns history.
- [ ] Implement revision signals from available forward estimate/revision data.
- [ ] Implement market confirmation from 1M/3M/6M/1Y performance and 52-week positioning.
- [ ] Implement survival/funding gates and overextension penalty.
- [ ] Enforce: score >80 requires at least three independent available signal families and no critical risk gate.
- [ ] Run targeted tests and confirm GREEN.
- [ ] Commit.

### Task 4: Opportunity View and Analysis Lens weighting

**Files:**
- Create: `src/lib/analysis/opportunity.ts`
- Modify: `src/lib/analysis/analysis-lens.ts`
- Test: `tests/analysis/opportunity.test.ts`
- Test: `tests/analysis/analysis-lens.test.ts`

**Interfaces:**
- Produces `computeOpportunityAssessment({ coreScore, mispricing, inflection, profile }): OpportunityAssessment`.
- Keeps the existing lens-local behavior non-persistent.

- [ ] Write failing tests for Value/Growth/Short-term/Long-term weight differences and unavailable-component renormalization.
- [ ] Verify no mutation of canonical report/profile.
- [ ] Implement profile-specific opportunity weights with Core-dominant long-term/quality and Inflection-dominant short-term.
- [ ] Run targeted tests and confirm GREEN.
- [ ] Commit.

### Task 5: Engine integration and persisted report schema

**Files:**
- Modify: `src/lib/analysis/engine.ts`
- Modify: `src/lib/analysis/config.ts`
- Modify: `src/lib/analysis/types.ts`
- Modify: `src/lib/analysis/index.ts`
- Test: `tests/analysis/engine.test.ts` or nearest canonical engine integration test.
- Test: `tests/analysis/canonical-export-surface.test.ts`

**Interfaces:**
- `AnalysisReport` gains optional derived intelligence assessments.
- Engine computes Mispricing and Inflection after canonical metrics/scoring/DCF/historical analysis exist.
- Opportunity remains lens-dependent and can be recomputed client-side without a provider request.

- [ ] Write failing integration test asserting deterministic intelligence fields and unchanged canonical Core Score.
- [ ] Bump model/report policy versions only where schema semantics require it.
- [ ] Integrate assessments in engine output without changing raw metrics.
- [ ] Ensure old persisted reports remain readable through optional fields.
- [ ] Run targeted tests and confirm GREEN.
- [ ] Commit.

### Task 6: Clear report UI

**Files:**
- Create: `src/components/analysis/investment-snapshot.tsx`
- Modify: `src/components/analysis/report-view.tsx`
- Modify locale dictionaries used by analysis UI.
- Test: existing report-view contract test plus `tests/analysis/investment-snapshot.test.ts`.

**Interfaces:**
- Displays Core, Mispricing, Inflection and profile-aware Opportunity separately.
- Simple Mode shows plain-language interpretation; Pro Mode exposes evidence, brakes, value-trap risk, coverage and confidence.

- [ ] Write failing UI/source-contract tests for all four scores and explicit uncertainty copy.
- [ ] Implement responsive Investment Snapshot near the top of the report.
- [ ] Implement “Why it may be mispriced” and “What could move it” summaries.
- [ ] Ensure score color/labels never imply guaranteed return.
- [ ] Recompute only Opportunity when Analysis Lens changes; canonical report is untouched.
- [ ] Run targeted UI tests and confirm GREEN.
- [ ] Commit.

### Task 7: Provider policy hardening without production degradation

**Files:**
- Create: `src/lib/data/provider-policy.ts`
- Modify: `src/lib/env/server.ts`
- Modify: `src/lib/data/provider.ts`
- Modify: `.env.example`
- Test: `tests/data/provider-policy.test.ts`
- Test: `tests/env/server.test.ts`

**Interfaces:**
- Produces a provider policy registry containing commercial display, redistribution, attribution, cache and review metadata.
- Provider chain never silently appends an unconfigured provider.

- [ ] Write failing test proving an explicitly configured provider chain is returned exactly and no implicit Yahoo fallback is added.
- [ ] Write failing policy tests proving production-disallowed providers cannot be selected in licensed mode.
- [ ] Implement registry and explicit-chain semantics.
- [ ] Preserve a separately named legacy mode so this code change is not deployed as a silent market-data outage before licensed production credentials exist.
- [ ] Add env/documentation explaining the production cutover gate.
- [ ] Run targeted tests and confirm GREEN.
- [ ] Commit.

### Task 8: Evaluation harness and full release gate

**Files:**
- Create: `src/lib/analysis/intelligence-evaluation.ts`
- Test: `tests/analysis/intelligence-evaluation.test.ts`
- Modify: `docs/STOCKBOX_FINAL_IMPLEMENTATION_REPORT.md` or current release report.

**Interfaces:**
- Accepts dated report snapshots and later price observations.
- Produces bucket-level calibration statistics without using future data as model inputs.

- [ ] Write tests that reject snapshots containing future-dated financial inputs and verify 1M/3M/6M outcome calculations.
- [ ] Implement deterministic offline evaluator only; do not expose unvalidated win-rate claims in production UI.
- [ ] Run all targeted intelligence tests.
- [ ] Run `npm test` / full Vitest suite.
- [ ] Run typecheck.
- [ ] Run lint.
- [ ] Run production build.
- [ ] Review diff for accidental Yahoo expansion, score mutation or fabricated data paths.
- [ ] Commit and open PR only after the complete gate is green.
