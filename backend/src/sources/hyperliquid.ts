// Hyperliquid public info API fetcher (keyless).
// Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
import { z } from "zod";
import type { Candle, FundingRow, Snapshot } from "../types";

const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

type FetchImpl = typeof fetch;

const RETRY_DELAY_MS = 500;
const GAP_MS = 200;
const FETCH_TIMEOUT_MS = 20_000;

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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

// Numeric strings from the HL API must parse to a finite number, not NaN/"" (Number("") is 0,
// a valid finite number, so .min(1) is needed to actually reject empty fields).
const numStr = z.string().min(1).transform(Number).pipe(z.number().finite());

// --- candleSnapshot ---

const CandleSchema = z.object({
  t: z.number(),
  T: z.number(),
  s: z.string(),
  i: z.string(),
  o: numStr,
  c: numStr,
  h: numStr,
  l: numStr,
  v: numStr,
  n: z.number(),
});

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
    const rawRows = z.array(z.unknown()).parse(json);
    for (const raw of rawRows) {
      const parsed = CandleSchema.safeParse(raw);
      if (!parsed.success) {
        console.error("dropping invalid HL candle row:", parsed.error.issues[0]?.message, raw);
        continue;
      }
      const row = parsed.data;
      out.set(row.t, { t: row.t, o: row.o, h: row.h, l: row.l, c: row.c, v: row.v, src: "hl" });
    }
    if (rawRows.length < MAX_ROWS_PER_CALL) break;
    // t/T are always plain JSON numbers per the API contract (unlike o/h/l/c/v), so it's safe
    // to read the last raw row's t directly for pagination even if that row failed validation.
    const lastT = (rawRows[rawRows.length - 1] as { t?: unknown })?.t;
    if (typeof lastT !== "number" || lastT <= cursor) break; // safety: no progress, avoid infinite loop
    cursor = lastT + 1;
    if (cursor >= endTime) break;
  }

  return [...out.values()].sort((a, b) => a.t - b.t);
}

// --- fundingHistory ---

const FundingHistoryRowSchema = z.object({
  coin: z.string(),
  fundingRate: numStr,
  premium: numStr,
  time: z.number(),
});

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
    const rawRows = z.array(z.unknown()).parse(json);
    for (const raw of rawRows) {
      const parsed = FundingHistoryRowSchema.safeParse(raw);
      if (!parsed.success) {
        console.error("dropping invalid HL funding row:", parsed.error.issues[0]?.message, raw);
        continue;
      }
      const row = parsed.data;
      out.set(row.time, { t: row.time, rate: row.fundingRate, premium: row.premium });
    }
    if (rawRows.length === 0 || rawRows.length < FUNDING_PAGE_SIZE) break;
    const lastT = (rawRows[rawRows.length - 1] as { time?: unknown })?.time;
    if (typeof lastT !== "number" || lastT <= cursor) break; // safety: no progress
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
  funding: numStr,
  openInterest: numStr,
  prevDayPx: numStr,
  dayNtlVlm: numStr,
  premium: numStr.nullable(),
  oraclePx: numStr,
  markPx: numStr,
  midPx: numStr.nullable(),
  impactPxs: z.array(z.string()).nullable(),
  dayBaseVlm: numStr,
});

const MetaAndAssetCtxsSchema = z.tuple([MetaSchema, z.array(AssetCtxSchema)]);

// fundingRate/nextFundingTime/fundingIntervalHours are occasionally missing
// for a thin/inactive venue on a given coin (seen live), so all three are
// optional here — filtered out below when building the BTC predicted list.
const PredictedFundingVenueSchema = z.object({
  fundingRate: numStr.optional(),
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
      rate: v.fundingRate!,
      intervalHours: v.fundingIntervalHours!,
    }));

  const oiCoins = ctx.openInterest;
  const markPx = ctx.markPx;

  return {
    t: Date.now(),
    markPx,
    oraclePx: ctx.oraclePx,
    oiCoins,
    oiUsd: oiCoins * markPx,
    funding: ctx.funding,
    premium: ctx.premium,
    dayNtlVlm: ctx.dayNtlVlm,
    predicted,
  };
}
