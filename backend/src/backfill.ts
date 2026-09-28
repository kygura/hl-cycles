// One-shot headless backfill: downloads Binance BTCUSDT perp history to fill in what
// Hyperliquid doesn't have (pre-2023-05-12 funding/premium, and all open-interest history),
// and merges it into data/funding.json and data/oi-history.json. Idempotent — safe to rerun.
//
// Usage: bun run backfill  (from repo root or backend/)
import { loadFunding, saveFunding, loadOiHistory, saveOiHistory, mergeByT } from "./store";
import { backfillFunding, backfillOiHistory } from "./sources/binance";
import { FUNDING_GENESIS } from "./refresh";

const HOUR = 3_600_000;
const BINANCE_HISTORY_START = Date.parse("2020-01-01T00:00:00Z");
const OI_HISTORY_START_DATE = "2020-09-01";
// The OI step downloads ~2200 daily zips total; a run can be killed mid-way (process limits,
// terminal closed, etc), so it checkpoints to disk every chunk instead of once at the end —
// a rerun then resumes from the last saved row instead of redownloading everything.
const OI_CHUNK_DAYS = 30;

function range(rows: { t: number }[]): string {
  if (rows.length === 0) return "empty";
  const first = new Date(rows[0]!.t).toISOString();
  const last = new Date(rows[rows.length - 1]!.t).toISOString();
  return `${rows.length} rows, ${first} .. ${last}`;
}

function* dateChunks(startDate: string, endDateExclusive: string, chunkDays: number): Generator<[string, string]> {
  let cursor = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDateExclusive}T00:00:00Z`);
  while (cursor < end) {
    const chunkEnd = Math.min(cursor + chunkDays * 86_400_000, end);
    yield [new Date(cursor).toISOString().slice(0, 10), new Date(chunkEnd).toISOString().slice(0, 10)];
    cursor = chunkEnd;
  }
}

// Exported (not just run at the bottom of this file) so a cron module can call these
// incremental steps directly without re-running this file as a script.
export async function backfillFundingStep(): Promise<void> {
  const existing = await loadFunding();
  const hlTs = existing.filter((r) => r.src == null).map((r) => r.t);
  const beforeT = hlTs.length ? Math.min(...hlTs) : FUNDING_GENESIS;
  const alreadyBackfilled = existing.some((r) => r.src === "binance" && r.t <= BINANCE_HISTORY_START);

  let merged = existing;
  if (alreadyBackfilled) {
    console.log("funding: Binance backfill already present from 2020-01, skipping download");
  } else {
    const binanceRows = await backfillFunding(beforeT);
    // existing (HL) rows are the "incoming" side of the merge so they always win any collision.
    merged = mergeByT(binanceRows, existing);
    await saveFunding(merged);
    console.log(`funding: +${binanceRows.length} Binance rows backfilled (before ${new Date(beforeT).toISOString()})`);
  }
  console.log(`data/funding.json: ${range(merged)}`);
}

export async function backfillOiStep(): Promise<void> {
  let merged = await loadOiHistory();
  const startDate = merged.length
    ? new Date(merged[merged.length - 1]!.t + HOUR).toISOString().slice(0, 10)
    : OI_HISTORY_START_DATE;
  const todayUtc = new Date().toISOString().slice(0, 10); // today's data isn't published yet

  if (startDate >= todayUtc) {
    console.log("oi-history: already up to date, skipping download");
    console.log(`data/oi-history.json: ${range(merged)}`);
    return;
  }

  let totalFetched = 0;
  let totalSkipped = 0;
  for (const [chunkStart, chunkEnd] of dateChunks(startDate, todayUtc, OI_CHUNK_DAYS)) {
    const { rows, fetched, skipped404 } = await backfillOiHistory(chunkStart, chunkEnd);
    totalFetched += fetched;
    totalSkipped += skipped404;
    merged = mergeByT(merged, rows);
    await saveOiHistory(merged); // checkpoint: survives a kill between chunks
    console.log(`oi-history: ${chunkStart}..${chunkEnd} done (+${fetched}, ${skipped404} 404), ${merged.length} rows so far`);
  }
  console.log(`oi-history: fetched ${totalFetched} days total, skipped ${totalSkipped} not-yet-published (404)`);
  console.log(`data/oi-history.json: ${range(merged)}`);
}

if (import.meta.main) {
  await backfillFundingStep();
  await backfillOiStep();
}
