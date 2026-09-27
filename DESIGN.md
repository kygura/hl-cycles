# hl-cycles — Interface Design

Design authority document for the frontend. Implementation follows this file; where SPEC.md and this file disagree on UI matters, this file wins. Where this file needs an API field SPEC.md does not define, see section 12 (API gaps) — the frontend must not invent data.

Stack constraints (from SPEC.md): React + Vite + TS, `lightweight-charts` v5, plain CSS with custom properties, no component library, single page, desktop first (1440), degrades to 1024, stacks below 900.

## 1. Product intent

The dashboard answers one question in under five seconds — *where is Bitcoin in its cycle, and is short-term leverage confirming or fighting that?* — and then lets the user learn why. It is an analytic terminal, not a marketing dashboard: dense, quiet, monospace numbers, colour used only to carry phase/state identity and direction. Every coloured element carries a text label; colour is never the only encoding.

Reading order (what the eye hits first to last): phase readout → cycle vector → HTF chart → LTF chart → signal history. The explainer is available everywhere but never competes for attention.

## 2. Layout

### 2.1 Grid at 1440 (desktop)

12-column grid, 16px gutters, 24px page padding, max content width 1600 (centered beyond that). Rows are content-sized; no fixed viewport height except the charts' minimum heights.

```
┌────────────────────────────────────────────────────────────────────────┐
│ StatusBar  hl-cycles · BTC  $109,842.00  · as of 2026-09-27 19:45 UTC │  40px
│            [● live 12m ago]                    [?] Phase guide         │
├────────────────────────────────────────┬───────────────────────────────┤
│ PhaseReadout                           │ CycleVector                   │
│  HTF EXPANSION  ·  LTF healthy_uptrend │   heat ↑                      │
│  trend  +0.62 ████████░░               │     ┌────┬────┐               │
│  heat   +0.31 ██████░░░░               │     │dist│euph│  ● now        │
│  leverage +0.18  momentum +0.44        │     ├────┼────┤  ~ path 90d   │
│  bias  +0.48  "Expansion; leverage..." │     │capi│accu│               │
│  cycle  d+890 · 61% · next 2028-04     │     └────┴────┘               │
│  funding  HL 9.1% · BIN 11.2% · BYB..  │        trend →                │
│  ▸ features                             │                               │
├────────────────────────────────────────┴───────────────────────────────┤
│ HtfChart  BTC/USD daily · log        [1d][1w]   ◼accu ◼exp ◼euph ...    │
│  ─────────────────────────────────────────────────────────────────────  │  480px
│  (candles + SMA200 + phase bands + halving markers)                     │
├────────────────────────────────────────────────────────────────────────┤
│ LtfChart  BTC-PERP Hyperliquid · 4h  [4h][1h]                          │
│  price + ema50                                                          │  300px
│  funding APR                                                            │  110px
│  open interest (USD)                                                    │  110px
├────────────────────────────────────────────────────────────────────────┤
│ SignalTable   [All][HTF][LTF]                       200 rows, scrolls   │  ≤ 420px
└────────────────────────────────────────────────────────────────────────┘
```

Column spans at 1440: PhaseReadout 7/12, CycleVector 5/12. Charts and table span 12.

### 2.2 At 1024

Same grid, PhaseReadout 7/12 and CycleVector 5/12 still fit (vector min 320px square). Chart heights unchanged. Page padding 16px. Feature detail table in PhaseReadout collapses by default (it already does at 1440, see 6.2).

### 2.3 Below 900 (stacked)

Single column in this order: StatusBar, PhaseReadout, CycleVector (max 360px wide, centered), HtfChart (360px), LtfChart (price 240 / funding 90 / OI 90), SignalTable. Table drops the `scores` column and keeps time, frame, from→to, price. No horizontal page scroll; the table itself may scroll horizontally.

### 2.4 Region rules

