# hl-cycles — Task map

**Phase 4 destination:** Vector long-term view (regime + Compass + key levels + brief) is the landing page, built on open on-chain/macro/options sources, tests green, export writes vector.json (SPEC.md Phase 4 "Done means").

**Harness (Phase 4):** Claude Code, auto mode, native stack only (no codex/opencode/pi bridges). Planner = top session (Opus 5.5). Routing: worker/ui-impl opus medium, heavy opus high, designer fable high, reviewers cross-model (fable for opus-implemented work).

**Original destination:** `bun run dev` serves a BTC HTF/LTF cycle dashboard (phase readout, charts, signal history) on Hyperliquid + Bitstamp data, with passing tests (see SPEC.md "Done means").

Tracker: local markdown (this file). Status: done / frontier / blocked.

## Decisions so far
- T0 research (Sonnet): Bitstamp chosen for 2011+ daily history. HL funding real from 2023-05-12, hourly, 500/page. HL OI is in coins. Reuse: marketstate zod AssetCtx schema; hyperion fetch-prices pacing pattern. No indicator code worth reusing.
- T1 scaffold (Haiku): bun workspaces, hono 4.13, zod 4.6, vite 5, react 18, lightweight-charts 5.2. `bun run --filter '*' dev` works.
- T2 model (Opus): docs/MODEL.md, calibrated on Bitstamp 2011-2026. 60 HTF flips, 11/13 landmarks hit. Added LTF state `downtrend`. Funding scored vs 0.1095 APR baseline, not z-score.
- T3 design (Fable): DESIGN.md, 7 components, dark palette, CycleVector SVG. API gaps resolved in SPEC "API amendments".
- T4 data layer (Sonnet): HL + Bitstamp sources with injected fetch seam, atomic JSON store, 15-min scheduler. predictedFundings has null venues, filtered. Live backfill ~46s: hl-1h 5003, hl-4h 5001, hl-1d 2231, bitstamp 5493, funding 29069.
- T5 model (Sonnet): pure model fns ported from calibration scripts; 60/60 fixture switches match; computeHtf 80ms. deleveraging state has no dedicated test yet.
- T6 api (Sonnet): 5 routes, model recomputed only on refresh/snapshot change; signals limit clamps at 1000; cross-venue apr = rate*8760/intervalHours; deleveraging synthetic test added. 56 tests. Payloads htf 3.6MB, ltf 3MB unrounded.
- T7 frontend (Sonnet): 7 components per DESIGN.md, puppeteer-verified 0 console errors at 1440/1024. LTF `downtrend` state colored grey-violet.
- T8 verification (4R lenses, checker, ponytail+standards/spec; 1 fix loop): localhost bind, finite-number validation, per-source failure isolation, injected clock, true append for snapshots, dropped unused hl-1w fetch, full-history HTF range (minBarSpacing), axis formatters, stale/null handling, shared color tokens, pinned deps. 60 tests green, build clean, live dev smoke ok. Skipped: CI/pre-commit (no remote), alerting (local tool), pagination helper refactor.

## Tasks
| id | task | model | depends | status |
|---|---|---|---|---|
| T0 | research data sources | Sonnet | - | done |
| T1 | scaffold workspace | Haiku | - | done |
| T2 | MODEL.md + calibration | Opus | T0 | done |
| T3 | DESIGN.md | Fable | SPEC | done |
| T4 | data layer: HL + Bitstamp sources, JSON store, refresher/snapshot scheduler | Sonnet | T1 | done |
| T5 | indicators + HTF/LTF/composite/signals model, fixture tests | Sonnet | T1, T2 | done |
| T6 | API routes wiring model to store | Sonnet | T4, T5 | done |
| T7 | frontend per DESIGN.md | Sonnet | T3, T6 | done |
| T8 | verification gate (review lenses, finalizer, ponytail-review, standards/spec, design drift, tests/build) | mixed | T7 | done |

