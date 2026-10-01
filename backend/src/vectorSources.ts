// Phase 4 vector data refresh (SPEC.md 4.1 D3, 4.2): runs only in the daily `cron --backfill`
// branch (and `bun run vector-fetch` locally). Each source is independent: a failure keeps the
// last-good file and is recorded in state.json `vectorSources[name]`; cron fails the job only
// once a source has gone more than 3 days without a success (cronLogic.staleVectorSources).
// First run (empty file) pulls full history; later runs re-fetch from the trailing 14 days where
// the API takes a start param, else re-fetch everything (all such sources are one cheap call per
// series), and mergeSeriesFile overwrites the overlapping days.
//
// Usage: bun run vector-fetch   (from backend/)
import { loadSeriesFile, saveSeriesFile, mergeSeriesFile, quarantineSeriesFile, loadState, saveState, type SeriesFile, type VectorSourceState } from "./store";
import { DAY } from "./model/indicators";
import { dayStart, type FetchImpl, type FetchResult } from "./sources/daily";
import { fetchCoinMetrics } from "./sources/coinmetrics";
import { fetchBGeometrics } from "./sources/bgeometrics";
import { fetchFred } from "./sources/fred";
import { fetchStablecoins } from "./sources/defillama";
import { fetchDvol, fetchOptionsSnapshot } from "./sources/deribit";
import { fetchFearGreed } from "./sources/feargreed";
import { errMsg } from "./cronLogic";

const OVERLAP_MS = 14 * DAY;
export const VECTOR_DEADLINE_MS = 8 * 60_000; // whole refresh, well inside the job's 20 min

export type VectorSource = {
  name: string;
  file: string;
  // `since` = trailing-window start for an incremental run, null on first run (full history).
  fetch: (since: number | null, fetchImpl: FetchImpl) => Promise<FetchResult>;
  /** History is built from daily snapshots and can't be re-fetched: a corrupt file is never discarded. */
  snapshotOnly?: boolean;
  /** Skip when it already succeeded this UTC day (bitcoin-data: 15 requests/day keyless). */
  oncePerDay?: boolean;
};

export const VECTOR_SOURCES: VectorSource[] = [
  { name: "coinmetrics", file: "onchain-cm.json", fetch: fetchCoinMetrics },
  { name: "bgeometrics", file: "onchain-bg.json", fetch: (_since, f) => fetchBGeometrics(f), oncePerDay: true },
  { name: "fred", file: "macro-fred.json", fetch: (_since, f) => fetchFred(f) },
  { name: "defillama", file: "stables.json", fetch: (_since, f) => fetchStablecoins(f) },
  { name: "deribit-dvol", file: "dvol.json", fetch: fetchDvol },
  { name: "deribit-skew", file: "options-skew.json", fetch: (_since, f) => fetchOptionsSnapshot(f), snapshotOnly: true },
  { name: "feargreed", file: "feargreed.json", fetch: fetchFearGreed },
];

/** Masks credential query values (`token=`, `api_key=`) in anything that reaches logs or state.json. */
export function redact(msg: string): string {
  return msg.replace(/\b(token|api_key)=[^&\s"']*/gi, "$1=***");
}

// Corrupt file: move it aside and pull full history, unless the history can't be re-fetched.
async function loadOrQuarantine(src: VectorSource, now: number): Promise<SeriesFile> {
  try {
    return await loadSeriesFile(src.file);
  } catch (err) {
    if (src.snapshotOnly) throw err;
    const to = await quarantineSeriesFile(src.file, now);
    console.error(`vector ${src.name}: corrupt data/${src.file} moved to ${to}, re-fetching full history: ${errMsg(err)}`);
    return { series: {}, fetchedAt: null };
  }
}

async function persist(vectorSources: Record<string, VectorSourceState>) {
  try {
    const s = await loadState();
    await saveState({ lastRefresh: s?.lastRefresh ?? null, lastError: s?.lastError ?? null, vectorSources });
  } catch (err) {
    console.error(`vector: could not persist state.json: ${errMsg(err)}`);
  }
}

// Never throws. Returns the updated per-source state map (prev entries kept for untouched names),
// also persisted to state.json after every source so a killed run keeps what already finished.
export async function refreshVector(
  prev: Record<string, VectorSourceState> = {},
  sources: VectorSource[] = VECTOR_SOURCES,
  fetchImpl: FetchImpl = fetch,
  now = Date.now(),
  deadlineMs = VECTOR_DEADLINE_MS,
): Promise<Record<string, VectorSourceState>> {
  const deadline = AbortSignal.timeout(deadlineMs);
  const f = ((url: string, init?: RequestInit) =>
    fetchImpl(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline })) as FetchImpl;
  const out = { ...prev };
  for (const src of sources) {
    const lastOk = prev[src.name]?.lastOk ?? null;
    if (src.oncePerDay && lastOk != null && dayStart(lastOk) === dayStart(now)) {
      console.log(`vector ${src.name}: already fetched today, skipped`);
      continue;
    }
    try {
      const existing = await loadOrQuarantine(src, now);
      // Oldest last-row across series, so a lagging series still gets its own gap re-fetched.
      const lastTs = Object.values(existing.series).filter((r) => r.length).map((r) => r[r.length - 1]!.t);
      const since = lastTs.length ? Math.min(...lastTs) - OVERLAP_MS : null;
      const { series, error } = await src.fetch(since, f);
      const empty = Object.entries(series).filter(([, rows]) => rows.length === 0).map(([k]) => k);
      if (Object.keys(series).length === 0 || empty.length) throw new Error(`no rows for ${empty.join(", ") || "any series"}`);
      const merged = mergeSeriesFile(existing, series, now);
      await saveSeriesFile(src.file, merged);
      out[src.name] = { lastOk: now, lastError: error ? redact(error) : null };
      const counts = Object.entries(merged.series).map(([k, r]) => `${k}=${r.length}`).join(" ");
      console.log(`vector ${src.name}: ok${error ? ` (partial: ${redact(error)})` : ""} -> data/${src.file} ${counts}`);
    } catch (err) {
      out[src.name] = { lastOk, lastError: redact(`${src.name}: ${errMsg(err)}`) };
      console.error(`vector ${src.name}: failed, kept last-good file: ${out[src.name]!.lastError}`);
    }
    await persist(out);
  }
  return out;
}

if (import.meta.main) {
  const state = await loadState();
  await refreshVector(state?.vectorSources ?? {});
}