- Every region is a `section` with a one-line header row: title (13px, `--text-2`), optional right-aligned controls (toggles/filters). Header height 32px. No card shadows, no rounded hero boxes: regions are separated by a 1px `--line` border, not by elevation.
- Regions are flat panels on `--surface-1`; the page background is `--surface-0`. Charts sit on `--surface-1` with no inner border.
- Spacing scale: 4 / 8 / 12 / 16 / 24 only.

## 3. Colour tokens

Dark theme is primary and the only theme in v1. A light theme is out of scope; tokens are named so one can be added later without touching components.

### 3.1 Surfaces and text

| Token | Value | Use |
|---|---|---|
| `--surface-0` | `#0b0d10` | page background |
| `--surface-1` | `#0e1013` | panels, chart background (validator surface) |
| `--surface-2` | `#15181d` | table header, hover rows, popover |
| `--line` | `#22262d` | region borders, table rules, grid lines (charts use it at 60% alpha) |
| `--line-strong` | `#343a44` | focused control border, crosshair |
| `--text-1` | `#e6e8eb` | primary numbers and labels |
| `--text-2` | `#9aa3ad` | secondary labels, units, table headers |
| `--text-3` | `#5f6873` | disabled, placeholders, axis text |
| `--accent` | `#3987e5` | focus rings, active toggle, links. Same hue as `accumulation`; acceptable because they never sit side by side as data. |

### 3.2 Direction (candles, deltas)

| Token | Value |
|---|---|
| `--up` | `#199e70` |
| `--down` | `#e66767` |
| `--flat` | `#9aa3ad` |

Validated (dark surface `#0e1013`): passes lightness, chroma, contrast; CVD ΔE 6.5 (protan) is in the warn band — acceptable because candles also encode direction by shape (close above/below open) and price deltas print a sign (`+`/`−`).

Candle rendering: up body `--up`, down body `--down`, wicks same colour as body, borders off. Do not use hollow candles.

### 3.3 HTF phase palette (6, cyclic order)

Order below is cycle order; adjacent pairs are what the eye compares on the chart's phase bands.

| Phase | Token | Value | Mnemonic |
|---|---|---|---|
| accumulation | `--ph-accumulation` | `#3987e5` | cold blue, bottoming |
| expansion | `--ph-expansion` | `#199e70` | green, healthy growth |
| euphoria | `--ph-euphoria` | `#c98500` | amber, overheating |
| distribution | `--ph-distribution` | `#e66767` | red, topping/selling |
| markdown | `--ph-markdown` | `#9085e9` | violet, cooling decline |
| capitulation | `--ph-capitulation` | `#d55181` | magenta, pain/flush |

Validator result (dark, cyclic adjacency incl. capitulation→accumulation): lightness PASS, chroma PASS, contrast PASS, CVD adjacent worst 6.7 ΔE (euphoria↔distribution, deutan) = warn band, normal-vision adjacent worst 13.0 (same pair, floor is 15). All-pairs cannot pass for six hues on any palette (documented in the dataviz reference: cap is three). **Consequence, binding:** phase colour is always accompanied by a text label — band labels on the HTF chart (see 7.1), the phase word in the readout badge, the quadrant labels in CycleVector, the `from→to` words in the table. No component may communicate phase by colour alone.

Band alpha on the chart: fill at 14% alpha over `--surface-1`; legend swatches and badges at 100%.

### 3.4 LTF state palette (7)

LTF states are status-like, shown as a badge with the state text, and as a thin state strip under the LTF price pane. Two states are deliberately grey.

| State | Token | Value | Reading |
|---|---|---|---|
| crowded_long | `--st-crowded-long` | `#e66767` | risk: longs over-extended |
| healthy_uptrend | `--st-healthy-uptrend` | `#199e70` | good |
| short_squeeze_fuel | `--st-squeeze` | `#c98500` | opportunity/warning |
| crowded_short | `--st-crowded-short` | `#d55181` | risk: shorts over-extended |
| deleveraging | `--st-deleveraging` | `#9085e9` | flush in progress |
| neutral | `--st-neutral` | `#9aa3ad` | grey |
| insufficient_data | `--st-nodata` | `#5f6873` | grey, badge drawn with a dashed border |

