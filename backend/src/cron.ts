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

await refreshAll();
const refreshError = getState().lastError; // capture before takeSnapshot() resets it

await takeSnapshot();
const snapshotError = getState().lastError;

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
