import { Hono } from "hono";
import { z } from "zod";
import { getState, mergeHtfDaily, startScheduler } from "./refresh";
import { loadCandles, loadFunding, loadOiHistory, loadAltFunding, loadAltOi, readSnapshots, loadSeriesFile, loadState } from "./store";
import { computeHtf, resampleWeekly, HALVINGS, type HtfPoint } from "./model/htf";
import { computeLtf, resampleCandles, type LtfInterval, type LtfPoint } from "./model/ltf";
import { signals, overview } from "./model/composite";
import { derivatives, predictedApr } from "./model/derivatives";
import { buildVector, type VectorPayload } from "./model/vector";
import { VECTOR_SOURCES } from "./vectorSources";
import { ASSETS, ALTS } from "./assets";
import type { FundingRow, OiRow, Snapshot } from "./types";

const ASSET_LTF_LIMIT = 1500;
const ALT_4H_BUCKET_MS = 14_400_000;

const app = new Hono();

// ponytail: one module-level cache, rebuilt only when refresh/snapshot state
// changes (lastRefresh/lastSnapshot as the memo key). Recomputes both LTF
// intervals even if a request only needs one; fine at this data size (~5500
// daily / ~10k 1h rows) — split per-interval memoization if that ever shows up.
type Cache = {
  key: string;
  htf: HtfPoint[];
  ltf: Record<LtfInterval, LtfPoint[]>;
  lastSnapshotRow: Snapshot | null;
  snapshots: Snapshot[];
  funding: FundingRow[];
  oiHistory: OiRow[];
  counts: { candles1d: number; candles4h: number; candles1h: number; funding: number; snapshots: number };
};
let cache: Cache | null = null;

async function getCache(): Promise<Cache> {
  const state = getState();
  const key = `${state.lastRefresh}:${state.lastSnapshot}`;
  if (cache && cache.key === key) return cache;

  const [bitstamp, hl1d, hl4h, hl1h, hl15m, funding, snapshots, oiHistory] = await Promise.all([
    loadCandles("bitstamp-1d"),
    loadCandles("hl-1d"),
    loadCandles("hl-4h"),
    loadCandles("hl-1h"),
    loadCandles("hl-15m"),
    loadFunding(),
    readSnapshots(),
    loadOiHistory(),
  ]);

  const now = Date.now();
  const daily = mergeHtfDaily(bitstamp, hl1d);
  const htf = computeHtf(daily, now);
  const ltf: Record<LtfInterval, LtfPoint[]> = {
    "4h": computeLtf(hl4h, funding, snapshots, "4h", now, oiHistory),
    "1h": computeLtf(hl1h, funding, snapshots, "1h", now, oiHistory),
    "15m": computeLtf(hl15m, funding, snapshots, "15m", now, oiHistory),
  };

  cache = {
    key,
    htf,
    ltf,
    lastSnapshotRow: snapshots.length ? snapshots[snapshots.length - 1]! : null,
    snapshots,
    funding,
    oiHistory,
    counts: {
      candles1d: daily.length,
      candles4h: hl4h.length,
      candles1h: hl1h.length,
      funding: funding.length,
      snapshots: snapshots.length,
    },
  };
  return cache;
}

// ponytail: one Map of (coin:interval) -> sliced LtfPoint[], rebuilt lazily per combo and
// invalidated wholesale on the same lastRefresh:lastSnapshot key as `cache` above (SPEC.md 3.5).
let assetCache: { key: string; points: Map<string, LtfPoint[]> } | null = null;

async function getAssetLtf(coin: string, interval: LtfInterval): Promise<LtfPoint[]> {
  const state = getState();
  const key = `${state.lastRefresh}:${state.lastSnapshot}`;
  if (!assetCache || assetCache.key !== key) assetCache = { key, points: new Map() };
  const cacheKey = `${coin}:${interval}`;
  const cached = assetCache.points.get(cacheKey);
  if (cached) return cached;

  const now = Date.now();
  let points: LtfPoint[];
  if (coin === "BTC") {
    const { ltf } = await getCache();
    points = ltf[interval];
  } else {
    const [hl1h, hl15m, funding, oiRows] = await Promise.all([
      loadCandles(`hl-${coin}-1h`),
      loadCandles(`hl-${coin}-15m`),
      loadAltFunding(coin),
      loadAltOi(coin),
    ]);
    const candles =
      interval === "15m" ? hl15m : interval === "1h" ? hl1h : resampleCandles(hl1h, ALT_4H_BUCKET_MS);
    points = computeLtf(candles, funding, [], interval, now, oiRows);
  }

  // BTC is the main chart and keeps full history; only alts are trimmed.
  const sliced = coin === "BTC" ? points : points.slice(-ASSET_LTF_LIMIT);
  assetCache.points.set(cacheKey, sliced);
  return sliced;
}