Same colour family as phases on purpose: red = crowded/hot in both frames, green = healthy in both, amber = heat/fuel, violet = decline/deleverage, magenta = pain. The user learns one vocabulary. Text label always present.

### 3.5 Status colours (StatusBar only)

| Token | Value | Use |
|---|---|---|
| `--ok` | `#199e70` | live dot |
| `--warn` | `#c98500` | stale (>30m) |
| `--bad` | `#e66767` | backend unreachable |

Always paired with a word (`live`, `stale`, `offline`).

## 4. Typography

```
--font-ui:   ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "JetBrains Mono", monospace;
```

| Token | Size / line | Use |
|---|---|---|
| `--fs-xs` | 11px / 16 | axis labels, table meta, units |
| `--fs-sm` | 12px / 18 | table body, feature rows, legend, tooltips |
| `--fs-md` | 13px / 20 | region titles, body copy in explainer |
| `--fs-lg` | 16px / 22 | LTF state badge text, composite summary line |
| `--fs-xl` | 22px / 28 | HTF phase word in readout, price in StatusBar |
| `--fs-2xl` | 32px / 36 | composite bias number |

Rules: every number is `--font-mono` with `font-variant-numeric: tabular-nums`. Labels are `--font-ui`. Phase/state words are `--font-mono`, uppercase for HTF phases (`EXPANSION`), lowercase snake_case exactly as the API returns for LTF states (`healthy_uptrend`) — this keeps the table and the badge literally searchable against the API. No letter-spacing tricks. Weight: 400 everywhere, 600 only for the HTF phase word and the bias number.

## 5. Number and date formatting (single `format.ts` module)

| Kind | Rule | Example |
|---|---|---|
| Price | USD, 2dp below 10k, 0dp at/above 10k, thousands separator, no currency symbol in tables and axes, `$` only in StatusBar | `109,842` · `$109,842` · `9,431.20` |
| Scores (trend, heat, leverage, momentum, bias) | always signed, 2dp | `+0.62` · `−0.05` · `0.00` prints as `0.00` |
| Percent (drawdown, cycleProgress, oiChange24h) | 1dp, signed when it is a change | `−23.4%` · `61.2%` |
| APR (funding) | percent, 1dp, signed | `+9.1%` · `−2.3%` |
| Premium | basis points, 0dp, signed | `+12 bp` |
| Open interest USD | compact, 2 significant | `4.2B` · `812M` |
| Mayer, rv30 | 2dp, unsigned | `1.34` |
| Dates (daily/weekly) | `YYYY-MM-DD` UTC | `2024-04-20` |
| Timestamps (4h/1h, signals, asOf) | `YYYY-MM-DD HH:mm` UTC, suffix ` UTC` only in StatusBar | `2026-09-27 16:00` |
| Relative age | `Ns` / `Nm` / `Nh` ago, integer | `12m ago` |
| Null | em dash `—`, never `null`, never `0` | `—` |
| Minus sign | use U+2212 `−` in rendered numbers, not hyphen | |

All axes on charts use the same functions (lightweight-charts `localization.priceFormatter` and `timeFormatter`).

## 6. Components (7)

Keep to these seven. Formatters, the API client and the theme are modules, not components.

### 6.1 `StatusBar`

Props: `health: Health | null`, `overview: Overview | null`, `status: "loading" | "ok" | "stale" | "error"`, `onOpenGuide()`.

Content, left to right: wordmark `hl-cycles`, `BTC` and `overview.price`, `as of {overview.asOf}` UTC, status pill (`● live 12m ago` / `● stale 47m ago` / `● offline — retrying`), right: `? Phase guide` button. 40px tall, `--surface-1`, bottom border `--line`.

Status derivation (in the data hook, not in the component): `error` if `/api/overview` fails; `stale` if `now − health.lastRefresh > 30 min`; otherwise `ok`.

### 6.2 `PhaseReadout`

Props: `overview: Overview` (the whole `/api/overview` object). Nothing else.

Layout (two columns internal at ≥1024, one below):

