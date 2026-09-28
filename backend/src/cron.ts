// One-shot headless collector for GitHub Actions (*/15 cron): refresh sources, take an OI/price
// snapshot, optionally run the incremental daily backfill, then re-render the static API export
// for GitHub Pages. Never starts the recurring in-process scheduler — that's server.ts's job
// when serving locally. Exits non-zero if any step errored, after still exporting what it can.
//
// Usage: bun run cron [-- --backfill]
import { getState, refreshAll, takeSnapshot } from "./refresh";
import { backfillFundingStep, backfillOiStep } from "./backfill";
import { exportStatic } from "./export";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// refreshAll()/takeSnapshot() already catch their own internal errors into state.lastError and
// never throw under normal operation, but they're wrapped here too anyway: this script's whole
// point is "the static export must run and the job must still deploy on a partial failure", so
// an unexpected throw from either one must not skip straight past the export step below.
let refreshError: string | null = null;
try {
  await refreshAll();
  refreshError = getState().lastError; // capture before takeSnapshot() resets it
} catch (err) {
  refreshError = errMsg(err);
}

let snapshotError: string | null = null;
try {
  await takeSnapshot();
  snapshotError = getState().lastError;
} catch (err) {
  snapshotError = errMsg(err);
}

let backfillError: string | null = null;
if (process.argv.includes("--backfill")) {
  try {
    await backfillFundingStep();
    await backfillOiStep();
  } catch (err) {
    backfillError = errMsg(err);
  }
}

const exportErrors = await exportStatic().catch((err) => [errMsg(err)]);

const errors = [refreshError, snapshotError, backfillError, ...exportErrors].filter(
  (e): e is string => e != null,
);

if (errors.length) {
  console.error(`cron: completed with errors: ${errors.join(" | ")}`);
  process.exit(1);
}
console.log("cron: ok");