// Phase 4 vector payload (SPEC 4.4): built lazily on first request and memoized on `cache`'s
// lastRefresh:lastSnapshot key plus every series file's fetchedAt (a vector-fetch run between two
// refreshes must still show up).
let vectorCache: { key: string; body: VectorPayload } | null = null;

async function getVector(): Promise<VectorPayload> {
  const base = await getCache();
  // A corrupt file degrades to no data (inputs go stale) instead of failing the route or the export.
  const files = await Promise.all(VECTOR_SOURCES.map((s) => loadSeriesFile(s.file).catch(() => ({ series: {}, fetchedAt: null }))));
  const key = `${base.key}:${files.map((f) => f.fetchedAt).join(",")}`;
  if (vectorCache && vectorCache.key === key) return vectorCache.body;
  const [alts, persisted] = await Promise.all([
    Promise.all(ALTS.map(async (coin) => ({ coin, candles1h: await loadCandles(`hl-${coin}-1h`), funding: await loadAltFunding(coin) }))),
    loadState(),
  ]);
  const body = buildVector({
    htf: base.htf,
    series: Object.assign({}, ...files.map((f) => f.series)),
    funding: base.funding,
    oi: base.oiHistory,
    alts,
    sources: persisted?.vectorSources ?? {},
  });
  vectorCache = { key, body };
  return body;
}

function badRequest(c: any, error: z.ZodError) {
  return c.json({ error: error.issues[0]?.message ?? "invalid query params" }, 400);
}

app.get("/api/health", async (c) => {
  const state = getState();
  const { counts } = await getCache();
  return c.json({
    ok: true,
    lastRefresh: state.lastRefresh,
    lastSnapshot: state.lastSnapshot,
    firstSnapshot: state.firstSnapshot,
    lastError: state.lastError,
    counts,
  });
});

app.get("/api/overview", async (c) => {
  const { htf, ltf, lastSnapshotRow } = await getCache();
  const state = getState();
  const price = lastSnapshotRow ? lastSnapshotRow.markPx : htf[htf.length - 1]?.c ?? 0;
  const crossVenueFunding = lastSnapshotRow
    ? lastSnapshotRow.predicted.map((p) => ({ venue: p.venue, apr: predictedApr(p) }))
    : [];
  const ov = overview({
    htf,
    ltf: ltf["4h"],
    price,
    lastRefresh: state.lastRefresh ?? 0,
    crossVenueFunding,
    now: Date.now(),
  });
  return c.json(ov);
});

const htfQuery = z.object({ interval: z.enum(["1d", "1w"]).default("1d") });

app.get("/api/htf", async (c) => {
  const parsed = htfQuery.safeParse(c.req.query());
  if (!parsed.success) return badRequest(c, parsed.error);
  const { htf } = await getCache();
  const candles = parsed.data.interval === "1w" ? resampleWeekly(htf) : htf;
  return c.json({ candles, halvings: HALVINGS });
});

app.get("/api/assets", (c) => c.json({ assets: ASSETS }));

app.get("/api/derivatives", async (c) => {
  const { snapshots, funding, oiHistory } = await getCache();
  return c.json(derivatives(snapshots, funding, Date.now(), oiHistory));
});

app.get("/api/vector", async (c) => c.json(await getVector()));

const ltfQuery = z.object({
  interval: z.enum(["15m", "1h", "4h"]).default("4h"),
  coin: z.string().optional(),
});

app.get("/api/ltf", async (c) => {
  const parsed = ltfQuery.safeParse(c.req.query());
  if (!parsed.success) return badRequest(c, parsed.error);
  const { interval, coin } = parsed.data;

  // No coin: byte-identical to the pre-Phase-3 response (full BTC history, no slicing).
  if (coin == null) {
    const { ltf } = await getCache();
    return c.json({ points: ltf[interval] });
  }

  if (!ASSETS.some((a) => a.coin === coin)) {
    return c.json({ error: `unknown coin: ${coin}` }, 400);
  }
  const points = await getAssetLtf(coin, interval);
  return c.json({ points });
});

const signalsQuery = z.object({
  frame: z.enum(["HTF", "LTF"]).optional(),
  limit: z.coerce.number().int().min(1).default(200), // capped at 1000 below, not rejected
});

app.get("/api/signals", async (c) => {
  const parsed = signalsQuery.safeParse(c.req.query());
  if (!parsed.success) return badRequest(c, parsed.error);
  const limit = Math.min(parsed.data.limit, 1000);
  const { htf, ltf } = await getCache();
  const all = signals(htf, ltf["4h"], 100_000);
  const filtered = parsed.data.frame ? all.filter((s) => s.frame === parsed.data.frame) : all;
  return c.json({ signals: filtered.slice(0, limit) });
});

app.onError((err, c) => {
  return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
});

if (process.env.NO_SCHEDULER !== "1") {
  void startScheduler();
}

export { app };
export default {
  port: 8787,
  hostname: "127.0.0.1",
  fetch: app.fetch,
};
