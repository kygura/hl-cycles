// alternative.me Fear & Greed (keyless). Verified 2026-10-01: `{data: [{value: "74",
// timestamp: "<unix seconds>"}], metadata: {error}}`, newest first. limit=0 returns full history.
import { z } from "zod";
import { DAY } from "../model/indicators";
import { type FetchImpl, type FetchResult, finite, getRes, toRows } from "./daily";

const Schema = z.object({ data: z.array(z.object({ value: z.unknown(), timestamp: z.unknown() })) });

export function parseFearGreed(json: unknown): FetchResult {
  const pairs: [number, number][] = [];
  for (const row of Schema.parse(json).data) {
    const sec = finite(row.timestamp);
    const v = finite(row.value);
    if (sec != null && v != null && v >= 0 && v <= 100) pairs.push([sec * 1000, v]);
  }
  return { series: { fearGreed: toRows(pairs) } };
}

export async function fetchFearGreed(since: number | null, fetchImpl: FetchImpl = fetch, now = Date.now()): Promise<FetchResult> {
  const limit = since == null ? 0 : Math.ceil((now - since) / DAY) + 1;
  return parseFearGreed(await (await getRes(`https://api.alternative.me/fng/?limit=${limit}`, fetchImpl, "feargreed")).json());
}