```
HTF  EXPANSION                     LTF  healthy_uptrend
trend  +0.62  [────────●──]         leverage  +0.18  [────●─────]
heat   +0.31  [──────●────]         momentum  +0.44  [──────●───]

BIAS  +0.48   "Expansion with healthy leverage; trend leads."
cycle  day 890 since 2024-04-20 · 61.2% of cycle
funding  HL +9.1%  Binance +11.2%  Bybit +10.4%
▸ features (12)
```

- HTF phase word: `--fs-xl`, 600, colour `--ph-*`, preceded by a 10px square swatch. LTF state: `--fs-lg`, mono, colour `--st-*`, in a 1px-bordered badge (dashed border for `insufficient_data`).
- Score bars: a 120px `[-1, +1]` track with a centre tick at 0 and a 6px marker. Track `--line`, marker `--text-1`. Not coloured by value — the sign in the number does that job.
- Bias: `--fs-2xl`, signed 2dp; the `summary` string beside it, `--fs-lg`, `--text-1`, max two lines, then ellipsis with full text in `title`.
- Cycle: `htf.cycle.daysSinceHalving`, `lastHalving` as date, `cycleProgress` as percent. Progress also drawn as a 4px bar spanning the readout width, fill `--text-3`, with four faint ticks at 25/50/75/100%.
- Funding: one line, `crossVenueFunding[]` mapped `venue apr`, HL first if present, others in API order. If empty: `funding —`.
- `▸ features`: collapsed by default; a `<details>` element (native, no JS). Body is a two-column mono table of `htf.features` then `ltf.features`, key as given by the API (`--text-2`), value 2dp or `—`. Because feature keys and units are not part of the contract (see 12), the UI renders them raw; that is acceptable for a learning tool.

### 6.3 `CycleVector`  (the signature piece — plain SVG)

Props: `points: { t: number; trend: number; heat: number; phase: Phase }[]` (last 90 daily HTF points, oldest first — derived from `/api/htf` in the data hook), `current: { trend, heat, phase }` (from overview).

SVG spec, viewBox `0 0 320 320`, `preserveAspectRatio="xMidYMid meet"`, CSS size 100% of column width, square, min 280, max 420.

- Plot area: 24px padding on all sides → domain `[-1, 1]` on both axes maps to `[24, 296]`. x = trend (right is positive), y = heat (up is positive; invert SVG y).
- Quadrant fills: four rects at 8% alpha of the phase that *typically* lives there, so the plane teaches the model even with no data:
  - top-right (trend+, heat+): `--ph-euphoria`
  - top-left (trend−, heat+): `--ph-distribution`
  - bottom-left (trend−, heat−): `--ph-capitulation`
  - bottom-right (trend+, heat−): `--ph-accumulation`
  Quadrant labels in the outer corners, `--fs-xs`, `--text-3`, uppercase: `EUPHORIA`, `DISTRIBUTION`, `CAPITULATION`, `ACCUMULATION`. `expansion` and `markdown` are transitional (near the x axis, moving) and are labelled once in the legend line under the SVG: "expansion / markdown = moving right / left across the axis".
  These quadrant hints are pedagogical, not the classifier; the actual phase of each point comes from the API and colours the point.
- Axes: two 1px lines through 0 in `--line-strong`; ticks at ±0.5 as 4px marks; axis titles `trend →` (bottom right) and `heat ↑` (top left) in `--fs-xs` `--text-2`.
- Trailing path: a `<polyline>` through the 90 points, stroke `--text-2`, 1.5px, `stroke-linejoin: round`, opacity ramp is not available on a single polyline, so draw it as up to 89 `<line>` segments with opacity `0.15 + 0.85 * i/88` (oldest faintest). Every 30th point gets a 3px hollow circle marker in `--text-2` so speed of movement is legible (dense markers = slow, sparse = fast).
- Current point: 7px circle filled with `--ph-{current.phase}`, 2px `--surface-1` ring, then a 1px `--text-1` outer ring. Label to the right: `{trend} , {heat}` in mono `--fs-xs`.
- Hover (optional, cheap): a transparent 12px hit circle per point; on hover show a tooltip `2026-07-14 · EXPANSION · trend +0.41 · heat +0.12`. Keyboard: not required for v1.
- Empty (`points.length < 2`): draw axes and quadrants, no path, centred `--text-3` text `not enough HTF history`.

