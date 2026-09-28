// Binance Vision historical data fetcher (keyless, no API key/rate-limit auth needed).
// Used only to backfill BTCUSDT perp history for periods before Hyperliquid has data:
// pre-2023-05-12 funding/premium, and all open-interest history (Hyperliquid snapshots only
// exist from 2026-09-27 on). This is a different venue used as a proxy — see docs/MODEL.md.
//
// Verified formats (2026-09-28):
// - funding monthly CSV has a header: calc_time,funding_interval_hours,last_funding_rate (8h rate).
// - premium 1h kline monthly CSV sometimes has a header, sometimes not (early months don't);
//   detected per-file. Standard kline columns, `close` is column index 4.
// - metrics daily CSV has a header (create_time as "YYYY-MM-DD HH:MM:SS" UTC, not epoch ms),
//   5-minute rows, and every row is duplicated verbatim in the file (deduped here by t).
// - monthly metrics files don't exist; only daily.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { z } from "zod";
import type { FundingRow, OiRow } from "../types";

const BASE = "https://data.binance.vision/data/futures/um";
const SYMBOL = "BTCUSDT";
const HOUR = 3_600_000;

type FetchImpl = typeof fetch;

// .min(1) matters: Number("") is 0, a valid finite number, so an empty CSV field would
// otherwise silently become a real-looking zero instead of failing validation.
const numStr = z.string().min(1).transform(Number).pipe(z.number().finite());

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function splitLines(csv: string): string[] {
  return csv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// Every row here starts with either an epoch-ms number (data) or a header word like
// "calc_time"/"open_time"/"create_time" (header) — cheap enough to just check the first char.
function hasHeaderRow(firstField: string): boolean {
  return !/^\d/.test(firstField);
}

// --- fundingRate monthly CSV ---

const FundingCsvRowSchema = z.tuple([numStr, numStr, numStr]);

export type RawFundingEvent = { t: number; intervalHours: number; rate: number };

export function parseFundingCsv(csv: string): RawFundingEvent[] {
  const lines = splitLines(csv);
  if (lines.length === 0) return [];
  const startIdx = hasHeaderRow(lines[0]!.split(",")[0]!) ? 1 : 0;
  const out: RawFundingEvent[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const fields = lines[i]!.split(",");
    const parsed = FundingCsvRowSchema.safeParse(fields);
    if (!parsed.success) {
      console.error("dropping invalid Binance funding row:", parsed.error.issues[0]?.message, lines[i]);
      continue;
    }
    const [t, intervalHours, rate] = parsed.data;
    out.push({ t, intervalHours, rate });
  }
  return out;
}

// --- premiumIndexKlines 1h monthly CSV ---

const PremiumKlineRowSchema = z.tuple([numStr, numStr, numStr, numStr, numStr]); // open_time..close, ignores the rest

export type RawPremiumRow = { t: number; premium: number };

export function parsePremiumCsv(csv: string): RawPremiumRow[] {
  const lines = splitLines(csv);
  if (lines.length === 0) return [];
  const startIdx = hasHeaderRow(lines[0]!.split(",")[0]!) ? 1 : 0;
  const out: RawPremiumRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const fields = lines[i]!.split(",").slice(0, 5);
    const parsed = PremiumKlineRowSchema.safeParse(fields);
    if (!parsed.success) {
      console.error("dropping invalid Binance premium row:", parsed.error.issues[0]?.message, lines[i]);
      continue;
    }
    out.push({ t: parsed.data[0], premium: parsed.data[4] });
  }
  return out;
}

// --- metrics daily CSV (5m open-interest rows) ---

const dateToMs = z
  .string()
  .transform((s) => Date.parse(`${s.replace(" ", "T")}Z`))
  .pipe(z.number().int().positive());

const MetricsCsvRowSchema = z.tuple([dateToMs, z.string(), numStr, numStr]); // create_time,symbol,sum_open_interest,sum_open_interest_value

export type RawOiRow = { t: number; oiCoins: number; oiUsd: number };

