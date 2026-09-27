// Bitstamp daily OHLC fetcher (keyless, supplementary HTF context only).
// Docs/behavior confirmed in docs/research/data-sources.md section 6.
import { z } from "zod";
import type { Candle } from "../types";

type FetchImpl = typeof fetch;

const OhlcRowSchema = z.object({
  timestamp: z.string(),
  open: z.string(),
  high: z.string(),
  low: z.string(),
  close: z.string(),
  volume: z.string(),
});

const ResponseSchema = z.object({
  data: z.object({
    pair: z.string(),
    ohlc: z.array(OhlcRowSchema),
  }),
});

const DAY_SEC = 86400;
const PAGE_LIMIT = 1000;

export async function fetchBitstampDaily(
  startSec = 1315872000, // 2011-09-13, earliest confirmed Bitstamp data
  fetchImpl: FetchImpl = fetch,
): Promise<Candle[]> {
  const out = new Map<number, Candle>();
  let cursor = startSec;
  const todayStartSec = Math.floor(Date.now() / 1000 / DAY_SEC) * DAY_SEC;

  for (;;) {
    const url = `https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=${DAY_SEC}&start=${cursor}&limit=${PAGE_LIMIT}`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Bitstamp HTTP ${res.status}`);
    const json = await res.json();
    const { ohlc } = ResponseSchema.parse(json).data;

    for (const row of ohlc) {
      const tSec = Number(row.timestamp);
      if (tSec >= todayStartSec) continue; // drop today's unclosed candle
      out.set(tSec, {
        t: tSec * 1000,
        o: Number(row.open),
        h: Number(row.high),
        l: Number(row.low),
        c: Number(row.close),
        v: Number(row.volume),
        src: "bitstamp",
      });
    }

    if (ohlc.length === 0 || ohlc.length < PAGE_LIMIT) break;
    const lastSec = Number(ohlc[ohlc.length - 1]!.timestamp);
    if (lastSec <= cursor) break; // safety: no progress
    cursor = lastSec + DAY_SEC;
    if (cursor >= todayStartSec) break;
  }

  return [...out.values()].sort((a, b) => a.t - b.t);
}
