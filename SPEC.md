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

## Phase 3: multi-asset, finer LTF, Vercel deploy

This section supersedes the "multi-asset support beyond BTC" item under Out of scope, and every mention of GitHub Pages. The BTC dashboard (HTF chart, LTF chart, readout, vector, signals) must stay visually unchanged. The only BTC-visible change is 3.4's OI window, which gives the OI pane more coverage and never less.

### 3.1 Deploy: Vercel builds the static site from committed `data/`

Vercel's Git integration builds and deploys every push to `main`. The site stays fully static, and the build makes no network calls:

1. `collect.yml` fetches the data and commits the raw `data/` files. It no longer builds the frontend, exports anything, or deploys.
2. Vercel runs `vite build`, then `bun run export`. The export reads only local files (`server.ts` with `NO_SCHEDULER=1` plus the store) and writes `frontend/dist/api/*.json`, as it does today.

Rejected alternative: committing the export JSON (to `frontend/public/api` or `data/export/`). It is about 10.5 MB for BTC alone and about 25 MB with alts. Git should hold source data only, not derived data that gets rewritten 48 times a day. Because the export lives only in `dist/` (git-ignored), the Vite dev proxy for `/api` has nothing to collide with.

`vercel.json` at the repo root (the Vercel project's Root Directory is the repo root):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "bun install --frozen-lockfile",
  "buildCommand": "VITE_STATIC=1 bun run build && bun run export",
  "outputDirectory": "frontend/dist"
}
```

The order matters. `vite build` empties `frontend/dist`, so the export has to run after it. Vercel detects `bun.lock` and uses Bun 1.x. If the build log shows `--frozen-lockfile` rejecting the lockfile version (the repo uses Bun 1.4.0), drop `--frozen-lockfile` from `installCommand` rather than pinning Bun by hand.

**Persisted refresh state.** At build time `refreshAll()` never runs, so `lastRefresh` would be `null` and the UI would show "not refreshed yet". To fix this:

- `cron.ts` writes `data/state.json` = `{ lastRefresh, lastError }` after refresh and snapshot. Add `loadState`/`saveState` to `store.ts`.
- `refresh.ts` reads that file at module load, next to the existing `bootSnapshots` block.
- `cron.ts` stops calling `exportStatic()`.

**Commit author (hard requirement).** On a Vercel Hobby plan with a private repo, Vercel only deploys commits whose author is the Hobby team owner. A `github-actions[bot]` author gets blocked. `collect.yml` must therefore set `git config user.name "${{ vars.DATA_AUTHOR_NAME }}"` and `user.email "${{ vars.DATA_AUTHOR_EMAIL }}"`. Both are repo variables, set to the identity the owner's own commits already use (see `git log --format='%an <%ae>'`).

**`collect.yml` changes:**

- Schedule: `*/30 * * * *` plus `5 0 * * *`. Keep the daily run as the `--backfill` run.
- Remove: the "Build frontend" step, `outputs`, `export_check`, `upload-pages-artifact`, and the whole `deploy` job (including the `pages`/`id-token` permissions).
- The commit step does `git add data/` on every run. Delete the 15-minute branch that stages only `snapshots.jsonl` and discards the rest, because the site is now built from these files and must not go stale.
- Keep the pull/rebase/push retry loop and the final "Fail if collection errored" step.

**`ci.yml`.** Pushes made with `GITHUB_TOKEN` do not trigger workflows (see the file's own comment), so data commits already skip CI. Add `paths-ignore: ["data/**"]` under `on.push` anyway. It costs nothing and protects the budget if a PAT is ever used.

**Actions budget (2000 min/month):**

| Item | Calculation | Minutes/month |
|---|---|---|
| collect | (48 + 1 runs/day) × 30.4 days × 1 billed min | ≈ 1490 |
| ci | about 2 min × about 150 human pushes/PRs | ≈ 300 |
| **Total** | | **≈ 1790** |

- Each collect run must finish in under 60 s wall time, or it bills 2 min and the total goes over the limit. Today a run takes about 42 s. Removing the frontend build saves about 10 s, and the extra HL calls (3.3) add about 15 s, so expect about 47 s. The worker records job durations from the first 3 scheduled runs in the PR description.
- Fallback, if the p90 duration goes over 55 s or usage passes 1800 before month end: change the cron to `0 * * * *` (about 760 min/month). Change nothing else.

Vercel: 49 deploys/day plus human pushes, under the Hobby limit of 100/day.

### 3.2 Asset list (verified live against `metaAndAssetCtxs` on 2026-09-28, none `isDelisted`)

There is one source of truth: `backend/src/assets.ts`.

```ts
export const ASSETS = [
  { coin: "BTC", sector: "Majors" }, { coin: "ETH", sector: "Majors" },
  { coin: "SOL", sector: "Majors" }, { coin: "XRP", sector: "Majors" },
  { coin: "HYPE", sector: "Perp DEX" }, { coin: "LIT", sector: "Perp DEX" },
  { coin: "SUI", sector: "L1" }, { coin: "NEAR", sector: "L1" },
  { coin: "ENA", sector: "DeFi" },
  { coin: "DOGE", sector: "Memes" }, { coin: "PUMP", sector: "Memes" },
  { coin: "TAO", sector: "AI" },
] as const;
export const ALTS = ASSETS.filter((a) => a.coin !== "BTC").map((a) => a.coin);
```

The frontend never duplicates this list. It reads `/api/assets` (`assets.json` in the static build), which returns `{ assets: ASSETS }`. Adding or removing a coin means editing only this file.

### 3.3 Data collection per alt

The following apply to each coin in `ALTS`:

| Series | Source | File | Retention |
|---|---|---|---|
| 15m candles | `candleSnapshot` `15m` | `data/candles-hl-<COIN>-15m.json` | last 5000 bars (about 52 days, the API cap) |
| 1h candles | `candleSnapshot` `1h` | `data/candles-hl-<COIN>-1h.json` | last 3000 bars (125 days: W90 = 2160 plus warm-up) |
| 4h candles | not fetched | derived at compute time by resampling the stored 1h bars | n/a |
| funding | `fundingHistory` | `data/funding-<COIN>.json` | last 125 days, start = `max(last.t + 1, now - 125d)` |
| OI | one `metaAndAssetCtxs` call for all alts | `data/oi-hl-<COIN>.json` as `OiRow` with `src: "hl"` | last 125 days |

- No 1d or HTF for alts. HL daily history for alts is short (HYPE starts Nov 2024, LIT is newer), and the halving model is BTC-specific. A trend-only daily view is a follow-up, to be added when it's asked for.
- BTC also gets `data/candles-hl-15m.json` (key `hl-15m`, last 5000 bars). All other BTC files, the snapshot format and `snapshots.jsonl` stay unchanged.
- In `hyperliquid.ts`:
  - `HlInterval` gains `"15m"`.
  - Add `fetchOi(coins)`: one `metaAndAssetCtxs` call that returns `{ coin, oiCoins, oiUsd }` for each requested coin present in the universe. It reuses the existing schemas, and a missing coin is reported as an error string rather than throwing for all coins.
- In `refresh.ts`:
  - Add `refreshAssets()`, called from `refreshAll()` after the BTC sources.
  - Each alt refreshes independently, so one failure never skips the others. Errors are appended to the same `lastError` summary.
  - Retention is applied at save time with two small helpers in `store.ts`: `keepLast(rows, n)` and `keepSince(rows, t)`.
  - `CandleKey` becomes the existing union plus `"hl-15m"` plus `` `hl-${string}-${"15m" | "1h"}` ``.
- `types.ts`: `OiRow.src` becomes `"binance" | "hl"`.

**Rate limits.** HL allows 1200 weight per minute per IP, and `info` calls weigh 20 plus a per-row surcharge. A normal 30-minute run makes 7 BTC calls (15m/1h/4h/1d, funding, meta, predicted), 33 alt calls (15m, 1h, funding × 11) and 1 OI call. That is 41 calls at about 21 weight each, about 860 in total. Add a weight guard to `postInfo`:

- Keep a module-level rolling 60 s log of `{ t, weight }`.
- Estimate each call's weight as `20 + ceil(rows / 20)` after the response (conservative).
- Before each call, sleep until `sum + 20 <= 1000`.
- Put the decision in a pure helper, `weightWaitMs(log, now, budget)`, so it can be tested.

Normal runs never hit the guard. The one-time bootstrap (about 8k weight: full 15m, 1h and funding pages for 11 coins) throttles itself to about 8 minutes. Run it locally once with `bun run cron` and commit `data/` before merging, so scheduled runs stay incremental.

**Size estimate** (measured about 85 B per candle row, about 69 B per funding row, about 70 B per OI row):

| | Size |
|---|---|
| Per alt: 15m 425 KB + 1h 255 KB + funding 210 KB + OI 420 KB | ≈ 1.3 MB |
| All 11 alts | ≈ 14.5 MB |
| BTC today (9.6 MB) + BTC 15m (0.4 MB) | ≈ 10 MB |
| **`data/` total** | **≈ 25 MB (under 30 MB)** |

`snapshots.jsonl` grows about 17 KB/day at the 30-minute cadence (about 6 MB/year). Revisit it in a year. Commits are append-only JSON (sorted by `t`), so git deltas per commit stay at a few KB.

### 3.4 Model: 15m and alts reuse `computeLtf` unchanged

- `LtfInterval` becomes `"15m" | "1h" | "4h"`. Add `CONSTS["15m"] = { BAR: 900_000, W30: 2880, W90: 8640, BARS_PER_YEAR: 35040 }`. The windows stay time-based.
- With the 5000-bar cap, the percentile and z-score windows fill in partially:
  - `premiumZ` becomes available after about 15 days (it needs `W30 / 2`).
  - `rv42Pct` becomes available after 30 days, using a partial 90-day window.
  - Neither is null-blocking: `blend()` already renormalizes when inputs are missing, and `rv42Pct` does not feed the state.
- New pure function `resampleCandles(candles, bucketMs)` in `model/ltf.ts`: OHLCV aggregation into UTC-aligned buckets, dropping a leading bucket that has fewer than `bucketMs / BAR_1h` rows. Alts 4h = `resampleCandles(hl1h, 14_400_000)`.
- Alt OI comes in through the existing `oiHistory` parameter (`snapshots = []`). Its 2 h window and same-source rule already fit 30-minute rows.
- BTC snapshot OI window: in `oiAt`, change `latestInWindow(snapTs, at, 1_800_000)` to `3_600_000`. With 30-minute collection plus GitHub cron jitter, a 30-minute window leaves OI gaps.
- The state thresholds are calibrated on BTC. Alts, and 15m for any coin, still get the labels, but the chart header says "thresholds calibrated on BTC". Do not recalibrate in this phase.

### 3.5 API and export

- `GET /api/assets` returns `{ assets: ASSETS }`.
- `GET /api/ltf?interval=15m|1h|4h&coin=<COIN>`:
  - With no `coin`: the response is byte-identical to today (BTC, full length). `interval=15m` without a coin is also accepted.
  - With `coin`: it must be in `ASSETS` (otherwise 400 `{ error }`). The response is `{ points }` sliced to the last 1500 points. Include `coin=BTC`, which uses the BTC files, snapshots and `oi-history`.
  - Per-(coin, interval) results are memoized on the same `lastRefresh:lastSnapshot` key as the existing cache.
- `export.ts`: `ROUTES` becomes the existing 8 entries plus `assets.json` plus `ltf-<COIN>-<interval>.json` for every asset × {15m, 1h, 4h}, which is 45 files. The alt export is about 1500 points × about 620 B, about 0.9 MB per file and about 33 MB in `dist/`. It gzips on the wire and is fetched one file at a time.
- `frontend/src/api.ts`:
  - `assets()` → `./api/assets.json` or `/api/assets`.
  - `assetLtf(coin, interval)` → `./api/ltf-${coin}-${interval}.json` or `/api/ltf?interval=${interval}&coin=${coin}`.

### 3.6 Frontend

- **Tabs.** `App.tsx` gets `const [view, setView] = useState<"btc" | "assets">("btc")`, shown as a two-button `.segmented` control on the first row inside `.app`. `"btc"` renders the current grid untouched. The existing hooks keep running in both views, so the status bar stays live.
- **`components/AssetsView.tsx`** (new):
  - Loads `api.assets()` once.
  - Coin picker: a native `<select>` with one `<optgroup label={sector}>` per sector. The default coin is ETH.
  - Interval state `"15m" | "1h" | "4h"`, default `"1h"`. It fetches `api.assetLtf(coin, interval)` on change, with the same cancelled-flag pattern as `useDashboardData`, plus loading, error and retry states.
  - Shows one text line from the last point: state · leverage · momentum · funding APR · OI · 24h OI change. Reuse `format.ts`.
  - Renders `LtfChart`.
- **`LtfChart`** gets optional props, whose defaults keep the BTC view identical:
  - `coin = "BTC"` → header `${coin}-PERP · Hyperliquid · ${interval}`.
  - `intervals = ["4h", "1h"]`, which drives the segmented buttons.
  - `note?: string` → adds "thresholds calibrated on BTC" to the header for Assets.
  - The `interval` type widens to `LtfInterval`.
  - For Assets, `firstSnapshotAt` = the `t` of the first point with `oiUsd != null`, or `null`.
- No router, no URL state, no new dependencies.

### 3.7 Tests required (`bun test`, existing fixture style)

1. `sources`: `fetchOi` parses a `metaAndAssetCtxs` fixture into per-coin OI, and a coin missing from the universe gives an error entry, not a throw. `fetchCandles` passes `"15m"` through in the request body.
2. `weightWaitMs`: returns 0 under budget, and returns the wait until the oldest entry expires when `sum + 20 > budget`.
3. `store`: `keepLast`/`keepSince` behave correctly, and alt keys map to `candles-hl-<COIN>-<interval>.json`. `saveState`/`loadState` round-trip.
4. `model`:
   - `resampleCandles` 1h → 4h: correct O/H/L/C/V per bucket, and a leading partial bucket is dropped.
   - `computeLtf(…, "15m", …)` on 2000 synthetic bars does not throw, and `premiumZ` is null before bar 1440.
   - A BTC snapshot 45 minutes before a bar close now yields `oiUsd`.
5. `api`:
   - `/api/ltf?interval=4h` without a coin equals the pre-change response (a regression guard for the BTC view).
   - `coin=ETH&interval=15m` returns at most 1500 points.
   - `coin=NOPE` → 400.
   - `/api/assets` equals `ASSETS`.
6. `export`: writes `assets.json` and all 36 `ltf-<COIN>-<interval>.json` files. With a `state.json` in `DATA_DIR`, `health.json.lastRefresh` is not null.
7. `refresh`: one alt's fetch failing still refreshes the other alts, and the failure appears in `lastError`.

### 3.8 Files to touch

| Area | Files |
|---|---|
| Backend (new) | `backend/src/assets.ts` |
| Backend (edit) | `sources/hyperliquid.ts`, `refresh.ts`, `store.ts`, `types.ts`, `model/ltf.ts`, `server.ts`, `export.ts`, `cron.ts` |
| Tests | `backend/test/*` plus fixtures |
| Frontend | `api.ts`, `App.tsx`, `components/LtfChart.tsx`, `components/AssetsView.tsx` (new) |
| Ops | `vercel.json` (new), `.github/workflows/collect.yml`, `.github/workflows/ci.yml` |
| Docs | README deploy section |

Order of work:

1. Backend and tests.
2. Run the bootstrap locally and commit `data/`.
3. Frontend.
4. Workflows and `vercel.json`.
5. Set the repo variables `DATA_AUTHOR_NAME`/`DATA_AUTHOR_EMAIL`, then connect the Vercel project.

## Phase 3b: Ledger restyle and aggregate panels

This phase restyles the frontend to the "Ledger" dark design system and adds two panels to the top of the BTC dashboard: Market Read and Hyperliquid derivatives. It adds no new data sources, no new collection, no new dependencies and no new model math. Authorities: the visuals are in DESIGN.md sections 3, 4 and 6.2, 6.8 to 6.10. The derived values are in docs/MODEL.md sections 3.2 to 3.4. Phase 3 stays as written. The one change to it is that `export.ts` now writes 46 files, where Phase 3 had 45.

### 3b.1 Restyle (frontend only)

- `theme.css`: replace the `:root` token block with DESIGN.md 3.1, 3.2, 3.6 and 4. Keep the `--ph-*` and `--st-*` values byte-identical. Delete the old names (`--surface-0/1/2`, `--line*`, `--text-*`, `--up`, `--down`, `--ok`, `--warn`, `--bad`, `--fs-*`) and rename every usage with the DESIGN.md 3.1 rename map. Add the `.t-*` type classes. `.region` becomes the Ledger panel, with a 1px `--border` on `--surface-100`, radius 10 and no shadow. Restyle `.segmented`, buttons, `select` and tables per 3.6.
- `index.html`: add the Google Fonts `<link>`s from DESIGN.md 4.
- `HtfChart.tsx` and `LtfChart.tsx`: change only the `css("--…")` names and the hex fallbacks passed to `alpha()` (`#22262d` becomes `#212328`, `#199e70` becomes `#3ecb82`, `#e66767` becomes `#f16060`). Leave the options, series, panes, markers, band logic and handlers untouched. The HTF chart must stay functionally identical, and a `git diff` of `HtfChart.tsx` should show only colour-token lines.
- `CycleVector.tsx`, `StatusBar.tsx`, `SignalTable.tsx`, `PhaseGuide.tsx` and `AssetsView.tsx`: apply the token renames and class changes only, with no behaviour change (DESIGN.md 6.10).
- Grep gate: `rg -- '--(surface-[012]|line|text-[123]|up|down|ok|warn|bad|fs-)\b' frontend/src` returns nothing.

### 3b.2 Market Read: `/api/overview` additions (backend, single source)

The words and the sentence are computed on the backend. They are exported in `overview.json` and tested with `bun test`. The frontend never maps scores to words itself.

`backend/src/model/composite.ts` (keep it in this file, next to `biasLabel`):

```ts
export type ComponentKey = "trend" | "heat" | "leverage" | "momentum";
export type Component = { key: ComponentKey; score: number | null; word: string | null };
export function componentWord(key: ComponentKey, score: number | null): string | null; // MODEL 3.3 table
export function readSentence(htfPhase: HtfPhase | null, ltfState: LtfState): string;   // MODEL 3.2
// summaryText becomes `${readSentence(...)} Bias: ${biasText}.` — output byte-identical to today
```

`Overview.composite` gains three fields and keeps the existing `bias` and `summary` unchanged:

```ts
composite: {
  bias: number | null;
  summary: string;
  label: BiasLabel | null;          // bias == null ? null : biasLabel(bias)
  sentence: string;                 // readSentence(h?.phase ?? null, ltfState)
  components: Component[];          // always 4, order trend, heat, leverage, momentum;
                                    // scores = h.trend, h.heat, l.leverage, l.momentum (null-safe)
};
```

Mirror these types in `frontend/src/api.ts`. `crossVenueFunding` stays in the API for compatibility. It now uses `predictedApr` (3b.3), and the UI no longer renders it.

### 3b.3 Derivatives: `/api/derivatives` and `derivatives.json`

New pure module `backend/src/model/derivatives.ts`. It exports `derivatives(snapshots: Snapshot[], funding: FundingRow[], now: number): Derivatives`, `predictedApr(p: Snapshot["predicted"][number]): number` and the `Derivatives` type. The rules are in docs/MODEL.md 3.4: the 7-day window anchored at `now`, the hourly last-per-bucket downsampling, the APR formulas, the OI change on coins with a 1 h tolerance, the venue order and short labels, and `collecting`.

Exact response shape (the static file is identical):

```ts
type Pt = [t: number, v: number];            // ascending by t, ≤ 169 per series
type Derivatives = {
  now: number;                               // window end (ms)
  windowMs: 604800000;
  asOf: number | null;                       // t of the last snapshot in the window
  firstSnapshot: number | null;              // earliest snapshot t in the whole file
  collecting: boolean;                       // < 24 hourly snapshot buckets in the window
  premium:    { points: Pt[]; last: number | null };                    // markPx/oraclePx − 1
  fundingApr: { points: Pt[]; last: number | null;                      // funding.json rate × 8760
                predicted: { venue: string; short: string; apr: number }[] }; // venue as stored ("HlPerp","BinPerp","BybitPerp"), short "HL"|"BIN"|"BYB"
  oiUsd:      { points: Pt[]; last: number | null; change24h: number | null };
  volume24h:  { points: Pt[]; last: number | null };                    // dayNtlVlm
};
```

Size: 4 series × ≤ 169 points × about 30 B is about 20 KB. Do not round the values.

- `server.ts`: add `snapshots` and `funding` to the existing `Cache` (both are already loaded in `getCache`). `GET /api/derivatives` returns `c.json(derivatives(cache.snapshots, cache.funding, Date.now()))`. It takes no query params, and the 24h/7d toggle is client-side. The `/api/overview` `crossVenueFunding` mapping switches to `predictedApr`.
- `export.ts`: `ROUTES["derivatives.json"] = "/api/derivatives"`, which makes 46 files.
- `frontend/src/api.ts`: `derivatives()` fetches `./api/derivatives.json` in static mode and `/api/derivatives` otherwise.
- `useDashboardData.ts`: fetch derivatives together with overview on each `lastRefresh` change (the same trigger as htf/ltf), and expose `derivatives`, `derivativesError` and `retryDerivatives` (the partial state from DESIGN.md 7).
- Degradation: the local `snapshots.jsonl` may hold only a handful of rows. Empty or short series are valid responses, never errors. The panel renders `collecting` per cell (DESIGN.md 6.8). Funding normally renders from `funding.json` while snapshots are still being collected.

### 3b.4 Frontend components

| File | Change |
|---|---|
| `components/MarketRead.tsx` | new (DESIGN.md 6.2). Replaces `PhaseReadout.tsx`, which is deleted |
| `components/DerivativesPanel.tsx` | new (DESIGN.md 6.8) |
| `components/Sparkline.tsx` | new, inline SVG, no library (DESIGN.md 6.9) |
| `App.tsx` | the BTC grid is MarketRead span-7 plus CycleVector span-5, then DerivativesPanel span-12, then HTF, LTF and signals as before |
| `api.ts`, `useDashboardData.ts` | 3b.2 types, 3b.3 fetcher and state |
| `theme.css`, `index.html`, charts, other components | 3b.1 |

`format.ts` already has every formatter these panels need (`fmtScore`, `fmtBp`, `fmtApr`, `fmtCompactUsd`, `fmtPercentSigned`, `fmtDate`). Add none.

### 3b.5 Tests required (`bun test`)

1. `componentWord` (new `backend/test/aggregate.test.ts`). For each key, test every boundary exactly and at ±1e-9: trend `0.25 → uptrend`, `0.2499… → sideways`, `−0.25 → downtrend`, `−0.2499… → sideways`. Heat: `0.75 hot`, `0.20 warm`, `−0.35 cool`, `−0.3499… mild`, `−0.60 cold`, `−0.5999… cool`. Leverage: `0.50 crowded`, `0.20 building`, `−0.25 shorting`, `−0.2499… balanced`, `−0.50 squeezable`, `−0.4999… shorting`. Momentum: `0.60 surging`, `0.30 rising`, `−0.30 falling`, `−0.2999… flat`, `−0.60 plunging`. `null → null` for all four. Also check that `+1` and `−1` map to the extreme words.
2. `readSentence` and `summaryText`: for a fixed phase and state, `summaryText(p, s, b) === readSentence(p, s) + " Bias: " + …`. The existing summary tests must still pass unchanged. For `null` phase with `insufficient_data`, the result is `"HTF data insufficient; LTF data insufficient."`.
3. `derivatives` (new `backend/test/derivatives.test.ts`, synthetic rows):
   - Empty snapshots plus 200 hourly funding rows: `collecting: true`, the three snapshot series are empty with `last: null`, `change24h: null`, `predicted: []`, `firstSnapshot: null`. `fundingApr.points.length === 168` (the window keeps `t > now − 7d`), and each `v === rate × 8760`.
   - Three snapshots in the same UTC hour: one point, with the last snapshot's `t` and values.
   - A snapshot older than 7d is excluded from the points but still sets `firstSnapshot`.
   - `premium` equals `markPx / oraclePx − 1`, and `oraclePx: 0` gives no point.
   - `change24h`: a `then` at exactly `now.t − 24h − 1h` counts, one at `−24h − 1h − 1ms` does not, and `then.oiCoins = 0` gives `null`.
   - `predictedApr({ rate: 0.00003732, intervalHours: 8 })` is `0.00003732 × 1095` (tolerance 1e-12). Predicted order is HL, BIN, BYB whatever the stored order, and an unknown venue keeps its name as `short`.
   - `collecting`: 23 hourly buckets gives `true`, 24 gives `false`.
4. `api.test.ts`:
   - `/api/derivatives` returns 200 with every key in 3b.3. With an empty `DATA_DIR` snapshot file it still returns 200 with `collecting: true`.
   - `/api/overview` `composite.components` has length 4, in key order, with each `word` equal to `componentWord(key, score)`.
   - `composite.summary` is unchanged against the pre-change fixture response.
5. `export.test.ts`: writes `derivatives.json`, and the total file count is 46.
6. Frontend: none required (no frontend test runner in the repo). `bun run build` must typecheck, and the 3b.1 grep gate must pass.

### 3b.6 Order of work

1. Backend: `composite.ts` additions, `derivatives.ts`, `server.ts`, `export.ts` and the tests (3b.5).
2. Frontend restyle (3b.1). Visually check that the HTF chart is unchanged apart from colour.
3. MarketRead, Sparkline, DerivativesPanel and App wiring.
4. Out of scope for this phase: a light theme, a sparkline tooltip or hover, per-window API params, alt derivatives panels, and more venues. Add them when they are asked for.
