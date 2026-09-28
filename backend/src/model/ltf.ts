// LTF (4h/1h) model. Pure functions only. See docs/MODEL.md section 2.
import type { Candle, FundingRow, OiRow, Snapshot } from "../types";
import { blend, clamp, emaSeeded, realizedVol, percentileRank, roc, rsiWilder, commitWithHysteresis } from "./indicators";

export type LtfInterval = "15m" | "1h" | "4h";

export type LtfState =
  | "insufficient_data"
  | "deleveraging"
  | "crowded_long"
  | "short_squeeze_fuel"
  | "crowded_short"
  | "healthy_uptrend"
  | "downtrend"
  | "neutral";

export type LtfPoint = Candle & {
  ema50: number | null;
  rsi14: number | null;
  roc6: number | null;
  fundingApr: number | null;
  premium: number | null;
  premiumZ: number | null;
  oiUsd: number | null;
  oiChange24h: number | null;
  rv42: number | null;
  rv42Pct: number | null;
  lFunding: number | null;
  lPremium: number | null;
  lOi: number | null;
  mEma: number | null;
  mRsi: number | null;
  mRoc: number | null;
  leverage: number | null; // L (raw)
  momentum: number | null; // M (raw)
  rawState: LtfState;
  state: LtfState; // committed
};

const CONSTS: Record<LtfInterval, { BAR: number; W30: number; W90: number; BARS_PER_YEAR: number }> = {
  "4h": { BAR: 14_400_000, W30: 180, W90: 540, BARS_PER_YEAR: 2190 },
  "1h": { BAR: 3_600_000, W30: 720, W90: 2160, BARS_PER_YEAR: 8760 },
  "15m": { BAR: 900_000, W30: 2880, W90: 8640, BARS_PER_YEAR: 35040 },
};

// OHLCV resample into UTC-aligned buckets of bucketMs (SPEC.md 3.4). Used to derive alt 4h
// candles from stored 1h candles (alts don't store 4h series). A leading bucket with fewer than
// bucketMs/1h rows is dropped — it's a partial bucket from the start of the stored history, not
// a real closed bar.
export function resampleCandles(candles: Candle[], bucketMs: number): Candle[] {
  const HOUR = 3_600_000;
  const expectedRows = bucketMs / HOUR;
  const sorted = [...candles].sort((a, b) => a.t - b.t);
  const buckets = new Map<number, Candle[]>();
  for (const c of sorted) {
    const bucketT = Math.floor(c.t / bucketMs) * bucketMs;
    const arr = buckets.get(bucketT);
    if (arr) arr.push(c);
    else buckets.set(bucketT, [c]);
  }
  const bucketTs = [...buckets.keys()].sort((a, b) => a - b);
  const out: Candle[] = [];
  for (let i = 0; i < bucketTs.length; i++) {
    const t = bucketTs[i]!;
    const rows = buckets.get(t)!; // already in ascending t order (sorted input)
    if (i === 0 && rows.length < expectedRows) continue;
    out.push({
      t,
      o: rows[0]!.o,
      h: Math.max(...rows.map((r) => r.h)),
      l: Math.min(...rows.map((r) => r.l)),
      c: rows[rows.length - 1]!.c,
      v: rows.reduce((a, r) => a + r.v, 0),
      src: rows[rows.length - 1]!.src,
    });
  }
  return out;
}

const FUNDING_BASE_APR = 0.0000125 * 8760; // 0.1095

/** Rightmost index with ts[idx] <= upper and ts[idx] >= upper - windowMs, else null. ts must be ascending. */
function latestInWindow(ts: number[], upper: number, windowMs: number): number | null {
  let lo = 0;
  let hi = ts.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= upper) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx === -1) return null;
  return ts[idx] >= upper - windowMs ? idx : null;
}

function rawStateOf(
  L: number | null,
  M: number | null,
  oiChange24h: number | null,
  roc6: number | null,
): LtfState {
  if (L == null || M == null) return "insufficient_data";
  if (oiChange24h != null && oiChange24h <= -0.08 && roc6 != null && Math.abs(roc6) >= 0.03) return "deleveraging";
  if (L >= 0.5) return "crowded_long";
  if (L <= -0.25 && M >= 0.2) return "short_squeeze_fuel";
  if (L <= -0.5) return "crowded_short";
  if (M >= 0.3) return "healthy_uptrend";
  if (M <= -0.3) return "downtrend";
  return "neutral";
}