Region header: `Cycle vector · trend vs heat · last 90 days`.

### 6.4 `HtfChart`

Props: `data: HtfResponse` (`candles`, `halvings`), `interval: "1d" | "1w"`, `onIntervalChange(i)`.

lightweight-charts v5 setup:
- One chart, one pane. `rightPriceScale.mode = Logarithmic`. `timeScale.timeVisible = false`. Background `--surface-1`, grid lines `--line` at 60% alpha, text `--text-3`, crosshair `--line-strong` with `mode: Normal`.
- Series, in draw order:
  1. **Phase band** — `HistogramSeries` on an overlay price scale (`priceScaleId: "phase"`, `scaleMargins: { top: 0, bottom: 0 }`), every bar `value: 1`, `color` = phase colour at 14% alpha, `priceLineVisible: false`, `lastValueVisible: false`. Because histogram bars are contiguous and full-height, this reads as a continuous background band. Fill from `candles[i].phase`.
  2. **Candles** — `CandlestickSeries`, `--up` / `--down`, `borderVisible: false`.
  3. **SMA200** — `LineSeries`, 1.5px, `--text-2`, `lastValueVisible: false`, `crosshairMarkerVisible: false`. From `candles[i].sma200` (skip nulls).
  4. **Halvings** — `createSeriesMarkers` on the candle series: one marker per timestamp in `halvings`, `position: "belowBar"`, `shape: "arrowUp"`, `color: --text-2`, `text: "halving YYYY"`. This is a marker, not a full-height line; v5 has no built-in vertical line. Acceptable for v1; a custom primitive drawing a 1px dashed `--line-strong` vertical is a follow-up, not required.
- Initial visible range: full history. `fitContent()` after data load and on interval change.
- Weekly: same code path, `?interval=1w`.
- Interval toggle: two-segment control `[1d][1w]` in the region header, active segment `--accent` text and border, inactive `--text-2`.
- Legend row in the header: six phase swatches + words (`--fs-xs`), always visible; this is the phase legend for the bands.
- Band labels (binding, see 3.3): when a contiguous phase run is wider than 72px on screen, print the phase word at `--fs-xs` `--text-2` at the top-left of the run. Implement as absolutely positioned HTML labels computed from `timeScale.timeToCoordinate()` on `subscribeVisibleLogicalRangeChange`; skip runs that would overlap. If this proves fiddly, minimum viable: the tooltip always names the phase and the legend exists.
- Tooltip (HTML overlay, `subscribeCrosshairMove`, top-left of chart, single line, mono `--fs-sm`):
  `2021-04-14 · O 63,523 H 64,863 L 61,319 C 62,970 · SMA200 34,120 · Mayer 1.85 · DD −2.9% · trend +0.71 heat +0.88 · EUPHORIA · src hl`
  Null fields print `—`. Phase word coloured with its token.
- Crosshair sync: none. HTF crosshair is independent from LTF by design (different time domains).
- Min height 480 at ≥1024, 360 stacked. Height is fixed CSS; chart resizes with `ResizeObserver`.

### 6.5 `LtfChart`

Props: `data: LtfResponse` (`points`), `interval: "4h" | "1h"`, `onIntervalChange(i)`, `firstSnapshotAt: number | null` (see 12).

