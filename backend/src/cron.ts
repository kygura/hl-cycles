// One-shot headless collector for GitHub Actions (*/30 + daily cron): refresh sources, take an
// OI/price snapshot, optionally run the incremental daily backfill, then persist state.json.
// Never starts the recurring in-process scheduler — that's server.ts's job when serving locally.
// No longer builds the static export (SPEC.md 3.1): Vercel does that at deploy time from the
// committed data/ files via `bun run export`. Exits non-zero if a BTC-pipeline step errored, if
// more than half the alts failed (see shouldFail below), or (daily run) if a Phase 4 vector source
// has gone more than 3 days without a success; a single flaky alt or vector source just warns.
//
// Usage: bun run cron [-- --backfill]
import { getState, refreshAll, takeSnapshot } from "./refresh";
import { backfillFundingStep, backfillOiStep } from "./backfill";
import { loadState, saveState } from "./store";
import { refreshVector, VECTOR_SOURCES } from "./vectorSources";
import { ALTS } from "./assets";
import { errMsg, shouldFail, staleVectorSources } from "./cronLogic";

// refreshAll()/takeSnapshot() already catch their own internal errors and never throw under
// normal operation, but they're wrapped here too anyway: this script's whole point is
// "state.json must reflect what actually happened, and the job must fail loudly on a real
// error", so an unexpected throw from either one must not skip past the state save below.
let btcErrors: string[] = [];
let altErrors: string[] = [];
try {
  ({ btcErrors, altErrors } = await refreshAll());
} catch (err) {
  btcErrors = [errMsg(err)];
}

let snapshotError: string | null = null;
try {
  await takeSnapshot();
  snapshotError = getState().lastError;
} catch (err) {
  snapshotError = errMsg(err);
}

let backfillError: string | null = null;
let vectorStale: string[] = [];
const prevState = await loadState();
let vectorSources = prevState?.vectorSources;
if (process.argv.includes("--backfill")) {
  try {
    await backfillFundingStep();
    await backfillOiStep();
  } catch (err) {
    backfillError = errMsg(err);
  }
  // Phase 4 sources: a failed fetch is a warning; only a source stale beyond 3 days is fatal.
  vectorSources = await refreshVector(vectorSources ?? {});
  for (const s of Object.values(vectorSources)) if (s.lastError) console.log(`::warning::cron: vector source: ${s.lastError}`);
  vectorStale = staleVectorSources(vectorSources, VECTOR_SOURCES.map((s) => s.name), Date.now());
}

for (const e of altErrors) console.log(`::warning::cron: alt source failed: ${e}`);

const otherErrors = [snapshotError, backfillError, ...vectorStale].filter((e): e is string => e != null);
const allBtcErrors = [...btcErrors, ...otherErrors];
const allErrors = [...allBtcErrors, ...altErrors];

await saveState({
  lastRefresh: getState().lastRefresh,
  lastError: allErrors.length ? allErrors.join("; ") : null,
  ...(vectorSources ? { vectorSources } : {}),
});

if (shouldFail(allBtcErrors, altErrors, ALTS.length)) {
  console.error(`cron: completed with errors: ${allErrors.join(" | ")}`);
  process.exit(1);
}
if (allErrors.length) {
  console.log(`cron: completed with tolerated alt errors: ${allErrors.join(" | ")}`);
}
console.log("cron: ok");
