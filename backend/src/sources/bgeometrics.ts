// bitcoin-data.com (BGeometrics) history endpoints. Verified 2026-10-01 on `etf-flow-btc`:
// a JSON array of `{d: "YYYY-MM-DD", unixTs: "<seconds>", <metricKey>: "<decimal>"}` where the
// value key differs per metric, so the parser takes the one key that isn't d/unixTs. Keyless
// quota is 10 req/hour AND 15 req/day (X-RateLimit-* headers), the last ~7 days are marked
// delayed. One history call per metric, never retried; on 429 or an exhausted hourly quota the
// remaining metrics are skipped and named in the error. refreshVector also skips this source when
// it already succeeded the same UTC day (protects the daily cap on manual re-runs). Optional
// BGEOMETRICS_TOKEN is sent as `?token=` (per bgeometrics.com/api docs; untested here without a key).
import { z } from "zod";
import type { Row } from "../model/indicators";
import { type FetchImpl, type FetchResult, type HttpError, type SeriesMap, finite, getRes, toRows } from "./daily";

const BASE = "https://bitcoin-data.com/v1";
export const BG_METRICS = [
  "sth-realized-price",
  "true-market-mean",
  "lth-realized-price",
  "sth-sopr",
  "nupl",
  "supply-profit",
  "etf-flow-btc",
] as const;
const META_KEYS = new Set(["d", "unixTs", "delayed", "time"]);

const RowsSchema = z.array(z.record(z.string(), z.unknown()));

export function parseBgSeries(json: unknown): Row[] {
  const pairs: [number, number][] = [];
  for (const row of RowsSchema.parse(json)) {
    const sec = finite(row.unixTs);
    const t = sec != null ? sec * 1000 : typeof row.d === "string" ? Date.parse(`${row.d}T00:00:00Z`) : NaN;
    const valueKeys = Object.keys(row).filter((k) => !META_KEYS.has(k));
    if (!Number.isFinite(t) || valueKeys.length !== 1) continue;
    const v = finite(row[valueKeys[0]!]);
    if (v != null) pairs.push([t, v]);
  }
  return toRows(pairs);
}

export async function fetchBGeometrics(
  fetchImpl: FetchImpl = fetch,
  token: string | undefined = process.env.BGEOMETRICS_TOKEN,
): Promise<FetchResult> {
  const series: SeriesMap = {};
  const errors: string[] = [];
  for (let i = 0; i < BG_METRICS.length; i++) {
    const metric = BG_METRICS[i]!;
    const url = `${BASE}/${metric}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    try {
      const res = await getRes(url, fetchImpl, metric);
      const rows = parseBgSeries(await res.json());
      if (rows.length === 0) throw new Error(`${metric}: no rows`);
      series[metric] = rows;
      if (res.headers.get("X-RateLimit-Remaining-Hour") === "0" && i < BG_METRICS.length - 1) {
        errors.push(`hourly quota exhausted; missing ${BG_METRICS.slice(i + 1).join(", ")}`);
        break;
      }
    } catch (err) {
      if ((err as HttpError).status === 429) {
        errors.push(`rate limited; missing ${BG_METRICS.slice(i).join(", ")}`);
        break;
      }
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (Object.keys(series).length === 0) throw new Error(errors.join("; ") || "no series");
  return errors.length ? { series, error: errors.join("; ") } : { series };
}
