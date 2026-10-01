// HTF (daily) model. Pure functions only. See docs/MODEL.md section 1.
import type { Candle } from "../types";
import { clamp, sma, roc, realizedVol, percentileRank, commitWithHysteresis, DAY as DAY_MS } from "./indicators";

export type HtfPhase =
  | "accumulation"
  | "expansion"
  | "euphoria"
  | "distribution"
  | "markdown"
  | "capitulation";

export type HtfPoint = Candle & {
  sma200: number | null;
  sma50: number | null;
  mayer: number | null;
  mayerPct: number | null;
  drawdown: number | null;
  sma200Slope30: number | null;
  roc30: number | null;
  roc365: number | null;
  rv30: number | null;
  rv30Pct: number | null;
  daysSinceLow365: number;
  tMayer: number | null;
  tSlope: number | null;
  tCross: number | null;
  hMayer: number | null;
  hDrawdown: number | null;
  hRoc365: number | null;
  trend: number | null; // T
  heat: number | null; // H
  rawPhase: HtfPhase | null;
  phase: HtfPhase | null; // committed
};

export const HALVINGS = [
  Date.UTC(2012, 10, 28),
  Date.UTC(2016, 6, 9),
  Date.UTC(2020, 4, 11),
  Date.UTC(2024, 3, 20),
] as const;

export const NEXT_HALVING_ESTIMATE = Date.UTC(2028, 3, 15);

export type CycleInfo = {
  lastHalving: number | null;
  daysSinceHalving: number | null;
  cycleProgress: number | null;
  nextHalvingEstimate: number;
};

/** MODEL 1.3. Cycle is context only, feeds no score. */
export function cycleInfo(t: number): CycleInfo {
  let lastHalving: number | null = null;
  for (const h of HALVINGS) {
    if (h <= t) lastHalving = h;
  }
  if (lastHalving == null) {
    return { lastHalving: null, daysSinceHalving: null, cycleProgress: null, nextHalvingEstimate: NEXT_HALVING_ESTIMATE };
  }
  const daysSinceHalving = Math.floor((t - lastHalving) / DAY_MS);
  const cycleProgress = clamp(daysSinceHalving / 1460, 0, 1);
  return { lastHalving, daysSinceHalving, cycleProgress, nextHalvingEstimate: NEXT_HALVING_ESTIMATE };
}

/** Floor to UTC day and forward-fill missing days (MODEL 1.1). */
function fillGaps(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const out: Candle[] = [];
  for (const raw of candles) {
    const t = Math.floor(raw.t / DAY_MS) * DAY_MS;
    const cur = { ...raw, t };
    if (out.length === 0) {
      out.push(cur);
      continue;
    }
    let prev = out[out.length - 1];
    while (prev.t + DAY_MS < cur.t) {
      const gapT = prev.t + DAY_MS;
      out.push({ t: gapT, o: prev.c, h: prev.c, l: prev.c, c: prev.c, v: 0, src: prev.src });
      prev = out[out.length - 1];
    }
    out.push(cur);
  }
  return out;
}

function rawPhaseOf(p: {
  T: number | null;
  H: number | null;
  c: number;
  sma50: number | null;
  drawdown: number;
  roc30: number | null;
  daysSinceLow365: number;
}): HtfPhase | null {
  const { T, H, c, sma50, drawdown, roc30, daysSinceLow365 } = p;
  if (T == null || H == null) return null;
  if ((H <= -0.6 && daysSinceLow365 <= 30) || (roc30 != null && roc30 <= -0.3 && drawdown <= -0.5 && T < 0)) {
    return "capitulation";
  }
  if (H >= 0.75 && T >= 0.3) return "euphoria";
  if (H <= -0.35 && daysSinceLow365 > 30) return "accumulation";
  if (H >= 0.2 && sma50 != null && c < sma50 && T > -0.25) return "distribution";
  if (T >= 0.25) return "expansion";
  if (T <= -0.25) return "markdown";
  return H > 0 ? "distribution" : "accumulation";
}

