import { Hono } from "hono";
import { z } from "zod";
import { getState, mergeHtfDaily, startScheduler } from "./refresh";
import { loadCandles, loadFunding, readSnapshots } from "./store";
import { computeHtf, resampleWeekly, HALVINGS, type HtfPoint } from "./model/htf";
import { computeLtf, type LtfInterval, type LtfPoint } from "./model/ltf";
import { signals, overview } from "./model/composite";
import type { Snapshot } from "./types";

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
  counts: { candles1d: number; candles4h: number; candles1h: number; funding: number; snapshots: number };
};
let cache: Cache | null = null;

async function getCache(): Promise<Cache> {
  const state = getState();
  const key = `${state.lastRefresh}:${state.lastSnapshot}`;
  if (cache && cache.key === key) return cache;

  const [bitstamp, hl1d, hl4h, hl1h, funding, snapshots] = await Promise.all([
    loadCandles("bitstamp-1d"),
    loadCandles("hl-1d"),
    loadCandles("hl-4h"),
    loadCandles("hl-1h"),
    loadFunding(),
    readSnapshots(),
  ]);

  const now = Date.now();
  const daily = mergeHtfDaily(bitstamp, hl1d);
  const htf = computeHtf(daily, now);
  const ltf: Record<LtfInterval, LtfPoint[]> = {
    "4h": computeLtf(hl4h, funding, snapshots, "4h", now),
    "1h": computeLtf(hl1h, funding, snapshots, "1h", now),
  };

  cache = {
    key,
    htf,
    ltf,
    lastSnapshotRow: snapshots.length ? snapshots[snapshots.length - 1]! : null,
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
    counts,
  });
});

app.get("/api/overview", async (c) => {
  const { htf, ltf, lastSnapshotRow } = await getCache();
  const state = getState();
  const price = lastSnapshotRow ? lastSnapshotRow.markPx : htf[htf.length - 1]?.c ?? 0;
  const crossVenueFunding = lastSnapshotRow
    ? lastSnapshotRow.predicted.map((p) => ({ venue: p.venue, apr: (p.rate * 8760) / p.intervalHours }))
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

const ltfQuery = z.object({ interval: z.enum(["4h", "1h"]).default("4h") });

app.get("/api/ltf", async (c) => {
  const parsed = ltfQuery.safeParse(c.req.query());
  if (!parsed.success) return badRequest(c, parsed.error);
  const { ltf } = await getCache();
  return c.json({ points: ltf[parsed.data.interval] });
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
