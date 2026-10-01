// DefiLlama total stablecoin market cap (keyless). Verified 2026-10-01: an array of
// `{date: "<unix seconds>", totalCirculatingUSD: {peggedUSD, peggedEUR, ...}}`; the total is the
// sum over every peg's USD-converted circulating supply (what DefiLlama's own "all" chart shows).
import { z } from "zod";
import { type FetchImpl, type FetchResult, finite, getRes, toRows } from "./daily";

const STABLES_URL = "https://stablecoins.llama.fi/stablecoincharts/all";

const Schema = z.array(z.object({ date: z.union([z.string(), z.number()]), totalCirculatingUSD: z.record(z.string(), z.unknown()) }));

export function parseStablecoins(json: unknown): FetchResult {
  const pairs: [number, number][] = [];
  for (const row of Schema.parse(json)) {
    const sec = finite(row.date);
    // Non-numeric pegs (rare nulls on exotic pegs) are left out of the sum, not zero-filled.
    const total = Object.values(row.totalCirculatingUSD).reduce<number>((a, v) => a + (finite(v) ?? 0), 0);
    if (sec != null && total > 0) pairs.push([sec * 1000, total]);
  }
  return { series: { totalStablecoinMcapUSD: toRows(pairs) } };
}

export async function fetchStablecoins(fetchImpl: FetchImpl = fetch): Promise<FetchResult> {
  return parseStablecoins(await (await getRes(STABLES_URL, fetchImpl, "defillama")).json());
}
