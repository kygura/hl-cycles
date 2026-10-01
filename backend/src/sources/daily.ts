// Shared plumbing for the Phase 4 "vector" adapters (SPEC.md 4.2): daily {t, v} rows keyed by
// UTC day start, finite-number parsing at the trust boundary, and a timed GET.
import { DAY, type Row } from "../model/indicators";

export type SeriesMap = Record<string, Row[]>;
// Partial results are allowed (e.g. bitcoin-data stops at its rate limit): `series` holds what was
// fetched, `error` names what wasn't. refreshVector saves the former and records the latter.
export type FetchResult = { series: SeriesMap; error?: string };
export type FetchImpl = typeof fetch;

const FETCH_TIMEOUT_MS = 30_000; // per request; refreshVector adds one overall deadline on top

export function dayStart(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

// Number("") and Number(null) are 0 — a real-looking value — so blanks are rejected explicitly.
export function finite(x: unknown): number | null {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x !== "string" || x.trim() === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// Dedup by UTC day (last write wins), ascending.
export function toRows(pairs: Iterable<[number, number]>): Row[] {
  const byDay = new Map<number, number>();
  for (const [t, v] of pairs) byDay.set(dayStart(t), v);
  return [...byDay.entries()].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t);
}

export type HttpError = Error & { status: number };

/** GET with a per-request timeout (combined with any caller signal); non-2xx throws an HttpError. */
export async function getRes(url: string, fetchImpl: FetchImpl, label: string): Promise<Response> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  // `label`, not `url`, in the message: some URLs carry an API key/token.
  if (!res.ok) throw Object.assign(new Error(`${label}: HTTP ${res.status}`), { status: res.status });
  return res;
}
