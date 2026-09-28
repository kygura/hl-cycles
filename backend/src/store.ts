// Plain JSON file storage under data/ (git-ignored). DATA_DIR env overrides
// the directory for tests. Every write is atomic (tmp file + rename) so a
// crash mid-write never corrupts the previous good file.
import { mkdir, rename, writeFile, readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Candle, FundingRow, OiRow, Snapshot } from "./types";

export type CandleKey =
  | "hl-1h"
  | "hl-4h"
  | "hl-1d"
  | "bitstamp-1d"
  | "hl-15m"
  | `hl-${string}-${"15m" | "1h"}`;

function dataDir(): string {
  return process.env.DATA_DIR ?? join(import.meta.dir, "..", "..", "data");
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function atomicWrite(path: string, contents: string) {
  const dir = path.slice(0, path.lastIndexOf("/"));
  await ensureDir(dir);
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, contents, "utf8");
  await rename(tmpPath, path);
}

async function readJsonArray<T>(path: string): Promise<T[]> {
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8").catch(() => "");
  if (!raw.trim()) return [];
  // A corrupt file must THROW, not silently return []: a caller that merges "existing" with
  // freshly-fetched incremental rows and saves the result would otherwise overwrite years of
  // real history with just the new rows, mistaking corruption for "no prior data". Throwing lets
  // refreshAll's per-source try/catch record the error and leave the corrupt file untouched
  // instead of destroying it.
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${path}: expected a JSON array, got ${typeof parsed}`);
  return parsed as T[];
}

// Dedup by t, sort ascending. On a collision the LATER argument (incoming)
// wins — that's how an open candle's row keeps getting refreshed by each
// new fetch.
export function mergeByT<T extends { t: number }>(existing: T[], incoming: T[]): T[] {
  const byT = new Map<number, T>();
  for (const row of existing) byT.set(row.t, row);
  for (const row of incoming) byT.set(row.t, row);
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

// Retention helpers for alt series (SPEC.md 3.3): applied at save time, after merging.
// Rows must already be sorted ascending by t (every merge/store function here keeps that).
export function keepLast<T>(rows: T[], n: number): T[] {
  return rows.length <= n ? rows : rows.slice(rows.length - n);
}

export function keepSince<T extends { t: number }>(rows: T[], since: number): T[] {
  return rows.filter((r) => r.t >= since);
}

function candlesPath(key: CandleKey): string {
  return join(dataDir(), `candles-${key}.json`);
}

export async function loadCandles(key: CandleKey): Promise<Candle[]> {
  return readJsonArray<Candle>(candlesPath(key));
}

export async function saveCandles(key: CandleKey, candles: Candle[]): Promise<void> {
  await atomicWrite(candlesPath(key), JSON.stringify(candles));
}

function fundingPath(): string {
  return join(dataDir(), "funding.json");
}

export async function loadFunding(): Promise<FundingRow[]> {
  return readJsonArray<FundingRow>(fundingPath());
}

export async function saveFunding(rows: FundingRow[]): Promise<void> {
  await atomicWrite(fundingPath(), JSON.stringify(rows));
}

function oiHistoryPath(): string {
  return join(dataDir(), "oi-history.json");
}

export async function loadOiHistory(): Promise<OiRow[]> {
  return readJsonArray<OiRow>(oiHistoryPath());
}

export async function saveOiHistory(rows: OiRow[]): Promise<void> {
  await atomicWrite(oiHistoryPath(), JSON.stringify(rows));
}

// Per-alt funding (data/funding-<COIN>.json, SPEC.md 3.3). BTC keeps its own data/funding.json
// via loadFunding/saveFunding above, untouched.
function altFundingPath(coin: string): string {
  return join(dataDir(), `funding-${coin}.json`);
}

export async function loadAltFunding(coin: string): Promise<FundingRow[]> {
  return readJsonArray<FundingRow>(altFundingPath(coin));
}

export async function saveAltFunding(coin: string, rows: FundingRow[]): Promise<void> {
  await atomicWrite(altFundingPath(coin), JSON.stringify(rows));
}

// Per-alt Hyperliquid OI snapshots (data/oi-hl-<COIN>.json, SPEC.md 3.3), distinct from the
// Binance-proxy data/oi-history.json used for BTC.
function altOiPath(coin: string): string {
  return join(dataDir(), `oi-hl-${coin}.json`);
}

export async function loadAltOi(coin: string): Promise<OiRow[]> {
  return readJsonArray<OiRow>(altOiPath(coin));
}

export async function saveAltOi(coin: string, rows: OiRow[]): Promise<void> {
  await atomicWrite(altOiPath(coin), JSON.stringify(rows));
}

// Persisted refresh state (SPEC.md 3.1): lets a fresh process (Vercel build, no scheduler run)
// know lastRefresh/lastError without ever calling refreshAll() itself.
export type PersistedState = { lastRefresh: number | null; lastError: string | null };

function statePath(): string {
  return join(dataDir(), "state.json");
}

export async function loadState(): Promise<PersistedState | null> {
  const path = statePath();
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf8").catch(() => "");
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as PersistedState;
  } catch {
    // state.json is cosmetic (last-refresh display only); a corrupt file shouldn't crash refresh.
    return null;
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  await atomicWrite(statePath(), JSON.stringify(state));
}

function snapshotsPath(): string {
  return join(dataDir(), "snapshots.jsonl");
}

export async function appendSnapshot(snapshot: Snapshot): Promise<void> {
  const dir = dataDir();
  await ensureDir(dir);
  const line = `${JSON.stringify(snapshot)}\n`;
  await appendFile(snapshotsPath(), line, "utf8");
}

export async function readSnapshots(): Promise<Snapshot[]> {
  const path = snapshotsPath();
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8").catch(() => "");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  const out: Snapshot[] = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      out.push(JSON.parse(lines[i]!) as Snapshot);
    } catch {
      // A malformed trailing line (partial write mid-crash) is skipped; a malformed line in the
      // middle would indicate real corruption, but we skip either way rather than throw.
      continue;
    }
  }
  return out;
}
