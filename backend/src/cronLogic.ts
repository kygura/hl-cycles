// Pure helpers for cron.ts, split out so they're unit-testable without importing cron.ts itself
// (which runs network calls as a side effect of module load — see its usage comment).

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
