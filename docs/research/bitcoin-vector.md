# Bitcoin Vector — reverse-engineering notes

Research date: 2026-09-30 / 2026-10-01. Goal: rebuild Glassnode's long-term BTC market view (Bitcoin Vector + the Week On-chain read that wraps it) from open data.

## 0. Sources read and an important caveat

**The Bitcoin Vector product itself is paywalled everywhere.** The actual daily regime signal lives in a Telegram bot ($749/mo). The weekly write-ups are paywalled too: "Bitcoin Vector Lite" on Substack (67 issues, all `only_paid`, checked via the Substack API) and "The Bitcoin Vector #N" on research.glassnode.com (Ghost paywall). So I put the framework together from these sources instead:

| Source | What it gave | Count |
|---|---|---|
| Gmail `insights@glassnode.com` | 18 threads. 9 are Week On-chain (WoC) teasers (Apr 29, May 6, Jul 22, Aug 12, Aug 26, Sep 2, Sep 9 full text, Sep 16, Sep 23, Sep 30). Also the Vector welcome email (Jul 13), a Vector marketing email (Jul 2), the Market Compass monthly (Sep 15), an Alpha Lab promo (Sep 24) and the Vector launch (Apr 20, via Notion) | 12 read in full |
| research.glassnode.com WoC full reports | Weeks 29–39 of 2026 (Jul 22 → Sep 30), every section and chart ID | 11 issues |
| glassnode.com/pricing/vector | Regime states, inflection list, allocation logic, track-record claims, the regime chart image | 1 |
| willywoo.substack.com/p/our-models | Official glossary of the Vector Lite models (thresholds included) | 1 |
| swissblock.substack.com free posts (2024–2025) | The legacy Swissblock report layout, including the "Speedometers" gauge panel, Risk Index, BFI and Weekly Playbook | 4 |
| research.glassnode.com/market-compass | Glassnode's 7-lens composite methodology | 1 |
| Notion "The Weekly Tape" (+ Vector launch note) | The user's own weekly tracking schema, Key Levels table and changelog from Aug 19 to Sep 30 | 2 pages |

So "Bitcoin Vector" really covers three related things. Each one maps to a layer you can rebuild:

1. **Bitcoin Vector (signal)**: Swissblock's systematic regime model, built with Willy Woo and sold by Glassnode. Output: a daily 4-state Risk-On/Off regime plus a BTC/cash allocation.
2. **Bitcoin Vector analysis (twice weekly) / Vector Lite (weekly)**: narrative reports built around Swissblock and Woo models (Risk-Off Signal, Macro Cycle Risk, Native Flows, tactical oscillators, price/liquidation targets).
3. **Week On-chain + Market Compass (free/cheap Glassnode)**: the metric-heavy weekly that lands in the inbox, often quotes the Vector regime, and is anchored by Glassnode's 7-lens composite. The Notion Weekly Tape is built from this layer.

---

## 1. Headline signal format

### 1.1 Vector regime (the core signal)
Four states, shown as a colored price line plus a strip of colored dots under the chart:

| State | Label on pricing page | Meaning / allocation |
|---|---|---|
| **Strong Risk-Off** | Capitulation | 100% cash. Structural weakness, liquidity withdrawal |
| **Mild Risk-Off** | Caution | Defensive. Woc30 described it as "one band above capitulation… a *tactical pause*" |
| **Mild Risk-On** | Accumulation | Exposure building / holding |
| **Strong Risk-On** | Euphoria | 100% BTC. "Optimal risk-on environment" |

- **The inflection is the product.** Marketing centers on the Risk-Off↔Risk-On flip dates: Risk-On on Sep 22, 2024 (100% BTC), Risk-Off on Oct 12, 2025 (100% cash, two days after the Oct 10 crash, "avoided up to 45% drawdown"), and Risk-On again on Aug 21, 2026 (100% BTC). Recent readings are published with a delay.
- **Allocation:** "Moderate Strategy" (named in the Apr 2026 launch and the Market Compass intro) moves allocation between BTC and cash. The launch also named a "Risk Index" as the second core indicator.
- **Timeframes:** "Long, mid and short-term BTC readings… individual metric per timeframe". So it has one model per horizon, not one blended number.
- **Claimed track record:** 2.07× vs unhedged hold since 2024; 4 Risk-On periods averaging +$37K each; 4 Risk-Off periods dodging up to $45K each.
- **Regime path in 2026 (from emails and WoC):** Strong Risk-Off "deep in capitulation" on Jul 2. Mild Risk-Off "tactical pause" around Jul 22. Risk-On from Aug 21 (pricing page last updated Aug 31).

### 1.2 Vector Lite model outputs (Woo/Swissblock glossary)
- **Swissblock Tactical | Strategic regime**: STRATEGIC means a strong directional trend ("ride it, don't overtrade"). TACTICAL means range-bound and reactive ("use weakness for entries, take profit faster").
- **Swissblock Risk-Off Signal** (0–1): 0 is low risk; 0–0.25 is moderate risk-off ("caution"); 0.25–1.0 is high risk-off ("forced selling/capitulation likely"). Described as an on-chain model of "statistical investor behavior" that detects fragility before major sell-offs.
- **Willy Woo Macro Cycle Risk (MCR)** (0–100%): a liquidity view. It rises to ~100% late in bull markets, stays ~100% through the bear, and drops to 0% when liquidity returns at the macro bottom. Low means liquidity supports rallies.
- **Willy Woo Tactical Positioning oscillators**: *Investor VWAP* (on-chain buy price, flags overbought/oversold), *Speculation* (amount of long-biased derivatives betting; high = headwind), *SOPR* (profit on coins sold; peaks = profit-taking dominant), *Urgency* (which side of the order book is most impatient).
- **Willy Woo Native Flows Model**: size of capital flowing into BTC, plus a fast "microstructure" signal. Rising flows + microstructure = bullish. Declining = bearish. Sideways or divergent = chop driven by liquidations.
- **Price targets**: *technical* (classic TA levels) and *liquidation* (modeled clusters; the end of a cluster is the squeeze target).

