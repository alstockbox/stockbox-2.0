# StockBox Intelligence Engine v3 — Design

## Mission

Upgrade StockBox from a strong deterministic stock-analysis report into a clearer investor-intelligence system that is materially better at separating three different questions:

1. **Is this a good business?** — Core Quality / existing StockBox Score.
2. **Is the market price wrong?** — Mispricing Score.
3. **Is something improving fast enough that the market may not have fully reflected it yet?** — Inflection Score.

The system must not claim to predict guaranteed price moves. “Rocket” discovery is implemented as probabilistic **Inflection / Breakout Potential**, with explicit confidence and failure conditions.

## Non-negotiable principles

- Raw facts remain raw facts. New scores never rewrite source data.
- Missing data is never treated as zero.
- No single factor can create a high-conviction opportunity by itself.
- Core Score remains independent from Mispricing and Inflection.
- High momentum cannot hide poor liquidity, leverage, dilution, cash-runway or earnings-quality risk.
- Cheapness alone cannot produce a high Mispricing Score when evidence suggests a value trap.
- Scores must be deterministic and reproducible from the report snapshot.
- Every output must expose coverage, confidence, strongest positive evidence and strongest counter-evidence.
- Existing archetype logic remains authoritative for banks, insurers, REITs/property companies, pre-revenue biotech and other non-standard firms.
- No Yahoo provider expansion. Yahoo remains a legacy dependency only until a licensed replacement is activated and benchmarked; the engine must be provider-agnostic.

## Architecture

### 1. Core Score

Keep the existing nine StockBox dimensions and profile-aware weighting. The current engine already has strong coverage handling, sector benchmarks, archetype rules and source-conflict diagnostics.

Core Score answers **business quality and balance of fundamentals**, not near-term return potential.

### 2. Mispricing Engine

Create a separate `MispricingAssessment` calculated from independent evidence families.

#### Pillar A — Intrinsic value

Use DCF only when its existing suitability and assumption-quality gates pass. Convert the current price versus bear/base/bull fair-value range into a bounded signal. A low-confidence DCF contributes little or nothing.

#### Pillar B — Historical self-valuation

Use historical P/E and other available historical valuation context. Reward statistically meaningful discount to the company’s own history only when the underlying earnings/cash-flow quality has not structurally deteriorated.

#### Pillar C — Peer-relative valuation

Use peer benchmarks only when peers are comparable and coverage is adequate. Avoid treating sector medians as truth for unusual archetypes.

#### Pillar D — Earnings/cash-flow power

Use earnings yield, FCF yield, EV/EBITDA, EV/Sales and price/book only where economically meaningful for the archetype.

#### Value-trap penalties

Penalize apparent cheapness when supported by evidence such as:

- revenue / EPS / FCF deterioration,
- collapsing operating or gross margins,
- weak cash conversion / high accrual-like divergence,
- leverage deterioration or weak interest coverage,
- material dilution / share-count growth,
- negative analyst revisions when available,
- severe source conflicts,
- stale financials,
- critical/high red flags.

#### Output

`MispricingAssessment` contains:

- `score: number | null` (0–100),
- `confidence: number` (0–100),
- `coverage: number` (0–1),
- `label: deep_discount | discounted | roughly_fair | premium | uncertain`,
- `pillars[]`, each with score, coverage, weight and evidence,
- `valueTrapRisk: low | medium | high`,
- `positiveEvidence[]`,
- `counterEvidence[]`,
- `dataAsOf`.

A high score means “the available evidence indicates a potentially favorable price versus fundamentals,” not “the stock will rise.”

### 3. Inflection Engine (“Rocket Radar” internally)

Create a separate `InflectionAssessment` designed to identify improving companies **before or during early recognition**, while avoiding already-extended momentum names.

#### Signal family A — Fundamental acceleration

Measure direction and acceleration, not merely absolute growth:

- revenue growth versus prior growth,
- EPS / earnings improvement,
- FCF growth and FCF-margin improvement,
- gross / operating-margin inflection,
- ROIC / ROE improvement where meaningful,
- cash conversion improvement.

#### Signal family B — Expectations/revisions

When analyst estimates are licensed and available:

- net EPS revisions over last week/month,
- revenue/EPS next-year growth,
- breadth of revisions,
- contradiction between improving fundamentals and still-muted expectations.

Revision data is evidence, never a mandatory dependency. Missing estimates reduce coverage rather than scoring negatively.

#### Signal family C — Market confirmation