// Rows are deduped by t (the raw file has every row duplicated verbatim).
export function parseMetricsCsv(csv: string): RawOiRow[] {
  const lines = splitLines(csv);
  if (lines.length === 0) return [];
  const startIdx = hasHeaderRow(lines[0]!.split(",")[0]!) ? 1 : 0;
  const byT = new Map<number, RawOiRow>();
  for (let i = startIdx; i < lines.length; i++) {
    const fields = lines[i]!.split(",").slice(0, 4);
    const parsed = MetricsCsvRowSchema.safeParse(fields);
    if (!parsed.success) {
      console.error("dropping invalid Binance metrics row:", parsed.error.issues[0]?.message, lines[i]);
      continue;
    }
    const [t, , oiCoins, oiUsd] = parsed.data;
    byT.set(t, { t, oiCoins, oiUsd });
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

// --- 8h funding -> hourly expansion, and 5m OI -> hourly downsample ---

// Rightmost row with row.t <= at, else null (same binary-search pattern as ltf.ts's
// latestInWindow, just without the window bound — premium/funding history has no snapshot
// staleness concept, we just want the last known value at or before the hour).
function latestAtOrBefore<T extends { t: number }>(sorted: T[], at: number): T | null {
  let lo = 0;
  let hi = sorted.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.t <= at) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return idx === -1 ? null : sorted[idx]!;
}

// Splits each 8h funding event into hourly-equivalent rows, attaching the Binance premium-index
// close for that hour. Alignment matches Hyperliquid's own convention (see docs/MODEL.md): a row
// timestamped t is the payment/reading for the period [t-1h, t) — i.e. t is when the value became
// known, not when the period started. calc_time T (paying for [T-8h, T)) therefore decomposes
// into hourly rows at T-7h, T-6h, ..., T (NOT T, T+1h, ..., T+7h, which would date each hourly
// slice 8h into the future it hadn't happened yet — a look-ahead bug). Same reasoning for premium:
// the value attached to row t must come from the 1h kline that CLOSES at t (open_time t-1h), not
// the kline opening at t (which covers [t, t+1h) and isn't known until t+1h). Exported for tests.
export function expandFundingHourly(events: RawFundingEvent[], premiumRows: RawPremiumRow[]): FundingRow[] {
  const premiumSorted = [...premiumRows].sort((a, b) => a.t - b.t);
  const out: FundingRow[] = [];
  for (const ev of events) {
    if (ev.intervalHours <= 0) continue; // defensive: never divide by zero on a malformed row
    const hourlyRate = ev.rate / ev.intervalHours;
    for (let h = 0; h < ev.intervalHours; h++) {
      const t = ev.t - (ev.intervalHours - 1 - h) * HOUR;
      const premiumRow = latestAtOrBefore(premiumSorted, t - HOUR);
      // null (not 0) when no premium kline is known yet for this hour — 0 is a real premium value
      // and must never stand in for "missing". See FundingRow.premium in types.ts.
      out.push({ t, rate: hourlyRate, premium: premiumRow?.premium ?? null, src: "binance" });
    }
  }
  return out;
}

// Last 5m row per UTC hour, keyed by the hour's CLOSE (h+1h), not its start. The raw metrics rows
// are 5-minute samples inside [h, h+1h) — e.g. a row at h:55 — so the true "last known OI for this
// hour" isn't actually known until the hour closes at h+1h. Keying by h (as if it were known from
// the hour's start) would let a same-hour lookup see a value up to ~55 minutes before it existed —
// a look-ahead bug. Every other close-keyed series in this codebase (candles, funding above) uses
// the same period-close convention. Exported for tests.
export function downsampleHourlyOi(rows: RawOiRow[]): OiRow[] {
  const byHour = new Map<number, RawOiRow>();
  for (const r of [...rows].sort((a, b) => a.t - b.t)) {
    byHour.set(Math.floor(r.t / HOUR) * HOUR + HOUR, r); // ascending order -> last write per hour wins
  }
  return [...byHour.entries()]
    .map(([hourCloseT, r]) => ({ t: hourCloseT, oiCoins: r.oiCoins, oiUsd: r.oiUsd, src: "binance" as const }))
    .sort((a, b) => a.t - b.t);
}

// --- network + zip plumbing ---

function fundingMonthUrl(ym: string): string {
  return `${BASE}/monthly/fundingRate/${SYMBOL}/${SYMBOL}-fundingRate-${ym}.zip`;
}

function premiumMonthUrl(ym: string): string {
  return `${BASE}/monthly/premiumIndexKlines/${SYMBOL}/1h/${SYMBOL}-1h-${ym}.zip`;
}

function metricsDayUrl(dateStr: string): string {
  return `${BASE}/daily/metrics/${SYMBOL}/${SYMBOL}-metrics-${dateStr}.zip`;
}

// Downloads a zip, extracts its single CSV via the `unzip` CLI (no zip-parsing dependency
// needed for this one-shot script), and cleans up the temp file. null on 404 (month/day not
// published yet), throws on any other failure.
const FETCH_TIMEOUT_MS = 20_000;

async function fetchZipCsv(url: string, fetchImpl: FetchImpl): Promise<string | null> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Binance Vision HTTP ${res.status} for ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const tmpPath = join(tmpdir(), `binance-vision-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await Bun.write(tmpPath, bytes);
  try {
    const proc = Bun.spawn(["unzip", "-p", tmpPath]);
    const csv = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`unzip exited ${exitCode} for ${url}`);
    return csv;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

async function fetchZipCsvRetry(url: string, fetchImpl: FetchImpl, attempt = 0): Promise<string | null> {
  try {
    return await fetchZipCsv(url, fetchImpl);
  } catch (err) {
    if (attempt === 0) {
      await sleep(500);
      return fetchZipCsvRetry(url, fetchImpl, attempt + 1);
    }
    throw err;
  }
}

export function nextYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m >= 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function* monthsBetween(startYm: string, endYmExclusive: string): Generator<string> {
  let ym = startYm;
  while (ym < endYmExclusive) {
    yield ym;
    ym = nextYm(ym);
  }
}

function* daysBetween(startDate: string, endDateExclusive: string): Generator<string> {
  let cursor = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDateExclusive}T00:00:00Z`);
  while (cursor < end) {
    yield new Date(cursor).toISOString().slice(0, 10);
    cursor += 86_400_000;
  }
}