### 1.3 Legacy Swissblock gauges (what the Vector report grew out of)
The "Speedometers" panel has four semicircle gauges. Each shows a big number, a label, "today", plus *last week* and *52w avg* values underneath:

| Gauge | Scale | Labels | Example (Aug 7, 2024) |
|---|---|---|---|
| Market Type | 0–100 | Bitcoin ↔ Altcoin (who leads) | 7 Bitcoin |
| Market Risk (Bitcoin Risk Index) | 0–100 | Low Risk / High Risk (>25 = high-risk territory; 100 = max) | 52 High Risk (last wk 0) |
| Price Momentum | −100…+100 | Bearish / Neutral / Bullish | −72 Bearish |
| Onchain Fundamentals (BFI) | 0–100 | Bearish / Neutral / Bullish (above 60 = strength; it has a "neutral channel" and a "positive quadrant") | 61 Bullish |

Supporting charts in those reports: Bitcoin Risk Index time series, Risk Oscillator (healthy around 0.5), "Key Risk Elements" (intraday vs interday volatility, loss-selling), Bitcoin Price Momentum, BFI time series, "Network Growth vs Liquidity", Fear & Greed, LTH net position change (Glassnode), then a "Weekly Playbook" (zones to buy, avoid and chase) and "Key Takeaways".

### 1.4 Glassnode Market Compass (the composite the WoC leans on)
- **7 lenses**, each scored 0–100 as a percentile against its own multi-year history and mapped to **5 named bands**. Each lens shows its 7d and 30d change.
- **Headline composite = average of the 4 forward-looking lenses**, running from Risk-Off through Defensive … to Risk-On:
  - Macro: Tightening/Restrictive → Expansionary (DXY vs 200DMA, yield curve, front-end policy path). "A DXY close back below its 200-day average is the single most important threshold in the framework."
  - Capital Flows & Liquidity: Drained → Light → Flush (stablecoin 30d RoC, exchange balances, spot net buying, ETF flows, accumulator stock).
  - Investor Behaviour: Distributing → Soft → Accumulating (LTH share of supply, Hodler Net Position, Accumulation Trend Score; "firm" once ATS > 0.5).
  - On-Chain Fundamentals: Contracting → Soft → Hot (new users/participation, valuation vs settlement throughput, blockspace demand in native BTC; fee momentum > 1.0 = demand turning up).
- **3 standalone lenses**, kept out of the headline on purpose:
  - Cycle Position: Capitulation → Euphoria (Realized P/L Ratio, price vs Realized Price, profitability).
  - Derivatives: Deleveraged → Light → Frothy (OI vs mcap, funding, term structure, DVOL, 25d skew).
  - Cross-Asset Rotation: BTC Season → Altseason (Altcoin Season Index, sector returns).
- **Cycle board**: 45 cycle indicators bucketed cold→hot. They track the "cold share" (peaked at 82% the week of Jun 29, 2026; 2% by Sep 7) and the median (neutral boundary = 40; "majority above 50" = cycle turned).
- Composite path: 14 Risk-Off (Jun 18), Risk-Off → Defensive (late Jul), **23/100 Defensive** (Sep 15 email; Macro back to Restrictive when DXY returned to its 200DMA).

---

## 2. Newsletter structure (the WoC template, stable across 11 issues)

1. **Subject = 2–4 word metaphor** ("Strength Meets a Wall", "Escape Velocity", "Breakdown into Thin Support", "Trigger Happy", "Paid to Wait"). Vector Lite uses song/film titles ("Break on Through", "Ghosts of Breakouts Past") and always opens with "Last week in BVLxxx, …".
2. **One-sentence dek** that states the regime plus the binding constraint.
3. **Executive Summary**: 5–6 bullets, one per section.
4. **Body in themed blocks.** The common pattern is **Macro Insight → On-chain Insight → Off-chain Insight** (wk 29, 30, 33). Newer issues use thematic headers ("The ETF Bid Cools", "Support Below", "A Wall Overhead", "Altcoins Pause, Leverage Waits"). Each sub-section is the same unit:
   - H3 claim headline ("Never Below the Realized Price").
   - 2 short paragraphs: what the metric is (one plain-English definition), today's value vs history.
   - **One chart** with a sentence-style caption and a "Live Chart" link.
   - **A falsifiable "what would change this" line** ("A daily close below $77.2K would end the current stretch").
5. **Market Compass tie-in** ("The Compass Agrees") and sometimes **"The Verdict: The Vector Stayed Out"**, which quotes the Vector regime.
6. **Conclusion**: one paragraph with explicit **confirm** and **invalidate** conditions, always as price levels plus a flow condition.
7. **Data as-of line** per data family (daily on-chain, ETF, hourly price/book).