v5 multi-pane, one chart, three panes sharing the time scale (native pane time sync; no manual crosshair code):
- Pane 0 (price, 300px): `CandlestickSeries` (`--up`/`--down`) + `LineSeries` ema50 (1.5px, `--text-2`). Linear scale. Under it, a 6px **state strip**: `HistogramSeries` on an overlay scale with `scaleMargins: { top: 0.97, bottom: 0 }`, `value: 1`, colour = `--st-{point.state}` at 70% alpha. This is the only place LTF state history is visible on a chart; text is available via tooltip.
- Pane 1 (funding APR, 110px): `HistogramSeries` from `fundingApr`, colour `--up` when ≥ 0 else `--down`, 60% alpha, plus a zero line (`createPriceLine` at 0, `--line-strong`). Pane title label `funding APR` top-left, `--fs-xs` `--text-3`.
- Pane 2 (OI USD, 110px): `LineSeries` from `oiUsd`, 1.5px, `--text-1`; nulls are gaps (`whitespace` points). Pane label `open interest`.
- Time axis visible on the bottom pane only.
- **OI empty state:** if every `oiUsd` in the visible data is null → hide the OI series and render an HTML overlay centred in pane 2: `collecting OI snapshots since {firstSnapshotAt as YYYY-MM-DD}` (or `collecting OI snapshots — no snapshot yet` if null), `--fs-sm` `--text-3`. If only the early part is null (the normal case) → no overlay; the line simply starts later. Same rule for the funding pane when all `fundingApr` are null, text `no funding data`.
- Interval toggle `[4h][1h]` in the header. Header title: `BTC-PERP · Hyperliquid · {interval}`.
- Tooltip (single line, top-left of pane 0):
  `2026-09-27 16:00 · O 109,120 H 110,004 L 108,877 C 109,842 · ema50 108,300 · RSI 61.2 · funding +9.1% · premium +12 bp · OI 4.2B (+3.1% 24h) · lev +0.18 mom +0.44 · healthy_uptrend`
- Crosshair mode Normal; panes highlight together natively.

### 6.6 `SignalTable`

Props: `signals: Signal[]`, `filter: "ALL" | "HTF" | "LTF"`, `onFilterChange(f)`.

Fetch strategy: request `/api/signals?frame=HTF&limit=200` and `?frame=LTF&limit=200` once, merge, sort by `t` desc; filter client-side. Rendering `limit` 200 rows total after filter.

Columns (fixed widths in `ch`, mono):

| time (16ch) | frame (4ch) | from → to (26ch) | price (10ch, right) | scores (16ch, right) |
|---|---|---|---|---|
| `2026-09-21 08:00` | `LTF` | `neutral → healthy_uptrend` | `106,410` | `lev +0.05  mom +0.31` |
| `2025-11-03` | `HTF` | `EXPANSION → EUPHORIA` | `128,900` | `tr +0.80  ht +0.72` |

- HTF rows show date only (daily signals); LTF rows show date and time.
- `from` and `to` each preceded by an 8px swatch of their phase/state colour; the words are the identity, the swatch is secondary. If `from` is null (first-ever label), print `—`.
- Row key: `${frame}-${t}`.
- Header sticky; body scrolls inside a 420px max-height container; zebra off; hover row `--surface-2`.
- Filter: three-segment control in the region header, same style as interval toggles.
- Empty: `no signals yet — labels are recorded when they change`.
- Below 900: hide `scores` column.

### 6.7 `PhaseGuide`

Props: `open: boolean`, `onClose()`, `current: { phase, state }` (to highlight the current rows).

A right-side drawer, 400px wide, full height, `--surface-2`, 1px left border, opened from StatusBar `? Phase guide`. Closes on Escape, on backdrop click, on the `×`. `role="dialog"`, `aria-modal`, focus moved to the drawer heading on open and returned on close. Plain text content, `--fs-md`, mono headings. It exists so the user learns cyclicality; keep each item to one sentence, and add nothing that MODEL.md does not back.

Content, in this order:

**How to read the two scores**
- *Trend* (−1..+1): where price sits versus its long averages and recent direction; positive means the market is structurally rising.
- *Heat* (−1..+1): how stretched price is versus fair-value proxies (Mayer multiple, drawdown, long-horizon momentum, realized volatility); positive means expensive and crowded, negative means washed out.
- The phase is a rule over (trend, heat) plus the cycle clock; the CycleVector plane is those two scores drawn as a point, and the trailing path shows the market rotating through the cycle.

