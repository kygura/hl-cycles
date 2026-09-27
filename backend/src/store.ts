// Plain JSON file storage under data/ (git-ignored). DATA_DIR env overrides
// the directory for tests. Every write is atomic (tmp file + rename) so a
// crash mid-write never corrupts the previous good file.
import { mkdir, rename, writeFile, readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Candle, FundingRow, Snapshot } from "./types";

export type CandleKey = "hl-1h" | "hl-4h" | "hl-1d" | "bitstamp-1d";

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
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return []; // corrupt file: never throw out of a load, keep serving
  }
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