The recurring framing is a **map of cost-basis levels**: support below (STH cost basis, True Market Mean, Realized Price, accumulation floor) and resistance above (LTH supply wall, ETF/treasury break-even, mean MVRV price, liquidation shelf, call walls, ask wall). Then demand checks (ETF, volume, realized cap, stablecoins), seller checks (realized profit, LTH share, sell-side risk), leverage checks (funding, OI in coins, skew), and macro as the "binding constraint" (10Y, DXY, 2Y vs Fed funds, real policy rate).

The user's Notion **Weekly Tape** already copies this: TL;DR → Regime Read (Phase / Dominant macro constraint / Altseason conditions) → Key Levels table (Metric | Level | Meaning | Status) → Glassnode Read → Web enrichment → Calendar → Emergent plays → Changelog.

---

## 3. Composite / signal logic (as far as it can be inferred)

**Vector (paywalled, inferred):**
- Inputs fall into four families, the same ones the Swissblock gauges show: **risk** (Risk Index / Risk-Off Signal: on-chain behavioural stress such as loss realization, volatility regime, STH behaviour), **momentum** (price momentum −100…100, plus "momentum thresholds" on the Swissblock product page), **fundamentals** (BFI = network growth + liquidity), and **liquidity/flows** (Woo's Native Flows / MCR = capital entering the network).
- Swissblock's own description: "evaluates momentum thresholds and capital flows to isolate distinct risk regimes."
- Regime ≈ a 2×2 grid. Risk-Off Signal at 0 with rising momentum/flows → Strong Risk-On. Risk-Off at 0 with fading momentum → Mild Risk-On. Risk-Off Signal 0–0.25 or momentum negative → Mild Risk-Off. Risk-Off > 0.25 with negative momentum and flows → Strong Risk-Off. Vector #01 (Apr 2025): "strong bullish structure, supported by **zero risk-off signals, rising momentum, and solid on-chain fundamentals**." That sentence is the rule in miniature.
- The allocation is binary at the extremes (100% BTC / 100% cash) and graded in between (Moderate Strategy). Flips are persistent: weeks-to-months regimes, not daily noise. The Oct 2025 → Aug 2026 Risk-Off lasted 10 months.

**Week On-chain regime phases (explicit rules they state repeatedly):**
- **Bull / strong uptrend phase**: price above both the True Market Mean and the STH cost basis ("stretches above both marked the stronger phases of the uptrend").
- **Bear confirmed**: price breaks below both (Feb 2026).
- **Capitulation phase**: price below both AND STH cost basis < TMM (coins changing hands below both cohorts' cost).
- **Break confirmation**: one daily close below TMM is a slip. A second close confirms the break. "Two daily closes back above with Realized Cap growing" restores it.
- **Seller exhaustion / bottom**: Realized P/L Ratio (90d SMA) < 0.5. Regime change only when it reclaims 2. Seller Exhaustion Constant in its historical floor zone. Supply in profit near ~50%. Relative Unrealized Loss stress (prior bottoms > 60%).
- **Top warning**: Sell-Side Risk Ratio spikes (23–35 bp/day at 2025 tops). LTH share of realized profit high. 90d change in altcoin share ≥ +2.8 pt with BTC near its ATH. Share of alts paying above-neutral funding high. Cycle board majority hot.
- **Macro ceiling**: 10Y > 4.45% and DXY > 99 "capped this cycle's advances". The Compass's single key threshold is DXY vs its 200DMA.

**Market Compass:** percentile-rank each indicator over a multi-year history, average within each lens (0–100), then average the 4 forward lenses into the headline, mapped to 5 bands. This is fully replicable as an architecture.

**Suggested open rebuild:** build the Compass architecture (percentile-ranked lenses) as the "map", and a Vector-style 4-state regime as the "act" layer: risk (STH-SOPR / price vs STH-CB / loss realization / volatility), momentum (trend score), flows (realized-cap 30d Δ + ETF + stablecoin RoC), with the 2×2 rule above.

---

## 4. Metric catalogue

Frequency = number of the 11 WoC issues (wk 29–39) where the metric carries a section or a key claim, by manual read. "Tape" = a row in the Notion Key Levels table (tracked weekly).
Replicability: **exact** = same definition from open data · **proxy** = close substitute · **no** = needs proprietary entity labels or a paid feed.
Endpoint status was probed live on 2026-09-30 (✅ 200 keyless, ⚠️ works with limits, ❌ blocked/keyed).

### 4.1 On-chain valuation / cost basis

| Metric | Measures | How they read it | Freq | Open source | Repl. |
|---|---|---|---|---|---|
| **STH Cost Basis** (realized price of coins <155d) | Avg entry of recent buyers | Above = recent buyers in profit / support. Approached from below in a downtrend = rejection zone. Below + under TMM = capitulation | 10/11 + tape | `bitcoin-data.com/v1/sth-realized-price` ⚠️ (keyless, 10 req/h, last 7d delayed) | exact (delayed); self-compute needs full node UTXO set |
| **True Market Mean** (investor cap / active supply) | Avg cost of *active* investors | Daily close below ends uptrend stretch; 2nd close confirms break; main bull/bear line | 5/11 + tape | `bitcoin-data.com/v1/true-market-mean` ⚠️. **Note:** read 78.7K (Sep 23) vs Glassnode 77.2K, so the definitions differ slightly | proxy |
| **Realized Price** | Avg cost of all coins | Bear bottoms trade below it. 2026 never closed below (shallowest bear) | 3/11 | CoinMetrics community `CapMrktCurUSD / CapMVRVCur / SplyCur` ✅. Derived ≈ $53.6K (Sep 29); bitcoin-data `realized-price` ⚠️ $53.1K | exact |
| **Median Realized Price** | Median coin cost | "Splits every coin's cost basis", support in summer 2026 ($63.0K) | 1/11 | none keyless | no (proxy: URPD from bitcoin-data if available) |
| **Mean MVRV price** = Realized Price × long-run avg MVRV | Level where avg holder profit is back to its norm | Major resistance ($96.7K) | 1/11 + tape | CM `CapMVRVCur` history ✅, compute mean | exact |
| **MVRV / MVRV-Z** | Valuation vs cost | Cycle position | 1/11 | CM `CapMVRVCur` ✅ (1.561 on Sep 29); bitcoin-data `mvrv-zscore` ⚠️ (1.09) | exact |
| **LTH/STH Cost Basis Distribution (URPD heatmap)** | Supply clustered by acquisition price | Defines walls/floors: LTH wall $83–86K (1.07M BTC), accumulation floor $62–65K | 6/11 + tape | none keyless | **no** (proxy: volume-at-price profile from exchange OHLCV, or a self-hosted UTXO index) |
| **LTH cost basis / LTH realized price** | LTH avg entry | Context floor | 1/11 | bitcoin-data `lth-realized-price` ⚠️ ($48.8K) | exact (delayed) |
| **ETF break-even / ETF unrealized P&L** | Cost basis of ETF-created coins | Institutional ceiling (~$86K; 228 sessions below; paper loss $18B → $3.9B) | 5/11 + tape | Farside flows ❌ (Cloudflare blocks curl; needs headless/Firecrawl) + price → flow-weighted cost | proxy |
| **Corporate Treasury Cost Basis** | Listed companies' avg entry | $80.5K; under water = overhead supply, not support | 2/11 | bitcointreasuries.net (scrape) | proxy |

### 4.2 On-chain profitability / behaviour

| Metric | Measures | How read | Freq | Open source | Repl. |
|---|---|---|---|---|---|
| **Percent Supply in Profit** (all, STH, median alt) | Share of coins above cost | ~50% = bear floor zone (four prior bears ended below). STH supply in profit > 54% (the "sell line") = recent buyers sell. Alt median > 50% = recovery broad | 6/11 + tape | bitcoin-data `supply-profit` ✅ (BTC amount; ÷ supply); alt version none | exact BTC / no for alts |
| **NUPL** | Aggregate paper P/L | Never negative this cycle (2018/2022 went deep negative) | 1/11 + tape | bitcoin-data `nupl` ⚠️ (0.371) | exact |
| **Relative Unrealized Loss** | Unrealized loss / mcap | Peaked 25% this bear vs > 60% prior capitulations | 1/11 | none verified (bitcoin-data likely) | proxy |
| **Net Realized Profit/Loss (weekly)** | $ locked in | Light vs 2024/25 tops = room to run; rising toward top-week levels = distribution | 3/11 | bitcoin-data `nrpl` (unverified, rate-limited) | proxy |
| **LTH share of realized profit** | Who is selling | 88% at Aug peak → 47% → 34% → 55%. Rising into flat price = distribution | 2/11 + tape | none | no (proxy: LTH-SOPR) |
| **Realized P/L Ratio** (90d SMA) | Profits vs losses realized | < 0.5 = cyclical seller exhaustion; reclaim 2 = regime change (0.75 in Aug) | 1/11 + Compass | bitcoin-data `realized-profit-loss-ratio` (unverified) | proxy |
| **Sell-Side Risk Ratio** (7d) | (realized P + L) / realized cap | 7 bp/day = light; 16 bp Aug peak; 23–35 bp at 2025 tops | 1/11 + tape | needs realized P/L | proxy |
| **(Adjusted) SOPR, STH-SOPR** | Profit ratio of spent coins | 7d aSOPR rejected at 1.0 nine times in the bear; holding > 1 in a rally = recovery | 2/11 (+ Woo oscillator) | bitcoin-data `sopr`, `sth-sopr` ⚠️ (1.0025 / 1.0002) | exact |
| **Seller Exhaustion Constant** = % supply in profit × 30d realized vol | Seller give-up | Cycle low; bottoms form in its floor zone | 2/11 | computable: supply-in-profit + price | exact |
| **Realized Cap daily Δ / capital inflow streak** | Net new capital on-chain | 27-day inflow streak ended Sep 15. Positive daily Δ = buyers back | 1/11 + tape | CM derived (`CapMrktCurUSD/CapMVRVCur`) ✅ | exact |
| **Accumulation Trend Score by cohort** (30d) | Entity-weighted accumulation | 0.5 neutral; all 6 cohorts > 0.5 = broad bid; one cohort only = thin | 2/11 + Compass | none | **no** (proxy: exchange-balance Δ + whale counts) |
| **Entity supply by size** (1k–10k, >100k) | Whale → custodian handoff | Coins moved from whales to ETF/custody | 1/11 | none | no |
| **LTH share of supply** | Holder conviction | 88.1% multi-year high = drawdown accumulation | Compass | bitcoin-data `lth-supply` (unverified) | proxy |
| **Revived Supply 1y+** | Dormant coins moving | Spike with little exchange inflow = custody migration, not selling | 1/11 | none keyless | no |
| **Percent Entities in Profit 30d momentum** (Alpha Lab) | Direction of holders in profit | Rising 30d = long, falling = cash; on since mid-Aug ~$64K | promo + tape | none (the user already tried a CM proxy; couldn't reproduce) | proxy |

### 4.3 Exchange flows / spot market

| Metric | Measures | How read | Freq | Open source | Repl. |
|---|---|---|---|---|---|
| **Exchange Net Position Change** (30d) / balances | Coins to/from venues | Outflows = healthy withdrawal. Fading inflows without outflows = neutral | 4/11 | CM community `SplyExNtv`, `FlowInExNtv` ✅ (CM's own labels) | proxy |
| **Exchange deposit/withdrawal volume** | Activity | Both thin = disinterest (mid-bear) | 1/11 | CM `FlowInExNtv`/`FlowOutExNtv` ✅ | proxy |
| **Spot volume** (in coins and USD; + ETF volume) | Participation | Lowest since 2019 = apathy; expansion on *up* legs vs capitulation spikes on down legs; ~$6.4B/day total = rally "early & speculative" | 4/11 + tape | Binance/Coinbase/Bybit klines ✅; CoinGecko ✅ | proxy |
| **Order-book depth / walls** (Binance spot, bps bands) | Resting liquidity | Ask wall $85–85.5K tripled = cap; bids thinning = soft floor | 5/11 + tape | `api.binance.com/api/v3/depth?limit=5000` ✅ (snapshot; store history yourself) | exact (Binance) |
| **Coinbase Premium** | US spot demand | > 0 = genuine US spot buying | 1/11 | Coinbase ticker ✅ vs Binance ✅ | exact |
| **Venue share of spot volume** | Breadth across venues | Many venues gaining share = healthier | 1/11 | exchange klines | proxy |

### 4.4 ETF / institutional / liquidity

| Metric | Measures | How read | Freq | Open source | Repl. |
|---|---|---|---|---|---|
| **US Spot ETF net flows** | Institutional demand | Clearest demand signal; ~$1B/day = strong; "persistence, not size"; 7d avg −5k BTC/day = severe | **11/11** + tape | Farside ❌ (CF challenge; use Firecrawl/headless); issuer holdings CSVs (iShares) | exact (scrape) |
| **ETF + corporate treasury net buying ("rails")** | Structural bid | June 2026 −65.8K BTC record outflow; treasuries 5.9K BTC/qtr vs 89K/mo in 2025 | 3/11 | Farside + bitcointreasuries.net | proxy |
| **Stablecoin market cap & 30d growth** | Dry powder | 30d growth inside 1.5–2.9% band = best forward month; fastest growth → losses; negative = drained | 1/11 + Compass | DefiLlama `stablecoins.llama.fi/stablecoincharts/all` ✅ | exact |

### 4.5 Derivatives — futures/perps

| Metric | Measures | How read | Freq | Open source | Repl. |
|---|---|---|---|---|---|
| **Perp funding** (BTC; share of alts > 0.01%) | Leverage bias | Pinned below neutral = no long chase; only 19% of alts above neutral = no froth (far below past alt tops) | 5/11 + tape | Binance `fapi/v1/fundingRate` ✅, Bybit ✅, Hyperliquid `fundingHistory` / `metaAndAssetCtxs` ✅ (all perps → breadth) | exact |
| **Open interest (coin vs USD)** | Positioning | OI up in USD but down in coins = no new positions; coin OI shrinking in a rally = squeeze, not leverage | 4/11 | Binance `openInterestHist` ✅ (30d cap), Bybit, HL ✅ | exact |
| **OI / volume ratio** | Book staleness | > 1 day of volume = heavy book on a quiet tape, liquidations extend | 1/11 | same | exact |
| **Liquidation heatmap / record liquidations** | Where forced flows sit | Short shelf $82–86K, long cluster $60–63K; record short flush Aug 19 | 4/11 | Coinglass ❌ (key). Proxy: model levels from OI changes × leverage tiers; HL whale positions via `clearinghouseState` | proxy |
| **Hyperliquid whale net positioning** | Smart/large leverage | Net long since March = crowd positioned early | 1/11 | HL info API (leaderboard + clearinghouseState) ✅ | proxy |
| **Perp directional premium (30d)** | Paying for longs | Positive but modest = constructive, not euphoric | 1/11 | HL `premium` field ✅, Binance premiumIndex | proxy |
| **3M annualized futures basis vs 2Y UST** | Carry trade attractiveness | Basis < 2Y = desks leave (only precedent Aug 2022 → Jan 2023, ended at the cycle low) | 1/11 | Deribit quarterly futures ✅ + FRED DGS2 | exact (Deribit) |
| **Taker buy/sell (urgency, Woo)** | Order-flow aggression | Side with urgency drives price | Woo model | Binance `takerlongshortRatio` ✅, aggTrades/klines taker volume | proxy |

### 4.6 Derivatives — options

| Metric | Measures | How read | Freq | Open source | Repl. |
|---|---|---|---|---|---|
| **25-delta skew** (1w, 1m, 6m) | Put vs call premium | > 0 = paying for downside; 1w flips are the fastest sentiment gauge; collapse = hedges off | 6/11 | Deribit `get_book_summary_by_currency?kind=option` ✅ (mark_iv) + ticker greeks → interpolate 25Δ | exact-ish |
| **ATM IV / DVOL / IV term structure** | Expected vol | DVOL < 35–40 = compressed / coiled; a break below 35 or above 40 shows direction | 3/11 + Compass | Deribit `get_volatility_index_data` ✅ (DVOL ~35, Sep 27–29) | exact |
| **Upside vs downside IV** | Wing demand | Upside IV record low (~23%) = call bid vanished | 1/11 | Deribit surface | proxy |
| **Put/call ratio (OI & volume)** | Hedging demand | Year low = hedges lifted | 2/11 | Deribit book summary ✅ | exact (Deribit) |
| **Max pain / strike OI walls** | Expiry gravity, call/put walls | Max pain below spot; call walls $85K/$90K = cap | 3/11 + tape | Deribit OI per strike ✅ | exact (Deribit; Glassnode adds IBIT) |
| **Dealer gamma (GEX) by strike** | Hedging accelerant/brake | Negative gamma spot→$92K speeds moves; positive ~$95K brakes; gamma flip $82.3K | 2/11 + tape | compute from Deribit OI + BS gamma, assume dealer side | proxy |
| **Options premium flow** | Budget for calls vs puts | Swing to puts = hedging, not panic | 2/11 | Deribit trades `get_last_trades_by_currency` | proxy |
| **1M realized volatility** | Realized vol | Deep compressions have almost always resolved up | 1/11 | price ✅ | exact |

### 4.7 Macro / cross-asset

| Metric | Measures | How read | Freq | Open source | Repl. |
|---|---|---|---|---|---|
| **US 10Y yield** | Discount rate | Ceiling: 10Y > 4.45% (with DXY > 99) caps advances; 5.29% (Sep 30) highest since 2007 | 6/11 + tape | FRED `DGS10` ✅ (keyless CSV; occasionally slow) | exact |
| **2Y yield vs Fed funds** | Priced policy path | 2Y above FFR = market pricing hikes | 3/11 | FRED `DGS2`, `DFEDTARU` | exact |
| **Real policy rate** (FFR − core CPI) | Tightness | Widening = tightening without a move | 2/11 | FRED `CPILFESL` ✅ + FFR | exact |
| **Inflation expectations gap** | Expectations vs data | 3.6% vs 2.5% widest in 3y | 1/11 | FRED `MICH` / `T5YIE` | exact |
| **DXY (and vs 200DMA)** | Dollar | Above 200DMA = macro restrictive (Compass key threshold); BTC handling the dollar rally "worse than almost any on record" | 4/11 + Compass + tape | Yahoo chart API `DX-Y.NYB` ✅ (unofficial, keyless); FRED `DTWEXBGS` (broad dollar proxy) | exact (Yahoo) |
| **Core CPI / FOMC path** | Inflation, policy | Downside print gives cuts room | 5/11 | FRED `CPILFESL` ✅ | exact |
| **LEI, Consumer Confidence** | Growth momentum | Turning up = growth doing the work | 2/11 | FRED `UMCSENT` ✅; LEI is Conference Board proprietary | proxy |
| **BTC vs S&P 500** (30-session up/down capture, % sessions won, 30d correlation) | Relative strength / beta | Reacts less to down days than up days = edge; > 50% sessions won; correlation → 0 = own flows | 7/11 + tape | FRED `SP500` ✅ / Yahoo `^GSPC` + BTC price | exact |
| **Multi-asset YTD panel** (gold, oil, NDX, SX5E, DXY) | Where capital goes | BTC lagging the hard-asset bid = trades as liquidity-sensitive risk | 4/11 | Yahoo chart API ✅ (`GC=F`, `CL=F`, `^NDX`, `^STOXX50E`) | exact |

### 4.8 Cycle / rotation / technical

| Metric | Measures | How read | Freq | Open source | Repl. |
|---|---|---|---|---|---|
| **Market Compass composite + lenses** | Composite regime | 0–100, 5 bands, Risk-Off → Risk-On | 10/11 (banner) + monthly | build from components above | proxy (architecture exact) |
| **Cycle board** (45 indicators, cold share, median) | Cycle temperature | Cold share 82% → 2%; median crossing 40/50 | 2/11 + tape | build from MVRV, NUPL, SIP, Puell, RHODL, etc. | proxy |
| **Price vs 200DMA (depth & time below), drawdown from ATH** | Bear depth/duration | Shallowest bear; ~3/4 of the typical time served | 1/11 | price ✅ | exact |
| **Altcoin breadth** (% top-500 beating BTC 7d/30d, % at 30d high, % above 20/50DMA) | Rotation breadth | 72.5% beat BTC (Sep 22); 6% at 30d high (Sep 30); 50DMA share halving = alt top | 6/11 + tape | CoinGecko markets ✅ (rate-limited), Binance klines, HL candles | exact (own universe) |
| **Altcoin share of mcap, 90d Δ / BTC dominance** | Rotation intensity | ≥ +2.8 pt in 90d near BTC ATH = top warning; −0.9 pt now | 2/11 + tape | CoinGecko `/global` ✅ (snapshot; store daily) | exact |
| **Altcoin Season Index** | Rotation | 87.5 in Jun was relative, not a fresh bid | Compass | blockchaincenter.net (scrape) / own calc | proxy |
| **Cap-tier returns** (large vs small) | Breadth down the curve | Top-heavy = early recovery | 1/11 | CoinGecko | exact |
| **Fear & Greed** | Sentiment | Fear → cautious greed is healthy | Swissblock | `api.alternative.me/fng/` ✅ (71 Greed, Sep 29) | exact |

### 4.9 Proprietary Vector/Woo/Swissblock models — open proxies

| Model | Open proxy |
|---|---|
| Swissblock Risk-Off Signal (0–1) / Bitcoin Risk Index (0–100) | Count of stress conditions: price < STH-CB, STH-SOPR 7d < 1, loss-dominant realized P/L, vol expansion on down days, negative Coinbase premium, ETF 7d outflow. Then a percentile score |
| Price Momentum (−100…100) | Normalized blend of 20/50/200d ROC or z-scored distance from 50/200DMA, clipped to ±100 |
| BFI (Onchain Fundamentals 0–100) | Percentile of active addresses (CM `AdrActCnt` ✅ / blockchain.info ✅) growth + realized-cap 30d Δ + tx count (CM `TxCnt` ✅) + fees in BTC (CM `FeeTotNtv` ✅) |
| Native Flows / MCR | Realized-cap 30d Δ (CM derived) ± ETF flows + stablecoin RoC; MCR ≈ percentile of MVRV with flows decaying |
| Investor VWAP | Price / STH realized price (or a 30–90d volume-weighted price) as an oscillator |
| Speculation | OI / market cap (Binance `openInterestHist` gives both) × funding sign |
| Urgency | Taker buy/sell ratio, CVD |
| Market Type (BTC vs alt) | BTC dominance 30d Δ / altcoin breadth percentile |
| Liquidation targets | OI-change × leverage-tier liquidation model |

---

## 5. Top metrics by frequency (WoC wk 29–39 + Weekly Tape)

| # | Metric | Freq | Replicability |
|---|---|---|---|
| 1 | US spot ETF net flows | 11/11 | exact (Farside scrape; curl blocked) |
| 2 | STH cost basis | 10/11 | exact via bitcoin-data (7d delay, 10 req/h) |
| 3 | Market Compass composite/lenses | 10/11 | proxy (rebuild architecture) |
| 4 | BTC vs S&P 500 relative strength | 7/11 | exact (FRED/Yahoo) |
| 5 | Cost-basis distribution walls (LTH $83–86K, floor $62–65K) | 6/11 | **no** (proxy: volume profile) |
| 6 | 25-delta skew | 6/11 | exact-ish (Deribit) |
| 7 | Percent supply in profit (BTC/STH/alts) | 6/11 | exact BTC (bitcoin-data); no for alts |
| 8 | 10Y yield (+DXY macro ceiling) | 6/11 | exact (FRED, Yahoo) |
| 9 | Altcoin breadth / alt funding share | 6/11 | exact (CoinGecko/HL) |
| 10 | True Market Mean | 5/11 (+ every tape) | proxy (bitcoin-data definition differs ~2%) |
| 11 | Order-book depth / walls | 5/11 | exact (Binance depth, self-stored) |
| 12 | Perp funding | 5/11 | exact (Binance/Bybit/HL) |
| 13 | ETF / treasury break-even | 5/11 | proxy |
| 14 | Core CPI / Fed path | 5/11 | exact (FRED) |
| 15 | Liquidation heatmap | 4/11 | proxy (Coinglass keyed) |
| — | also 4/11: OI (coin vs USD), spot volume, realized profit / LTH share, exchange net position | | exact / proxy / proxy / proxy |

---

## 6. Design language

- **Tone:** calm, plain-English, declarative. One idea per sub-section. Every metric gets a one-clause definition the first time it appears ("the average price paid for coins held less than 155 days"). Hedged but falsifiable: every claim comes with "a move above/below X would…". No hype, no exclamation marks. Metaphor only in titles ("Ghosts of Breakouts Past", "Priced For Nothing, Reacting To Everything").
- **Narrative unit:** claim headline → value vs history → chart → trigger. Readers can skim the H3s and the exec bullets and still get the full story.
- **Signature visuals:**
  - **Regime-colored price line + dot strip** (Vector): four colors (strong-off coral red `~#FF5A5F`, mild-off salmon, mild-on light periwinkle, strong-on royal blue `~#3B4BDB`), numbered "INFLECTION POINT" callouts with grey dots, a legend at the bottom, and a thin categorical strip of daily dots under the time axis.
  - **Speedometer gauges** (Swissblock): semicircle arcs split red/grey/blue, a big serif number in the regime color, a label ("High Risk", "Bearish"), a white dot for last week's position and a filled dot for today, with "last week" and "52w avg" sub-values.
  - **Lens tiles with 0–100 + named band + 7d/30d deltas** (Compass).
  - **Shaded regime bands on price charts** (green where price > TMM & STH-CB, red in capitulation), **cost-basis heatmaps** (URPD stacked by cohort), **liquidation heatmaps**, **gamma-by-strike heatmaps**, **cross-sectional heatmaps for alts** (funding, supply in profit across the top 500), "demand recovery stack" (blue above / red below a trailing baseline).
  - **Circled current reading** at the right edge plus **historical analog markers** (rings around prior bear stays, circles at prior floors).
- **What makes it appealing:** one regime word up top, a small set of named levels the reader can watch (a "map" of support/resistance from cost bases), every chart tied to an action trigger, history used as precedent ("only one other stretch on record…"), and continuity across issues ("Last week this report named $84K…"). The Notion Tape's Key Levels table with a Status column (Holding / Contested / Stale) captures most of that value in one table.

---

## 7. Baseline readings (most recent)

| Reading | Value | Date / source |
|---|---|---|
| Vector regime | **Risk-On (100% BTC)** since Aug 21, 2026 10:00 UTC | pricing page (updated Aug 31) |
| Market Compass composite | **23/100 Defensive**, Macro Restrictive | Sep 15 email |
| BTC price | ~$83.4–83.8K; spiked to $85,619 and was rejected | Sep 30 (Tape, WoC 39) |
| STH cost basis | **$73.3K** (Sep 30) · $71.3K (Sep 16) · open proxy $72,798 (bitcoin-data, Sep 23) | WoC 39 / 37 |
| True Market Mean | **$77.2K**, held since Sep 18 · $76.7K (Sep 16) · open proxy $78,742 (Sep 23) | WoC 39 / 37 |
| Realized price | ~$53.5K (Glassnode Jun) · CM-derived ≈ $53.6K (Sep 29) · bitcoin-data $53,093 (Sep 23) | |
| Mean MVRV price | $96.7K (next major resistance) | WoC 38 |
| LTH supply band / ask wall | $84–85K / Binance asks $85–85.5K, tripled since Sep 24 | WoC 38/39 |
| Dealer gamma | negative spot→$92K, positive brake ~$95K | WoC 38 (Sep 21 data) |
| ETF flows | ~$1B/day Sep 21–22 → $24M Sep 28; $1.3B over 5d (Sep 23); −$334M Sep 8–14 | WoC 37–39 |
| ETF / treasury break-even | ~$86K / $80.5K | WoC 36/37 |
| LTH share of realized profit | 34% → **55%** | WoC 39 (to Sep 29) |
| Sell-side risk ratio | 7 bp/day (Aug peak 16) | WoC 36 (Sep 7) |
| Total BTC volume (spot+ETF) | ~$6.4B/day, near post-ETF low | WoC 39 |
| Stablecoin mcap | ~$301B, flat, ~4% below the Apr peak | WoC 37 (Sep 14) |
| Realized cap | 27-day inflow streak ended Sep 15 | WoC 37 |
| Cycle board | cold share 2% (peak 82% wk of Jun 29); median near 40 | WoC 36 / 34 |
| Alts | 6% at 30d high (from 49%); 19% above-neutral funding; median alt SIP 23% | WoC 39 |
| Macro | 10Y 5.29%, 2Y 4.89%, 30Y 5.64% (Sep 30); DXY ~100.9 (Sep 23); FFR 3.75–4.00% after the Sep 16 hike; core PCE 2.9% | Tape |
| Open-data spot checks (my probes) | CM MVRV 1.561, price $83,675 (Sep 29) · bitcoin-data NUPL 0.371, MVRV-Z 1.09, SOPR 1.0025, STH-SOPR 1.0002, LTH RP $48,778 (Sep 23) · DVOL ~35 (Sep 27–29) · F&G 71 Greed (Sep 29) · Binance funding 0.0066%/8h, HL 0.00125%/h (Sep 30) · Binance OI 92.5K BTC (Sep 29) | live |

---

## 8. Endpoint verification log (2026-09-30)

| Endpoint | Status | Notes |
|---|---|---|
| CoinMetrics community `/v4/timeseries/asset-metrics` | ✅ keyless | Free: `PriceUSD, CapMrktCurUSD, CapMVRVCur, SplyCur, AdrActCnt, TxCnt, HashRate, FeeTotNtv, FlowInExNtv, SplyExNtv`. **`CapRealUSD` is 403**; derive realized cap = mcap / MVRV |
| bitcoin-data.com (BGeometrics) `/v1/<metric>/last` | ⚠️ keyless | **10 req/hour**, last 7 days delayed (returns `delayed:true`). Works: sth/lth/realized price, TMM, NUPL, SOPR, STH-SOPR, MVRV, MVRV-Z, supply-profit. Rest unverified (hit the rate limit). Use history endpoints and cache |
| mempool.space API | ✅ | fees, hashrate |
| api.blockchain.info/charts | ✅ | addresses, tx, etc. |
| Deribit public v2 (DVOL, option book summary) | ✅ | skew/GEX/max pain/PCR computable |
| FRED `fredgraph.csv?id=` | ✅ keyless | occasionally slow (one 15s timeout, then a 200 on retry) |
| Yahoo `query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB` | ✅ | unofficial; also for SPX, gold, oil |
| stooq CSV | ❌ | JS challenge |
| Farside ETF flows | ❌ for curl | Cloudflare "Just a moment"; use Firecrawl/headless or issuer CSVs |
| Binance spot depth / fapi funding / openInterestHist / takerlongshortRatio | ✅ | openInterestHist ~30d history only |
| Bybit v5 funding | ✅ | |
| Hyperliquid info API | ✅ | already documented in `docs/research/data-sources.md` |
| DefiLlama stablecoins | ✅ | |
| alternative.me F&G | ✅ | |
| CoinGecko `/api/v3/global` | ✅ | rate-limited, keyless |
| Coinbase Exchange ticker | ✅ | |
| Coinglass (liquidations) | ❌ | key required (not tested; known) |

## 9. Not replicable with open data (and fallbacks)
- **Entity-adjusted metrics** (Accumulation Trend Score, entity cohorts, entities in profit, LTH share of realized profit, Revived supply, exchange balances by Glassnode labels). Fallback: CM exchange supply + bitcoin-data cohort series.
- **URPD / cost-basis distribution walls.** Fallback: a volume-at-price profile over STH (155d) and LTH windows from exchange candles, which gives the same "walls" qualitatively.
- **Exact True Market Mean** (Glassnode's active-supply definition). The bitcoin-data version runs ~2% higher.
- **Liquidation heatmap.** Model it from OI deltas plus leverage tiers.
- **The Vector signal itself and the Woo models.** Rebuild with the proxies in §4.9. Compare against the known flip dates (Sep 22, 2024 on; Oct 12, 2025 off; Aug 21, 2026 on) as a sanity backtest.
