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