## Phase 4 decisions so far
- T9a research (Opus): Vector paywalled; rebuilt from WoC full reports, Woo glossary, Market Compass methodology, Notion Weekly Tape. docs/research/bitcoin-vector.md.
- T9b discussion (Opus): ETF flows keyless via bitcoin-data etf-flow-btc; carry-forward not renormalize for regime; per-input staleness; DTWEXBGS for dollar.
- T10 design (Fable): §14, 8 components in components/vector, regime tokens contrast-checked (Vector royal blue rejected 2.8:1 → #7484f5), toggle moved to StatusBar. API gaps resolved in SPEC 4.7.
- T9 data (Opus): 7 sources live keyless, 145 tests. bitcoin-data history only from 2022-10-01 (also 15 req/day cap; cron uses 7); supply-profit in BTC (÷ SplyCur). SoSoValue skipped (no key). Skew via Black-76 from mark_iv, 1 snapshot so far.
- T13 UI (Opus): components/vector/* per §14, 0 console errors 1440/1024/390 on sample, degraded + 404 states verified. Flows gauge uses lens zones 40/60; app-grid min-width:0 fixes pre-existing 843px overflow at 390.
- T11+T12 model (Opus): 163 tests. Flips hit all 3 targets (+6/+11/+5d); 2022 tail all risk-off; 2025 5 flips (miss ≤4). Flip = extreme↔extreme only (post-hoc choice). Regime starts 2022-10-07 (no proxies). Compass headline biased ~+20 vs Glassnode (48 vs 23 Sep 15), untuned. vector.json 1.21MB.
- T14 gate round 1: 6 reviewers, 0 blockers. Confirmed criticals: no alerting for dead vector source; no regime regression fixture. Fix loop 1 dispatched (backend+docs / frontend parallel, disjoint write sets). DESIGN §14.9 addendum: conditions checklist, lens-band gauge words, last-4 numbered flips, asOf-age stale.
- T14 fix loop 1 + re-verify (Fable): all 17 confirmed findings closed; 177 tests, tsc clean both, build+export OK, 0 console errors 1440/390. Regime/flips byte-identical pre/post refactor.
- Scope (user): keyless + free-key sources; Vector replaces landing, existing charts stay as drill-down.

## Phase 4 tasks
| id | task | model | depends | status |
|---|---|---|---|---|
| T9 | data layer: 6 vector sources, store, daily cron wiring, collect.yml secrets, fixture tests | opus medium | SPEC P4 | done |
| T10 | DESIGN.md §14 Vector view | fable high | SPEC P4 | done |
| T11+T12 | MODEL.md §8 + compass/vector model fns + /api/vector + export + tests, calibration on shipped fns (merged to avoid duplicate calibration code) | opus high | T9 | done |
| T13 | frontend Vector view per DESIGN §14 (built against SPEC 4.4/4.7 contract + sample payload, re-verified on real export after T12) | opus medium | T10, SPEC 4.7 | done (pending real-data re-verify) |
| T14 | verification gate: 4R (fable), finalizer+ponytail+spec (fable), real-data drift + build/test (opus), fix loop 1, re-verify (fable) | mixed | T13 | done |

## Backlog / open items
- Vector: 2025 has 5 extreme flips (target ≤4); noisy conditions = ETF 7d outflow, downside semivol > median. Candidate: semivol vs 365d 75th pct, ETF 7d sum vs −X BTC. Re-check against regression fixture.
- Vector: Compass headline reads ~+20 vs Glassnode (48 vs 23, Sep 15); untuned on 2 points. Collect more Glassnode readings from WoC emails before tuning.
- Vector: vector.json 1.2MB on every load; trim history or split history into a lazily-fetched file if load time matters.
- Vector: server vector cache key omits state.json vectorSources (live server only); empty single series discards whole source fetch.
- Vector: skew + put/call snapshot-only; scored after 365 snapshots.
- HTF thresholds are absolute (hDrawdown, capitulation gates); shallower cycles may never trigger capitulation. Candidate: rolling-percentile drawdown/roc365 like mayerPct. See docs/MODEL.md 6.1.
