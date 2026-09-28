// Refresh orchestration: backfill on first run, incremental afterward, plus
// the 15-minute snapshot scheduler. Never throws out of the scheduler —
// failures are logged into state.lastError and cached data keeps serving.
import { fetchCandles, fetchFunding, fetchSnapshot, fetchOi, type HlInterval } from "./sources/hyperliquid";
import { fetchBitstampDaily } from "./sources/bitstamp";
import {
  loadCandles,
  saveCandles,
  loadFunding,
  saveFunding,
  loadAltFunding,
  saveAltFunding,
  loadAltOi,
  saveAltOi,
  loadState,
  appendSnapshot,
  readSnapshots,
  mergeByT,
  keepLast,
  keepSince,
  type CandleKey,
} from "./store";
import { ALTS } from "./assets";
import type { Candle } from "./types";

const COIN = "BTC";
export const FUNDING_GENESIS = Date.parse("2023-05-12T00:00:00Z");
const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;
const ALT_RETENTION_MS = 125 * 86_400_000; // 125 days (SPEC.md 3.3)

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

// Initialize firstSnapshot/lastSnapshot from snapshots.jsonl on module load (not gated by the
// scheduler), so getState() is correct under NO_SCHEDULER and right after a process restart,
// before any in-process refresh/snapshot has run.
const bootSnapshots = await readSnapshots();
if (bootSnapshots.length > 0) {
  state.firstSnapshot = bootSnapshots[0]!.t;
  state.lastSnapshot = bootSnapshots[bootSnapshots.length - 1]!.t;
}

// Seed lastRefresh/lastError from data/state.json (SPEC.md 3.1): at Vercel build time
// refreshAll() never runs, so without this lastRefresh would stay null and the UI would show
// "not refreshed yet" even though data/ was freshly collected by the last GitHub Actions run.
const bootState = await loadState();
if (bootState) {
  state.lastRefresh = bootState.lastRefresh;
  state.lastError = bootState.lastError;
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

async function refreshHlCandles(
  key: CandleKey,
  interval: HlInterval,
  coin: string = COIN,
  retain?: (rows: Candle[]) => Candle[],
): Promise<void> {
  const existing = await loadCandles(key);
  const startTime = existing.length ? existing[existing.length - 1]!.t + 1 : 0;
  const incoming = await fetchCandles(coin, interval, startTime);
  let merged = mergeByT(existing, incoming);
  if (retain) merged = retain(merged);
  await saveCandles(key, merged);
}

async function refreshAltFunding(coin: string): Promise<void> {
  const existing = await loadAltFunding(coin);
  const since = Date.now() - ALT_RETENTION_MS;
  const startTime = existing.length ? Math.max(existing[existing.length - 1]!.t + 1, since) : since;
  const incoming = await fetchFunding(coin, startTime);
  const merged = keepSince(mergeByT(existing, incoming), since);
  await saveAltFunding(coin, merged);
}

// One metaAndAssetCtxs call covers every alt (SPEC.md 3.3). A per-coin failure (missing from the
// universe) is collected as its own "<coin>-oi: <message>" string -- same "<coin>-<suffix>" shape
// as the other per-alt tasks below, so callers (cron.ts's shouldFail) can attribute failures back
// to a coin without parsing a nested error message.
async function refreshOi(): Promise<string[]> {
  const results = await fetchOi(ALTS);
  const errors: string[] = [];
  const since = Date.now() - ALT_RETENTION_MS;
  const now = Date.now();
  for (const r of results) {
    if ("error" in r) {
      errors.push(`${r.coin}-oi: ${r.error}`);
      continue;
    }
    const existing = await loadAltOi(r.coin);
    const merged = keepSince(
      mergeByT(existing, [{ t: now, oiCoins: r.oiCoins, oiUsd: r.oiUsd, src: "hl" as const }]),
      since,
    );
    await saveAltOi(r.coin, merged);
  }
  return errors;
}

// Every alt refreshes independently — one alt's 15m/1h/funding call failing must never skip the
// others (SPEC.md 3.3). Returns a list of "<coin>-<suffix>: <message>" strings, same shape
// refreshAll collects for the BTC sources, so refreshAll can just concatenate the two.
export async function refreshAssets(): Promise<string[]> {
  const errors: string[] = [];
  const tasks: Array<[string, () => Promise<void>]> = [];
  for (const coin of ALTS) {
    tasks.push([
      `${coin}-15m`,
      () => refreshHlCandles(`hl-${coin}-15m`, "15m", coin, (rows) => keepLast(rows, 5000)),
    ]);
    tasks.push([
      `${coin}-1h`,
      () => refreshHlCandles(`hl-${coin}-1h`, "1h", coin, (rows) => keepLast(rows, 3000)),
    ]);
    tasks.push([`${coin}-funding`, () => refreshAltFunding(coin)]);
  }
  for (const [name, run] of tasks) {
    try {
      await run();
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  try {
    errors.push(...(await refreshOi()));
  } catch (err) {
    errors.push(`oi: ${err instanceof Error ? err.message : String(err)}`);
  }
  return errors;
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

// Each source refreshes independently: one source failing (rate limit, network blip) must not
// skip the others. Errors are collected into a single summary string on state.lastError (null
// when every source succeeded), and returned split by BTC-vs-alt so cron.ts can decide severity
// (a BTC source failing is always fatal; a single flaky alt is not).
export async function refreshAll(): Promise<{ btcErrors: string[]; altErrors: string[] }> {
  if (refreshing) return { btcErrors: [], altErrors: [] }; // guard against overlapping runs
  refreshing = true;
  const btcErrors: string[] = [];
  const sources: Array<[string, () => Promise<void>]> = [
    ["bitstamp", refreshBitstamp],
    ["hl-1h", () => refreshHlCandles("hl-1h", "1h")],
    ["hl-4h", () => refreshHlCandles("hl-4h", "4h")],
    ["hl-1d", () => refreshHlCandles("hl-1d", "1d")],
    ["hl-15m", () => refreshHlCandles("hl-15m", "15m", COIN, (rows) => keepLast(rows, 5000))],
    ["funding", refreshFunding],
  ];
  for (const [name, run] of sources) {
    try {
      await run();
    } catch (err) {
      btcErrors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const altErrors = await refreshAssets();
  try {
    dailyCache.bitstamp = await loadCandles("bitstamp-1d");
    dailyCache.hl = await loadCandles("hl-1d");
  } catch (err) {
    btcErrors.push(`daily-cache: ${err instanceof Error ? err.message : String(err)}`);
  }
  state.lastRefresh = Date.now();
  const errors = [...btcErrors, ...altErrors];
  state.lastError = errors.length ? errors.join("; ") : null;
  refreshing = false;
  return { btcErrors, altErrors };
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

  await refreshAll();
  await takeSnapshot();

  setInterval(() => {
    void refreshAll().then(() => takeSnapshot());
  }, SNAPSHOT_INTERVAL_MS);
}
