// FRED macro series. Default is the keyless `fredgraph.csv` (verified 2026-10-01: header
// `observation_date,<ID>`, a blank value on holidays/missing days). With FRED_API_KEY set it
// uses the JSON API instead (`observations[].{date,value}`, "." for missing). fredgraph is
// occasionally slow (docs/research/bitcoin-vector.md §8), so each series retries once after 3s.
import { z } from "zod";
import type { Row } from "../model/indicators";
import { type FetchImpl, type FetchResult, type SeriesMap, finite, getRes, toRows } from "./daily";

export const FRED_SERIES = ["DTWEXBGS", "DGS10", "DGS2", "DFEDTARU", "SP500", "T10Y2Y"] as const;

export function parseFredCsv(csv: string): Row[] {
  const pairs: [number, number][] = [];
  for (const line of csv.split("\n")) {
    const [d, val] = line.trim().split(",");
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue; // header / blank line
    const v = finite(val);
    if (v != null) pairs.push([Date.parse(`${d}T00:00:00Z`), v]);
  }
  return toRows(pairs);
}

const JsonSchema = z.object({ observations: z.array(z.object({ date: z.string(), value: z.string() })) });

export function parseFredJson(json: unknown): Row[] {
  const pairs: [number, number][] = [];
  for (const o of JsonSchema.parse(json).observations) {
    const t = Date.parse(`${o.date}T00:00:00Z`);
    const v = finite(o.value); // "." -> null
    if (Number.isFinite(t) && v != null) pairs.push([t, v]);
  }
  return toRows(pairs);
}

async function fetchOne(id: string, fetchImpl: FetchImpl, apiKey: string | undefined): Promise<Row[]> {
  if (apiKey) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&file_type=json&api_key=${encodeURIComponent(apiKey)}`;
    return parseFredJson(await (await getRes(url, fetchImpl, `fred ${id}`)).json());
  }
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
  return parseFredCsv(await (await getRes(url, fetchImpl, `fred ${id}`)).text());
}

export async function fetchFred(
  fetchImpl: FetchImpl = fetch,
  apiKey: string | undefined = process.env.FRED_API_KEY,
  retryDelayMs = 3_000,
): Promise<FetchResult> {
  const series: SeriesMap = {};
  const errors: string[] = [];
  for (const id of FRED_SERIES) {
    try {
      let rows: Row[];
      try {
        rows = await fetchOne(id, fetchImpl, apiKey);
      } catch {
        await Bun.sleep(retryDelayMs);
        rows = await fetchOne(id, fetchImpl, apiKey); // one retry (timeouts seen in practice)
      }
      if (rows.length === 0) throw new Error(`fred ${id}: no rows`);
      series[id] = rows;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (Object.keys(series).length === 0) throw new Error(errors.join("; "));
  return errors.length ? { series, error: errors.join("; ") } : { series };
}
