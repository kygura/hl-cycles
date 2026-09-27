// Refresh orchestration: backfill on first run, incremental afterward, plus
// the 15-minute snapshot scheduler. Never throws out of the scheduler —
// failures are logged into state.lastError and cached data keeps serving.
import { fetchCandles, fetchFunding, fetchSnapshot, type HlInterval } from "./sources/hyperliquid";
import { fetchBitstampDaily } from "./sources/bitstamp";
import {
  loadCandles,
  saveCandles,
  loadFunding,
  saveFunding,
  appendSnapshot,
  readSnapshots,
  mergeByT,
  type CandleKey,
} from "./store";
import type { Candle } from "./types";

const COIN = "BTC";
const FUNDING_GENESIS = Date.parse("2023-05-12T00:00:00Z");
const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

type RefreshState = {
  lastRefresh: number | null;
  lastSnapshot: number | null;
  firstSnapshot: number | null;
  lastError: string | null;
};

const state: RefreshState = {
  lastRefresh: null,
  lastSnapshot: null,
  firstSnapshot: null,
  lastError: null,
};

export function getState(): RefreshState {
  return { ...state };
}

// Cache of the two daily series feeding htfDaily(); populated by refreshAll.
const dailyCache = {
  bitstamp: [] as Candle[],
  hl: [] as Candle[],
};

function floorToUtcDay(t: number): number {
  return Math.floor(t / 86400000) * 86400000;
}

// Pure merge rule (SPEC.md): Bitstamp before the first HL 1d candle with
// non-zero volume, HL from that day on. Exported separately so it's testable
// without touching disk.
export function mergeHtfDaily(bitstamp: Candle[], hl: Candle[]): Candle[] {
  const hlSorted = [...hl].sort((a, b) => a.t - b.t);
  const firstReal = hlSorted.find((c) => c.v > 0);
  const cutoff = firstReal ? floorToUtcDay(firstReal.t) : Infinity;
  const bsPart = bitstamp.filter((c) => floorToUtcDay(c.t) < cutoff);
  const hlPart = hlSorted.filter((c) => floorToUtcDay(c.t) >= cutoff);
  return mergeByT(bsPart, hlPart);
}

export function htfDaily(): Candle[] {
  return mergeHtfDaily(dailyCache.bitstamp, dailyCache.hl);
}

async function refreshHlCandles(key: CandleKey, interval: HlInterval): Promise<void> {
  const existing = await loadCandles(key);
  const startTime = existing.length ? existing[existing.length - 1]!.t + 1 : 0;
  const incoming = await fetchCandles(COIN, interval, startTime);
  const merged = mergeByT(existing, incoming);
  await saveCandles(key, merged);
}

async function refreshBitstamp(): Promise<void> {
  const existing = await loadCandles("bitstamp-1d");
  const startSec = existing.length
    ? existing[existing.length - 1]!.t / 1000 + 86400
    : undefined;
  const incoming = await fetchBitstampDaily(startSec);
  const merged = mergeByT(existing, incoming);
  await saveCandles("bitstamp-1d", merged);
}

async function refreshFunding(): Promise<void> {
  const existing = await loadFunding();
  const startTime = existing.length ? existing[existing.length - 1]!.t + 1 : FUNDING_GENESIS;
  const incoming = await fetchFunding(COIN, startTime);
  const merged = mergeByT(existing, incoming);
  await saveFunding(merged);
}

let refreshing = false;

export async function refreshAll(): Promise<void> {
  if (refreshing) return; // guard against overlapping runs
  refreshing = true;
  try {
    await refreshBitstamp();
    await refreshHlCandles("hl-1h", "1h");
    await refreshHlCandles("hl-4h", "4h");
    await refreshHlCandles("hl-1d", "1d");
    await refreshHlCandles("hl-1w", "1w");
    await refreshFunding();
    dailyCache.bitstamp = await loadCandles("bitstamp-1d");
    dailyCache.hl = await loadCandles("hl-1d");
    state.lastRefresh = Date.now();
    state.lastError = null;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    refreshing = false;
  }
}

export async function takeSnapshot(): Promise<void> {
  try {
    const snapshot = await fetchSnapshot(COIN);
    await appendSnapshot(snapshot);
    state.lastSnapshot = snapshot.t;
    if (state.firstSnapshot === null) state.firstSnapshot = snapshot.t;
    state.lastError = null;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
  }
}

let schedulerStarted = false;

export async function startScheduler(): Promise<void> {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const existingSnapshots = await readSnapshots();
  if (existingSnapshots.length > 0) {
    state.firstSnapshot = existingSnapshots[0]!.t;
    state.lastSnapshot = existingSnapshots[existingSnapshots.length - 1]!.t;
  }

  await refreshAll();
  await takeSnapshot();

  setInterval(() => {
    void refreshAll().then(() => takeSnapshot());
  }, SNAPSHOT_INTERVAL_MS);
}
