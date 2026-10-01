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
│ MarketRead                             │ CycleVector                   │
│  +0.34 bullish   EXPANSION             │   heat ↑                      │
│  [capitulation ━━━━━━━━┃━━━━ euphoria] │     ┌────┬────┐               │
│  HTF expansion: trend is up…; short-…  │     │dist│euph│  ● now        │
│  TREND     HEAT     LEVERAGE  MOMENTUM │     ├────┼────┤  ~ path 90d   │
│  ▬▬ uptrend ▬ warm  ▬ building ▬ rising│     │capi│accu│               │
│  cycle  d+890 · 61% · next 2028-04     │     └────┴────┘               │
│  ▸ features                             │        trend →                │
├────────────────────────────────────────┴───────────────────────────────┤
│ DerivativesPanel  Hyperliquid derivatives · BTC-PERP   [7d][30d][90d]   │
│  PREMIUM         FUNDING APR       OPEN INTEREST      VOLUME 24H        │  ~120px
│  −3.1 bp         +9.9%   ▸HL ▸BIN  3.06B  −1.2% 24h   2.00B             │
│  ╱╲_╱‾╲_         ‾‾╲__╱‾ ▸BYB      ╱‾‾╲__╱            _╱‾╲_╱            │
├────────────────────────────────────────────────────────────────────────┤
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

Column spans at 1440: MarketRead 7/12, CycleVector 5/12. DerivativesPanel, charts and table span 12.

### 2.2 At 1024

Same grid, MarketRead 7/12 and CycleVector 5/12 still fit (vector min 320px square). DerivativesPanel drops to a 2×2 sparkline grid. Chart heights unchanged. Page padding 16px. Feature detail table in MarketRead collapses by default (it already does at 1440, see 6.2).

### 2.3 Below 900 (stacked)

Single column in this order: StatusBar, MarketRead, CycleVector (max 360px wide, centered), DerivativesPanel (sparklines one per row), HtfChart (360px), LtfChart (price 240 / funding 90 / OI 90), SignalTable. Table drops the `scores` column and keeps time, frame, from→to, price. No horizontal page scroll; the table itself may scroll horizontally.

### 2.4 Region rules

- Every region is a `section.region` panel (3.6): 1px `--border` on `--surface-100`, radius 10, no shadow. Header row: title in `label` style `--ink-300`, optional right-aligned controls; padding 12/16; `--border-subtle` rule below.
- Page background `--surface-000`; panels sit on it separated by the 16px gutter, not by elevation. Charts fill the panel body on `--surface-100` with no inner border.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 only (`--space-1`…`--space-6`).

## 3. Colour tokens ("Ledger" design system, dark)

Dark theme is primary and the only theme. Tokens live as CSS custom properties on `:root` in `theme.css`; components reference them only via `var(--…)` (or `css("--…")` in charts), never raw hex. A light theme stays out of scope; the names allow one later.

### 3.1 Surfaces, borders, ink, accent

| Token | Value | Use |
|---|---|---|
| `--surface-000` | `#0b0c0e` | page background |
| `--surface-100` | `#131417` | panels (`.region`), chart background |
| `--surface-200` | `#1b1d21` | table header, hover rows, inputs, segmented track, popover, crosshair label |
| `--surface-300` | `#25272c` | active segmented button, gauge midpoint |
| `--border-subtle` | `#212328` | inner rules (region header rule, table rows), chart grid lines (at 60% alpha) |
| `--border` | `#2e3037` | panel border (1px), control borders |
| `--border-strong` | `#40434c` | focused/hovered control border, crosshair, zero lines, gauge ticks |
| `--ink-100` | `#f2f2f4` | primary figures and labels |
| `--ink-200` | `#c2c4ca` | secondary text, sentence, sparkline stroke |
| `--ink-300` | `#8b8e97` | eyebrows, table headers, axis text, units, disabled |
| `--accent` | `#5b84f0` | active state, links, component score bars, sparkline last-point dot |
| `--accent-strong` | `#7c9cf5` | focus ring (`outline: 2px solid; outline-offset: 2px`), link hover |
| `--accent-subtle` | `#16213f` | selected table row |

Rename map from v1 (every usage in `theme.css`, `HtfChart.tsx`, `LtfChart.tsx`, `CycleVector.tsx`, inline styles, and the hex fallbacks passed to `alpha()`): `--surface-0`→`--surface-000`, `--surface-1`→`--surface-100`, `--surface-2`→`--surface-200`, `--line`→`--border-subtle`, `--line-strong`→`--border-strong`, `--text-1`→`--ink-100`, `--text-2`→`--ink-200`, `--text-3`→`--ink-300`. Old names are deleted, not aliased.

### 3.2 Semantic (direction, status)

| Token | Value | Replaces | Use |
|---|---|---|---|
| `--positive` | `#3ecb82` | `--up`, `--ok` | up candles, positive deltas (OI 24h change), live dot |
| `--positive-subtle` | `#0f2419` | — | live status pill background |
| `--negative` | `#f16060` | `--down`, `--bad` | down candles, negative deltas, offline dot |
| `--negative-subtle` | `#2a1414` | — | offline status pill background |
| `--warning` | `#e0a23d` | `--warn` | stale dot, stale top border on Market Read, "collecting" pill text |
| `--warning-subtle` | `#2b2110` | — | stale / collecting pill background |
| `--flat` | `#8b8e97` (= `--ink-300`) | `--flat` | zero deltas |

Candle rendering is unchanged: up body `--positive`, down body `--negative`, wicks same colour, borders off, no hollow candles. Deltas always print a sign, so direction never rests on colour alone. Score bars (Market Read) are NOT coloured by sign: positive heat or leverage is not "good", so they use `--accent`.

### 3.3 HTF phase palette (6, cyclic order) — unchanged

Order below is cycle order; adjacent pairs are what the eye compares on the chart's phase bands.

| Phase | Token | Value | Mnemonic |
|---|---|---|---|
| accumulation | `--ph-accumulation` | `#3987e5` | cold blue, bottoming |
| expansion | `--ph-expansion` | `#199e70` | green, healthy growth |
| euphoria | `--ph-euphoria` | `#c98500` | amber, overheating |
| distribution | `--ph-distribution` | `#e66767` | red, topping/selling |
| markdown | `--ph-markdown` | `#9085e9` | violet, cooling decline |
| capitulation | `--ph-capitulation` | `#d55181` | magenta, pain/flush |

Validator result (dark, cyclic adjacency incl. capitulation→accumulation): lightness PASS, chroma PASS, contrast PASS, CVD adjacent worst 6.7 ΔE (euphoria↔distribution, deutan) = warn band, normal-vision adjacent worst 13.0 (same pair, floor is 15). All-pairs cannot pass for six hues on any palette (documented in the dataviz reference: cap is three). **Consequence, binding:** phase colour is always accompanied by a text label — band labels on the HTF chart (see 7.1), the phase word in Market Read, the quadrant labels in CycleVector, the `from→to` words in the table. No component may communicate phase by colour alone.

Band alpha on the chart: fill at 14% alpha over `--surface-100`; legend swatches and badges at 100%. The phase palette deliberately does NOT follow the Ledger semantic colours: `--ph-expansion` stays `#199e70` even though `--positive` is `#3ecb82`.

### 3.4 LTF state palette (8) — unchanged

LTF states are status-like, shown as a badge with the state text, and as a thin state strip under the LTF price pane. Two states are deliberately grey.

| State | Token | Value | Reading |
|---|---|---|---|
| crowded_long | `--st-crowded-long` | `#e66767` | risk: longs over-extended |
| healthy_uptrend | `--st-healthy-uptrend` | `#199e70` | good |
| short_squeeze_fuel | `--st-squeeze` | `#c98500` | opportunity/warning |
| crowded_short | `--st-crowded-short` | `#d55181` | risk: shorts over-extended |
| deleveraging | `--st-deleveraging` | `#9085e9` | flush in progress |
| downtrend | `--st-downtrend` | `#736aa8` | orderly decline (added after v1, MODEL 2.5) |
| neutral | `--st-neutral` | `#9aa3ad` | grey |
| insufficient_data | `--st-nodata` | `#5f6873` | grey, badge drawn with a dashed border |

Same colour family as phases on purpose: red = crowded/hot in both frames, green = healthy in both, amber = heat/fuel, violet = decline/deleverage, magenta = pain. The user learns one vocabulary. Text label always present.

### 3.5 Status pill (StatusBar)

`live` = `--positive` dot on `--positive-subtle`; `stale` = `--warning` on `--warning-subtle`; `offline` = `--negative` on `--negative-subtle`. Pill: radius 4, padding 2px 8px, text `--ink-100`, `figure-sm`. Always paired with the word.

### 3.6 Spacing, radius, elevation