// oiHistory (Binance-proxy hourly OI, see docs/MODEL.md) is optional and only fills in where
// no snapshot is near the bar; snapshots always win when present.
export function computeLtf(
  candles: Candle[],
  funding: FundingRow[],
  snapshots: Snapshot[],
  interval: LtfInterval,
  now: number,
  oiHistory: OiRow[] = [],
): LtfPoint[] {
  const { BAR, W30, W90, BARS_PER_YEAR } = CONSTS[interval];
  const bars = candles.filter((x) => x.t + BAR <= now).sort((a, b) => a.t - b.t);
  const n = bars.length;
  const c = bars.map((x) => x.c);

  const fundingSorted = [...funding].sort((a, b) => a.t - b.t);
  const snapsSorted = [...snapshots].sort((a, b) => a.t - b.t);
  const snapTs = snapsSorted.map((s) => s.t);
  const oiHistSorted = [...oiHistory].sort((a, b) => a.t - b.t);
  const oiHistTs = oiHistSorted.map((o) => o.t);
  const OI_HISTORY_WINDOW_MS = 7_200_000; // 2h: oi-history is hourly, tolerate one missing hour

  const ema50 = emaSeeded(c, 50);
  const rsi14 = rsiWilder(c, 14);
  const roc6 = roc(c, 6);
  const rv42 = realizedVol(c, 42, BARS_PER_YEAR);
  const rv42Pct = percentileRank(rv42, W90, W30);

  const HOUR = 3_600_000;
  const fundingTs = fundingSorted.map((f) => f.t);
  const fundingApr: (number | null)[] = [];
  const premium: (number | null)[] = [];
  if (BAR < HOUR) {
    // Hyperliquid funding rows are hourly. A bar narrower than 1h has no funding row inside its
    // own [b.t, b.t+BAR) window 3 times out of 4, which starves premiumZ's W30/2 threshold and
    // leaves L null too often for commitWithHysteresis to ever commit away from insufficient_data
    // (needs 2 consecutive non-null raw states in a row). Forward-fill from the latest funding
    // row at or before the bar instead, bounded to 1h staleness so a real gap still goes null.
    for (const b of bars) {
      const idx = latestInWindow(fundingTs, b.t, HOUR);
      fundingApr.push(idx == null ? null : fundingSorted[idx].rate * 8760);
      premium.push(idx == null ? null : fundingSorted[idx].premium);
    }
  } else {
    // per-bar funding/premium aggregation: rows with bar.t <= row.t < bar.t + BAR
    let fj = 0;
    for (const b of bars) {
      while (fj < fundingSorted.length && fundingSorted[fj].t < b.t) fj++;
      let k = fj;
      let sr = 0;
      let m = 0;
      let sp = 0;
      let mp = 0; // premium averages over only the rows that HAVE a premium (Binance rows can be null)
      while (k < fundingSorted.length && fundingSorted[k].t < b.t + BAR) {
        sr += fundingSorted[k].rate;
        m++;
        const p = fundingSorted[k].premium;
        if (p != null) {
          sp += p;
          mp++;
        }
        k++;
      }
      fundingApr.push(m ? (sr / m) * 8760 : null);
      premium.push(mp ? sp / mp : null);
    }
  }

  const premiumZ: (number | null)[] = premium.map((p, i) => {
    if (p == null) return null;
    const w: number[] = [];
    for (let j = Math.max(0, i - W30); j < i; j++) {
      const v = premium[j];
      if (v != null) w.push(v);
    }
    // W30 is already sized per interval as "30 days of bars" (2880 15m bars = 720 1h bars = 180
    // 4h bars), so W30/2 is a 15-day-elapsed threshold in every interval alike -- forward-filled
    // sub-hour bars don't need a separate hourly sample count, they satisfy the same wall-clock bar
    // count once real funding data has accumulated.
    if (w.length < W30 / 2) return null;
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const variance = w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length;
    return (p - mean) / Math.max(Math.sqrt(variance), 0.0001);
  });

  // Snapshot near the bar wins; oi-history (Binance proxy) fills in only when no snapshot is near.
  type OiAt = { oiCoins: number | null; oiUsd: number | null; src: "snapshot" | "history" | null };
  function oiAt(at: number): OiAt {
    // 1h window (was 30m): 30-minute collection cadence plus GitHub cron jitter left gaps.
    const idx = latestInWindow(snapTs, at, 3_600_000);
    if (idx != null) return { oiCoins: snapsSorted[idx].oiCoins, oiUsd: snapsSorted[idx].oiUsd, src: "snapshot" };
    const hIdx = latestInWindow(oiHistTs, at, OI_HISTORY_WINDOW_MS);
    if (hIdx != null) return { oiCoins: oiHistSorted[hIdx].oiCoins, oiUsd: oiHistSorted[hIdx].oiUsd, src: "history" };
    return { oiCoins: null, oiUsd: null, src: null };
  }

  const oiUsd: (number | null)[] = [];
  const oiChange24h: (number | null)[] = [];
  for (const b of bars) {
    const closeT = b.t + BAR;
    const nowOi = oiAt(closeT);
    oiUsd.push(nowOi.oiUsd);
    const thenOi = oiAt(closeT - 86_400_000);
    // Snapshot OI (Hyperliquid, coins) and history OI (Binance proxy, a different venue/asset)
    // are not the same series: a same-value discontinuity between them would show up as a fake
    // OI change with no real leverage move behind it. Only compare two points from the same source.
    oiChange24h.push(
      nowOi.oiCoins == null || thenOi.oiCoins == null || thenOi.oiCoins <= 0 || nowOi.src !== thenOi.src
        ? null
        : nowOi.oiCoins / thenOi.oiCoins - 1,
    );
  }

  const lFunding = fundingApr.map((f) => (f == null ? null : Math.tanh((f - FUNDING_BASE_APR) / 0.1)));
  const lPremium = premiumZ.map((z) => (z == null ? null : Math.tanh(z / 2)));
  const lOi: (number | null)[] = [];
  const L: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const sideBlend = blend([
      [0.4, lFunding[i]],
      [0.3, lPremium[i]],
    ]);
    const side = sideBlend == null ? null : Math.sign(sideBlend);
    const oi = oiChange24h[i];
    const lo = side == null || oi == null ? null : side === 0 ? 0 : side * Math.tanh(oi / 0.05);
    lOi.push(lo);
    L.push(
      blend([
        [0.4, lFunding[i]],
        [0.3, lPremium[i]],
        [0.3, lo],
      ]),
    );
  }

  const mEma = ema50.map((e, i) => (e == null ? null : Math.tanh((c[i] / e - 1) / 0.03)));
  const mRsi = rsi14.map((r) => (r == null ? null : clamp((r - 50) / 25)));
  const mRoc = roc6.map((r) => (r == null ? null : Math.tanh(r / 0.04)));
  const M: (number | null)[] = c.map((_, i) =>
    blend([
      [0.4, mEma[i]],
      [0.3, mRsi[i]],
      [0.3, mRoc[i]],
    ]),
  );

  const rawState: LtfState[] = c.map((_, i) => rawStateOf(L[i], M[i], oiChange24h[i], roc6[i]));
  const committed = commitWithHysteresis(rawState, () => 2) as LtfState[];

  const points: LtfPoint[] = [];
  for (let i = 0; i < n; i++) {
    points.push({
      ...bars[i],
      ema50: ema50[i],
      rsi14: rsi14[i],
      roc6: roc6[i],
      fundingApr: fundingApr[i],
      premium: premium[i],
      premiumZ: premiumZ[i],
      oiUsd: oiUsd[i],
      oiChange24h: oiChange24h[i],
      rv42: rv42[i],
      rv42Pct: rv42Pct[i],
      lFunding: lFunding[i],
      lPremium: lPremium[i],
      lOi: lOi[i],
      mEma: mEma[i],
      mRsi: mRsi[i],
      mRoc: mRoc[i],
      leverage: L[i],
      momentum: M[i],
      rawState: rawState[i],
      state: committed[i],
    });
  }
  return points;
}
