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
