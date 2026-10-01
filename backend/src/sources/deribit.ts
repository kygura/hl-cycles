// Deribit public v2 (keyless). Verified 2026-10-01:
// - get_volatility_index_data: `result.data` = [[t, open, high, low, close]] ascending, at most
//   1000 rows per call; `result.continuation` is the end_timestamp for the next (older) page, null
//   when exhausted. 1D candles are keyed by their 00:00 UTC open; the current day is partial and
//   gets overwritten by the next run.
// - get_book_summary_by_currency (kind=option): per instrument `mark_iv` (vol points),
//   `underlying_price` (the expiry's forward), `open_interest`; NO greeks.
import { z } from "zod";
import { DAY, type Row } from "../model/indicators";
import { type FetchImpl, type FetchResult, dayStart, finite, getRes, toRows } from "./daily";

const BASE = "https://www.deribit.com/api/v2/public";
const YEAR_MS = 365 * DAY;
const TARGET_T = 30 / 365;
const MAX_PAGES = 20;

// --- DVOL ---

const DvolSchema = z.object({
  result: z.object({ data: z.array(z.array(z.unknown())), continuation: z.number().nullable().optional() }),
});

export function parseDvol(json: unknown): { rows: Row[]; continuation: number | null } {
  const { data, continuation } = DvolSchema.parse(json).result;
  const pairs: [number, number][] = [];
  for (const r of data) {
    const t = finite(r[0]);
    const close = finite(r[4]);
    if (t != null && close != null && close > 0) pairs.push([t, close]);
  }
  return { rows: toRows(pairs), continuation: continuation ?? null };
}

export async function fetchDvol(since: number | null, fetchImpl: FetchImpl = fetch, now = Date.now()): Promise<FetchResult> {
  const start = since ?? 0;
  let end: number | null = now;
  const all: Row[] = [];
  for (let i = 0; end != null && end > start && i < MAX_PAGES; i++) {
    const url = `${BASE}/get_volatility_index_data?currency=BTC&resolution=1D&start_timestamp=${start}&end_timestamp=${end}`;
    const { rows, continuation } = parseDvol(await (await getRes(url, fetchImpl, "deribit dvol")).json());
    all.push(...rows);
    end = rows.length ? continuation : null;
  }
  return { series: { dvol: toRows(all.map((r) => [r.t, r.v])) } };
}

// --- 25-delta skew + put/call OI snapshot ---
//
// Method: the book summary carries no greeks, so each option's delta is recomputed from its own
// mark_iv with Black-76 on the expiry forward (underlying_price), r = 0 (Deribit marks options
// against the matching future, and reports interest_rate 0): d1 = (ln(F/K) + σ²T/2) / (σ√T),
// call Δ = N(d1), put Δ = N(d1) − 1, T = (expiry 08:00 UTC − now) / 365d. Per expiry, OTM options
// only (calls K ≥ F, puts K ≤ F), IV is linearly interpolated in |Δ| at 0.25 for each wing;
// skew = IV(25Δ put) − IV(25Δ call), in vol points (positive = puts bid / fear). The 30-day value
// is a linear interpolation in T between the two expiries that bracket 30 days.
// Put/call OI ratio = Σ put open_interest / Σ call open_interest over every listed option.

const BookSchema = z.object({
  result: z.array(
    z.object({
      instrument_name: z.string(),
      mark_iv: z.unknown(),
      underlying_price: z.unknown(),
      open_interest: z.unknown(),
    }),
  ),
});

const MONTHS: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

export function parseInstrument(name: string): { expiry: number; strike: number; isCall: boolean } | null {
  const m = /^BTC-(\d{1,2})([A-Z]{3})(\d{2})-(\d+)-([CP])$/.exec(name);
  if (!m || MONTHS[m[2]!] == null) return null;
  return {
    expiry: Date.UTC(2000 + Number(m[3]), MONTHS[m[2]!]!, Number(m[1]), 8),
    strike: Number(m[4]),
    isCall: m[5] === "C",
  };
}

// Standard normal CDF via the Abramowitz–Stegun 7.1.26 erf approximation (|error| < 1.5e-7).
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function bsDelta(F: number, K: number, T: number, ivPct: number, isCall: boolean): number {
  const s = ivPct / 100;
  const d1 = (Math.log(F / K) + 0.5 * s * s * T) / (s * Math.sqrt(T));
  return isCall ? normCdf(d1) : normCdf(d1) - 1;
}

// IV at |Δ| = 0.25 by linear interpolation between the two points that bracket it, else null.
function ivAt25(points: { d: number; iv: number }[]): number | null {
  const sorted = [...points].sort((a, b) => a.d - b.d);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (a.d <= 0.25 && b.d >= 0.25) return b.d === a.d ? a.iv : a.iv + ((0.25 - a.d) / (b.d - a.d)) * (b.iv - a.iv);
  }
  return null;
}

export type OptionsSnapshot = { skew25d: number; putCallOi: number };

export function computeOptionsSnapshot(json: unknown, now: number): OptionsSnapshot {
  const byExpiry = new Map<number, { calls: { d: number; iv: number }[]; puts: { d: number; iv: number }[] }>();
  let putOi = 0;
  let callOi = 0;
  for (const o of BookSchema.parse(json).result) {
    const inst = parseInstrument(o.instrument_name);
    if (!inst) continue;
    const oi = finite(o.open_interest);
    if (oi != null && oi >= 0) {
      if (inst.isCall) callOi += oi;
      else putOi += oi;
    }
    const iv = finite(o.mark_iv);
    const F = finite(o.underlying_price);
    const T = (inst.expiry - now) / YEAR_MS;
    if (iv == null || iv <= 0 || F == null || F <= 0 || T <= 0) continue;
    if (inst.isCall ? inst.strike < F : inst.strike > F) continue; // OTM wings only
    const d = Math.abs(bsDelta(F, inst.strike, T, iv, inst.isCall));
    const e = byExpiry.get(inst.expiry) ?? { calls: [], puts: [] };
    (inst.isCall ? e.calls : e.puts).push({ d, iv });
    byExpiry.set(inst.expiry, e);
  }

  const skews: { T: number; skew: number }[] = [];
  for (const [expiry, e] of byExpiry) {
    const p = ivAt25(e.puts);
    const c = ivAt25(e.calls);
    if (p != null && c != null) skews.push({ T: (expiry - now) / YEAR_MS, skew: p - c });
  }
  skews.sort((a, b) => a.T - b.T);
  const below = skews.filter((s) => s.T <= TARGET_T).pop();
  const above = skews.find((s) => s.T >= TARGET_T);
  if (!below || !above) throw new Error("deribit skew: no expiries bracketing 30d");
  const skew25d = above.T === below.T ? below.skew : below.skew + ((TARGET_T - below.T) / (above.T - below.T)) * (above.skew - below.skew);
  if (callOi <= 0) throw new Error("deribit skew: zero call open interest");
  return { skew25d, putCallOi: putOi / callOi };
}

export async function fetchOptionsSnapshot(fetchImpl: FetchImpl = fetch, now = Date.now()): Promise<FetchResult> {
  const json = await (await getRes(`${BASE}/get_book_summary_by_currency?currency=BTC&kind=option`, fetchImpl, "deribit book")).json();
  const { skew25d, putCallOi } = computeOptionsSnapshot(json, now);
  const t = dayStart(now);
  return { series: { skew25d: [{ t, v: skew25d }], putCallOi: [{ t, v: putCallOi }] } };
}