**HTF phases** (six rows, swatch + word + one sentence; the current phase row gets a `← now` marker):
- accumulation — trend flat-to-negative and heat low after a long decline; patient buyers absorb supply and price bases.
- expansion — trend turns positive while heat is still moderate; the healthiest part of the cycle, price rises with room to run.
- euphoria — trend and heat both high; price is far above its long averages and momentum is extreme, historically near cycle tops.
- distribution — heat stays high but trend rolls over; strong hands sell into strength and the top forms.
- markdown — trend negative with heat cooling; the sustained decline of a bear market.
- capitulation — trend and heat both deeply negative with high volatility; forced selling flushes out leverage and sets up the next accumulation.

**LTF states** (seven rows, same treatment):
- crowded_long — positive funding and rising open interest with stalling momentum; longs are paying to stay in and are vulnerable.
- healthy_uptrend — positive momentum with moderate leverage; the trend is being driven by spot demand, not just perps.
- short_squeeze_fuel — negative funding or heavy shorts against a market that refuses to fall; fuel for a sharp move up.
- crowded_short — negative funding with rising open interest and falling price; shorts are extended.
- deleveraging — open interest dropping fast with volatility up; positions are being liquidated in either direction.
- neutral — nothing extreme; funding near zero and leverage unremarkable.
- insufficient_data — not enough snapshots yet to score leverage; OI-based components are dropped and the label is withheld.

**Composite bias** — one paragraph: the bias combines HTF phase (direction and stretch) with LTF leverage (whether the crowd already agrees); a positive bias means the long-term frame is constructive and short-term leverage is not fighting it; a negative bias means either the cycle is late/hot or leverage is crowded against the trend. Read the summary line, then look at where the vector point sits.

**Cycle clock** — one sentence: halvings (2012, 2016, 2020, 2024) cut new supply in half; prior cycles peaked roughly 12–18 months after a halving and bottomed roughly a year after that, so `days since halving` and `% of cycle` are context, not a prediction.

## 7. States

Derived once in a `useDashboardData()` hook that polls `/api/health` and `/api/overview` every 60s and refetches `/api/htf`, `/api/ltf`, `/api/signals` when `health.lastRefresh` changes.

| State | Trigger | Rendering |
|---|---|---|
| loading (first load) | no overview yet | StatusBar shows `loading…`; each region renders its header and a flat `--surface-2` block of its final height (no shimmer animation). Charts create the chart instance immediately so layout does not jump. |
| ok | overview ok, `now − lastRefresh ≤ 30m` | normal, status pill `● live Nm ago` in `--ok` |
| stale | `now − lastRefresh > 30m` | status pill `● stale Nh ago` in `--warn`; a 1px `--warn` top border on PhaseReadout; everything else renders the cached data unchanged. No modal, no banner. |
| error (backend down) | `/api/overview` fetch fails or non-2xx | status pill `● offline — retrying in 30s` in `--bad`. If earlier data exists, keep rendering it with the pill in `--bad`. If nothing was ever loaded, each region shows centred `--text-3` text `backend unreachable at :8787 — run bun run dev`. Retry with fixed 30s interval; no exponential backoff needed locally. |
| partial | one of htf/ltf/signals fails while overview is ok | that region alone shows `failed to load — retry` with a text button; others unaffected. |
| empty | endpoint ok but empty arrays | region-specific text from sections 6.3–6.6. |

No skeleton animations, no spinners longer than a 12px ring in the status pill.

## 8. Interaction summary

- HTF chart: independent crosshair; scroll/drag zoom native; double-click resets to `fitContent()`. Toggle 1d/1w keeps the visible range proportionally where possible, otherwise fits.
- LTF chart: three panes time-synced natively; independent from HTF.
- CycleVector: hover tooltip per point; no zoom.
- SignalTable: click a row → HTF row scrolls the HTF chart to centre that `t` (`timeScale.scrollToPosition` after `timeToIndex`), LTF row does the same on the LTF chart. Cheap, high learning value: "what did the chart look like when the label flipped". Row gets `--surface-2` background while selected.
- Toggles and filters are `<button role="tab">` groups with `aria-selected`; the active one carries `--accent` colour and a 1px `--accent` bottom border.
- Keyboard: tab order follows visual order; drawer traps focus; charts are not keyboard-navigable (documented limitation).

