# hl-cycles Scoring Model

This file is the exact spec for every derived value in hl-cycles. Implement it as written. Where this file and `SPEC.md` disagree about the model, this file wins. Every constant here was calibrated on real data (see "Calibration"). Do not change constants without re-running the regression fixtures.

## 0. Conventions

- Time is UTC milliseconds. A day is `86_400_000` ms. Daily candles have `t` at 00:00 UTC. If a source gives a daily `t` that is not a multiple of `86_400_000`, floor it to the UTC day before merging.
- Only closed candles are scored. Drop a candle while `t + intervalMs > now`. `/api/overview.price` comes from the latest snapshot `markPx` (fallback: last closed candle close), not from the scored series.
- `ln` is the natural log. `tanh` is `Math.tanh`. `clamp(x, a, b) = min(b, max(a, x))`. If a clamp has no bounds given, it means `clamp(x, -1, 1)`.
- "Index `i`" means the position in the ascending, gap-free, deduplicated series. Windows written as `[i-k+1 .. i]` include bar `i`.
- `null` spreads. A formula with any `null` input returns `null` unless the section says to drop and renormalize.
- Weighted blend with renormalization: `blend(parts) = Σ(w·x) / Σ(w)` over the parts whose `x` is not `null`. If no part is available, the result is `null`.
- Percentile rank of `x[i]` in a window: `pctRank = (countLess + 0.5·countEqual) / count`, over the non-null values in the window, **including `x[i]` itself**. If `count < min`, the result is `null`. Result is in (0, 1).
- Numbers are IEEE doubles. Tests compare derived values with a tolerance of `1e-6` and compare labels exactly.

## 1. HTF (daily)

### 1.1 Input series

The daily series is Bitstamp before the first Hyperliquid 1d candle with `v > 0`, and Hyperliquid from that day on (per `SPEC.md`). Each item keeps `src`. The series must be continuous (one candle per UTC day). If a day is missing, forward-fill it with `o = h = l = c = previous close`, `v = 0`, and `src` equal to the previous candle's `src`. (Bitstamp 2011-09-13 to 2026-09-26 had no gaps when checked.)

Let `c[i]` be the close.

### 1.2 Features

| name | formula | first non-null index |
|---|---|---|
| `sma50[i]` | mean of `c[i-49 .. i]` | 49 |
| `sma200[i]` | mean of `c[i-199 .. i]` | 199 |
| `mayer[i]` | `c[i] / sma200[i]` | 199 |
| `mayerPct[i]` | pctRank of `mayer[i]` in window `[i-1459 .. i]`, min 365 values | 563 |
| `ath[i]` | `max(c[0 .. i])` | 0 |
| `drawdown[i]` | `c[i] / ath[i] - 1` (≤ 0) | 0 |
| `sma200Slope30[i]` | `sma200[i] / sma200[i-30] - 1` | 229 |
| `roc30[i]` | `c[i] / c[i-30] - 1` | 30 |
| `roc365[i]` | `c[i] / c[i-365] - 1` | 365 |
| `rv30[i]` | sample stdev (divide by n-1 = 29) of `lr[i-29 .. i]`, times `sqrt(365)`, where `lr[k] = ln(c[k] / c[k-1])` | 30 |
| `rv30Pct[i]` | pctRank of `rv30[i]` in window `[i-1459 .. i]`, min 365 values | 394 |
| `daysSinceLow365[i]` | `i - m`, where `m` is the index of the minimum of `c[max(0, i-364) .. i]`. Ties go to the **most recent** index. | 0 |

Indices are for a series that starts at the first Bitstamp day (2011-09-13). Index 229 is 2012-04-29 and index 563 is 2013-03-29. If Bitstamp is removed, the same index rules apply to the Hyperliquid series (phases then start 563 days after 2020-08-19).

`rv30` and `rv30Pct` are for display only. They do not feed any score.

### 1.3 Cycle

Halvings (UTC midnight): `2012-11-28`, `2016-07-09`, `2020-05-11`, `2024-04-20`. Keep them as a constant array in ascending order.

- `lastHalving` = the latest halving with `halving ≤ t`. It is `null` before 2012-11-28.
- `daysSinceHalving = floor((t - lastHalving) / 86_400_000)`, or `null`.
- `cycleProgress = clamp(daysSinceHalving / 1460, 0, 1)`, or `null`.

The cycle does not feed any score. It is context only.

### 1.4 Trend `T` in [-1, 1]

All three inputs are required. If any is `null`, `T` is `null`.

```
tMayer = tanh( ln(mayer) / 0.15 )
tSlope = tanh( sma200Slope30 / 0.04 )
tCross = tanh( ln(sma50 / sma200) / 0.10 )
T      = 0.35·tMayer + 0.35·tSlope + 0.30·tCross
```

### 1.5 Heat `H` in [-1, 1]

All three inputs are required. If any is `null`, `H` is `null`.

```
hMayer    = 2·mayerPct - 1
hDrawdown = clamp( 1 + drawdown / 0.4 )        // 0% → +1, -40% → 0, ≤ -80% → -1
hRoc365   = tanh( ln(1 + roc365) / 1.0 )
H         = 0.50·hMayer + 0.25·hDrawdown + 0.25·hRoc365
```

### 1.6 Raw phase

If `T` or `H` is `null`, `rawPhase` is `null`. Otherwise check the rules **in this order**. The first match wins.

| # | phase | condition |
|---|---|---|
| 1 | `capitulation` | `(H ≤ -0.60 AND daysSinceLow365 ≤ 30)` OR `(roc30 ≤ -0.30 AND drawdown ≤ -0.50 AND T < 0)` |
| 2 | `euphoria` | `H ≥ 0.75 AND T ≥ 0.30` |
| 3 | `accumulation` | `H ≤ -0.35 AND daysSinceLow365 > 30` |
| 4 | `distribution` | `H ≥ 0.20 AND c < sma50 AND T > -0.25` |
| 5 | `expansion` | `T ≥ 0.25` |
| 6 | `markdown` | `T ≤ -0.25` |
| 7 | `distribution` if `H > 0`, else `accumulation` | (flat trend band) |

### 1.7 Phase hysteresis (committed phase)

Walk the days in ascending order with state `cur = null`, `cand = null`, `run = 0`, `away = 0`.

```
for each day i:
  r = rawPhase[i]
  if r == null:            phase[i] = null; continue        // only happens during warmup
  if cur == null:          cur = r; phase[i] = cur; continue // initial assignment, not a signal
  if r == cur:             cand = null; run = 0; away = 0
  else:
    away += 1
    if r == cand: run += 1 else: cand = r; run = 1
    need = (r == "euphoria" or r == "capitulation") ? 5 : 14
    if run >= need or away >= 28:
      emit signal (day i, from cur, to r)
      cur = r; cand = null; run = 0; away = 0
  phase[i] = cur
```

In words: a new phase is committed after it is the raw phase for 5 days in a row (`euphoria`, `capitulation`) or 14 days in a row (the others). As a fallback, if the raw phase differs from the committed one for 28 days in a row (through a mix of other phases), the committed phase becomes that day's raw phase. The signal date is the day the switch is confirmed, not the first day of the run. This is causal: day `i` only uses data up to `i`.

### 1.8 Weekly resample (`/api/htf?interval=1w`)

- The week key is `weekStart = floor((t - 345_600_000) / 604_800_000) · 604_800_000 + 345_600_000` (Monday 00:00 UTC; 1970-01-05 was a Monday).
- Group the daily candles by `weekStart`. `t = weekStart`, `o` = the first day's open, `h` = max high, `l` = min low, `c` = the last day's close, `v` = sum, `src` = the last day's `src`.
- Indicator fields (`sma200`, `sma50`, `mayer`, `drawdown`, `rv30`, `trend`, `heat`, `phase`) are **copied from the last daily point of that week**. They are not recomputed on weekly bars.
- The current, unfinished week is included. Its values come from the latest closed day.