| Token | Value |
|---|---|
| `--space-1` … `--space-6` | `4px` `8px` `12px` `16px` `24px` `32px` |
| `--radius-sm` / `--radius-md` / `--radius-lg` | `4px` / `6px` / `10px` |

- Panel (`.region`): `background: var(--surface-100); border: 1px solid var(--border); border-radius: var(--radius-lg);` no `box-shadow` anywhere in the app. `overflow: hidden` so charts clip to the radius.
- Region header: padding `12px 16px`, `border-bottom: 1px solid var(--border-subtle)`, text in `label` style (4.1), `--ink-300`; right-aligned controls allowed.
- Region body: padding `16px`. Grid gutter `16px`, page padding `24px` (unchanged).
- Controls (buttons, `<select>`, segmented): radius `--radius-md`, 1px `--border`, background `--surface-200`, text `--ink-200`; hover border `--border-strong`; focus-visible ring `--accent-strong`.
- Segmented control: track `--surface-200` radius 6 padding 2; active button `--surface-300` + `--ink-100`; inactive `--ink-300`. This replaces the v1 accent underline (section 8).
- Tables: header row `--surface-200`, `label` style; row rule `--border-subtle`; hover `--surface-200`; selected `--accent-subtle`.
- Pills (status, "collecting"): radius `--radius-sm`.

## 4. Typography

