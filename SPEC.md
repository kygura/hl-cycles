# hl-cycles — Specification

## What it is

A local web dashboard that explains where Bitcoin (and by extension the crypto market) sits in its cycle, using open data only. It is a derivatives-plus-price regime model in the spirit of Glassnode's "Bitcoin Vector", without on-chain data. It has two frames:

- **HTF (higher time frame):** daily/weekly price structure. Where are we in the multi-year cycle? Trend regime, extension/valuation vs long averages, drawdown from all-time high, long-horizon momentum, realized-volatility regime, days since halving.
- **LTF (lower time frame):** 4h/1h derivatives state on Hyperliquid. Is leverage crowded? Funding, premium/basis, open-interest change, short-term momentum, volatility.

Both frames produce deterministic, documented scores and a phase/state label. Changes in labels are recorded as a signal history. No trading, no order placement, no API keys.

## Data sources

Primary: Hyperliquid public info API, `POST https://api.hyperliquid.xyz/info` (see `docs/research/data-sources.md`).

| Need | Request type | Notes |
|---|---|---|
| Candles 1h/4h/1d/1w | `candleSnapshot` | Most recent 5000 candles per interval only. Numeric fields are strings. 1d history reaches 2020-08 but volume is zero before 2023 (pre-mainnet index data). |
| Funding + premium history | `fundingHistory` | Hourly rows `{coin, fundingRate, premium, time}`, 500 rows per call, paginate with `startTime = lastTime + 1`. Real data from 2023-05-12. |
| Live derivatives state | `metaAndAssetCtxs` | Match BTC by name in `universe`. `openInterest` is in coins (multiply by `markPx` for USD). |
| Cross-venue funding | `predictedFundings` | HL funds hourly, Binance/Bybit 8h. Compare annualized. |

Supplementary (HTF context only): Bitstamp daily OHLC, keyless, from 2011-09-13.
`GET https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&start=<unix>&limit=1000`, walk forward with `start = last + 86400`.
It sits behind its own adapter (`backend/src/sources/bitstamp.ts`) exposing one function that returns daily `Candle[]`. Removing it must only shorten HTF history, never break the app.

**HTF daily series merge rule:** use Bitstamp for days before the first Hyperliquid 1d candle with non-zero volume; use Hyperliquid from that day on. Tag each candle with its `src`.

**Open interest has no history endpoint.** The backend snapshots `metaAndAssetCtxs` + `predictedFundings` for BTC every 15 minutes and appends to a local file. OI-based features are `null` until enough snapshots exist, and the scoring model must degrade gracefully (drop the component and renormalize weights).

## Storage

Plain JSON files under `data/` (git-ignored), per the JSON-first convention:

- `data/candles-<interval>.json` (Hyperliquid, merged incrementally, dedup by `t`)
- `data/bitstamp-1d.json`
- `data/funding.json`
- `data/snapshots.jsonl` (one JSON object per line, append-only)

SQLite is not warranted at this size (tens of thousands of rows). Revisit only if snapshots exceed ~1M lines.

All derived values (indicators, scores, phases, signal history) are recomputed from raw data on each refresh. They are deterministic functions of the stored raw data, so nothing derived is persisted.

## Shared types (backend/src/types.ts)

```ts
type Candle = { t: number; o: number; h: number; l: number; c: number; v: number; src: "hl" | "bitstamp" }; // t = open time, ms UTC
type FundingRow = { t: number; rate: number; premium: number }; // hourly, rate per hour
type Snapshot = { t: number; markPx: number; oraclePx: number; oiCoins: number; oiUsd: number; funding: number; premium: number | null; dayNtlVlm: number; predicted: { venue: string; rate: number; intervalHours: number }[] };
```

## Model

The exact scoring method lives in `docs/MODEL.md` (written and calibrated before implementation). Summary of intent:

- HTF produces `trend` in [-1, 1], `heat` in [-1, 1], and a phase in: `accumulation`, `expansion`, `euphoria`, `distribution`, `markdown`, `capitulation`.
- LTF produces `leverage` in [-1, 1], `momentum` in [-1, 1], and a state label (for example crowded long, healthy trend, short squeeze fuel, deleveraging, neutral).
- A composite readout combines both frames into one bias score and a one-line plain-English summary.
- Signal history = every change of HTF phase (daily) and LTF state (4h bar), with timestamp, previous and new label, price, and the scores at that moment. LTF state changes must persist at least 2 bars before being recorded (debounce), so the table is readable.

