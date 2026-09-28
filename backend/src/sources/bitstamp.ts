// Bitstamp daily OHLC fetcher (keyless, supplementary HTF context only).
// Docs/behavior confirmed in docs/research/data-sources.md section 6.
import { z } from "zod";
import type { Candle } from "../types";

type FetchImpl = typeof fetch;

// Numeric strings from the Bitstamp API must parse to a finite number, not NaN/"" (Number("")
// is 0, a valid finite number, so .min(1) is needed to actually reject empty fields).
const numStr = z.string().min(1).transform(Number).pipe(z.number().finite());

const OhlcRowSchema = z.object({
  timestamp: numStr,
  open: numStr,
  high: numStr,
  low: numStr,
  close: numStr,
  volume: numStr,
});

const ResponseSchema = z.object({
  data: z.object({
    pair: z.string(),
    ohlc: z.array(z.unknown()),
  }),
});

const DAY_SEC = 86400;
const PAGE_LIMIT = 1000;
const FETCH_TIMEOUT_MS = 20_000;

export async function fetchBitstampDaily(
  startSec = 1315872000, // 2011-09-13, earliest confirmed Bitstamp data
  fetchImpl: FetchImpl = fetch,
): Promise<Candle[]> {
  const out = new Map<number, Candle>();
  let cursor = startSec;
  const todayStartSec = Math.floor(Date.now() / 1000 / DAY_SEC) * DAY_SEC;

  for (;;) {
    const url = `https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=${DAY_SEC}&start=${cursor}&limit=${PAGE_LIMIT}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Bitstamp HTTP ${res.status}`);
    const json = await res.json();
    const { ohlc } = ResponseSchema.parse(json).data;

    for (const raw of ohlc) {
      const parsed = OhlcRowSchema.safeParse(raw);
      if (!parsed.success) {
        console.error("dropping invalid Bitstamp OHLC row:", parsed.error.issues[0]?.message, raw);
        continue;
      }
      const row = parsed.data;
      if (row.timestamp >= todayStartSec) continue; // drop today's unclosed candle
      out.set(row.timestamp, {
        t: row.timestamp * 1000,
        o: row.open,
        h: row.high,
        l: row.low,
        c: row.close,
        v: row.volume,
        src: "bitstamp",
      });
    }

    if (ohlc.length === 0 || ohlc.length < PAGE_LIMIT) break;
    const lastRaw = (ohlc[ohlc.length - 1] as { timestamp?: unknown })?.timestamp;
    const lastSec = typeof lastRaw === "string" ? Number(lastRaw) : NaN;
    if (!Number.isFinite(lastSec) || lastSec <= cursor) break; // safety: no progress
    cursor = lastSec + DAY_SEC;
    if (cursor >= todayStartSec) break;
  }

  return [...out.values()].sort((a, b) => a.t - b.t);
}
