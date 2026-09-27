// Hyperliquid public info API fetcher (keyless).
// Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
import { z } from "zod";
import type { Candle, FundingRow, Snapshot } from "../types";

const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

type FetchImpl = typeof fetch;

const RETRY_DELAY_MS = 500;
const GAP_MS = 200;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Sequential POST with ~200ms gap before the call, one retry on 429/5xx/network
// error with a short backoff, then throw. Trust boundary: caller must not see
// partial/garbled data, so we never swallow a final failure.
async function postInfo(
  body: unknown,
  fetchImpl: FetchImpl,
  attempt = 0,
): Promise<unknown> {
  if (attempt > 0) {
    await sleep(RETRY_DELAY_MS);
  } else {
    await sleep(GAP_MS);
  }
  let res: Response;
  try {
    res = await fetchImpl(HL_INFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (attempt === 0) return postInfo(body, fetchImpl, attempt + 1);
    throw new Error(
      `Hyperliquid request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      return postInfo(body, fetchImpl, attempt + 1);
    }
    throw new Error(`Hyperliquid HTTP ${res.status}`);
  }
  return res.json();
}

// --- candleSnapshot ---

const CandleSchema = z.object({
  t: z.number(),
  T: z.number(),
  s: z.string(),
  i: z.string(),
  o: z.string(),
  c: z.string(),
  h: z.string(),
  l: z.string(),
  v: z.string(),
  n: z.number(),
});

const CandlesSchema = z.array(CandleSchema);

export type HlInterval = "1h" | "4h" | "1d" | "1w";

const MAX_ROWS_PER_CALL = 5000;

export async function fetchCandles(
  coin: string,
  interval: HlInterval,
  startTime = 0,
  endTime: number = Date.now(),
  fetchImpl: FetchImpl = fetch,
): Promise<Candle[]> {
  const out = new Map<number, Candle>();
  let cursor = startTime;

  // candleSnapshot returns at most ~5000 rows per call. Paginate by re-issuing
  // with a narrowed startTime whenever a full page comes back, until we get a
  // short page (fewer than the cap) or reach endTime.
  for (;;) {
    const json = await postInfo(
      { type: "candleSnapshot", req: { coin, interval, startTime: cursor, endTime } },
      fetchImpl,
    );
    const rows = CandlesSchema.parse(json);
    for (const row of rows) {
      out.set(row.t, {
        t: row.t,
        o: Number(row.o),
        h: Number(row.h),
        l: Number(row.l),
        c: Number(row.c),
        v: Number(row.v),
        src: "hl",
      });
    }
    if (rows.length < MAX_ROWS_PER_CALL) break;
    const lastT = rows[rows.length - 1]!.t;
    if (lastT <= cursor) break; // safety: no progress, avoid infinite loop
    cursor = lastT + 1;
    if (cursor >= endTime) break;
  }

  return [...out.values()].sort((a, b) => a.t - b.t);
}

// --- fundingHistory ---

const FundingHistoryRowSchema = z.object({
  coin: z.string(),
  fundingRate: z.string(),
  premium: z.string(),
  time: z.number(),
});

const FundingHistorySchema = z.array(FundingHistoryRowSchema);

const FUNDING_PAGE_SIZE = 500;

export async function fetchFunding(
  coin: string,
  startTime: number,
  fetchImpl: FetchImpl = fetch,
): Promise<FundingRow[]> {
  const out = new Map<number, FundingRow>();
  let cursor = startTime;
  const now = Date.now();

  for (;;) {
    const json = await postInfo(
      { type: "fundingHistory", coin, startTime: cursor, endTime: now },
      fetchImpl,
    );
    const rows = FundingHistorySchema.parse(json);
    for (const row of rows) {
      out.set(row.time, {
        t: row.time,
        rate: Number(row.fundingRate),
        premium: Number(row.premium),
      });
    }
    if (rows.length === 0 || rows.length < FUNDING_PAGE_SIZE) break;
    const lastT = rows[rows.length - 1]!.time;
    if (lastT <= cursor) break; // safety: no progress
    cursor = lastT + 1;
    if (cursor >= now) break;
  }

  return [...out.values()].sort((a, b) => a.t - b.t);
}

// --- metaAndAssetCtxs + predictedFundings -> Snapshot ---

const UniverseAssetSchema = z.object({
  szDecimals: z.number(),
  name: z.string(),
  maxLeverage: z.number(),
  marginTableId: z.number(),
  isDelisted: z.boolean().optional(),
});

const MetaSchema = z.object({
  universe: z.array(UniverseAssetSchema),
});

const AssetCtxSchema = z.object({
  funding: z.string(),
  openInterest: z.string(),
  prevDayPx: z.string(),
  dayNtlVlm: z.string(),
  premium: z.string().nullable(),
  oraclePx: z.string(),
  markPx: z.string(),
  midPx: z.string().nullable(),
  impactPxs: z.array(z.string()).nullable(),
  dayBaseVlm: z.string(),
});

const MetaAndAssetCtxsSchema = z.tuple([MetaSchema, z.array(AssetCtxSchema)]);

// fundingRate/nextFundingTime/fundingIntervalHours are occasionally missing
// for a thin/inactive venue on a given coin (seen live), so all three are
// optional here — filtered out below when building the BTC predicted list.
const PredictedFundingVenueSchema = z.object({
  fundingRate: z.string().optional(),
  nextFundingTime: z.number().optional(),
  fundingIntervalHours: z.number().optional(),
});

// Some venues report null for thin/inactive markets on a given coin — nullable
// here, filtered out below when building the BTC predicted-funding list.
const PredictedFundingsSchema = z.array(
  z.tuple([
    z.string(),
    z.array(z.tuple([z.string(), PredictedFundingVenueSchema.nullable()])),
  ]),
);

export async function fetchSnapshot(
  coin: string,
  fetchImpl: FetchImpl = fetch,
): Promise<Snapshot> {
  const metaJson = await postInfo({ type: "metaAndAssetCtxs" }, fetchImpl);
  const [meta, assetCtxs] = MetaAndAssetCtxsSchema.parse(metaJson);

  const index = meta.universe.findIndex((a) => a.name === coin);
  if (index === -1) throw new Error(`${coin} not found in Hyperliquid universe`);
  const ctx = assetCtxs[index];
  if (!ctx) throw new Error(`${coin} has no assetCtx at index ${index}`);

  const predictedJson = await postInfo({ type: "predictedFundings" }, fetchImpl);
  const predictedAll = PredictedFundingsSchema.parse(predictedJson);
  const coinEntry = predictedAll.find(([name]) => name === coin);
  const predicted = (coinEntry?.[1] ?? [])
    .filter(
      (entry): entry is [string, Required<NonNullable<(typeof entry)[1]>>] =>
        entry[1] != null &&
        entry[1].fundingRate !== undefined &&
        entry[1].fundingIntervalHours !== undefined,
    )
    .map(([venue, v]) => ({
      venue,
      rate: Number(v.fundingRate),
      intervalHours: v.fundingIntervalHours,
    }));

  const oiCoins = Number(ctx.openInterest);
  const markPx = Number(ctx.markPx);

  return {
    t: Date.now(),
    markPx,
    oraclePx: Number(ctx.oraclePx),
    oiCoins,
    oiUsd: oiCoins * markPx,
    funding: Number(ctx.funding),
    premium: ctx.premium === null ? null : Number(ctx.premium),
    dayNtlVlm: Number(ctx.dayNtlVlm),
    predicted,
  };
}
