# hl-cycles — Task map

**Destination:** `bun run dev` serves a BTC HTF/LTF cycle dashboard (phase readout, charts, signal history) on Hyperliquid + Bitstamp data, with passing tests (see SPEC.md "Done means").

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

## Backlog / open items
- HTF thresholds are absolute (hDrawdown, capitulation gates); shallower cycles may never trigger capitulation. Candidate: rolling-percentile drawdown/roc365 like mayerPct. See docs/MODEL.md 6.1.