## 9. Chart theme (lightweight-charts options, shared)

```
layout.background     solid --surface-1
layout.textColor      --text-3
layout.fontFamily     --font-mono
layout.fontSize       11
grid.vertLines/horzLines.color   --line @ 60%
crosshair.vertLine/horzLine.color  --line-strong, labelBackgroundColor --surface-2
rightPriceScale.borderColor / timeScale.borderColor   --line
timeScale.rightOffset 4, barSpacing default
localization.priceFormatter / timeFormatter  from format.ts
```

Read CSS variables at chart creation via `getComputedStyle(document.documentElement)`; charts do not re-theme live (single theme in v1).

## 10. Accessibility floor

- Text contrast: `--text-1` and `--text-2` on `--surface-1` both exceed 4.5:1; `--text-3` is for axis and disabled text only, never for body copy that must be read.
- Colour is never sole encoding (3.3, 3.4, 3.2).
- Tables are real `<table>` elements; charts have an `aria-label` naming the series and interval; the drawer is a dialog.
- No motion beyond native chart panning.

## 11. File layout (frontend/src)

```
main.tsx, App.tsx                 shell: grid, hook, region order
api.ts                            typed fetchers, zod-free (types mirrored from backend/src/types.ts)
format.ts                         section 5
theme.css                         tokens (section 3, 4) + region/base styles
useDashboardData.ts               section 7 state machine + polling
components/StatusBar.tsx
components/PhaseReadout.tsx
components/CycleVector.tsx
components/HtfChart.tsx
components/LtfChart.tsx
components/SignalTable.tsx
components/PhaseGuide.tsx
```

One CSS file. Component styles use class names prefixed by component (`.htf-`, `.vector-`); no CSS modules, no CSS-in-JS.

## 12. What the API contract lacks and the UI needs

These are asks for the backend; the UI degrades as noted until they exist.

1. **`firstSnapshot` on `/api/health`** — needed for the OI empty-state text "collecting OI snapshots since <date>". Degrade: print `collecting OI snapshots — no history yet`.
2. **Unit convention for `apr`, `fundingApr`, `premium`, `cycleProgress`, `drawdown`** — SPEC does not say fraction vs percent. Design assumes **fractions** (`0.091` → `+9.1%`, `premium` fraction → bp). Backend must confirm or the display is off by 100×.
3. **`features` shape** — SPEC says "named numeric values (nullable)". UI needs `Record<string, number | null>`; keys are printed raw. If the backend can add a stable ordering and unit hints (`docs/MODEL.md` table), the feature list becomes readable; not blocking.
4. **`signals[].from` nullable** — first-ever label has no predecessor. Design treats `from: null` as `—`. Contract should say so.
5. **Error body shape** — unspecified. UI keys only on HTTP status; any non-2xx is `error`.
6. **`asOf` vs `lastRefresh`** — overview has `asOf`, health has `lastRefresh`. Design uses `lastRefresh` for staleness and `asOf` for display. If they can differ meaningfully, document why; otherwise expose `lastRefresh` on overview too and drop the second poll.
7. **Halving dates for the future** — `cycleProgress` implies an assumed cycle length; the readout would like `nextHalvingEstimate` to print `next ~2028-04`. Degrade: omit.
8. **`/api/htf?interval=1w` phase per week** — SPEC says "same fields where computable"; design assumes `phase` is present on weekly points (band still draws). If null, weekly view shows candles without bands.

## 13. Deliberate omissions

- No light theme, no theme switch.
- No settings persistence; interval/filter reset on reload.
- No true vertical halving lines (markers instead) — needs a custom primitive; follow-up.
- No crosshair sync across HTF/LTF (different time domains, would mislead).
- No export/screenshot/share.
- No mobile-specific gestures beyond what lightweight-charts provides.
