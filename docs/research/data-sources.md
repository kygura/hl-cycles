# Data Sources Reference — Hyperliquid + BTC HTF History

Verified live against `https://api.hyperliquid.xyz/info` and public exchange APIs on 2026-09-27.
All Hyperliquid calls below are `POST` with `Content-Type: application/json`.

---

## 1. candleSnapshot

**Request:**
```json
{"type":"candleSnapshot","req":{"coin":"BTC","interval":"1d","startTime":0,"endTime":1600000000000}}
```
`interval` tested and confirmed working: `1d`, `1w`, `4h`, `1h` (same shape for all).

**Response** — array of candle objects:
```json
{"t":1597795200000,"T":1597881599999,"s":"BTC","i":"1d","o":"11962.0","c":"11763.9","h":"12037.1","l":"11574.8","v":"0.0","n":0}
```

| field | meaning | type |
|---|---|---|
| `t` | candle open time, ms epoch | number |
| `T` | candle close time, ms epoch | number |
| `s` | symbol | string |
| `i` | interval | string |
| `o`,`c`,`h`,`l` | open/close/high/low | **string** (decimal, not number) |
| `v` | volume (base coin units) | **string** |
| `n` | trade count | number |

**Earliest BTC 1d candle:** `t=1597795200000` = **2020-08-19 04:00:00 UTC**. Confirmed via `startTime:0`. Note: the earliest candles (through ~2023) show `v:"0.0"` and `n:0` — this looks like backfilled/index price data before Hyperliquid mainnet had real trading volume. Real trading volume (and funding, see below) starts appearing around **May 2023**, which lines up with Hyperliquid's actual mainnet perp launch. Treat pre-2023 candles as index-price-only, not real market activity.

No pagination param beyond `startTime`/`endTime` — just widen the window; there's no documented row cap observed in testing (a 1w query returned 106 rows cleanly).

---

## 2. fundingHistory

**Request:**
```json
{"type":"fundingHistory","coin":"BTC","startTime":0,"endTime":1790542412000}
```
(`endTime` optional, defaults to now)

**Response:**
```json
{"coin":"BTC","fundingRate":"0.0000125","premium":"-0.0003460577","time":1787950800058}
```
All numeric-looking fields (`fundingRate`, `premium`) are **strings**. `time` is a number (ms epoch).

- **Cadence:** confirmed hourly — consecutive rows differ by exactly `3599987` ms (~1h, HL funds every hour, not every 8h like Binance/Bybit).
- **Page cap:** confirmed **500 rows per call**, hard cap regardless of window width (30-day window with a wide-enough range still truncates to 500 and stops mid-period).
- **Earliest data:** `time=1683849600048` = **2023-05-12 00:00:00 UTC**. Anything requested before this returns an empty array (tested down to 2011 — always `[]`).
- **Pagination approach:** since it's capped at 500 rows (≈20.8 days of hourly data), walk forward: call with `startTime = last_row.time + 1`, repeat until an empty/short response comes back or you reach current time.

---

## 3. metaAndAssetCtxs

**Request:**
```json
{"type":"metaAndAssetCtxs"}
```

**Response:** a 2-element array `[meta, assetCtxs]`.
- `meta.universe` is an array of coin metadata objects, in index order (index = position in this array = the asset ID used elsewhere in the API).
- `assetCtxs` is a parallel array of live market-state objects, **same index order** as `universe`.

BTC is at **index 0** as of this check (`universe[0].name == "BTC"`). Don't hardcode this — always look it up by matching `name`.

Universe entry example:
```json
{"szDecimals":5,"name":"BTC","maxLeverage":40,"marginTableId":56}
```

AssetCtx entry example (BTC, live):
```json
{
  "funding":"0.0000073111",
  "openInterest":"37470.12454",
  "prevDayPx":"83995.0",
  "dayNtlVlm":"1134990950.9098792076",
  "premium":"-0.000390177",
  "oraclePx":"84577.0",
  "markPx":"84543.0",
  "midPx":"84543.5",
  "impactPxs":["84543.0","84544.0"],
  "dayBaseVlm":"13415.0319"
}
```

**Units (confirmed):**
- `openInterest` — in **BTC (coins)**, not USD. (37470 BTC × ~$84.5k ≈ $3.17B notional, sane for HL BTC-perp OI.)
- `dayNtlVlm` — 24h volume in **USD notional**.
- `dayBaseVlm` — 24h volume in **coins** (13415 BTC here, consistent: 13415 × 84.5k ≈ 1.13B ≈ `dayNtlVlm`, confirms the pairing).
- `oraclePx`, `markPx`, `midPx`, `prevDayPx` — all USD price, all strings.
- `impactPxs` — 2-element array `[bidImpactPx, askImpactPx]`, USD strings, used for liquidation/impact calcs.
- `funding` — current hourly funding rate (string, same units as fundingHistory rows).
- `premium` — mark-vs-oracle premium, same units as fundingHistory's `premium`.

---

## 4. predictedFundings

**Request:**
```json
{"type":"predictedFundings"}
```

