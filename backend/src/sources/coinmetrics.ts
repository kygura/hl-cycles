// CoinMetrics community API (keyless). Verified 2026-10-01: values are decimal strings,
// `time` is an ISO day start, missing metrics are simply absent from a row, flow/exchange-supply
// metrics carry a `-status: "flash"` (preliminary) flag — the trailing-14-day re-fetch overwrites
// them once final. `CapRealUSD` is 403 on the community tier, so realized cap is derived.
import { z } from "zod";
import { type FetchImpl, type FetchResult, type SeriesMap, finite, getRes, toRows } from "./daily";

const BASE = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
export const CM_METRICS = [
  "CapMrktCurUSD",
  "CapMVRVCur",
  "SplyCur",
  "AdrActCnt",
  "TxCnt",
  "FeeTotNtv",
  "HashRate",
  "SplyExNtv",
  "FlowInExNtv",
] as const;
const MAX_PAGES = 20; // full history is ~1 page at page_size 10000; this only stops a runaway loop

const PageSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  next_page_url: z.string().optional(),
});

type Pairs = Record<string, [number, number][]>;

function collect(pairs: Pairs, json: unknown): string | null {
  const page = PageSchema.parse(json);
  for (const row of page.data) {
    const t = typeof row.time === "string" ? Date.parse(row.time) : NaN;
    if (!Number.isFinite(t)) continue;
    const vals: Record<string, number> = {};
    for (const m of CM_METRICS) {
      const v = finite(row[m]);
      if (v != null) {
        vals[m] = v;
        (pairs[m] ??= []).push([t, v]);
      }
    }
    // Derived: realized cap = mcap / MVRV; realized price = realized cap / supply.
    const { CapMrktCurUSD: mcap, CapMVRVCur: mvrv, SplyCur: sply } = vals;
    if (mcap != null && mvrv != null && mvrv > 0) {
      const realCap = mcap / mvrv;
      (pairs.RealizedCapUSD ??= []).push([t, realCap]);
      if (sply != null && sply > 0) (pairs.RealizedPriceUSD ??= []).push([t, realCap / sply]);
    }
  }
  const next = page.next_page_url ?? null;
  // The next URL comes from the response body: only ever follow it back to the same API.
  if (next != null && !next.startsWith(`${BASE}?`)) throw new Error("coinmetrics: refusing next_page_url outside the API base");
  return next;
}

function finish(pairs: Pairs): SeriesMap {
  return Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, toRows(v)]));
}

export function parseCoinMetricsPages(pages: unknown[]): SeriesMap {
  const pairs: Pairs = {};
  for (const p of pages) collect(pairs, p);
  return finish(pairs);
}

export async function fetchCoinMetrics(since: number | null, fetchImpl: FetchImpl = fetch): Promise<FetchResult> {
  const start = since == null ? "" : `&start_time=${new Date(since).toISOString().slice(0, 10)}`;
  let url: string | null = `${BASE}?assets=btc&frequency=1d&page_size=10000&metrics=${CM_METRICS.join(",")}${start}`;
  const pairs: Pairs = {};
  for (let i = 0; url && i < MAX_PAGES; i++) {
    const res: Response = await getRes(url, fetchImpl, "coinmetrics");
    url = collect(pairs, await res.json());
  }
  return { series: finish(pairs) };
}