## 2. LTF (4h default, 1h)

### 2.1 Constants per interval

| constant | 4h | 1h |
|---|---|---|
| `BAR` (ms) | 14_400_000 | 3_600_000 |
| `W30` bars in 30 days | 180 | 720 |
| `W90` bars in 90 days | 540 | 2160 |
| `BARS_PER_YEAR` | 2190 | 8760 |
| `BARS_24H` | 6 | 24 |

`FUNDING_BASE_APR = 0.0000125 · 8760 = 0.1095` (Hyperliquid's resting hourly funding when the premium is near zero).

### 2.2 Features per bar `i` (bar open `t`, close `t + BAR`)

| name | formula | null when |
|---|---|---|
| `ema50` | seed: `ema50[49] = mean(c[0..49])`; then `ema50[i] = c[i]·(2/51) + ema50[i-1]·(49/51)` | `i < 49` |
| `rsi14` | Wilder. `d_k = c[k]-c[k-1]`, `g = max(d,0)`, `l = max(-d,0)`. Seed at `i = 14`: `ag = mean(g_1..g_14)`, `al = mean(l_1..l_14)`. Then `ag = (13·ag + g_i)/14`, same for `al`. `rsi = al == 0 ? 100 : 100 - 100/(1 + ag/al)` | `i < 14` |
| `roc6` | `c[i] / c[i-6] - 1` | `i < 6` |
| `fundingApr` | for bars ≥ 1h: mean of `rate` over funding rows with `t ≤ row.t < t + BAR`, times 8760. For bars < 1h (15m): forward-filled from the latest funding row with `row.t ≤ t`, since Hyperliquid funding rows are hourly | no rows in the bar (≥1h); no funding row within 1h before `t` (<1h) |
| `premium` | for bars ≥ 1h: mean of `premium` over the same rows. For bars < 1h: forward-filled the same way as `fundingApr` | same as `fundingApr` |
| `premiumZ` | `(premium[i] - μ) / max(σ, 0.0001)`, where μ and σ (population, divide by n) come from the non-null `premium` values in `[i-W30 .. i-1]` (the current bar is **excluded**) | `premium[i]` null, or fewer than `W30/2` non-null values in the window |
| `oiUsd` | `oiUsd` of the latest snapshot with `snap.t ≤ t + BAR` and `snap.t ≥ t + BAR - 3_600_000` | no such snapshot |
| `oiChange24h` | `oiCoinsNow / oiCoinsThen - 1`. `oiCoinsNow` is taken the same way as `oiUsd`. `oiCoinsThen` is the latest snapshot with `snap.t ≤ t + BAR - 86_400_000` and `snap.t ≥ t + BAR - 86_400_000 - 3_600_000` | either snapshot is missing, or `oiCoinsThen ≤ 0` |
| `rv42` | sample stdev (n-1) of the last 42 log returns `[i-41 .. i]`, times `sqrt(BARS_PER_YEAR)` | `i < 42` |
| `rv42Pct` | pctRank of `rv42[i]` in `[i-W90+1 .. i]`, min `W30` values | not enough values |

Use coins, not USD, for `oiChange24h`, so a price move alone does not look like new leverage. `rv42` and `rv42Pct` are for display only.

**Provenance note.** `FundingRow.src` and `OiRow.src` mark rows backfilled from Binance BTCUSDT perp history (`data/oi-history.json`, and the pre-2023-05-12 rows of `data/funding.json`): missing `src` on a funding row means Hyperliquid, `src: "binance"` means the Binance proxy. This covers periods Hyperliquid itself has no data for — funding/premium before Hyperliquid's 2023-05-12 funding history starts, and all open interest before Hyperliquid snapshots exist (2026-09-27 on). It is a different venue: Binance's funding interval is 8h (expanded to hourly-equivalent rows here) versus Hyperliquid's 1h, and "premium" is Binance's own premium index, not Hyperliquid's. `oiUsd`/`oiChange24h` fall back to `oi-history.json` only when no Hyperliquid snapshot is near the bar; a real snapshot always wins.

### 2.3 Leverage `L` in [-1, 1]

```
lFunding = tanh( (fundingApr - 0.1095) / 0.10 )            weight 0.4
lPremium = tanh( premiumZ / 2 )                            weight 0.3
side     = sign( blend of lFunding (w 0.4) and lPremium (w 0.3) )   // -1, 0 or +1
lOi      = side · tanh( oiChange24h / 0.05 )                        weight 0.3; null if oiChange24h is null
L        = blend of lFunding, lPremium, lOi with renormalization
```

Open interest tells how much leverage is building, not which side. So `lOi` takes its sign from funding and premium: rising OI makes the crowded side look more crowded, and falling OI makes it look less crowded. If both `lFunding` and `lPremium` are `null`, `L` is `null`. If `side = 0`, then `lOi = 0` and it still counts in the blend when `oiChange24h` is not null.

### 2.4 Momentum `M` in [-1, 1]

```
mEma = tanh( (c / ema50 - 1) / 0.03 )      weight 0.4
mRsi = clamp( (rsi14 - 50) / 25 )          weight 0.3
mRoc = tanh( roc6 / 0.04 )                 weight 0.3
M    = blend with renormalization
```

### 2.5 Raw state

First match wins:

| # | state | condition |
|---|---|---|
| 1 | `insufficient_data` | `L == null OR M == null` |
| 2 | `deleveraging` | `oiChange24h != null AND oiChange24h ≤ -0.08 AND abs(roc6) ≥ 0.03` |
| 3 | `crowded_long` | `L ≥ 0.50` |
| 4 | `short_squeeze_fuel` | `L ≤ -0.25 AND M ≥ 0.20` |
| 5 | `crowded_short` | `L ≤ -0.50` |
| 6 | `healthy_uptrend` | `M ≥ 0.30` |
| 7 | `downtrend` | `M ≤ -0.30` |
| 8 | `neutral` | otherwise |

### 2.6 State debounce (committed state)

This uses the same loop as 1.7, with no `away` fallback and `need = 2` for every state, `insufficient_data` included. The first bar's raw state is the initial state, and it is not a signal. A signal is emitted on the bar where the new state completes its second bar in a row. Example: raw `A A B B` gives committed `A A A B`, with the signal at bar 3 (0-based).

## 3. Composite

```
bLev    = L == null ? 0 : sign(L) · 0.3 · max(0, (abs(L) - 0.5) / 0.5)   // 0 until |L| > 0.5, 0.3 at |L| = 1
base    = blend([0.6·T, 0.4·M]) with renormalization                     // T = HTF trend of the last closed day, M = LTF momentum of the last closed 4h bar
bias    = base == null ? null : clamp(base - bLev)
```

When longs are crowded (`L > 0.5`), the bias moves bearish. When shorts are crowded, it moves bullish.

Bias label (use the first that matches): `bias ≥ 0.50` → `strongly bullish`, `≥ 0.15` → `bullish`, `> -0.15` → `neutral`, `> -0.50` → `bearish`, else `strongly bearish`.

### 3.1 Summary string

```
summary = `${HTF_TEXT[htfPhase]}; ${LTF_TEXT[ltfState]}. Bias: ${label} (${fmt(bias)}).`
fmt(x) = (x >= 0 ? "+" : "-") + abs(x).toFixed(2)      // -0 and 0 print "+0.00"
```

If `bias` is `null`, the summary is `${HTF_TEXT}; ${LTF_TEXT}. Bias: unavailable.`

| HTF phase | `HTF_TEXT` |
|---|---|
| `accumulation` | `HTF accumulation: price is basing well below prior highs` |
| `expansion` | `HTF expansion: trend is up and not yet overheated` |
| `euphoria` | `HTF euphoria: trend is up and price is extremely extended` |
| `distribution` | `HTF distribution: still elevated but momentum is fading` |
| `markdown` | `HTF markdown: trend is down` |
| `capitulation` | `HTF capitulation: deep drawdown with fresh lows` |
| `null` | `HTF data insufficient` |

| LTF state | `LTF_TEXT` |
|---|---|
| `crowded_long` | `perps are crowded long (funding and premium hot)` |
| `healthy_uptrend` | `short-term uptrend with balanced leverage` |
| `short_squeeze_fuel` | `price is rising while shorts pay (squeeze fuel)` |
| `crowded_short` | `perps are crowded short` |
| `deleveraging` | `open interest is flushing out on a sharp move` |
| `downtrend` | `short-term downtrend with balanced leverage` |
| `neutral` | `short-term neutral` |
| `insufficient_data` | `LTF data insufficient` |

Example: `HTF expansion: trend is up and not yet overheated; perps are crowded long (funding and premium hot). Bias: bullish (+0.34).`

### 3.2 Market Read (aggregate, display only, Phase 3b)

The Market Read panel adds **no new model math**. Its headline number is `bias` from section 3, and its four "why" scores are the existing raw scores: `trend = T` and `heat = H` of the last closed day (1.4, 1.5), and `leverage = L` and `momentum = M` of the last closed 4h bar (2.3, 2.4). These are exactly `overview.htf.trend`, `htf.heat`, `ltf.leverage` and `ltf.momentum`. Only `T`, `M` and `L` feed `bias`; `heat` is shown because it decides the phase, not because it moves the bias.

Composition, restated for the panel:

```
bias  = clamp( blend([0.6·T, 0.4·M]) − bLev(L) )        // section 3
label = biasLabel(bias)                                // section 3, null when bias is null
phase = committed HTF phase (1.7)                      // the ONE phase word
```

`sentence` is the summary without its bias clause (the number and label are already the headline):

```
sentence = `${HTF_TEXT[htfPhase]}; ${LTF_TEXT[ltfState]}.`      // tables in 3.1, htfPhase null → HTF_TEXT_NULL
summary  = `${sentence} Bias: ${biasText}.`                     // byte-identical to 3.1
```

Implement as `readSentence(htfPhase, ltfState)` in `backend/src/model/composite.ts`; `summaryText` calls it, so the existing summary tests pin both.

### 3.3 Component words

Pure function `componentWord(key, score)` in `backend/src/model/composite.ts`, `key ∈ {"trend","heat","leverage","momentum"}`, returns `string | null`. `null` score → `null` word (the UI prints `—`). Check the rows top to bottom; the first match wins. Comparisons are exactly as written (`≥` includes the boundary, `>` excludes it), so every boundary value maps to one word.

| key | rule 1 | rule 2 | rule 3 | rule 4 | otherwise |
|---|---|---|---|---|---|
| `trend` (T) | `≥ 0.25` → `uptrend` | `> −0.25` → `sideways` | — | — | `downtrend` |
| `heat` (H) | `≥ 0.75` → `hot` | `≥ 0.20` → `warm` | `> −0.35` → `mild` | `> −0.60` → `cool` | `cold` |
| `leverage` (L) | `≥ 0.50` → `crowded` | `≥ 0.20` → `building` | `> −0.25` → `balanced` | `> −0.50` → `shorting` | `squeezable` |
| `momentum` (M) | `≥ 0.60` → `surging` | `≥ 0.30` → `rising` | `> −0.30` → `flat` | `> −0.60` → `falling` | `plunging` |

Where the thresholds come from (so the words never contradict a label on screen):

- trend ±0.25 = the `expansion`/`markdown` rules in 1.6.
- heat 0.75 = `euphoria`, 0.20 = `distribution`, −0.35 = `accumulation`, −0.60 = `capitulation` (1.6).
- leverage 0.50 = `crowded_long`, −0.25 = `short_squeeze_fuel`, −0.50 = `crowded_short` (2.5); 0.20 is the one display-only cut, so "building" appears before the state flips to crowded. `crowded` means crowded **long**; crowded short reads `squeezable`.
- momentum ±0.30 = `healthy_uptrend`/`downtrend` (2.5); ±0.60 are display-only cuts for the extremes.

`overview.composite.components` is always the 4-element array in the order trend, heat, leverage, momentum: `{ key, score, word }`.

### 3.4 Derivatives series (`/api/derivatives`, display only, Phase 3b)

Built by a pure `derivatives(snapshots, funding, now)` in `backend/src/model/derivatives.ts` from stored data only: `data/snapshots.jsonl` (`Snapshot`) and `data/funding.json` (`FundingRow`). Window `W = 7 · 86_400_000`, anchored at `now` (request time; build time for the static export). Only rows with `now − W < t ≤ now` are used.

Units, verified against the stored data: `FundingRow.rate` and `Snapshot.funding` are **hourly** Hyperliquid rates (e.g. `0.0000125` = the resting rate), so an hourly rate annualizes as `× 8760`. `Snapshot.predicted[].rate` is **per venue interval**, so it annualizes as `rate × 8760 / intervalHours` (Binance and Bybit report `intervalHours: 8`, HL reports `1`). This is the formula `/api/overview.crossVenueFunding` already uses; both must call one exported helper, `predictedApr(p)`.

| series | per point | source |
|---|---|---|
| `premium` | `markPx / oraclePx − 1` (fraction; the UI prints bp) | snapshots |
| `fundingApr` | `rate × 8760` | funding rows (hourly, already one per hour) |
| `oiUsd` | `oiUsd` | snapshots |
| `volume24h` | `dayNtlVlm` (Hyperliquid's rolling 24h notional, USD) | snapshots |

Mark-vs-oracle is used on purpose rather than `Snapshot.premium` (Hyperliquid's impact-price premium), because it is what the panel labels.

**Downsampling.** Snapshots are bucketed by UTC hour (`floor(t / 3_600_000)`) and only the **last** snapshot in each bucket is kept, with its own `t`. So each series has at most 168 points (169 at a boundary). Funding rows are already hourly and are not bucketed. A snapshot with `oraclePx ≤ 0` gives no `premium` point. Non-finite values are dropped.

**Gaps.** Points are not interpolated or filled. The client breaks the line where consecutive points are more than `7_200_000` ms apart (DESIGN.md 6.9).

**`last`.** The value of the last point in the series, or `null` if the series is empty.

**OI 24h change** (coins, like `oiChange24h` in 2.2, so a price move alone is not new leverage):

```
now  = the last snapshot in the window
then = the latest snapshot s with  now.t − 86_400_000 − 3_600_000 ≤ s.t ≤ now.t − 86_400_000
change24h = now.oiCoins / then.oiCoins − 1      // null if there is no now or no then, or then.oiCoins ≤ 0
```

The 1 h tolerance is the same as the BTC snapshot OI window in SPEC.md 3.4. `then` is searched in the raw snapshots, before bucketing.

**Predicted funding.** From the last snapshot in the window, in the order `HlPerp`, `BinPerp`, `BybitPerp`, then any other venue in stored order. Short labels are `HlPerp → HL`, `BinPerp → BIN`, `BybitPerp → BYB`, and any unknown venue keeps its stored name. If there is no snapshot in the window, the list is `[]`.

**Collecting.** `collecting = (number of hourly snapshot buckets in the window) < 24`. So the panel says "collecting" until at least a day's worth of hourly coverage exists. `firstSnapshot` is the `t` of the earliest snapshot in the whole file (not just the window), or `null`.

## 4. `/api/overview` feature keys

`htf.features` (values for the last closed day, all `number | null`):
`close, sma50, sma200, mayer, mayerPct, drawdown, sma200Slope30, roc30, roc365, rv30, rv30Pct, daysSinceLow365, tMayer, tSlope, tCross, hMayer, hDrawdown, hRoc365`

`ltf.features` (values for the last closed bar of the requested or default interval, all `number | null`):
`close, ema50, rsi14, roc6, fundingApr, premium, premiumZ, oiUsd, oiChange24h, rv42, rv42Pct, lFunding, lPremium, lOi, mEma, mRsi, mRoc`

`composite` (Phase 3b, additive, existing fields unchanged): `bias`, `summary`, plus `label` (`BiasLabel | null`), `sentence` (3.2) and `components` (3.3).

`htf.phase` is the committed phase. `ltf.state` is the committed state. `trend`, `heat`, `leverage` and `momentum` are the raw scores of that day or bar. Signal rows use the committed labels and the scores on the switch day or bar (`price` = that close).

## 5. Regression fixtures

### 5.1 Fixture data

Tests run on **Bitstamp-only** daily data, 2011-09-13 through 2026-09-26 inclusive: 5493 rows, no gaps, first close `5.97` (2011-09-13), last close `84433.05` (2026-09-26). Store it as `backend/test/fixtures/bitstamp-1d.json` (`Candle[]`, `src: "bitstamp"`). Create it once with the Bitstamp adapter (`step=86400`, `limit=1000`, walk `start` from `1315872000`, stop at 2026-09-26) and commit it. The calibration copy is at `/tmp/claude-1000/-home-nca-projects/48be78ba-2edb-475d-894b-e6297e6a3797/scratchpad/model/bitstamp.json`. That copy has ms `t`, no `src`, and one extra partial row for 2026-09-27, which you must drop. Do not use the merged series for these tests: Hyperliquid closes differ slightly and can move switch dates by a day or two.

### 5.2 Numeric checks (tolerance 1e-4)

| date | c | sma200 | T | H | mayerPct | drawdown | sma200Slope30 | roc365 | rv30 | rv30Pct | daysSinceLow365 | phase |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2021-11-10 | 64921.43 | 45662.5953 | 0.750546 | 0.693424 | 0.744178 | -0.039041 | 0.013759 | 3.239448 | 0.584640 | 0.319521 | 364 | expansion |
| 2022-11-21 | 15766 | 22323.23745 | -0.969084 | -0.789659 | 0.155822 | -0.766634 | -0.125564 | -0.731315 | 0.834485 | 0.772260 | 0 | capitulation |

Warmup: `T` is `null` before 2012-04-29 and non-null from that day on. `H` and `phase` are `null` before 2013-03-29. The first phase is `euphoria` on 2013-03-29.

### 5.3 Anchor dates (test these)

Each anchor sits at least 10 days away from a phase switch.

| date | expected phase |
|---|---|
| 2013-12-01 | euphoria |
| 2015-01-15 | capitulation |
| 2015-08-01 | accumulation |
| 2016-06-01 | expansion |
| 2017-12-15 | euphoria |
| 2018-12-15 | capitulation |
| 2019-02-15 | accumulation |
| 2020-03-30 | capitulation |
| 2021-03-15 | euphoria |
| 2022-04-15 | markdown |
| 2022-07-01 | capitulation |
| 2022-12-01 | capitulation |
| 2023-01-20 | accumulation |
| 2024-03-13 | euphoria |
| 2024-10-01 | distribution |
| 2025-06-15 | expansion |

### 5.4 Full phase-change table

These are all committed phase switches on the fixture: 60 switches plus the initial assignment in row 0. `T` and `H` are rounded to 2 decimals and show values on the switch day. A test should assert that the list of `(date, to)` pairs matches this table exactly.

| # | date (UTC) | from | to | close | T | H |
|---|---|---|---|---|---|---|
| 0 | 2013-03-29 | (none) | euphoria | 90 | 1.00 | 0.99 |
| 1 | 2013-04-30 | euphoria | expansion | 140 | 1.00 | 0.68 |
| 2 | 2013-11-08 | expansion | euphoria | 334 | 0.99 | 0.90 |
| 3 | 2014-02-03 | euphoria | expansion | 809 | 1.00 | 0.51 |
| 4 | 2014-04-09 | expansion | accumulation | 442 | 0.02 | -0.49 |
| 5 | 2014-07-01 | accumulation | markdown | 638 | -0.37 | -0.16 |
| 6 | 2014-07-24 | markdown | accumulation | 602 | -0.17 | -0.20 |
| 7 | 2014-08-26 | accumulation | markdown | 512 | -0.43 | -0.28 |
| 8 | 2014-09-30 | markdown | accumulation | 391 | -0.88 | -0.43 |
| 9 | 2014-12-21 | accumulation | capitulation | 320 | -0.94 | -0.82 |
| 10 | 2015-02-27 | capitulation | accumulation | 253 | -0.99 | -0.79 |
| 11 | 2015-11-09 | accumulation | expansion | 378 | 0.83 | 0.07 |
| 12 | 2017-03-02 | expansion | euphoria | 1258 | 0.99 | 0.79 |
| 13 | 2017-04-12 | euphoria | expansion | 1212 | 0.98 | 0.67 |
| 14 | 2017-05-04 | expansion | euphoria | 1537 | 0.99 | 0.84 |
| 15 | 2018-01-27 | euphoria | distribution | 11447 | 1.00 | 0.52 |
| 16 | 2018-02-14 | distribution | expansion | 9491 | 0.92 | 0.19 |
| 17 | 2018-04-04 | expansion | capitulation | 6800 | -0.08 | -0.33 |
| 18 | 2018-05-04 | capitulation | accumulation | 9697 | -0.05 | -0.01 |
| 19 | 2018-07-29 | accumulation | markdown | 8217 | -0.72 | -0.07 |
| 20 | 2018-10-24 | markdown | accumulation | 6412 | -0.69 | -0.36 |
| 21 | 2018-11-20 | accumulation | capitulation | 4352 | -0.86 | -0.84 |
| 22 | 2019-01-28 | capitulation | accumulation | 3430 | -0.98 | -0.93 |
| 23 | 2019-05-17 | accumulation | expansion | 7352 | 0.52 | 0.18 |
| 24 | 2019-11-18 | expansion | accumulation | 8171 | -0.14 | -0.32 |
| 25 | 2020-01-16 | accumulation | markdown | 8710 | -0.60 | -0.10 |
| 26 | 2020-03-05 | markdown | accumulation | 9067 | 0.12 | -0.04 |
| 27 | 2020-03-16 | accumulation | capitulation | 5033 | -0.49 | -0.64 |
| 28 | 2020-04-13 | capitulation | markdown | 6864 | -0.84 | -0.35 |
| 29 | 2020-05-29 | markdown | expansion | 9421 | 0.48 | -0.02 |
| 30 | 2020-12-20 | expansion | euphoria | 23471 | 1.00 | 0.82 |
| 31 | 2021-05-14 | euphoria | distribution | 49880 | 0.97 | 0.41 |
| 32 | 2021-05-31 | distribution | expansion | 37341 | 0.44 | 0.02 |
| 33 | 2021-07-13 | expansion | markdown | 32728 | -0.33 | -0.23 |
| 34 | 2021-08-20 | markdown | distribution | 49356 | 0.07 | 0.31 |
| 35 | 2021-10-21 | distribution | expansion | 62219 | 0.47 | 0.67 |
| 36 | 2021-12-01 | expansion | distribution | 57252 | 0.77 | 0.51 |
| 37 | 2022-01-18 | distribution | accumulation | 42377 | -0.10 | -0.16 |
| 38 | 2022-02-17 | accumulation | markdown | 40556 | -0.45 | -0.33 |
| 39 | 2022-06-16 | markdown | capitulation | 20383 | -0.99 | -0.82 |
| 40 | 2022-08-01 | capitulation | accumulation | 23283 | -0.99 | -0.67 |
| 41 | 2022-09-10 | accumulation | capitulation | 21672 | -0.98 | -0.68 |
| 42 | 2022-11-04 | capitulation | accumulation | 21153 | -0.89 | -0.51 |
| 43 | 2022-11-13 | accumulation | capitulation | 16310 | -0.98 | -0.79 |
| 44 | 2023-01-04 | capitulation | accumulation | 16849 | -0.88 | -0.56 |
| 45 | 2023-02-16 | accumulation | expansion | 23521 | 0.52 | -0.12 |
| 46 | 2023-09-13 | expansion | accumulation | 26226 | 0.00 | -0.17 |
| 47 | 2023-11-05 | accumulation | expansion | 35045 | 0.52 | 0.31 |
| 48 | 2024-03-03 | expansion | euphoria | 63142 | 0.99 | 0.82 |
| 49 | 2024-04-26 | euphoria | distribution | 63745 | 0.98 | 0.56 |
| 50 | 2024-05-28 | distribution | expansion | 68327 | 0.96 | 0.55 |
| 51 | 2024-08-24 | expansion | distribution | 64174 | 0.25 | 0.25 |
| 52 | 2024-11-23 | distribution | euphoria | 97775 | 0.86 | 0.78 |
| 53 | 2025-01-14 | euphoria | distribution | 96523 | 0.95 | 0.60 |
| 54 | 2025-03-20 | distribution | expansion | 84158 | 0.49 | 0.09 |
| 55 | 2025-09-05 | expansion | distribution | 110669 | 0.61 | 0.32 |
| 56 | 2025-12-06 | distribution | markdown | 89249 | -0.59 | -0.28 |
| 57 | 2026-03-30 | markdown | accumulation | 66731 | -0.96 | -0.45 |
| 58 | 2026-04-26 | accumulation | markdown | 78660 | -0.78 | -0.22 |
| 59 | 2026-08-13 | markdown | accumulation | 63418 | -0.72 | -0.43 |
| 60 | 2026-09-24 | accumulation | expansion | 84383 | 0.63 | 0.15 |

## 6. Calibration results (2026-09-27)

**HTF** (Bitstamp 2011-09-13 to 2026-09-26): 60 phase switches. Days per phase: expansion 1869, accumulation 989, euphoria 679, markdown 620, distribution 425, capitulation 348.

Checked against the cycle landmarks:

| target | result |
|---|---|
| euphoria 2013-11/12 | hit (2013-11-08 to 2014-02-03) |
| euphoria 2017-12 | hit (2017-05-04 to 2018-01-27) |
| euphoria 2021-03 | hit (2020-12-20 to 2021-05-14) |
| euphoria 2021-11 | **miss**: expansion, then distribution from 2021-12-01. The November 2021 top had a Mayer multiple of only about 1.4 and H peaked at 0.69, below the 0.75 threshold. Lowering the threshold to catch it would also mark mid-trend rallies as euphoria. |
| euphoria 2024-03 / 2024-12 | hit both (2024-03-03 to 2024-04-26, 2024-11-23 to 2025-01-14) |
| capitulation 2015-01 | hit (2014-12-21 to 2015-02-27) |
| capitulation 2018-12 | hit (2018-11-20 to 2019-01-28) |
| capitulation 2020-03 | hit, confirmed 2020-03-16. The crash day 2020-03-12 is 4 days early because of the 5-day confirmation. |
| capitulation 2022-06 / 2022-11 | hit both (2022-06-16 and 2022-11-13 blocks) |
| accumulation 2015 | hit (2015-02-27 to 2015-11-09) |
| accumulation 2019-01..03 | hit (2019-01-28 to 2019-05-17) |
| accumulation 2023-01 | hit (2023-01-04 to 2023-02-16) |

Robustness: moving `dwell` between 14 and 16, the euphoria heat threshold between 0.70 and 0.75, the distribution heat threshold between 0.2 and 0.3, the accumulation threshold between -0.30 and -0.35, or the trend band between ±0.20 and ±0.25 keeps the switch count at 60 to 62 with the same landmark hits.

**LTF** (Hyperliquid 4h, 2025-09-23 to 2026-09-27, 2130 bars with funding, no OI history, so `lOi` was always dropped). Share of bars per committed state: neutral 31.9%, downtrend 23.2%, crowded_short 17.4%, short_squeeze_fuel 13.8%, healthy_uptrend 12.8%, crowded_long 0.9%. No state is above 70% and neutral is not near 0%. There were 317 debounced switches (about 0.9 per day). The sample was a bearish year, so crowded_long is rare. Recheck after a bull leg. `deleveraging` is untested until snapshots exist.

Funding facts behind the LTF constants: hourly funding sat exactly at the 0.1095 APR baseline in more than half of the hours (APR quantiles p5/p25/p50/p95/p99: -0.096 / 0.022 / 0.110 / 0.110 / 0.166). Premium quantiles p5/p50/p95: -5.9 / -4.0 / +3.0 bps.

## 6.1 Threshold calibration (known limitation)

The HTF heat and capitulation thresholds are absolute, not cycle-relative. `hDrawdown = clamp(1 + drawdown / 0.4)` (backend/src/model/htf.ts) saturates at a 40% drawdown, and capitulation requires either `H <= -0.6` within 30 days of the 365-day low, or `drawdown <= -0.5` with `roc30 <= -0.3`. Only `mayer` and `rv30` are percentile-ranked (`mayerPct`, `rv30Pct`).

Cycles are getting structurally shallower: the 2026 maximum drawdown is about -53%, against -77% and -84% in the two prior cycles. A cycle that never reaches those depths may never trigger capitulation, and the heat floor never approaches -1.

Candidate fix: rank `drawdown` and `roc365` by rolling percentile over a 4-year window, the way `mayerPct` is built, or scale the absolute thresholds per cycle. Not implemented. Revisit once the current cycle has printed its low and there is enough data to check the landmark table again.

## 7. Rationale (changes from the first draft)

- **Mayer percentile window, trailing 1460 days rather than expanding.** An expanding window keeps comparing with the 2011–2013 extremes (Mayer 5+). Later tops (2021 at about 2.4) then never read hot, and heat drifts cooler every cycle. A trailing 4-year window adapts to diminishing returns and lets each cycle's top rank near 1. For a percentile, log or raw Mayer gives the same result because the log is monotonic, so the log appears only in the trend term (`tMayer`), where scale matters.
- **Heat blends percentile (0.5), drawdown (0.25) and 365-day ROC (0.25).** The percentile alone stays pinned near 1 for months in a bull market. Drawdown and ROC let heat cool off after a top.
- **Distribution uses `close < sma50` instead of `dT = T - T[30]`.** `T` saturates near 1 through most bull markets, so its 30-day change is about 0 right at tops and `dT` never fired. Losing the 50-day average while heat is still ≥ 0.2 is the observable rollover.
- **Capitulation vs accumulation is decided by days since the 365-day low (≤ 30 vs > 30), not by heat alone.** In early 2019 and early 2023, heat was as low as at the true lows. What changed was that price had stopped making new lows. Before this rule the model scored 9/13 on the landmarks; with it, 11/13.
- **Shock branch for capitulation** (30-day return ≤ -30%, drawdown ≤ -50%, trend below 0). March 2020 fell too fast for the 1460-day percentile to reach -0.6. The `T < 0` guard keeps mid-bull crashes out (2013-07, 2018-02).
- **Hysteresis is 14 days, 5 for euphoria and capitulation, plus a 28-day fallback.** Short, sharp extremes need fast confirmation or they get missed (March 2020 lasted about 4 weeks). The 28-day fallback fixes a stuck state: when the raw phase keeps alternating between two other phases (for example expansion and euphoria in November 2024), no single candidate reaches 14 days in a row, and without the fallback the committed phase lagged by months. With a 10-day dwell there were 79 switches; switching on any 14 days away from the current phase gave 72.
- **Funding is measured as deviation from Hyperliquid's resting 0.1095 APR, not as a 30-day z-score.** Funding is pinned at that exact value most of the time, so the trailing standard deviation is often about 0 and a z-score would blow up on tiny moves. The premium is continuous, so it keeps a z-score (with a 1 bp floor on the standard deviation).
- **OI change uses coins and signs itself from funding and premium.** OI in USD rises with price alone. OI does not say which side is crowded, only how much.
- **An LTF `downtrend` state was added.** Without it, orderly selling with balanced leverage fell into `neutral`, and neutral would have been about 55% of bars in a bearish year.
- **`rv30`, `rv42`, their percentiles and the halving cycle are display-only.** Adding them to the scores did not improve the landmark fit, and cycle timing is a narrative, not an input to measure. They still appear in `features` for the dashboard.
- **Known ceiling:** the LTF sample is one bearish year, and it had no OI history. Revisit the `L` thresholds (±0.5) once the store holds a bull period and at least 30 days of snapshots.

## 8. Vector + Compass (Phase 4)

Code: `backend/src/model/compass.ts` (lenses), `backend/src/model/vector.ts` (regime, levels, brief, payload), helpers in `indicators.ts`. Served at `GET /api/vector` (`vector.json`), shape per `SPEC.md` 4.4 + 4.7. Pure functions over the stored series; nothing here fetches.

### 8.1 Daily spine, alignment, carry-forward

- **Spine** = the HTF daily series (§1.1: merged Bitstamp + Hyperliquid, gap-filled, closed days only). `price[i]` is its close. Every output series has one value per spine day.
- **Alignment.** A source row matches a spine day only on the exact UTC day (`t` already floored by the adapters). Then `carry(x, 10)`: a missing day takes the last value for at most **10** consecutive days, after that it is `null`. This covers weekends/holidays (FRED), the weekly `DTWEXBGS` print and the ~7-day bitcoin-data delay.
- **Flows** (`etf-flow-btc`): days with no row between the first and last row read **0** (no print = no flow), days after the last row are unknown; rolling sums are taken first, then the sum is carried ≤ 10 days. So the live reading is the last complete window carried forward, and it **can be revised** when bitcoin-data's delayed rows land (a day first read as "after the last row" becomes a real print, and a day zero-filled inside the range can gain a value). Pinned by `vector-model.test.ts` "ETF tail".
- **As-of** of an input = `t` of its source's last row. `oldestInputAsOf` = the oldest as-of over the six regime condition sources (D8; those drive the label).
- Derived metrics are computed on the carried daily series (so a 7-day mean at a 3-day-old tail includes 3 carried days).
- **Staleness limitation:** `stale` only checks the age of each source's *last* row. An interior gap longer than 10 days (a source outage later backfilled only partly) makes the input null, so that condition reads "not stressed" for those days, without any flag in the payload.

### 8.2 Compass

**Percentile (D4).** `pct[i]` = §0 pctRank of `x[i]` over the trailing **1460** spine days, minimum **365** non-null values (so the window expands from 365 to 1460 days, null before). Scores are 0–100: `score = 100·pct` for polarity `+`, `100·(1 − pct)` for `−`. The payload's `inputs[].pct` is the raw percentile (before polarity), so `p90` on the dollar means "dollar high", which pulls Macro down.

**Lens** = mean of its non-null input scores; `null` when fewer than half of its inputs are present (`2·present < n`). **Headline** = mean of the non-null forward lenses (Macro, Capital Flows, Investor Behaviour, On-chain Fundamentals) under the same half rule. `d7`/`d30` = score today minus score 7/30 spine days ago (point change, null if either is null). Band = `floor(score / 20)`, 100 → band 5.

**Inputs and polarity (the one table).** `30/365` means `mean(x[i−29..i]) / mean(x[i−364..i])`. `chg30` means `x[i]/x[i−30] − 1`. Unit `pct` values are percent points.

| Lens | Input key | Formula | Source | Unit | Pol. | History from |
|---|---|---|---|---|---|---|
| Macro | `dollar_vs_200d` | `DTWEXBGS / SMA200(DTWEXBGS) − 1` (200 **observations**, business days) ×100 | FRED | pct | − | 2006 |
| Macro | `us10y_chg90d` | `DGS10[i] − DGS10[i−90]` (calendar days, pp) | FRED | pct | − | 1962 |
| Macro | `curve_10y2y` | `T10Y2Y` (pp) | FRED | pct | + | 1976 |
| Macro | `policy_gap` | `DGS2 − DFEDTARU` (pp; positive = market prices hikes) | FRED | pct | − | 2008-12 |
| Macro | `btc_vs_spx_30d` | `(chg30(price) − chg30(SP500)) × 100` | spine, FRED | pct | + | 2016-10 |
| Capital Flows | `stables_roc30` | `chg30(total stablecoin mcap) × 100` | DefiLlama | pct | + | 2017-11 |
| Capital Flows | `realized_cap_chg30` | `chg30(RealizedCapUSD) × 100` | CoinMetrics | pct | + | 2010 |
| Capital Flows | `etf_flow_30d` | 30-day sum of daily ETF net flow | bitcoin-data | btc | + | 2024-01-11 (+365 d) |
| Capital Flows | `exchange_supply_chg30` | `chg30(SplyExNtv) × 100` | CoinMetrics | pct | − | 2011 |
| Investor Behaviour | `sth_sopr_30d` | 30-day mean of STH-SOPR | bitcoin-data | ratio | + | 2022-10 |
| Investor Behaviour | `price_vs_sth` | `price / STH realized price` | spine, bitcoin-data | ratio | + | 2022-10 |
| Investor Behaviour | `exchange_inflow_ratio` | `FlowInExNtv` 30/365 | CoinMetrics | ratio | − | 2011 |
| Investor Behaviour | `fear_greed` | Fear & Greed, **contrarian** (extreme fear scores as accumulating) | alternative.me | index | − | 2018-02 |
| On-chain Fundamentals | `active_addresses` | `AdrActCnt` 30/365 | CoinMetrics | ratio | + | 2009 |
| On-chain Fundamentals | `tx_count` | `TxCnt` 30/365 | CoinMetrics | ratio | + | 2009 |
| On-chain Fundamentals | `fees_btc` | `FeeTotNtv` 30/365 | CoinMetrics | ratio | + | 2009 |
| On-chain Fundamentals | `hashrate` | `HashRate` 30/365 | CoinMetrics | ratio | + | 2009 |
| Cycle Position | `mvrv` | `CapMVRVCur` | CoinMetrics | ratio | + | 2010 |
| Cycle Position | `nupl` | NUPL | bitcoin-data | ratio | + | 2022-10 |
| Cycle Position | `supply_in_profit` | `supply-profit (BTC) / SplyCur × 100` | bitcoin-data, CoinMetrics | pct | + | 2022-10 |
| Cycle Position | `htf_heat` | HTF heat `H` (§1.5) | spine | index | + | 2013 |
| Derivatives | `funding_apr` | 7-day mean of the daily mean of `rate × 8760 × 100` | funding.json | pct | + | 2020 |
| Derivatives | `oi_to_mcap` | daily mean `oiUsd` / `CapMrktCurUSD` × 100 | oi-history.json, CoinMetrics | pct | + | 2020-09 |
| Derivatives | `dvol` | Deribit DVOL | Deribit | index | + | 2021-03 |
| Derivatives | `skew_25d` | 25Δ put IV − call IV, ~30d (calls bid = froth = low skew) | options-skew.json | index | − | builds daily; null until 365 snapshots |
| Derivatives | `hl_premium` | 7-day mean of the daily mean of funding-row `premium × 100` | funding.json | pct | + | 2020 |
| Rotation | `alts_beating_btc` | share (0–100) of HL alts whose 30d return beats BTC's | alt 1h candles (23:00 UTC close) | pct | + | ~125 d retention |
| Rotation | `alts_funding_hot` | share (0–100) of HL alts whose 7-day mean hourly funding > 0.0000125 (resting rate) | alt funding | pct | + | ~125 d retention |

**Collected, not yet scored:** `putCallOi` (Σ put OI / Σ call OI over every listed Deribit option) is stored daily in `options-skew.json` next to `skew25d`. Snapshot-only history can't be backfilled, so it is kept from day one; it enters no lens yet.

Rotation inputs are already cross-sectional percentages and alt series are retained for only 125 days (SPEC 3.3), so a 365-day time percentile would never exist. **Deviation from D4:** they are scored as-is (`score = share`), and a breadth is null below 5 reporting alts. Price / realized price is not a separate Cycle input: it equals MVRV up to the price source, so it would double-weight one signal.

**Bands (5 per lens, low → high):**

| Lens | Bands |
|---|---|
| Headline | Risk-Off, Defensive, Neutral, Constructive, Risk-On |
| Macro | Tightening, Restrictive, Neutral, Accommodative, Expansionary |
| Capital Flows | Drained, Light, Neutral, Healthy, Flush |
| Investor Behaviour | Distributing, Soft, Neutral, Firm, Accumulating |
| On-chain Fundamentals | Contracting, Soft, Neutral, Expanding, Hot |
| Cycle Position (standalone) | Capitulation, Cold, Neutral, Warm, Euphoria |
| Derivatives (standalone) | Deleveraged, Light, Neutral, Heavy, Frothy |
| Rotation (standalone) | BTC Season, BTC-Led, Mixed, Alt-Led, Altseason |

### 8.3 Vector regime

**Stress conditions** (fixed set of six, D5). Each is evaluated on the carried series; a `null` input (missing beyond 10 days, or before its history) counts as **not stressed**.

| key | true when | payload `value` |
|---|---|---|
| `price_below_sth` | `price < STH realized price` | STH cost basis (USD) |
| `sth_sopr_below_1` | 7-day mean of STH-SOPR `< 1` | the 7d mean |
| `price_below_tmm` | `price < True Market Mean` | TMM (USD) |
| `downside_vol_high` | `dsv30 > median(dsv30[i−364..i])`, with `dsv30 = sqrt(mean_{30d}(min(lr, 0)²) · 365)`, `lr = ln(c[k]/c[k−1])`; median needs all 365 values | `dsv30 / median` |
| `stables_contracting` | `chg30(total stablecoin mcap) < 0` | the change, pct |
| `etf_outflow_7d` | 7-day sum of ETF net flow `< 0`; always false before 2024-01-11 | the sum, BTC |

`riskOff = (# true) / 6`, never renormalized. **Start:** the first spine day where STH cost basis, TMM, STH-SOPR 7d, the semivol median, stablecoin chg30 and momentum all exist: **2022-10-07**. Before that `state`, `riskOff` are null (history still carries price and momentum). No proxies are used before bitcoin-data's 2022-10-01 start: STH-SOPR has no open proxy, and a VWAP of one exchange's volume is not a cohort cost basis. Fabricating two of six conditions would bias `riskOff` low for a decade of history.

**Momentum** in [−100, 100]:

```
momentum[i] = 100 · (1/3) · Σ_{k ∈ {20, 50, 200}} tanh( ln(c[i] / c[i−k]) / (0.035 · √k) )
```

`0.035` is BTC's long-run daily log-return σ, so each lookback is scaled by its own expected 1σ move. Equal weights. Null before index 200.

**Flows** = `chg30(RealizedCapUSD) × 100` (percent; sign is what matters). Exposed as `regime.flows`.

**Raw state** (SPEC thresholds, unchanged by calibration):

```
strong_risk_on   if riskOff = 0    and momentum > 0 and flows > 0
mild_risk_on     if riskOff ≤ 0.25 and momentum > 0          (≤ 1 of 6 conditions)
strong_risk_off  if riskOff ≥ 0.5  and momentum < 0          (≥ 3 of 6)
mild_risk_off    otherwise
```

**Hysteresis:** `commitWithHysteresis(raw, () => 3)`: a new state commits only after the same raw state holds **3** consecutive daily closes; the first defined day commits immediately.

**Allocation** (% BTC): strong_risk_on 100, mild_risk_on 66, mild_risk_off 33, strong_risk_off 0.

**Flip** = the committed state reaches the **opposite extreme**: `strong_risk_on` after the last extreme was `strong_risk_off`, or the reverse (100% BTC ↔ 0% BTC, the moves Glassnode dates). Mild states are graded steps and are not flips. `flips[].from` is the committed state of the previous day. `regime.since` = first day of the **current committed state's** run (so the hero's day count is days in the printed state).

**Stale** (D5/D8): true when any of the six condition sources' as-of is null or more than 10 days before the last spine day (ETF exempt while the last day is before 2024-01-11; the semivol input is the spine itself).

### 8.4 Key levels

All on the spine, carried ≤ 10 days. `distancePct = (price / level − 1) × 100` (positive: price above). Status over the last two closes: `holding` if `price > level` on both, `lost` if `price ≤ level` on both (a close exactly on the level counts as below), `contested` otherwise; null if either level value is missing.

| key | value | proxy |
|---|---|---|
| `sth_cost_basis` | bitcoin-data `sth-realized-price` | no |
| `true_market_mean` | bitcoin-data `true-market-mean` | no |
| `realized_price` | CoinMetrics `RealizedPriceUSD` | no |
| `lth_realized_price` | bitcoin-data `lth-realized-price` | no |
| `mean_mvrv_price` | realized price × expanding mean of `CapMVRVCur` since 2010-07 (no look-ahead) | no |
| `sma200` | HTF `sma200` | no |
| `etf_cost_basis` | `Σ close·inflow / Σ inflow` over days with ETF net flow > 0 since 2024-01-11 | **yes** |

### 8.5 WoC phase

```
strong_uptrend if price > TMM and price > STH-CB
capitulation   if price < both and STH-CB < TMM
bear           if price < both
transition     otherwise          (null if STH-CB or TMM is missing)
```

### 8.6 Brief and D7 note

Sentences, in order, each emitted only when its inputs exist (4–6 in practice). `{usd}` = `$73.3K` style, `{±n}` = signed with U+2212.

1. `The Vector regime reads {state words} ({allocation}% BTC) for {days} days since {since}, with {k} of 6 stress conditions active; {trigger}.` Trigger on the risk-on side: `momentum below zero or 2 active conditions would end risk-on`; on the risk-off side: `risk-on needs positive momentum with at most 1 active condition`.
2. STH cost basis, above: `Price holds above the short-term holder cost basis ({usd}) for {n} sessions; a daily close below it would end the stretch.` Below: `Price sits below the short-term holder cost basis ({usd}) for {n} sessions; two daily closes back above it would reclaim it.` `n` = consecutive closes on the current side.
3. Same for the True Market Mean, with the WoC break rule as trigger: `one daily close below it is a slip, a second confirms the break.`
4. `Momentum reads {±m} against {±m7} a week ago; a move through zero would flip its leg of the regime.`
5. `Realized cap changed {±x}% over 30 days, the {p}th percentile of the last four years; a turn negative would remove / positive would restore the flows leg of strong risk-on.`
6. `The Compass headline is {score} ({band}), {±d30} points over 30 days; {weakest forward lens} is the weakest forward lens at {score} ({band}).`

`confirm` = `a daily close above the {nearest level above price} ({usd}) with realized cap growing`; `invalidate` = `a daily close below the {nearest level below price} ({usd})`; null when no level is on that side.

`regime.htfNote` (D7, DESIGN 14.4.1, complete): risk-on state with HTF phase `distribution`, `markdown` or `capitulation`, or risk-off state with `expansion` → `HTF phase reads {PHASE} — the cycle frame disagrees with the regime.` Otherwise null.

### 8.7 Gauges and macro strip

Gauges `{now, lastWeek (7 days ago), avg52w (mean of non-null values over the last 365 days), scale}`: `risk = riskOff × 100` (0–100), `momentum` (−100–100), `fundamentals` = On-chain Fundamentals lens (0–100), `flows` = Capital Flows lens (0–100). Macro strip: `dollarVs200d` = the Compass input at the last spine day (percent); `us10y`, `us2y`, `fedFundsUpper`, `curve` = the FRED value at the last spine day, carried ≤ 10 days (pp), i.e. the same value the Macro lens scores (an observation dated after the last spine close is not shown yet); `spxCorr30d` = Pearson correlation of daily log returns of BTC and the S&P 500 over the last 30 S&P trading-day returns (days present in both); `macro.asOf` = the oldest last observation among the six FRED series.

Rounding in the payload: prices and levels 2 dp, riskOff 3 dp, momentum and scores 1 dp, input values 4 significant digits. `vector.json` is about 1.2 MB with full daily history.

### 8.8 Calibration (2026-10-01, data to 2026-09-28)

**What was tuned:** no threshold. The SPEC raw-state thresholds (0.25 / 0.5 / momentum 0 / flows 0) and the 3-close hysteresis are used as written. Momentum weights are equal and its σ is fixed a priori. One definition was chosen after looking at the data: a **flip is an extreme-to-extreme move** (8.3). Counting every risk-on/risk-off side change instead gives 5 / 13 / 10 / 7 side changes in 2023 / 2024 / 2025 / 2026, driven mostly by two noisy conditions (`etf_outflow_7d`, and `downside_vol_high`, which is true about half the time by construction), so mild states chatter around the 1-condition boundary.

Flip list (committed, extreme-to-extreme):

| # | date | from → to | price |
|---|---|---|---|
| 1 | 2023-10-28 | mild_risk_on → strong_risk_on | 34,102 |
| 2 | 2024-05-02 | mild_risk_off → strong_risk_off | 59,103 |
| 3 | 2024-06-01 | mild_risk_on → strong_risk_on | 67,811 |
| 4 | 2024-06-26 | mild_risk_off → strong_risk_off | 60,857 |
| 5 | 2024-09-28 | mild_risk_on → strong_risk_on | 65,860 |
| 6 | 2025-02-27 | mild_risk_off → strong_risk_off | 84,732 |
| 7 | 2025-05-04 | mild_risk_on → strong_risk_on | 94,257 |
| 8 | 2025-08-31 | mild_risk_off → strong_risk_off | 108,227 |
| 9 | 2025-09-15 | mild_risk_on → strong_risk_on | 115,370 |
| 10 | 2025-10-23 | mild_risk_off → strong_risk_off | 110,063 |
| 11 | 2026-05-06 | mild_risk_off → strong_risk_on | 81,401 |
| 12 | 2026-05-21 | strong_risk_on → strong_risk_off | 77,587 |
| 13 | 2026-08-26 | mild_risk_on → strong_risk_on | 79,026 |

| target (±30 d) | result |
|---|---|
| risk-on 2024-09-22 | **hit**, 2024-09-28 (+6 d) |
| risk-off 2025-10-12 | **hit**, 2025-10-23 (+11 d) |
| risk-on 2026-08-21 | **hit**, 2026-08-26 (+5 d) |
| ≤ 4 flips per calendar year | 2022: 0, 2023: 1, 2024: 4, 2025: **5 (miss)**, 2026: 3 (to 09-28) |
| 2022 mostly risk-off | **hit**: 86 of 86 days strong_risk_off (regime starts 2022-10-07) |

Days per committed state by year: 2023 strong-off 49 / mild-off 215 / mild-on 70 / strong-on 31 (stablecoin supply shrank all year, so `stables_contracting` held one condition on through the rally); 2024 56 / 77 / 127 / 106; 2025 108 / 76 / 40 / 141; 2026 (to 09-28) 180 / 43 / 10 / 38.

Robustness: `ON_MAX` anywhere in 0.17–0.34 gives the same 13 flips (conditions come in sixths). `OFF_MIN = 0.67` loses the 2024 and 2025 targets. Momentum weights 1/2/3 (slower) give 9 flips with the same three hits but the 2025 off-flip moves to 2025-11-08 (+27 d) and 2025 still has 5.

**Compass headline vs the Glassnode baseline** (different inputs; same architecture):

| date | Glassnode | ours | lenses (macro / flows / behaviour / fundamentals) |
|---|---|---|---|
| 2026-06-18 | 14 Risk-Off | 32.4 Defensive | 34.5 / 7.0 / 42.7 / 45.5 |
| late Jul | Risk-Off → Defensive | 37.6 Defensive (07-22) | 38.9 / 16.1 / 48.9 / 46.3 |
| 2026-09-15 | 23 Defensive | 50.7 Neutral | 45.3 / 59.1 / 46.4 / 52.1 |

Same direction (rising from June to September) and the same Macro read (Restrictive), but ours sits 18–28 points higher. Behaviour and Fundamentals stay near the middle where Glassnode's (LTH share, Hodler Net Position, new-user growth) read weak; our Capital Flows lens recovers faster on stablecoin growth and ETF inflows. Not tuned: two reference points are not enough to fit seven lenses without overfitting. A pro-cyclical Fear & Greed (polarity +) moves June to 27 but September to 54, so the contrarian SPEC reading is kept.

**Level checks vs WoC (2026-09-24..28):** STH-CB 72,876 (WoC 73.3K), TMM 78,826 (77.2K), realized price 53,575 (~53.5K) match. Mean MVRV price 105,077 vs WoC 96.7K: the CoinMetrics expanding mean MVRV since 2010 is ~1.96 against Glassnode's ~1.81. ETF cost basis proxy 81,555 vs ~86K break-even (inflow-weighted closes, no redemptions; marked proxy).

Regression guard: `backend/test/vector-regression.test.ts` runs `buildVector` on frozen real inputs (`test/fixtures/vector-regression/`, 2022-09-01 → 2026-09-28) and pins the start day, all 13 flips above and three riskOff/momentum/headline anchors. A change there is a model change: update this section with it.

Known ceilings: the regime has three years of history (one full cycle leg); Rotation only covers the last ~95 days and an 11-coin universe (WoC quotes a broad alt universe, so its 6% / 19% readings are not comparable); skew enters Derivatives only after 365 daily snapshots.