**Response:** array of `[coinName, [[venueName, {fundingRate, nextFundingTime, fundingIntervalHours}], ...]]`. Confirmed 234 coins returned; BTC entry:
```json
["BTC", [
  ["BinPerp",  {"fundingRate":"0.00002801",  "nextFundingTime":1790553600000, "fundingIntervalHours":8}],
  ["HlPerp",   {"fundingRate":"0.0000072019","nextFundingTime":1790539200000, "fundingIntervalHours":1}],
  ["BybitPerp",{"fundingRate":"0.00004006",  "nextFundingTime":1790553600000, "fundingIntervalHours":8}]
]]
```
Confirmed cross-venue coverage includes **Binance (`BinPerp`) and Bybit (`BybitPerp`)** alongside Hyperliquid itself (`HlPerp`). Useful as a cross-venue funding-rate divergence signal — note the interval difference: HL funds hourly, Binance/Bybit fund every 8h, so compare on an annualized-rate basis, not raw rate.

---

## 5. Rate limits (info endpoint)

Not independently load-tested (would burn the call budget); per Hyperliquid docs (hyperliquid.gitbook.io → API → Rate Limits):
- Rate limiting is **weight-based per IP**, with a budget refilling over time (documented as roughly 1200 weight/minute for a base/unauthenticated IP).
- `info` requests are generally weight **2 or 20** depending on endpoint (batched/heavy endpoints like `candleSnapshot` and historical queries are weighted higher than lightweight state queries).
- Practical guidance: keep bulk historical backfills (candles, funding) throttled to a few requests/second with backoff on `429`; don't fire concurrent tight loops.
- This section is doc-derived, not independently verified against a live 429 — confirm against Hyperliquid's rate-limit doc page directly if precision matters for a production worker.

---

## 6. Keyless free long BTC daily history (pre-2020, HTF cycle context)

Tested live from this machine (no API key on any of these):

| Source | Endpoint | Earliest confirmed | Max page size | Notes |
|---|---|---|---|---|
| **Bitstamp** ✅ recommended | `GET https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&start=<unix>&limit=<n>` | **2011-09-13** (`start=1315872000` returns data; `start` before that returns `[]`) | **1000** rows confirmed working in one call | Keyless, reliable, cleanly paginatable |
| Binance | `GET https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=<ms>&limit=<n>` | 2017-08-17 (BTCUSDT pair launch) | 1000 (Binance docs) | Works keyless from this machine (not geo-blocked here), but shorter history — misses 2011–2017 |
| Kraken | `GET https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since=<unix>` | **Not usable for long history** — capped at ~720 most-recent daily rows regardless of `since` (tested `since=0` and `since=<2024 date>`, both returned the same ~720-row window ending "now") | ~720, non-paginable further back | Reject for HTF use — no real pagination |

**Recommendation: Bitstamp.** Longest keyless history (2011-09-13 onward, i.e. covers both halvings before 2020 and the run-up to them), reliable JSON, clean pagination via `start` + `limit` (max 1000/call — walk forward with `start = last_row.timestamp + 86400`).

**Exact URL template:**
```
https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&start=<unix_seconds>&limit=1000
```

**Response shape:**
```json
{"data":{"pair":"BTC/USD","ohlc":[
  {"timestamp":"1315872000","open":"5.80","high":"6.00","low":"5.65","close":"5.97","volume":"58.37138238"},
  ...
]}}
```
All numeric fields are strings. `timestamp` is **seconds**, not ms.

**Pagination approach:** loop `start = last_row.timestamp + 86400`, `limit=1000`, until response `ohlc` array is empty or shorter than requested (reached present day). ~1000 rows/call = ~2.7 years/call, so full 2011→now history is ~6 calls.

Not tested live (skipped to stay under call budget, but worth knowing as fallback/cross-check candidates): CoinGecko `market_chart` (public tier is capped to 365 days of daily granularity as of recent policy changes — likely insufficient alone for full HTF history), Coinbase Exchange candles (300-row cap, shorter history than Bitstamp), CryptoCompare `histoday` (now requires an API key per recent changes).

---

## 7. Halving dates

Confirmed against known Bitcoin protocol history (not a live-API fact, doesn't need a call):

| Halving | Date (UTC) | Block height |
|---|---|---|
| 1st | 2012-11-28 | 210,000 |
| 2nd | 2016-07-09 | 420,000 |
| 3rd | 2020-05-11 | 630,000 |
| 4th | 2024-04-20 | 840,000 |
| 5th (next, expected) | ~2028-04 | ~1,050,000 |

These are correct and match the standard record. The 2028 date is an estimate (block-interval-dependent, ±a few weeks), not a fixed date.

---

## Summary for workers

- **Intraday/recent BTC data (2023-05 onward for funding, 2020-08 onward for candles):** use Hyperliquid `candleSnapshot` + `fundingHistory` + `metaAndAssetCtxs` directly.
- **Cross-venue funding comparison:** `predictedFundings` (HL vs Binance vs Bybit).
- **Long-horizon BTC price history (2011→now) for cycle/HTF context:** use **Bitstamp OHLC**, not Hyperliquid (HL simply doesn't have it) and not Kraken (capped short window).
- All Hyperliquid numeric fields are **JSON strings** — parse to float/decimal explicitly, don't assume numeric JSON types.
