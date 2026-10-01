// Pure indicator functions. No IO, no fetch. See docs/MODEL.md section 0/1.2/2.2.

export function clamp(x: number, a = -1, b = 1): number {
  return Math.min(b, Math.max(a, x));
}

/** Weighted blend with renormalization over non-null parts (MODEL 0). null if none available. */
export function blend(parts: Array<[weight: number, value: number | null]>): number | null {
  let wsum = 0;
  let vsum = 0;
  for (const [w, v] of parts) {
    if (v == null) continue;
    wsum += w;
    vsum += w * v;
  }
  return wsum === 0 ? null : vsum / wsum;
}

export function sma(c: number[], k: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < c.length; i++) {
    sum += c[i];
    if (i >= k) sum -= c[i - k];
    out.push(i >= k - 1 ? sum / k : null);
  }
  return out;
}

export function roc(c: number[], k: number): (number | null)[] {
  return c.map((x, i) => (i >= k ? x / c[i - k] - 1 : null));
}

/** ln(c[i]/c[i-1]); null at i=0. */
export function logReturns(c: number[]): (number | null)[] {
  return c.map((x, i) => (i > 0 ? Math.log(x / c[i - 1]) : null));
}

/** Sample stdev (n-1) of the trailing `window` log returns, annualized by sqrt(annFactor). */
export function realizedVol(c: number[], window: number, annFactor: number): (number | null)[] {
  const lr = logReturns(c);
  return c.map((_, i) => {
    if (i < window) return null;
    const w = lr.slice(i - window + 1, i + 1) as number[];
    const m = w.reduce((a, b) => a + b, 0) / window;
    const varSum = w.reduce((a, b) => a + (b - m) ** 2, 0);
    return Math.sqrt((varSum / (window - 1)) * annFactor);
  });
}

/**
 * Percentile rank of x[i] in the trailing window [i-windowSize+1..i], including x[i] itself,
 * over non-null values only. null if x[i] is null or fewer than `min` non-null values in window.
 * ponytail: naive O(n*windowSize) scan, fine for ~5500 rows at windowSize=1460.
 */
export function percentileRank(x: (number | null)[], windowSize: number, min: number): (number | null)[] {
  return x.map((v, i) => {
    if (v == null) return null;
    let lt = 0;
    let eq = 0;
    let cnt = 0;
    for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
      const y = x[j];
      if (y == null) continue;
      cnt++;
      if (y < v) lt++;
      else if (y === v) eq++;
    }
    return cnt < min ? null : (lt + 0.5 * eq) / cnt;
  });
}

/** EMA seeded with SMA(period) at index period-1 (MODEL 2.2 ema50). */
export function emaSeeded(c: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let e = 0;
  for (let i = 0; i < c.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (i === period - 1) {
      e = c.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      e = c[i] * k + e * (1 - k);
    }
    out.push(e);
  }
  return out;
}

/**
 * Generic phase/state hysteresis (MODEL 1.7 and 2.6). Walks `raw` in order with a committed
 * value that only switches once the incoming candidate has run for `needFor(candidate)` bars,
 * or (if `maxAway` given) after `maxAway` bars away from the committed value regardless of run.
 * `raw[i] == null` passes through as null (warmup) without disturbing state.
 */
export function commitWithHysteresis(
  raw: (string | null)[],
  needFor: (candidate: string) => number,
  maxAway?: number,
): (string | null)[] {
  const committed: (string | null)[] = [];
  let cur: string | null = null;
  let cand: string | null = null;
  let run = 0;
  let away = 0;
  for (const r of raw) {
    if (r == null) {
      committed.push(null);
      continue;
    }
    if (cur == null) {
      cur = r;
      committed.push(cur);
      continue;
    }
    if (r === cur) {
      cand = null;
      run = 0;
      away = 0;
    } else {
      away++;
      if (r === cand) run++;
      else {
        cand = r;
        run = 1;
      }
      const need = needFor(r);
      if (run >= need || (maxAway != null && away >= maxAway)) {
        cur = r;
        cand = null;
        run = 0;
        away = 0;
      }
    }
    committed.push(cur);
  }
  return committed;
}

/** Wilder RSI, seeded with the mean of the first `period` gains/losses (MODEL 2.2 rsi14). */
export function rsiWilder(c: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let ag = 0;
  let al = 0;
  for (let i = 0; i < c.length; i++) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const d = c[i] - c[i - 1];
    const g = Math.max(d, 0);
    const l = Math.max(-d, 0);
    if (i <= period) {
      ag += g / period;
      al += l / period;
      out.push(i === period ? (al === 0 ? 100 : 100 - 100 / (1 + ag / al)) : null);
      continue;
    }
    ag = (ag * (period - 1) + g) / period;
    al = (al * (period - 1) + l) / period;
    out.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return out;
}

export const DAY = 86_400_000;

// --- Phase 4 daily-spine helpers (MODEL 8.1). `Series` is one value per spine day, null = missing.
export type Row = { t: number; v: number };
export type Series = (number | null)[];

/**
 * Values of `rows` on a gap-free ascending daily spine, exact-day match only. With `zero`, days
 * between the first and last row that have no row read 0 (flows: no print = no flow).
 */
export function onSpine(rows: Row[], spine: number[], zero = false): Series {
  const byT = new Map(rows.map((r) => [r.t, r.v]));
  const first = rows.length ? rows[0]!.t : Infinity;
  const last = rows.length ? rows[rows.length - 1]!.t : -Infinity;
  return spine.map((t) => byT.get(t) ?? (zero && t >= first && t <= last ? 0 : null));
}

/** Forward-fill a null that follows a value, for at most `max` consecutive days (D5). */
export function carry(x: Series, max: number): Series {
  let last: number | null = null;
  let age = 0;
  return x.map((v) => {
    if (v != null) {
      last = v;
      age = 0;
      return v;
    }
    age++;
    return last != null && age <= max ? last : null;
  });
}

/** Trailing mean of x[i-k+1..i]; null if any value in the window is null. */
export function rollMean(x: Series, k: number): Series {
  return x.map((_, i) => {
    if (i < k - 1) return null;
    let s = 0;
    for (let j = i - k + 1; j <= i; j++) {
      const v = x[j];
      if (v == null) return null;
      s += v;
    }
    return s / k;
  });
}

/** x[i] / x[i-k] - 1, null-propagating. */
export function change(x: Series, k: number): Series {
  return x.map((v, i) => (i >= k && v != null && x[i - k] != null && x[i - k] !== 0 ? v / (x[i - k] as number) - 1 : null));
}

/** Elementwise a op b, null if either side is null. */
export function zip(a: Series, b: Series, f: (x: number, y: number) => number | null): Series {
  return a.map((x, i) => (x == null || b[i] == null ? null : f(x, b[i] as number)));
}