export const FUNDING_HISTORY_START_YM = "2020-01";

// Fetches every published month from 2020-01 up to (and including) the month containing
// `beforeT`, then filters to rows strictly before `beforeT` — the caller passes Hyperliquid's
// first funding row time so these never overlap HL's own history.
export async function backfillFunding(beforeT: number, fetchImpl: FetchImpl = fetch): Promise<FundingRow[]> {
  const endYmExclusive = nextYm(new Date(beforeT).toISOString().slice(0, 7));
  const out: FundingRow[] = [];
  for (const ym of monthsBetween(FUNDING_HISTORY_START_YM, endYmExclusive)) {
    const [fundingCsv, premiumCsv] = await Promise.all([
      fetchZipCsvRetry(fundingMonthUrl(ym), fetchImpl),
      fetchZipCsvRetry(premiumMonthUrl(ym), fetchImpl),
    ]);
    if (fundingCsv == null) continue; // month not published yet (e.g. the current month)
    const events = parseFundingCsv(fundingCsv);
    const premiumRows = premiumCsv == null ? [] : parsePremiumCsv(premiumCsv);
    out.push(...expandFundingHourly(events, premiumRows));
  }
  return out.filter((r) => r.t < beforeT).sort((a, b) => a.t - b.t);
}

export type OiBackfillResult = { rows: OiRow[]; fetched: number; skipped404: number };

// Fetches every daily metrics file in [fromDate, toDateExclusive) with bounded concurrency,
// skipping 404s (not-yet-published days) and retrying once on transient failures. A day that
// still fails after the retry is NOT silently skipped like a 404: it's collected and the whole
// call throws at the end, so the caller (backfillOiStep) never checkpoints past it — checkpointing
// a chunk that's missing a day due to a transient network error would permanently skip that day
// on every future run (the next run resumes from the checkpoint's last saved timestamp).
export async function backfillOiHistory(
  fromDate: string,
  toDateExclusive: string,
  fetchImpl: FetchImpl = fetch,
  concurrency = 8,
): Promise<OiBackfillResult> {
  const days = [...daysBetween(fromDate, toDateExclusive)];
  const allRaw: RawOiRow[] = [];
  let fetched = 0;
  let skipped404 = 0;
  const failedDays: string[] = [];
  let cursor = 0;

  async function worker() {
    for (;;) {
      const idx = cursor++;
      if (idx >= days.length) return;
      const day = days[idx]!;
      let csv: string | null;
      try {
        csv = await fetchZipCsvRetry(metricsDayUrl(day), fetchImpl);
      } catch (err) {
        console.error(`Binance metrics ${day} failed:`, err instanceof Error ? err.message : String(err));
        failedDays.push(day);
        continue;
      }
      if (csv == null) {
        skipped404++;
        continue;
      }
      fetched++;
      allRaw.push(...parseMetricsCsv(csv));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, days.length) }, worker));
  if (failedDays.length > 0) {
    throw new Error(`Binance metrics fetch failed for ${failedDays.length} day(s): ${failedDays.sort().join(", ")}`);
  }
  return { rows: downsampleHourlyOi(allRaw), fetched, skipped404 };
}
