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

// --- weight guard (SPEC.md 3.3) ---
// HL allows 1200 weight/min/IP; `info` calls weigh 20 plus a per-row surcharge. A module-level
// rolling 60s log of {t, weight} lets postInfo throttle itself well under budget, without any
// caller having to think about it. weightWaitMs is a pure function so it's directly testable.
export type WeightLogEntry = { t: number; weight: number };

const WEIGHT_WINDOW_MS = 60_000;
const WEIGHT_BUDGET = 1000;

/** ms to wait so that, after waiting, the trailing-60s logged weight plus a new call's minimum
 * weight (20) stays within budget. 0 if already under budget. Pure — log/now/budget are inputs. */
export function weightWaitMs(log: WeightLogEntry[], now: number, budget: number): number {
  const relevant = log.filter((e) => e.t > now - WEIGHT_WINDOW_MS);
  const sum = relevant.reduce((a, e) => a + e.weight, 0);
  if (sum + 20 <= budget) return 0;
  const oldest = relevant.reduce((min, e) => Math.min(min, e.t), Infinity);
  return Math.max(0, oldest + WEIGHT_WINDOW_MS - now);
}

const weightLog: WeightLogEntry[] = [];

// Conservative per SPEC.md 3.3: 20 base + ceil(rows/20), where rows = the response array length
// when the response itself is an array (candleSnapshot, fundingHistory, predictedFundings), else
// 0 (metaAndAssetCtxs is a 2-element tuple — near enough to the base weight).
function responseWeight(json: unknown): number {
  const rows = Array.isArray(json) ? json.length : 0;
  return 20 + Math.ceil(rows / 20);
}

function logWeight(weight: number) {
  const now = Date.now();
  weightLog.push({ t: now, weight });
  while (weightLog.length && weightLog[0]!.t <= now - WEIGHT_WINDOW_MS) weightLog.shift();
}

// Test-only: the weight log is module-level (shared across every call in the process), so a test
// file that fires many real postInfo calls (via a mocked global fetch) needs to start from a
// clean budget instead of inheriting whatever other test files logged in the same 60s window.
export function __resetWeightLogForTests(): void {
  weightLog.length = 0;
}

// Sequential POST with ~200ms gap before the call, one retry on 429/5xx/network
// error with a short backoff, then throw. Trust boundary: caller must not see
// partial/garbled data, so we never swallow a final failure.
async function postInfo(
  body: unknown,
  fetchImpl: FetchImpl,
  attempt = 0,
): Promise<unknown> {
  // A single wait based on the oldest logged entry isn't always enough -- a cluster of heavy
  // responses can still be over budget once that one entry ages out -- so recheck after each
  // wait until the log genuinely clears under budget.
  let waitMs = weightWaitMs(weightLog, Date.now(), WEIGHT_BUDGET);
  while (waitMs > 0) {
    await sleep(waitMs);
    waitMs = weightWaitMs(weightLog, Date.now(), WEIGHT_BUDGET);
  }
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
    logWeight(20); // failed call still consumed HL's rate-limit budget on their side
    if (attempt === 0) return postInfo(body, fetchImpl, attempt + 1);
    throw new Error(
      `Hyperliquid request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    logWeight(20); // ditto -- a 429 in particular means we're already close to their limit
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      return postInfo(body, fetchImpl, attempt + 1);
    }
    throw new Error(`Hyperliquid HTTP ${res.status}`);
  }
  const json = await res.json();
  logWeight(responseWeight(json));
  return json;
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

export type HlInterval = "15m" | "1h" | "4h" | "1d" | "1w";

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

// --- fetchOi: metaAndAssetCtxs -> per-coin OI (SPEC.md 3.3) ---

export type OiResult =
  | { coin: string; oiCoins: number; oiUsd: number }
  | { coin: string; error: string };

// One metaAndAssetCtxs call covers every requested coin. A coin missing from the universe (or
// with no matching assetCtx) is reported as an error entry for that coin only — it must never
// throw and lose the other coins' results.
export async function fetchOi(coins: string[], fetchImpl: FetchImpl = fetch): Promise<OiResult[]> {
  const metaJson = await postInfo({ type: "metaAndAssetCtxs" }, fetchImpl);
  const [meta, assetCtxs] = MetaAndAssetCtxsSchema.parse(metaJson);

  return coins.map((coin): OiResult => {
    const index = meta.universe.findIndex((a) => a.name === coin);
    if (index === -1) return { coin, error: `${coin} not found in Hyperliquid universe` };
    const ctx = assetCtxs[index];
    if (!ctx) return { coin, error: `${coin} has no assetCtx at index ${index}` };
    return { coin, oiCoins: ctx.openInterest, oiUsd: ctx.openInterest * ctx.markPx };
  });
}
