// Pure helpers for cron.ts, split out so they're unit-testable without importing cron.ts itself
// (which runs network calls as a side effect of module load — see its usage comment).
import { DAY } from "./model/indicators";

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// BTC-source, snapshot, and backfill errors are always fatal (the dashboard's core data); alt
// errors ("<coin>-<suffix>: message") are only fatal once more than half of ALTS have at least
// one failing task.
export function shouldFail(btcErrors: string[], altErrors: string[], altCount: number): boolean {
  if (btcErrors.length > 0) return true;
  if (altCount === 0) return false;
  const failedAlts = new Set(altErrors.map((e) => e.split("-")[0])).size;
  return failedAlts > altCount / 2;
}

export const VECTOR_STALE_DAYS = 3;

/**
 * Vector sources that haven't succeeded for more than VECTOR_STALE_DAYS (or ever): these fail the
 * daily run. A source that failed only today but succeeded within the window is just a warning.
 */
export function staleVectorSources(
  states: Record<string, { lastOk: number | null }>,
  names: string[],
  now: number,
): string[] {
  return names
    .filter((n) => {
      const ok = states[n]?.lastOk ?? null;
      return ok == null || now - ok > VECTOR_STALE_DAYS * DAY;
    })
    .map((n) => `vector ${n}: no successful fetch in over ${VECTOR_STALE_DAYS} days`);
}