Loaded from Google Fonts in `frontend/index.html` `<head>` (no npm font package):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
```

```
--font-ui:   "Inter", ui-sans-serif, system-ui, sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
```

Six roles, each a utility class in `theme.css` (`.t-body`, `.t-label`, `.t-heading`, `.t-figure-lg`, `.t-figure`, `.t-figure-sm`) backed by size/line-height tokens:

| Role | Font | Size / line | Weight | Extra | Use |
|---|---|---|---|---|---|
| `body` | UI | 14 / 20 | 400 | — | default `body`, sentence, words, explainer copy |
| `label` | UI | 12 / 16 | 500 | `letter-spacing: 0.02em; text-transform: uppercase` | eyebrows, region headers, table headers, sparkline titles |
| `heading` | UI | 17 / 24 | 600 | — | drawer title, empty-state headings |
| `figure-lg` | mono | 20 / 26 | 500 | tabular | bias number, phase word, sparkline last values, StatusBar price |
| `figure` | mono | 14 / 20 | 400 | tabular | table figures, feature values, LTF state badge |
| `figure-sm` | mono | 12 / 16 | 400 | tabular | component scores, deltas, axis-adjacent labels, predicted-funding tick labels, pills |

Rules: every live figure is `--font-mono` with `font-variant-numeric: tabular-nums` (`.mono` keeps working and now means Plex Mono). Labels and prose are `--font-ui`. Phase/state words stay mono: uppercase for HTF phases (`EXPANSION`), lowercase snake_case exactly as the API returns for LTF states (`healthy_uptrend`). The v1 `--fs-*` tokens are deleted; map `--fs-xs`/`--fs-sm` → `figure-sm` or `label`, `--fs-md` → `body`, `--fs-lg` → `body`, `--fs-xl`/`--fs-2xl` → `figure-lg`. Chart canvases keep `fontSize: 11` (functional identity, 9) and pick up Plex Mono through `--font-mono`.

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

## 6. Components

Keep to these (6.2 MarketRead replaced PhaseReadout; 6.8–6.9 added in Phase 3b). Formatters, the API client and the theme are modules, not components.

### 6.1 `StatusBar`

Props: `health: Health | null`, `overview: Overview | null`, `status: "loading" | "ok" | "stale" | "error"`, `onOpenGuide()`.

Content, left to right: wordmark `hl-cycles`, `BTC` and `overview.price`, `as of {overview.asOf}` UTC, status pill (`● live 12m ago` / `● stale 47m ago` / `● offline — retrying`), right: `? Phase guide` button. 40px tall, `--surface-100`, bottom border `--border-subtle`.

Status derivation (in the data hook, not in the component): `error` if `/api/overview` fails; `stale` if `now − health.lastRefresh > 30 min`; otherwise `ok`.

### 6.2 `MarketRead` (replaces `PhaseReadout`, Phase 3b)

File `components/MarketRead.tsx`; `PhaseReadout.tsx` is deleted. Props: `overview: Overview`, `stale: boolean`. All words and the sentence come from the API (`overview.composite.*`, docs/MODEL.md 3.2–3.3); the component computes nothing but pixel positions.

```
+0.34  bullish                                   EXPANSION ■
[■■■■■■■■■■■■■■■■■■■■■■■■┃■■■■■■■■■■]   −1 ··· 0 ··· +1
HTF expansion: trend is up and not yet overheated; short-term uptrend with balanced leverage.
TREND            HEAT             LEVERAGE         MOMENTUM
[──|███──]       [──|█───]        [──|██───]       [──|███──]
uptrend  +0.62   warm  +0.31      building +0.24   rising +0.44
cycle  day 890 since 2024-04-20 · 61.2% · next ~2028-04
▸ features
```

- **Headline row.** Left: `composite.bias` as `figure-lg` `--ink-100` via `fmtScore` (`—` if null), then `composite.label` in `body` `--ink-200` (`unavailable` if null). Right: the ONE phase word = `htf.phase` uppercased, `figure-lg`, colour `PHASE_TOKEN[phase]`, followed by a 10px square swatch; `—` in `--ink-300` if null.
- **Gauge** (plain HTML/CSS, no SVG needed). Track: full width, 8px tall, radius 4, `background: linear-gradient(90deg, var(--ph-capitulation) 0%, var(--surface-300) 50%, var(--ph-euphoria) 100%)`. Scale is linear: `left% = (clamp(bias, −1, 1) + 1) / 2 × 100`. Ticks: 1px × 12px `--border-strong` at the label boundaries −0.5, −0.15, +0.15, +0.5 (`left%` 25, 42.5, 57.5, 75) and a 1px × 16px `--ink-300` tick at 0. Marker: 3px × 20px `--ink-100` bar, radius 2, centred on `left%`, 1px `--surface-000` outline so it reads over both gradient ends; omitted when bias is null. End captions `−1` / `0` / `+1` in `figure-sm` `--ink-300` under the track. Element is `role="meter" aria-valuemin=-1 aria-valuemax=1 aria-valuenow={bias} aria-valuetext="{label} {fmtScore(bias)}"`. The gradient is only a mnemonic for "bearish end ↔ bullish end"; the number and label carry the reading (3.3 rule).
- **Sentence.** `composite.sentence` (ONE sentence), `body` `--ink-200`, single line with ellipsis, full `composite.summary` in `title`.
- **Why row.** CSS grid, 4 equal columns (2×2 below 900), order trend, heat, leverage, momentum from `composite.components`. Each cell: eyebrow (`label` style, `--ink-300`); a 64px × 6px track `--surface-300` radius 3 with a 1px `--border-strong` centre tick, filled from the centre to the score in `--accent` (width `|score|/2 × 100%`, left or right of centre by sign); below, the word in `body` `--ink-100` and the score in `figure-sm` `--ink-300` (`fmtScore`). Null score → empty track, word `—`. `title` on the cell lists the sub-scores from `features` so every number stays reachable: trend `tMayer / tSlope / tCross`, heat `hMayer / hDrawdown / hRoc365`, leverage `lFunding / lPremium / lOi`, momentum `mEma / mRsi / mRoc`, each `fmtScore`.
- **Cycle** line and the **`▸ features` `<details>`** move over unchanged from v1 PhaseReadout (same content, `figure-sm` values, `--ink-300` keys). The v1 funding line is dropped here: DerivativesPanel shows the predicted funding (6.8). The LTF state badge is dropped: the sentence names the LTF state and the LTF chart's state strip/tooltip show it.
- **Stale:** `stale` → panel gets a 1px `--warning` top border (replaces `readout-top-warn`).

### 6.3 `CycleVector`  (the signature piece — plain SVG)

Props: `points: { t: number; trend: number; heat: number; phase: Phase }[]` (last 90 daily HTF points, oldest first — derived from `/api/htf` in the data hook), `current: { trend, heat, phase }` (from overview).

SVG spec, viewBox `0 0 320 320`, `preserveAspectRatio="xMidYMid meet"`, CSS size 100% of column width, square, min 280, max 420.

- Plot area: 24px padding on all sides → domain `[-1, 1]` on both axes maps to `[24, 296]`. x = trend (right is positive), y = heat (up is positive; invert SVG y).
- Quadrant fills: four rects at 8% alpha of the phase that *typically* lives there, so the plane teaches the model even with no data:
  - top-right (trend+, heat+): `--ph-euphoria`
  - top-left (trend−, heat+): `--ph-distribution`
  - bottom-left (trend−, heat−): `--ph-capitulation`
  - bottom-right (trend+, heat−): `--ph-accumulation`
  Quadrant labels in the outer corners, `figure-sm`, `--ink-300`, uppercase: `EUPHORIA`, `DISTRIBUTION`, `CAPITULATION`, `ACCUMULATION`. `expansion` and `markdown` are transitional (near the x axis, moving) and are labelled once in the legend line under the SVG: "expansion / markdown = moving right / left across the axis".
  These quadrant hints are pedagogical, not the classifier; the actual phase of each point comes from the API and colours the point.
- Axes: two 1px lines through 0 in `--border-strong`; ticks at ±0.5 as 4px marks; axis titles `trend →` (bottom right) and `heat ↑` (top left) in `figure-sm` `--ink-200`.
- Trailing path: a `<polyline>` through the 90 points, stroke `--ink-200`, 1.5px, `stroke-linejoin: round`, opacity ramp is not available on a single polyline, so draw it as up to 89 `<line>` segments with opacity `0.15 + 0.85 * i/88` (oldest faintest). Every 30th point gets a 3px hollow circle marker in `--ink-200` so speed of movement is legible (dense markers = slow, sparse = fast).
- Current point: 7px circle filled with `--ph-{current.phase}`, 2px `--surface-100` ring, then a 1px `--ink-100` outer ring. Label to the right: `{trend} , {heat}` in mono `figure-sm`.
- Hover (optional, cheap): a transparent 12px hit circle per point; on hover show a tooltip `2026-07-14 · EXPANSION · trend +0.41 · heat +0.12`. Keyboard: not required for v1.
- Empty (`points.length < 2`): draw axes and quadrants, no path, centred `--ink-300` text `not enough HTF history`.

Region header: `Cycle vector · trend vs heat · last 90 days`.

### 6.4 `HtfChart`

Props: `data: HtfResponse` (`candles`, `halvings`), `interval: "1d" | "1w"`, `onIntervalChange(i)`.

lightweight-charts v5 setup:
- One chart, one pane. `rightPriceScale.mode = Logarithmic`. `timeScale.timeVisible = false`. Background `--surface-100`, grid lines `--border-subtle` at 60% alpha, text `--ink-300`, crosshair `--border-strong` with `mode: Normal`.
- Series, in draw order:
  1. **Phase band** — `HistogramSeries` on an overlay price scale (`priceScaleId: "phase"`, `scaleMargins: { top: 0, bottom: 0 }`), every bar `value: 1`, `color` = phase colour at 14% alpha, `priceLineVisible: false`, `lastValueVisible: false`. Because histogram bars are contiguous and full-height, this reads as a continuous background band. Fill from `candles[i].phase`.
  2. **Candles** — `CandlestickSeries`, `--positive` / `--negative`, `borderVisible: false`.
  3. **SMA200** — `LineSeries`, 1.5px, `--ink-200`, `lastValueVisible: false`, `crosshairMarkerVisible: false`. From `candles[i].sma200` (skip nulls).
  4. **Halvings** — `createSeriesMarkers` on the candle series: one marker per timestamp in `halvings`, `position: "belowBar"`, `shape: "arrowUp"`, `color: --ink-200`, `text: "halving YYYY"`. This is a marker, not a full-height line; v5 has no built-in vertical line. Acceptable for v1; a custom primitive drawing a 1px dashed `--border-strong` vertical is a follow-up, not required.
- Initial visible range: full history. `fitContent()` after data load and on interval change.
- Weekly: same code path, `?interval=1w`.
- Interval toggle: two-segment control `[1d][1w]` in the region header, segmented style per 3.6.
- Legend row in the header: six phase swatches + words (`figure-sm`), always visible; this is the phase legend for the bands.
- Band labels (binding, see 3.3): when a contiguous phase run is wider than 72px on screen, print the phase word at `figure-sm` `--ink-200` at the top-left of the run. Implement as absolutely positioned HTML labels computed from `timeScale.timeToCoordinate()` on `subscribeVisibleLogicalRangeChange`; skip runs that would overlap. If this proves fiddly, minimum viable: the tooltip always names the phase and the legend exists.
- Tooltip (HTML overlay, `subscribeCrosshairMove`, top-left of chart, single line, mono `figure-sm`):
  `2021-04-14 · O 63,523 H 64,863 L 61,319 C 62,970 · SMA200 34,120 · Mayer 1.85 · DD −2.9% · trend +0.71 heat +0.88 · EUPHORIA · src hl`
  Null fields print `—`. Phase word coloured with its token.
- Crosshair sync: none. HTF crosshair is independent from LTF by design (different time domains).
- Min height 480 at ≥1024, 360 stacked. Height is fixed CSS; chart resizes with `ResizeObserver`.

### 6.5 `LtfChart`

Props: `data: LtfResponse` (`points`), `interval: "4h" | "1h"`, `onIntervalChange(i)`, `firstSnapshotAt: number | null` (see 12).

v5 multi-pane, one chart, three panes sharing the time scale (native pane time sync; no manual crosshair code):
- Pane 0 (price, 300px): `CandlestickSeries` (`--positive`/`--negative`) + `LineSeries` ema50 (1.5px, `--ink-200`). Linear scale. Under it, a 6px **state strip**: `HistogramSeries` on an overlay scale with `scaleMargins: { top: 0.97, bottom: 0 }`, `value: 1`, colour = `--st-{point.state}` at 70% alpha. This is the only place LTF state history is visible on a chart; text is available via tooltip.
- Pane 1 (funding APR, 110px): `HistogramSeries` from `fundingApr`, colour `--positive` when ≥ 0 else `--negative`, 60% alpha, plus a zero line (`createPriceLine` at 0, `--border-strong`). Pane title label `funding APR` top-left, `figure-sm` `--ink-300`.
- Pane 2 (OI USD, 110px): `LineSeries` from `oiUsd`, 1.5px, `--ink-100`; nulls are gaps (`whitespace` points). Pane label `open interest`.
- Time axis visible on the bottom pane only.
- **OI empty state:** if every `oiUsd` in the visible data is null → hide the OI series and render an HTML overlay centred in pane 2: `collecting OI snapshots since {firstSnapshotAt as YYYY-MM-DD}` (or `collecting OI snapshots — no snapshot yet` if null), `figure-sm` `--ink-300`. If only the early part is null (the normal case) → no overlay; the line simply starts later. Same rule for the funding pane when all `fundingApr` are null, text `no funding data`.
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
- Header sticky; body scrolls inside a 420px max-height container; zebra off; hover row `--surface-200`.
- Filter: three-segment control in the region header, same style as interval toggles.
- Empty: `no signals yet — labels are recorded when they change`.
- Below 900: hide `scores` column.

### 6.7 `PhaseGuide`

Props: `open: boolean`, `onClose()`, `current: { phase, state }` (to highlight the current rows).

A right-side drawer, 400px wide, full height, `--surface-200`, 1px left border, opened from StatusBar `? Phase guide`. Closes on Escape, on backdrop click, on the `×`. `role="dialog"`, `aria-modal`, focus moved to the drawer heading on open and returned on close. Plain text content, `body`, mono headings. It exists so the user learns cyclicality; keep each item to one sentence, and add nothing that MODEL.md does not back.

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

### 6.8 `DerivativesPanel` (Phase 3b)

File `components/DerivativesPanel.tsx`. Props: `data: Derivatives | null`, `error: boolean`, `onRetry()`. Data is `/api/derivatives` (`derivatives.json` static), contract in SPEC.md 3b.3. Span 12, placed right after the MarketRead/CycleVector row.

- Header: `Hyperliquid derivatives · BTC-PERP`; right side a `[7d][30d][90d]` segmented control (default `30d`; each is a client-side slice of the 90d payload, no refetch) and, when `data.collecting`, a pill `collecting since {fmtDate(data.firstSnapshot)}` (`--warning` on `--warning-subtle`, or `collecting — no snapshot yet` if `firstSnapshot` is null).
- Body: CSS grid of 4 cells (2×2 at ≤1024, 1 column below 900), gap 16. Each cell top to bottom: eyebrow (`label`, `--ink-300`), last value (`figure-lg` `--ink-100`) with a secondary figure (`figure-sm`), then a `Sparkline` 48px tall, full cell width.

| Cell | Eyebrow | Last value | Secondary | Sparkline extras |
|---|---|---|---|---|
| premium | `MARK VS ORACLE` | `fmtBp(premium.last)` | `premium` | zero line |
| funding | `FUNDING APR` | `fmtApr(fundingApr.last)` | `HL hourly, annualized` | zero line; 3 predicted ticks `HL` / `BIN` / `BYB` at `fundingApr.predicted[].apr`, label = `short` field |
| OI | `OPEN INTEREST` | `fmtCompactUsd(oiUsd.last)` | `fmtPercentSigned(oiUsd.change24h) 24h`, coloured `--positive` / `--negative` / `--flat` by sign, `—` if null | — |
| volume | `VOLUME 24H` | `fmtCompactUsd(volume24h.last)` | `notional` | — |

- Per cell, if its `points.length < 2` the sparkline area shows centred `figure-sm` `--ink-300` text `collecting` (premium/OI/volume) or `no funding data` (funding) at the same 48px height, so the layout never jumps. Funding normally renders even while snapshots are still collecting, because it comes from the funding history.
- States: `data == null && !error` → loading block per 7; `error` → `failed to load — retry` (partial state, 7).

### 6.9 `Sparkline` (Phase 3b, inline SVG, no library)

File `components/Sparkline.tsx`, ~60 lines, pure presentational. Props: `points: [number, number][]` (`[t, v]`, ascending), `height = 48`, `zeroLine = false`, `markers: { label: string; value: number }[] = []`, `ariaLabel: string`.

- `<svg viewBox="0 0 200 {height}" preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={ariaLabel}>`. Strokes use `vector-effect="non-scaling-stroke"` so stretching keeps 1.5px lines.
- x: linear in `t` over `[points[0].t, points.at(-1).t]` into `[0, 200 − 16]` (the right 16 units are reserved for marker ticks). y: linear over `[min, max]` of all values ∪ marker values ∪ `{0}` if `zeroLine`, padded 10% each side; if `max == min`, pad ±1 unit of |value| (or ±1 if value is 0) so a flat series draws mid-height.
- Line: one `<path>`, `--ink-200`, 1.5px, no fill, no area. **Gaps:** start a new `M` segment when `t[i] − t[i−1] > 7_200_000` (2 × the 1h bucket), so missing collection never draws a fake straight line.
- Last point: 2.5px-radius dot `--accent`.
- `zeroLine`: 1px horizontal `--border-strong` dashed `2 2` at y(0).
- Markers: a 6-unit horizontal `--ink-300` tick at the right edge at y(value); labels are HTML `<span>`s absolutely positioned over the SVG's right edge at `top = y/height × 100%`, `figure-sm` `--ink-300`, sorted by value and nudged apart to ≥12px. `title` on each label = `{label} predicted {fmtApr(value)}`.
- No axes, no tooltip, no hover. The last value is printed by the parent.

### 6.10 Assets tab restyle (Phase 3b)

`AssetsView.tsx` changes only class names and inline colour references: its wrapper is a `.region` panel (3.6), the coin `<select>` and interval segmented use the control styles, the one-line stats row uses `figure` mono with `--ink-200` keys, and inline `var(--text-2)` becomes `var(--ink-200)`. Behaviour unchanged.

## 7. States

Derived once in a `useDashboardData()` hook that polls `/api/health` and `/api/overview` every 60s and refetches `/api/htf`, `/api/ltf`, `/api/signals` when `health.lastRefresh` changes.

| State | Trigger | Rendering |
|---|---|---|
| loading (first load) | no overview yet | StatusBar shows `loading…`; each region renders its header and a flat `--surface-200` block of its final height (no shimmer animation). Charts create the chart instance immediately so layout does not jump. |
| ok | overview ok, `now − lastRefresh ≤ 30m` | normal, status pill `● live Nm ago` in `--positive` |
| stale | `now − lastRefresh > 30m` | status pill `● stale Nh ago` in `--warning`; a 1px `--warning` top border on MarketRead; everything else renders the cached data unchanged. No modal, no banner. |
| error (backend down) | `/api/overview` fetch fails or non-2xx | status pill `● offline — retrying in 30s` in `--negative`. If earlier data exists, keep rendering it with the pill in `--negative`. If nothing was ever loaded, each region shows centred `--ink-300` text `backend unreachable at :8787 — run bun run dev`. Retry with fixed 30s interval; no exponential backoff needed locally. |
| partial | one of htf/ltf/signals fails while overview is ok | that region alone shows `failed to load — retry` with a text button; others unaffected. |
| empty | endpoint ok but empty arrays | region-specific text from sections 6.3–6.6. |

No skeleton animations, no spinners longer than a 12px ring in the status pill.

## 8. Interaction summary

- HTF chart: independent crosshair; scroll/drag zoom native; double-click resets to `fitContent()`. Toggle 1d/1w keeps the visible range proportionally where possible, otherwise fits.
- LTF chart: three panes time-synced natively; independent from HTF.
- CycleVector: hover tooltip per point; no zoom.
- SignalTable: click a row → HTF row scrolls the HTF chart to centre that `t` (`timeScale.scrollToPosition` after `timeToIndex`), LTF row does the same on the LTF chart. Cheap, high learning value: "what did the chart look like when the label flipped". Row gets `--surface-200` background while selected.
- Toggles and filters are `<button role="tab">` groups with `aria-selected`; styled as the segmented control in 3.6 (active = `--surface-300` + `--ink-100`). Focus-visible ring `--accent-strong`.
- Keyboard: tab order follows visual order; drawer traps focus; charts are not keyboard-navigable (documented limitation).

## 9. Chart theme (lightweight-charts options, shared)

```
layout.background     solid --surface-100
layout.textColor      --ink-300
layout.fontFamily     --font-mono
layout.fontSize       11
grid.vertLines/horzLines.color   --border-subtle @ 60%
crosshair.vertLine/horzLine.color  --border-strong, labelBackgroundColor --surface-200
rightPriceScale.borderColor / timeScale.borderColor   --border-subtle
timeScale.rightOffset 4, barSpacing default
localization.priceFormatter / timeFormatter  from format.ts
```

Read CSS variables at chart creation via `getComputedStyle(document.documentElement)`; charts do not re-theme live (single theme). Phase 3b changes only the variable names above (and candle colours via `--positive`/`--negative`, 3.2); every option, series, pane and interaction stays identical.

## 10. Accessibility floor

- Text contrast on `--surface-100` / `--surface-200` / `--surface-300`: `--ink-100` 16.5 / 15.1 / 13.4, `--ink-200` 10.6 / 9.7 / 8.6, `--ink-300` 5.6 / 5.2 / 4.6, `--accent` 5.3 / 4.8 / 4.3 (:1). All pass 4.5:1 except `--accent` on `--surface-300`, so never put accent text on the active segmented button. `--ink-300` is fine for eyebrows and table headers; keep long body copy on `--ink-200` or brighter.
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
components/MarketRead.tsx         (replaces PhaseReadout.tsx, 6.2)
components/DerivativesPanel.tsx   (6.8)
components/Sparkline.tsx          (6.9)
components/AssetsView.tsx         (6.10)
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

## 14. Phase 4: Vector view (landing)

Design for SPEC.md Phase 4 (4.4 API, 4.5 content, D7/D8). Research basis: `docs/research/bitcoin-vector.md` §1, §2, §6. The Vector block becomes the top of the BTC view; everything that exists today (MarketRead, CycleVector, DerivativesPanel, main chart with frames, SignalTable) stays below it unchanged as the drill-down. Nothing in sections 1–13 is revoked; this section only adds.

### 14.1 Intent and reading order

The page answers *"should I be in Bitcoin right now, and what would change that answer?"* in the first screen. The Glassnode/Swissblock appeal comes from four things, and the layout is built to deliver them in this order:

1. **Regime word in under five seconds.** One word pair (`STRONG RISK-ON`), one colour, one allocation bar, one "since" date. Nothing else competes at that size.
2. **Why.** Four speedometer gauges (risk, momentum, fundamentals, flows) with today / last week / 52w markers, then the Compass headline and seven lens tiles. Both are the *inputs* to the word above; the eye moves from conclusion to evidence.
3. **Where.** The regime-coloured long-horizon price chart with numbered flips, and the key-levels ladder with a Status column. This is the "map" the newsletter is built around.
4. **What would change it.** The brief: numbered claims, each with its trigger, plus explicit confirm / invalidate lines in the hero.
5. **Drill-down.** A section divider, then the existing components. The HTF phase, derivatives and signals are still here, demoted.

Tone rule for all Vector copy (from §6 of the research): declarative, plain English, no exclamation marks, no metaphors outside titles. Every claim prints its number. The UI shows text the API produced; it does not compose sentences.

### 14.2 Layout

#### 14.2.1 At 1440

Same 12-column grid, gutters and page padding as §2.1. The `[BTC][Assets]` view toggle **moves into the StatusBar** right cluster (`[BTC][Assets]  ? Phase guide`), so the hero is the first thing under the 40px bar. `StatusBar` gains props `view: "btc" | "assets"` and `onViewChange(v)`; the free-floating `.segmented` above `.app-grid` in `App.tsx` is deleted. The `Assets` view is unchanged.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ StatusBar  hl-cycles · BTC $83,675 · as of …  [● live]   [BTC][Assets] [?]   │ 40
├──────────────────────────────┬───────────────────────────────────────────────┤
│ RegimeHero            span 5 │ Gauges (4 × Gauge)                     span 7 │
│ ▌STRONG RISK-ON              │  RISK        MOMENTUM   FUNDAMENTALS  FLOWS   │
│ ▌100% BTC ████████████████   │   ╭──╮        ╭──╮        ╭──╮        ╭──╮    │ ~210
│ ▌since 2026-08-21 · day 41   │   33          +42         61          +2.4%   │
│ ▌inputs as of 2026-09-29     │  elevated    bullish     strong      inflow   │
│ ▌HTF phase reads DISTRIBUTION│  last wk 41 · 52w 27  …                       │
│ ▌confirm ▲ …  invalidate ▼ … │  ● today  ○ last week  | 52w avg              │
├──────────────────────────────┴──────────────────────────┬────────────────────┤
│ RegimeChart  Regime · BTC/USD daily · log  [1Y][4Y][All] [levels] │ CompassPanel  │
│  (log price line coloured by regime, flip callouts ①②③)│  COMPASS           │
│  ─────────────────────────────────────────────────────  │  23  Defensive     │ 420
│  ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪ dot strip ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪  │  7d +3 · 30d +9 ~~ │
│  ◼strong-off ◼mild-off ◼mild-on ◼strong-on  ① 2024-09-22│  Macro        18 … │
│                                                  span 8 │  Flows        31 … │
│                                                         │  Behaviour    27 … │
│                                                         │  Fundamentals 16 … │
│                                                         │  ── standalone ──  │
│                                                         │  Cycle        44 … │
│                                                         │  Derivatives  22 … │
│                                                         │  Rotation      9 … │
│                                                         │             span 4 │
├─────────────────────────────────────┬───────────────────┴────────────────────┤
│ LevelsTable                  span 5 │ Brief                           span 7 │
│ METRIC          LEVEL   DIST  STATUS│  1  Price holds above the STH cost …  │ ~260
│ Mean MVRV price 96,700 +15.6% lost  │     ↳ a daily close below $73.3K …    │
│ ETF cost basis~ 86,000  +2.8% lost  │  2  …                                 │
│ ── price 83,675 ──────────────────  │  3  …                                 │
│ TMM             77,200  −7.7% holding│ …                                     │
│ STH cost basis  73,300 −12.4% holding│                                       │
├─────────────────────────────────────┴────────────────────────────────────────┤
│ MacroStrip  DOLLAR VS 200D +1.8% │ US 10Y 5.29% │ US 2Y 4.89% │ FED FUNDS 4.00% │ 56
│             CURVE 10Y−2Y +0.40 │ BTC·SPX CORR 30D +0.42 │ as of 2026-09-30     │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▸ sources · 6 ok · 1 failing                                                 │ 32
├──────────────────────────────────────────────────────────────────────────────┤
│ ── DRILL-DOWN · HTF PHASE · LEVERAGE · CHART · SIGNALS ─────────────────────  │ 32
├──────────────────────────────┬───────────────────────────────────────────────┤
│ MarketRead (§6.2)     span 7 │ CycleVector (§6.3)                     span 5 │
│ DerivativesPanel (§6.8)  · main chart with frames (§6.4/6.5) · ▸ Signal history │
└──────────────────────────────────────────────────────────────────────────────┘
```