## API (Hono, port 8787, all JSON, all GET)

- `GET /api/health` → `{ ok, lastRefresh, lastSnapshot, counts: { candles1d, candles4h, candles1h, funding, snapshots } }`
- `GET /api/overview` → `{ asOf, price, htf: { phase, trend, heat, features, cycle: { lastHalving, daysSinceHalving, cycleProgress } }, ltf: { state, leverage, momentum, features }, composite: { bias, summary }, crossVenueFunding: [{ venue, apr }] }`. `features` are named numeric values (nullable) with the raw inputs that drove each score.
- `GET /api/htf` → `{ candles: HtfPoint[], halvings: number[] }` where `HtfPoint = Candle & { sma200, sma50, mayer, drawdown, rv30, trend, heat, phase }` (daily, full history). `?interval=1w` returns weekly-resampled candles with the same fields where computable.
- `GET /api/ltf?interval=4h|1h` → `{ points: LtfPoint[] }` where `LtfPoint = Candle & { ema50, rsi14, fundingApr, premium, oiUsd, oiChange24h, leverage, momentum, state }` (nullable where data is missing).
- `GET /api/signals?frame=HTF|LTF&limit=200` → `{ signals: [{ t, frame, from, to, price, trend|leverage, heat|momentum }] }`, newest first.

## Stack and layout

- `backend/`: Bun + Hono + zod (zod validates every Hyperliquid and Bitstamp response at the boundary). Tests with `bun test`.
- `frontend/`: Vite + React + TypeScript, charts with `lightweight-charts` (TradingView, Apache-2.0: log scale, candlesticks, series overlays, fast on 5000+ points). Vite proxies `/api` to the backend.
- Root `package.json` uses Bun workspaces; `bun run dev` starts both. `bun test` runs backend tests.

## Refresh schedule

On boot: backfill missing history (Bitstamp full once, Hyperliquid candles all intervals, funding from 2023-05-12), then take a snapshot. Every 15 minutes: snapshot + incremental candle/funding refresh. Requests are sequential with a small delay (weight budget ~1200/min per IP; we use a tiny fraction). Network failures log and keep serving cached data; they never crash the server.

## Done means

1. `bun install && bun run dev` from the repo root starts backend and frontend (documented in README).
2. The dashboard in a browser shows: BTC HTF chart (daily, log scale, full history, phase-colored background or band), LTF chart (4h with funding and OI panes), the current phase readout (HTF phase, LTF state, composite bias and summary), and the signal history table.
3. `bun test` passes (indicators, model phase rules against fixtures, source parsers, store merge).
4. The verification gate has run and its findings are fixed or reported.

## Out of scope

On-chain metrics, order execution, accounts/auth, alerts/notifications, multi-asset support beyond BTC (the code keeps `coin` as a parameter where it is free, nothing more).

## API amendments (resolved after the design pass, binding)

1. `GET /api/health` also returns `firstSnapshot` (ms or `null`).
2. Units: every ratio is a **fraction**, never a percent. That covers `apr`, `fundingApr`, `premium`, `drawdown`, `cycleProgress`, `oiChange24h`, `roc*`, `rv*`, and percentiles in [0,1]. The UI formats them.
3. `features` is `Record<string, number | null>` with the exact keys listed in `docs/MODEL.md` section 4, in that order.
4. `signals[].from` is `null` for the first label ever committed.
5. Errors return a non-2xx status with body `{ error: string }`.
6. `asOf` = open time of the last closed candle used by the model. `lastRefresh` = wall-clock time of the last successful data refresh. `/api/overview` includes `lastRefresh` too, so the UI polls only `/api/overview` for staleness.
7. `htf.cycle` includes `nextHalvingEstimate` (ms, constant 2028-04-15 UTC, labelled an estimate in the UI).
8. Weekly points (`/api/htf?interval=1w`) carry `phase` and the scores copied from the week's last day, per `docs/MODEL.md` section 1.8.