Use available price information:

- 1M / 3M / 6M / 1Y momentum,
- position versus 52-week high/low,
- trend alignment,
- later: volume expansion / volatility compression when a licensed provider supplies adequate daily OHLCV history.

Reward early confirmation, not pure parabolic extension. Extreme short-term strength without fundamental confirmation receives an overextension penalty.

#### Signal family D — Survival / funding quality

Especially for small caps, a potential inflection is invalidated or strongly discounted by:

- acute balance-sheet stress,
- debt service weakness,
- persistent negative FCF without adequate cash,
- material dilution,
- deteriorating working-capital quality,
- archetype-specific critical risks.

#### Signal family E — Research/catalyst evidence

Use official filings, insider/short-position information and research evidence where available. Do not fabricate catalysts. A missing catalyst layer lowers coverage only.

#### Output

`InflectionAssessment` contains:

- `score: number | null`,
- `confidence`,
- `coverage`,
- `stage: dormant | building | confirming | extended | fragile | uncertain`,
- `signals[]`,
- `accelerators[]`,
- `brakes[]`,
- `overextensionRisk: low | medium | high`,
- `dataAsOf`.

A score above 80 is impossible unless at least three independent signal families are available and no critical financial-risk gate is active.

### 4. Opportunity View

Create a presentation-only `OpportunityAssessment` that combines existing Core Score, Mispricing and Inflection for the selected investment lens.

It must never overwrite the canonical StockBox Score.

Examples:

- **Value lens:** Core 30%, Mispricing 55%, Inflection 15%.
- **Growth lens:** Core 40%, Mispricing 20%, Inflection 40%.
- **Short-term lens:** Core 20%, Mispricing 15%, Inflection 65%.
- **Long-term / Quality:** Core dominates; Inflection is secondary.

If one component is unavailable, weights are renormalized only when minimum coverage requirements are met. Otherwise Opportunity Score is unavailable.

The UI shows the three scores separately before any combined score.

### 5. Explainability / UI

At the top of a completed report, add an **Investment Snapshot**:

- Core quality score,
- Mispricing score,
- Inflection score,
- Opportunity score for the active Analysis Lens,
- confidence / coverage,
- a one-sentence interpretation.

Below it, two concise cards:

**Why it may be mispriced** — strongest evidence and value-trap warnings.

**What could move the stock** — fundamental acceleration, revisions, market confirmation and brakes.

Simple Mode gets the plain-language summary. Pro Mode exposes pillar/signal details and data provenance.

### 6. Data-provider strategy

Do not make engine logic depend on Yahoo-specific fields.

- SEC / Bolagsverket / FI / ECB / Riksbanken / OpenFIGI / GLEIF remain authoritative/official layers where applicable.
- Twelve Data (or another explicitly licensed provider) can supply commercial market data, corporate actions and estimates after licensing is confirmed.
- Remove implicit Yahoo fallback in the provider chain as a separate migration step once production has a licensed market-data provider configured.
- Add a provider-policy registry so production providers can be marked `commercialDisplayAllowed`, `redistributionAllowed`, `attributionRequired`, `cachePolicy`, and `lastTermsReview`.
- Until a licensed provider is configured, do not deploy a change that silently removes live market data and degrades production analyses.

### 7. Calibration and validation

No claim that the new scores “predict rockets” is allowed without out-of-sample evidence.

Add deterministic fixture tests now, then an offline evaluation harness using point-in-time historical snapshots where available. Prevent look-ahead by using only data known on each evaluation date.

Track separately:

- future 1M / 3M / 6M returns,
- maximum favorable excursion,
- maximum drawdown,
- hit rate of high-score buckets,
- calibration by market-cap / sector / archetype,
- false-positive rate for high Inflection scores,
- value-trap rate for high Mispricing scores.

The production UI reports model score/confidence, not unvalidated win-rate claims.

## Success criteria

1. Existing StockBox Core Score regression suite remains green.
2. Mispricing can identify a cheap high-quality company differently from a cheap deteriorating value trap.
3. Inflection rewards simultaneous acceleration/revisions/market confirmation and penalizes fragile or overextended setups.
4. Missing estimates or historical valuation lower confidence/coverage rather than creating false negatives.
5. Analysis Lens changes Opportunity weighting without mutating saved user profile.
6. The report is clearer: a user can understand “good company,” “cheap/expensive,” and “early inflection” as three separate concepts in seconds.
7. No new provider is activated in production without explicit commercial rights.