Rows 1–4 plus the sources line form the **Vector block**; it is one `VectorView` component that renders five `section.region` panels into the shared grid (not one giant panel), so gutters and panel rules match the rest of the page. The hero and the gauges share **one** region (span 12) split internally 5/7 with a 1px `--border-subtle` vertical rule, because the gauges are the hero's evidence and must read as one unit.

Heights are content-sized except: RegimeChart body 420px; CompassPanel is `align-self: stretch` so it matches the chart row (tiles are 44px each, headline block 112px, divider 24px: 112 + 7×44 + 24 = 444, which fits the chart region's 420 + header 32).

The **Drill-down divider** is a `div.vx-divider.span-12`: `label` style `--ink-300`, text `Drill-down · HTF phase · leverage · chart · signals`, a 1px `--border-subtle` rule filling the rest of the row, 32px tall, no panel. MarketRead and CycleVector keep their own headers and content exactly as §6.2–6.3; they are not renamed.

#### 14.2.2 At 1024

- Hero/gauge region stacks internally: hero full width as a horizontal row (word + allocation left, since/inputs/notes right), then the four gauges in one row below (each gauge 128px wide). Region height ~300.
- RegimeChart span 12 at 380px. CompassPanel span 12 below it: headline block left (span 4 of an inner grid), tiles in a 4-column grid for the forward lenses and a 3-column grid for the standalone lenses, each tile 72px tall (two-line layout: name + score on line 1, band + deltas on line 2, track below).
- LevelsTable span 6, Brief span 6.
- MacroStrip wraps to two rows of three cells.
- Page padding 16px, as §2.2.

#### 14.2.3 Below 900 (stacked)

Single column, in this order: StatusBar (the view toggle stays in the bar; the price hides below 480px), RegimeHero, Gauges as a 2×2 grid (gauge 140px wide), CompassPanel (headline, then one tile per row), RegimeChart at 300px with the legend/flip row wrapping, LevelsTable (drops the `Distance` column; the distance moves into the Level cell as a second `figure-sm` line), Brief, MacroStrip as a two-column definition list, sources line, Drill-down divider, then the existing stacked order from §2.3. No horizontal page scroll.

### 14.3 Tokens

Additions to `theme.css` `:root` and `tokens.ts`. No existing token changes value or name.

#### 14.3.1 Regime palette (4)

Adapted from Vector's coral / salmon / periwinkle / royal blue to the Ledger dark surfaces. The two risk-off states share a red hue and the two risk-on states share a blue hue; strength is lightness (strong = more saturated, mild = lighter/pastel). Red↔blue is safe for protan/deutan vision, and within a hue the strong/mild pair differs by ≥ 3 contrast steps, so it survives greyscale too. Text use is permitted for all four on `--surface-100/200/300`; graphics use is permitted everywhere.

| State (API) | Token | Value | Word shown | Contrast on `--surface-100` / `-200` / `-300` |
|---|---|---|---|---|
| `strong_risk_off` | `--regime-strong-off` | `#f66a6a` | `STRONG RISK-OFF` | 6.3 / 5.8 / 5.1 |
| `mild_risk_off` | `--regime-mild-off` | `#f0a894` | `MILD RISK-OFF` | 9.4 / 8.6 / 7.6 |
| `mild_risk_on` | `--regime-mild-on` | `#a9b7f7` | `MILD RISK-ON` | 9.5 / 8.7 / 7.7 |
| `strong_risk_on` | `--regime-strong-on` | `#7484f5` | `STRONG RISK-ON` | 5.6 / 5.1 / 4.5 |

All four pass 4.5:1 for text on every Ledger surface and 3:1 for graphics. `#3b4bdb` (Vector's actual royal blue) is 2.8:1 on `--surface-100` and is rejected; `#7484f5` is the nearest royal blue that passes. It sits close to `--accent` (`#5b84f0`), so inside Vector components **`--accent` is not used for fills or bars**; `--accent` keeps its §3.1 jobs (focus ring, links, segmented control) and blue fills inside the Vector block always mean "Risk-On".

Binding: the regime words are `RISK-ON` / `RISK-OFF` with `STRONG` / `MILD`. The Vector marketing labels (Euphoria, Accumulation, Caution, Capitulation) are **never shown**; they collide with the HTF phase vocabulary in §3.3.

#### 14.3.2 Compass band ramp (5)

Positional, lowest → highest band, aliased onto the regime palette so the user learns one vocabulary (low = red/off, high = blue/on):

| Band index (score) | Token | Value |
|---|---|---|
| 1 (0–20) | `--band-1` | `var(--regime-strong-off)` |
| 2 (20–40) | `--band-2` | `var(--regime-mild-off)` |
| 3 (40–60) | `--band-3` | `#9aa3ad` (same value as `--st-neutral`) |
| 4 (60–80) | `--band-4` | `var(--regime-mild-on)` |
| 5 (80–100) | `--band-5` | `var(--regime-strong-on)` |

The ramp is used **only** for the headline and the four forward lenses, where high genuinely means risk-on. The three standalone lenses (Cycle Position, Derivatives, Rotation) have no good/bad direction (a high Cycle score is euphoria, which is amber in the rest of the app), so their tiles are **monochrome**: track segments `--ink-300`, score `--ink-100`. The pole words carry the meaning. Band index is derived client-side from the score (`floor(score / 20)`, 100 → 5) because D4 fixes bands at 20/40/60/80.

`tokens.ts` additions: `REGIME_VAR: Record<RegimeState, string>`, `REGIME_TOKEN` (the `var()` form, built like `PHASE_TOKEN`), `REGIME_WORD: Record<RegimeState, string>`, `BAND_VAR: readonly [string, string, string, string, string]`. Charts resolve hex through the existing `css()` helper.

#### 14.3.3 Typography: the regime word

Swissblock prints its big number in a serif. **Decision: no serif.** Ledger has one UI face and one mono face, every live figure and every phase word is already Plex Mono, and a third family for a single element would read as a different product bolted on. Instead the hero gets one new role:

| Role | Font | Size / line | Weight | Use |
|---|---|---|---|---|
| `figure-xl` | mono | 36 / 40 (28 / 32 below 900) | 500 | the regime word in RegimeHero, nothing else |

Add `.t-figure-xl` next to the other roles in `theme.css`. The word is uppercase mono, letter-spacing `0.02em`, coloured with its regime token; it is the only element on the page in this role, which is what makes it the headline. The Compass headline score stays at `figure-lg` so it does not compete.

### 14.4 Components

All live under `components/vector/`. Each receives already-typed slices of the `/api/vector` response (`Vector` type in `api.ts`, mirrored from SPEC 4.4) and computes **nothing but pixel positions and string formatting**. Constants that mirror MODEL.md §8 thresholds live in one file, `components/vector/scales.ts`, with a comment pointing at MODEL.md §8; if the model moves a threshold, that file changes, nothing else.

Class prefix `.vx-`. Shared states per component unless stated: `loading` renders the region header and a flat `--surface-200` block of the final height (§7); `error` renders `failed to load — retry` (§7 partial state); the retry callback is one `retryVector()` shared by the block.

#### 14.4.1 `RegimeHero`

Props: `regime: Vector["regime"]`, `asOf: string`, `oldestInputAsOf: string`, `stale: boolean`, `brief: Vector["brief"]`, `htfPhase: HtfPhase | null` (from `overview.htf.phase`).

Anatomy (top to bottom inside the hero cell, which has a 3px left border in the regime colour, `padding-left: 13px` so content aligns with 16px):

```
▌STRONG RISK-ON                               ← figure-xl, --regime-strong-on
▌100% BTC  [████████████████████████████████]  ← allocation bar
▌since 2026-08-21 · day 41                    ← figure-sm --ink-200
▌inputs as of 2026-09-29        [● stale]     ← figure-sm --ink-300 (+ pill when stale)
▌HTF phase reads DISTRIBUTION — the cycle     ← body --ink-200, only when they disagree
▌frame disagrees with the regime.
▌CONFIRM     a daily close above $86.0K …     ← label --ink-300 + body --ink-200
▌INVALIDATE  a daily close below $77.2K …
```

- **Word:** `REGIME_WORD[regime.state]`. Null state → `—` in `--ink-300` and the left border `--border`.
- **Allocation bar:** `{allocation}% BTC` in `figure` `--ink-100`, then a 160px × 8px track `--surface-300` radius 4 filled from the left to `allocation%` in the regime colour. `role="meter" aria-valuemin=0 aria-valuemax=100 aria-valuenow={allocation} aria-valuetext="{allocation}% BTC"`. The remainder is cash; print `· {100 − allocation}% cash` in `figure-sm` `--ink-300` after the track.
- **Since:** `since {fmtDate(regime.since)} · day {daysBetween(regime.since, asOf)}`. Day count is `floor((asOf − since) / 86 400 000)`; day 0 on the flip day.
- **Inputs as-of (D8):** always printed: `inputs as of {fmtDate(oldestInputAsOf)}`. When `stale` is true, append the pill `● stale · carrying forward` (`--warning` on `--warning-subtle`, §3.5 pill shape) and give the whole hero/gauge region a 1px `--warning` top border (same rule MarketRead uses).
- **D7 disagreement note:** shown only when the pair is in this table; otherwise the row is omitted (no empty space):

  | Regime | HTF phase | Note |
  |---|---|---|
  | `*_risk_on` | `distribution`, `markdown`, `capitulation` | `HTF phase reads {PHASE} — the cycle frame disagrees with the regime.` |
  | `*_risk_off` | `expansion` | `HTF phase reads EXPANSION — the cycle frame disagrees with the regime.` |

  The phase word is uppercase mono coloured with its `--ph-*` token (§3.3 rule: colour plus word). `accumulation`+off and `euphoria`+off/on are not disagreements. This table is the full rule; the implementer must not extend it.
- **Confirm / invalidate:** two rows, `label` `--ink-300` keyword in a 96px column, `body` `--ink-200` text from `brief.confirm` / `brief.invalidate`. Null → `—`.

#### 14.4.2 `Gauge` (×4, plain SVG)

Props: `label: string`, `now: number | null`, `lastWeek: number | null`, `avg52w: number | null`, `scale: GaugeScale` (from `scales.ts`), `fmt: (v: number) => string`.

`GaugeScale = { min, max, zones: { to: number; color: BandVar; word: string }[] }`. Fixed scales, in `scales.ts`:

| Gauge | API field | Display domain | Zones (upper bound → colour, word) | Source of thresholds |
|---|---|---|---|---|
| RISK | `gauges.risk` (riskOff 0–1, shown ×100) | 0–100 | 25 → `--band-4` `low risk`; 50 → `--band-3` `elevated`; 100 → `--band-2` `high risk` | SPEC 4.3 state rule (0.25 / 0.5) |
| MOMENTUM | `gauges.momentum` | −100…100 | 0 → `--band-2` `bearish`; 100 → `--band-4` `bullish` (exactly 0 → `--band-3` `flat`) | sign |
| FUNDAMENTALS | `gauges.fundamentals` | 0–100 | 40 → `--band-2` `weak`; 60 → `--band-3` `neutral`; 100 → `--band-4` `strong` | D4 band edges |
| FLOWS | `gauges.flows` (realized-cap 30d %) | −10…+10 %, clamped | 0 → `--band-2` `outflow`; 10 → `--band-4` `inflow` (exactly 0 → `flat`) | sign; domain see 14.8 |

Zones deliberately use the **mild** colours; the strong colours are reserved for the regime word and the chart, so the gauges read as evidence, not as four more verdicts.

SVG: `viewBox="0 0 160 100"`, CSS width 100% of its cell, max 168px, `preserveAspectRatio="xMidYMid meet"`.
- Arc centre (80, 84), radius 62, stroke 10, `stroke-linecap: butt`, from 180° (left, `min`) to 0° (right, `max`). Angle for value v: `θ = π × (1 − (clamp(v) − min) / (max − min))`.
- Track: full semicircle in `--surface-300`. Zone arcs: one `<path>` per zone over the track, zone colour at `opacity: 0.4`. Zones are a mnemonic; markers and the number carry the reading.
- Zone boundaries: 1px `--border-strong` radial ticks, 14px long, straddling the arc.
- **52w avg:** a 2px × 16px `--ink-300` radial tick just outside the arc (radius 68–84). Omitted when null.
- **Last week:** hollow circle r=5 on the arc centreline, stroke 1.5px `--ink-200`, no fill. Omitted when null.
- **Today:** filled circle r=5.5 in the zone colour at full opacity, with a 1.5px `--ink-100` outer ring. Drawn last. Omitted when `now` is null. If `now` is outside the domain (flows), it is drawn at the arc end and the number keeps the true value with a `›` / `‹` suffix.
- Below the arc, HTML (not SVG text): eyebrow above the SVG `label` `--ink-300`; the number `figure-lg` in the zone colour (`—` `--ink-300` when null); the zone word `body` `--ink-200`; sub-row `figure-sm` `--ink-300`: `last wk {fmt(lastWeek)} · 52w {fmt(avg52w)}` (nulls `—`).
- `role="meter" aria-valuemin={min} aria-valuemax={max} aria-valuenow={now} aria-valuetext="{label} {fmt(now)}, {word}; last week {fmt(lastWeek)}; 52-week average {fmt(avg52w)}"` on the gauge wrapper. The SVG itself is `aria-hidden`.
- One legend line under the row of four, `figure-sm` `--ink-300`, right-aligned: `● today  ○ last week  | 52w avg`.

#### 14.4.3 `RegimeChart` (lightweight-charts v5)

Props: `history: Vector["history"]`, `flips: Vector["flips"]`, `levels: Vector["levels"]`, `asOf: string`.

Region header: `Regime · BTC/USD daily · log`; right: segmented `[1Y][4Y][All]` (default `4Y`) and a toggle button `levels` (`aria-pressed`, segmented styling, single button). Body 420px (380 at 1024, 300 below 900), `ResizeObserver` as the other charts, shared chart theme §9.

Series, in draw order:
1. **Dot strip** — `HistogramSeries`, `priceScaleId: "regime"`, `scaleMargins: { top: 0.965, bottom: 0 }`, every point `value: 1`, `color` = regime hex of `history[i].state` at 85% alpha, `priceLineVisible: false`, `lastValueVisible: false`. Same technique as the LTF state strip (§6.5); reads as the Vector dot strip under the axis.
2. **Price** — `LineSeries`, `lineWidth: 1.5`, per-point `color` = regime hex of `history[i].state` (v5 `LineData.color`), `rightPriceScale.mode: Logarithmic`, `lastValueVisible: true`, `priceLineVisible: false`. Points with null `state` (before the model has enough inputs) use `--ink-300`.
3. **Flip callouts** — `createSeriesMarkers` on the price series, one per entry in `flips`, chronological 1-based index as `text`, `shape: "circle"`, `color: --ink-200`, `size: 1`, `position: "aboveBar"` when `to` is a risk-off state, `"belowBar"` when risk-on. This is the "inflection point" numbering.
4. **Key levels** — when the toggle is on: `createPriceLine` on the price series per level with non-null `value`: `color --ink-300`, `lineWidth 1`, `lineStyle: Dashed`, `axisLabelVisible: true`, `title: level.label` (proxy levels get `~` appended). Toggle default: **on at 1Y, off at 4Y/All** (lines bunch on a log scale over long ranges); changing the range preset resets the toggle to that default, after which the user's click wins until the next preset change.

Range presets: `1Y`/`4Y` → `timeScale.setVisibleRange({ from: asOf − N×365d, to: asOf })`; `All` → `fitContent()`. Double-click resets to the active preset. Scroll/zoom native.

Under the chart, one row (`figure-sm`, wraps below 900): the four regime swatches + words (`◼ strong risk-off  ◼ mild risk-off  ◼ mild risk-on  ◼ strong risk-on`), then the **last four flips** right-aligned: `③ 2026-08-21 · mild risk-off → strong risk-on · 63,420`. Older flips are listed in the row's `title`. If `flips` is empty: `no regime flips in history`.

Tooltip (HTML overlay, top-left, §6.4 style): `2025-10-12 · 110,230 · MILD RISK-OFF · risk 50 · mom −31`, the regime word coloured by its token.

`aria-label="Bitcoin daily log price coloured by Vector regime, {first date} to {asOf}"`.

#### 14.4.4 `CompassPanel`

Props: `compass: Vector["compass"]`.

Region header: `Market compass · 7 lenses · 4y percentile`. Body, top to bottom:

**Headline block** (112px): eyebrow `COMPASS · HEADLINE`; row: score `figure-lg` coloured `--band-{idx}` (`—` `--ink-300` if null), band word `body` `--ink-100` (`compass.headline.band` as the API gives it; `insufficient history` if score is null), right-aligned `7d {fmtDeltaPts(d7)} · 30d {fmtDeltaPts(d30)}` `figure-sm` `--ink-300`; below, the existing `Sparkline` (§6.9) at `height=32` over the last 365 `compass.history[].headline` points (nulls dropped; `< 2` points → the §6.8 `collecting` text at 32px), `ariaLabel="Compass headline, last 365 days"`. The 20/40/60/80 band lines are not drawn on the sparkline; the deltas carry the direction.

**Lens tiles** (7): native `<details class="vx-tile">`; the `<summary>` is the 44px row, the expanded body is the inputs table. Order is the API order; forward lenses first, then a 24px divider row with `label` text `STANDALONE · NOT IN HEADLINE` and a 1px `--border-subtle` rule, then the three standalone tiles.

Summary row anatomy (grid `1fr auto auto`, gap 12, items baseline):
```
Capital Flows            31  Light          7d +4 · 30d −12
[▮▮░░░]
```
- Name `body` `--ink-100`. Score `figure` coloured `--band-{idx}` for forward lenses, `--ink-100` for standalone. Band word `figure-sm` `--ink-200`. Deltas `figure-sm` `--ink-300`, signed integers.
- Track: five 4px-tall segments with 2px gaps, radius 2, filled up to the band index in the tile's colour (`--band-{idx}` forward, `--ink-300` standalone), empty segments `--surface-300`.
- Null score: `—`, band word `insufficient history` in `--ink-300`, empty track, deltas `—`. The tile still expands.
- Hover `--surface-200` on the summary; the native disclosure marker is hidden and replaced by a `▸`/`▾` glyph in `--ink-300` at the right edge.

Expanded body: a real `<table>` (`figure-sm`): `input | value | pct | as of`. `value` via `fmtRaw` (14.6), `pct` as `p{int}` (`—` if null), `as of` `fmtDate`. Inputs whose `asOf` is older than the lens' freshest input by > 7 days get the `as of` cell in `--warning` (text stays; colour is secondary).

#### 14.4.5 `LevelsTable`

Props: `levels: Vector["levels"]`, `price: number | null` (from `overview.price`).

Region header: `Key levels · cost-basis map`. A real `<table>` in `figure`, columns:

| Metric (left, flex) | Level (right, 10ch) | Distance (right, 8ch) | Status (10ch) |
|---|---|---|---|
| `True Market Mean` | `77,200` | `−7.7%` | `● holding` |
| `ETF cost basis ~` | `86,000` | `+2.8%` | `● lost` |

- Rows sorted by `value` descending, so the table reads as a price ladder. A **divider row** is inserted where `price` falls: a single cell spanning all columns, 1px `--border-strong` rule with centred text `price 83,675` in `figure-sm` `--ink-200`. Omitted if `price` is null.
- `proxy: true` → metric name followed by ` ~` in `--ink-300` and `title="proxy: flow-weighted ETF cost basis, inflows only"`.
- Status pill (§3.5 shape): `holding` `--positive` on `--positive-subtle`; `lost` `--negative` on `--negative-subtle`; `contested` `--warning` on `--warning-subtle`. The word is always printed. Status is literal (price above / below / crossed recently), so a resistance above price reads `lost`; that is intended and matches SPEC 4.3.
- Null `value` → `—` in Level and Distance, status cell `—`. Fewer than 5 non-null levels → a footer line `figure-sm` `--ink-300`: `{n} of {total} levels available`.
- Below 900 the Distance column is removed and the distance is printed under the level inside the Level cell.

#### 14.4.6 `MacroStrip`

Props: `macro: Vector["macro"]`.

A span-12 `section.region` with no header; body is a flex row (wraps to 3+3 at 1024, two-column `<dl>` below 900), 56px tall, cells separated by 1px `--border-subtle`. Each cell: eyebrow `label` `--ink-300`, then value `figure` `--ink-100`. Right-most cell: `as of {fmtDate(macro.asOf)}` in `figure-sm` `--ink-300`.

| Eyebrow | Field | Format |
|---|---|---|
| `DOLLAR VS 200D` | `dollarVs200d` | `fmtPercentSigned`, 1dp |
| `US 10Y` | `us10y` | `fmtYield` (2dp, `%`) |
| `US 2Y` | `us2y` | `fmtYield` |
| `FED FUNDS` | `fedFundsUpper` | `fmtYield` |
| `CURVE 10Y−2Y` | `curve` | signed, 2dp, no `%` |
| `BTC·SPX CORR 30D` | `spxCorr30d` | signed, 2dp |

No colour by sign anywhere in the strip; macro is context, not a verdict.

#### 14.4.7 `Brief`

Props: `brief: Vector["brief"]`, `wocPhase: string`.

Region header: `Brief · {wocPhase}` (e.g. `Brief · strong uptrend`, lowercase, underscores to spaces). Body: an `<ol>` with one `<li>` per sentence in `brief.sentences` (4–6). Each item: the number in `figure-sm` `--ink-300` in a 24px column, the sentence in `body` `--ink-200`, `max-width: 72ch`, 8px between items. No bullets, no bold. Confirm / invalidate are **not** repeated here (they live in the hero). Empty `sentences` → `no brief — the model has not produced a reading yet`.

#### 14.4.8 `SourcesFooter`

Props: `sources: Vector["sources"]`, `now: number`.

A span-12 `<details class="vx-sources">`, 32px summary in `figure-sm` `--ink-300`: `▸ sources · {ok} ok · {failing} failing` (`failing` omitted when 0). Expanded: a `<table>` `source | last ok | error` in `figure-sm`; `last ok` as relative age (`fmtAge`), `error` is `lastError` text in `--ink-200` or `—`. Each row starts with a status dot and word: `● ok` (`--positive`) when `lastError` is null, `● failing` (`--negative`) otherwise. Nothing else on the page changes colour because of a failing source; the hero's `stale` pill already carries that consequence.

#### 14.4.9 `VectorView` (composition)

Props: `vector: Vector | null`, `error: boolean`, `onRetry()`, `overview: Overview | null`. Renders the five regions, the sources footer and the Drill-down divider into `.app-grid` using `span-5/7/8/4/12` (add `.span-8` and `.span-4` to `theme.css`). Owns no state beyond passing props. Range preset, levels toggle and tile open/closed state are local to RegimeChart and the `<details>` elements; none persist (§13).

### 14.5 Interaction, state transitions, accessibility

- **Data flow.** `useDashboardData` fetches `/api/vector` alongside `/api/overview` on first load and whenever `health.lastRefresh` changes; it exposes `vector`, `vectorError`, `retryVector`. The payload changes once a day; no separate polling.
- **Loading.** Every Vector region renders its header and a flat `--surface-200` block: hero/gauges 210, chart 420, compass 420, levels 260, brief 160, macro 56. The chart instance is created immediately (§7).
- **Error.** All five regions show `failed to load — retry` with the shared `retryVector`; the drill-down below is unaffected (§7 partial state).
- **Stale.** `vector.stale` → hero pill + warning top border on the hero/gauge region only. `status === "stale"` from health keeps its existing effects (StatusBar pill, MarketRead border); the two are independent signals and both may show.
- **Null regime / null headline / null lens.** Each prints `—` plus its text reason (`insufficient history`), never an empty cell. The chart still draws price; null-state points are `--ink-300`.
- **Chart.** Presets, levels toggle, double-click reset as 14.4.3. No crosshair sync with the main chart (different purpose, §13).
- **Tiles.** Native `<details>`; keyboard: Tab to the summary, Enter/Space toggles. Multiple tiles may be open.
- **Focus order** follows the visual order: StatusBar controls → hero (no focusable elements) → chart controls → tiles → sources summary → drill-down.
- **A11y.** Colour is never the sole encoding: regime word, zone words, band words, status words, flip words are always printed. Gauges and the allocation bar are `role="meter"` with `aria-valuetext`. Tables are real tables. The chart and the sparkline have `aria-label`s. All new text colours meet 4.5:1 on their surfaces (14.3.1, §10); zone arcs at 40% opacity are decorative and marked so by the surrounding text. No motion.

### 14.6 Number formats (extends §5, in `format.ts`)

| Kind | Rule | Example |
|---|---|---|
| Compass score, gauge 0–100 values, percentile | integer, unsigned | `23` · `p62` |
| Compass delta (d7, d30) | `fmtDeltaPts`: signed integer, no unit | `+4` · `−12` · `0` |
| Momentum | signed integer | `+42` · `−72` |
| Risk (gauge) | `riskOff × 100`, integer | `33` |
| Flows, dollar vs 200d, level distance | `fmtPercentSigned`, 1dp | `+2.4%` · `−7.7%` |
| Yields, Fed funds | `fmtYield`: 2dp with `%` | `5.29%` |
| Curve, correlation | signed 2dp, no unit | `+0.40` · `−0.12` |
| Allocation | integer `%` | `66% BTC` |
| Day count | `day N` | `day 41` |
| Flip index | circled digit ①–⑳ in UI text; plain digit inside chart markers | `③` |
| Raw lens input (`fmtRaw`) | ≤ 4 significant digits, thousands separator above 1,000, trailing zeros trimmed | `1.561` · `83,675` · `0.0025` |
| Dates | as §5 (`YYYY-MM-DD` UTC) | |

The minus sign stays U+2212. Null stays `—`.

### 14.7 File layout additions and boundaries

```
frontend/src/
  api.ts                          + Vector, RegimeState, Lens, Level types; fetchVector()
  format.ts                       + fmtDeltaPts, fmtYield, fmtRaw, daysBetween
  tokens.ts                       + REGIME_VAR, REGIME_TOKEN, REGIME_WORD, BAND_VAR
  theme.css                       + --regime-*, --band-*, .t-figure-xl, .span-8, .span-4, .vx-* rules
  useDashboardData.ts             + vector, vectorError, retryVector
  App.tsx                         view toggle removed from body; <VectorView/> + divider above the drill-down
  components/StatusBar.tsx        + view / onViewChange props, segmented in the right cluster
  components/vector/VectorView.tsx
  components/vector/RegimeHero.tsx
  components/vector/Gauge.tsx
  components/vector/RegimeChart.tsx
  components/vector/CompassPanel.tsx   (LensTile is a local component in this file)
  components/vector/LevelsTable.tsx
  components/vector/MacroStrip.tsx
  components/vector/Brief.tsx
  components/vector/SourcesFooter.tsx
  components/vector/scales.ts          gauge domains, zones and words (mirror of MODEL.md §8)
```

Where the implementer must not freelance:
- No new fonts, no component library, no chart library beyond lightweight-charts, no CSS beyond `theme.css`.
- No regime words other than those in 14.3.1; no `--accent` fills inside the Vector block.
- The D7 table (14.4.1) and the gauge zones (14.4.2) are complete as written; do not add rows.
- Do not compute model values in the UI (no client-side percentiles, no re-deriving `riskOff`, no inventing levels). If a number is not in the payload it prints `—` and is listed in 14.8.
- Existing components (§6) are not modified by this phase except StatusBar's two new props and the App shell.
- Reuse `Sparkline` (§6.9) for the Compass headline; do not write a second sparkline.

### 14.8 API gaps (Phase 4)

Asks for the backend, with the UI fallback until each exists. Field names follow SPEC 4.4.

1. **Gauge domains.** `gauges.flows` is a raw percent with no bounds, so the arc has no fixed geometry. Propose `gauges.<key>.scale: { min: number; max: number }` for all four gauges (risk `0/1`, momentum `−100/100`, fundamentals `0/100`, flows chosen by calibration). Fallback: `scales.ts` hardcodes flows at `−10…+10 %` clamped, and the gauge marks clipped values with `›`/`‹`.
2. **Units.** Confirm: `regime.allocation` is an integer percent (`66`), `levels[].distancePct` is in percent (`−7.7`) with positive meaning the level is **above** price, `macro.dollarVs200d` is a fraction (`0.018`) like the §12 #2 ratios, `macro.us10y/us2y/fedFundsUpper/curve` are in percent points as FRED publishes them (`5.29`), `spxCorr30d` is in `[−1, 1]`. Design assumes exactly these.
3. **Timestamps.** Confirm `asOf`, `oldestInputAsOf`, `regime.since`, `compass.lenses[].inputs[].asOf`, `macro.asOf`, `sources.*.lastOk` are ISO date strings, and `flips[].t`, `history[].t`, `compass.history[].t` are epoch milliseconds like every other `t` in the API. Design assumes this split; the UI will not parse two formats for one field.
4. **Lens input units.** `compass.lenses[].inputs[].value` has no unit hint, so the expanded tile prints a generic `fmtRaw` number. Propose `inputs[].unit: "usd" | "ratio" | "pct" | "btc" | "count" | "index"` so the table can format each row properly. Not blocking.
5. **D7 note from the backend (nice-to-have).** The disagreement rule in 14.4.1 is model logic living in the UI. Propose `regime.htfNote: string | null` produced server-side from the same table; when present the UI prints it verbatim and the client table is deleted.
6. **Flip count.** `flips` is unbounded over full history; the UI lists the last four and uses chart markers for all. If history ever exceeds ~40 flips the marker numbers lose meaning; cap is a MODEL.md question (≤ 4 per year is already a calibration target), not a UI one.

### 14.9 Addendum (post-review, planner decision)

- **Stress-condition checklist (RegimeHero).** The checklist goes below the confirm/invalidate rows, as a native `<details>` closed by default. Summary line in `label` style: `stress conditions · {k} of 6 active`; `k` takes the `--regime-strong-off` colour when > 0, `--ink-300` otherwise. The open list has one row per `regime.conditions[]` item, in four columns: an on/off pill (`active` uses the strong-off colour, `clear` uses `--ink-300`; the text label is always present), the `label`, `value` in mono via `fmtRaw`, and the `asOf` date. Row height 24px, no extra region. At <900 the `asOf` column is dropped. This is the Vector "zero risk-off signals" readout, so it does not repeat the brief.
- **Gauge words for fundamentals and flows** use the band name of the matching lens (On-chain Fundamentals / Capital Flows), so the gauge and the Compass tile never disagree. Risk and momentum keep their `scales.ts` words.
- **Flip markers:** every flip gets a marker. Only the last four carry numbers, and those numbers match the flip list under the chart. Older flips show an unnumbered dot.
- **Staleness:** the hero shows the stale pill when `vector.stale` is true **or** when `now − asOf > 3 days`, because the static export freezes `stale` at export time.