export function computeHtf(daily: Candle[], now: number): HtfPoint[] {
  const closed = daily.filter((x) => x.t + DAY_MS <= now);
  const filled = fillGaps(closed);
  const n = filled.length;
  const c = filled.map((x) => x.c);

  const sma50 = sma(c, 50);
  const sma200 = sma(c, 200);
  const mayer = c.map((x, i) => (sma200[i] == null ? null : x / (sma200[i] as number)));
  const mayerPct = percentileRank(mayer, 1460, 365);

  let ath = -Infinity;
  const drawdown: number[] = c.map((x) => {
    ath = Math.max(ath, x);
    return x / ath - 1;
  });

  const sma200Slope30 = sma200.map((v, i) =>
    i >= 30 && v != null && sma200[i - 30] != null ? (v as number) / (sma200[i - 30] as number) - 1 : null,
  );
  const roc30 = roc(c, 30);
  const roc365 = roc(c, 365);
  const rv30 = realizedVol(c, 30, 365);
  const rv30Pct = percentileRank(rv30, 1460, 365);

  const daysSinceLow365: number[] = c.map((_, i) => {
    let b = i;
    for (let j = Math.max(0, i - 364); j <= i; j++) if (c[j] <= c[b]) b = j;
    return i - b;
  });

  const tMayer = mayer.map((m) => (m == null ? null : Math.tanh(Math.log(m) / 0.15)));
  const tSlope = sma200Slope30.map((s) => (s == null ? null : Math.tanh(s / 0.04)));
  const tCross = sma50.map((s50, i) =>
    s50 == null || sma200[i] == null ? null : Math.tanh(Math.log((s50 as number) / (sma200[i] as number)) / 0.1),
  );
  const T: (number | null)[] = c.map((_, i) => {
    const a = tMayer[i];
    const b = tSlope[i];
    const e = tCross[i];
    if (a == null || b == null || e == null) return null;
    return 0.35 * a + 0.35 * b + 0.3 * e;
  });

  const hMayer = mayerPct.map((p) => (p == null ? null : 2 * p - 1));
  const hDrawdown = drawdown.map((d) => clamp(1 + d / 0.4));
  const hRoc365 = roc365.map((r) => (r == null ? null : Math.tanh(Math.log(1 + r) / 1.0)));
  const H: (number | null)[] = c.map((_, i) => {
    const a = hMayer[i];
    const b = hDrawdown[i];
    const e = hRoc365[i];
    if (a == null || b == null || e == null) return null;
    return 0.5 * a + 0.25 * b + 0.25 * e;
  });

  const rawPhase: (HtfPhase | null)[] = c.map((x, i) =>
    rawPhaseOf({
      T: T[i],
      H: H[i],
      c: x,
      sma50: sma50[i],
      drawdown: drawdown[i],
      roc30: roc30[i],
      daysSinceLow365: daysSinceLow365[i],
    }),
  );

  const committed = commitWithHysteresis(
    rawPhase,
    (r) => (r === "euphoria" || r === "capitulation" ? 5 : 14),
    28,
  ) as (HtfPhase | null)[];

  const points: HtfPoint[] = [];
  for (let i = 0; i < n; i++) {
    points.push({
      ...filled[i],
      sma200: sma200[i],
      sma50: sma50[i],
      mayer: mayer[i],
      mayerPct: mayerPct[i],
      drawdown: drawdown[i],
      sma200Slope30: sma200Slope30[i],
      roc30: roc30[i],
      roc365: roc365[i],
      rv30: rv30[i],
      rv30Pct: rv30Pct[i],
      daysSinceLow365: daysSinceLow365[i],
      tMayer: tMayer[i],
      tSlope: tSlope[i],
      tCross: tCross[i],
      hMayer: hMayer[i],
      hDrawdown: hDrawdown[i],
      hRoc365: hRoc365[i],
      trend: T[i],
      heat: H[i],
      rawPhase: rawPhase[i],
      phase: committed[i],
    });
  }
  return points;
}

function weekStartOf(t: number): number {
  return Math.floor((t - 345_600_000) / 604_800_000) * 604_800_000 + 345_600_000;
}

/** MODEL 1.8. Groups daily points into weekly bars; indicator fields copy the week's last day. */
export function resampleWeekly(points: HtfPoint[]): HtfPoint[] {
  const out: HtfPoint[] = [];
  let groupStart = -1;
  let group: HtfPoint[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const last = group[group.length - 1];
    out.push({
      ...last,
      t: groupStart,
      o: group[0].o,
      h: Math.max(...group.map((p) => p.h)),
      l: Math.min(...group.map((p) => p.l)),
      c: last.c,
      v: group.reduce((a, p) => a + p.v, 0),
      src: last.src,
    });
  };
  for (const p of points) {
    const ws = weekStartOf(p.t);
    if (ws !== groupStart) {
      flush();
      groupStart = ws;
      group = [];
    }
    group.push(p);
  }
  flush();
  return out;
}
