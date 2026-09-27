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

## Tasks
| id | task | model | depends | status |
|---|---|---|---|---|
| T0 | research data sources | Sonnet | - | done |
| T1 | scaffold workspace | Haiku | - | done |
| T2 | MODEL.md + calibration | Opus | T0 | done |
| T3 | DESIGN.md | Fable | SPEC | done |
| T4 | data layer: HL + Bitstamp sources, JSON store, refresher/snapshot scheduler | Sonnet | T1 | done |
| T5 | indicators + HTF/LTF/composite/signals model, fixture tests | Sonnet | T1, T2 | done |
| T6 | API routes wiring model to store | Sonnet | T4, T5 | frontier |
| T7 | frontend per DESIGN.md | Sonnet | T3, T6 | blocked |
| T8 | verification gate (review lenses, finalizer, ponytail-review, standards/spec, design drift, tests/build) | mixed | T7 | blocked |
