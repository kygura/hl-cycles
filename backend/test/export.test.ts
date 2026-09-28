import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASSETS } from "../src/assets";

const INTERVALS = ["15m", "1h", "4h"];

const EXPECTED_FILES = [
  "health.json",
  "htf-1d.json",
  "htf-1w.json",
  "ltf-1h.json",
  "ltf-4h.json",
  "overview.json",
  "signals-HTF.json",
  "signals-LTF.json",
  "assets.json",
  "derivatives.json",
  ...ASSETS.flatMap(({ coin }) => INTERVALS.map((iv) => `ltf-${coin}-${iv}.json`)),
].sort();

// Writes the minimal set of BTC data files export.ts's underlying server needs to boot without
// throwing (empty alt/oi/state files are fine — loadCandles/loadAltFunding/loadAltOi/loadState
// all degrade to [] / null on a missing file).
async function writeMinimalFixture(dataDir: string): Promise<void> {
  const bitstampRaw = await readFile(join(import.meta.dir, "fixtures/bitstamp-1d.json"), "utf8");
  await writeFile(join(dataDir, "candles-bitstamp-1d.json"), bitstampRaw);
  await writeFile(join(dataDir, "candles-hl-1d.json"), "[]");
  await writeFile(join(dataDir, "candles-hl-4h.json"), "[]");
  await writeFile(join(dataDir, "candles-hl-1h.json"), "[]");
  await writeFile(join(dataDir, "funding.json"), "[]");
}

// Runs export.ts as a real subprocess rather than importing it in-process: bun test shares one
// module registry across all test files, and api.test.ts already loads "../src/server" against
// its own fixture DATA_DIR — a second in-process import would just return that cached module.
describe("bun run export", () => {
  test("writes all 46 static routes as 200s to the given out dir", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "hl-cycles-export-data-"));
    const outDir = await mkdtemp(join(tmpdir(), "hl-cycles-export-out-"));
    await writeMinimalFixture(dataDir);

    const proc = Bun.spawn({
      cmd: ["bun", "src/export.ts", outDir],
      cwd: join(import.meta.dir, ".."),
      env: { ...process.env, DATA_DIR: dataDir, NO_SCHEDULER: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error(await new Response(proc.stderr).text());
    }
    expect(exitCode).toBe(0);

    const files = (await readdir(outDir)).sort();
    expect(files).toEqual(EXPECTED_FILES);
    for (const f of files) {
      const raw = await readFile(join(outDir, f), "utf8");
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  });

  test("with a state.json in DATA_DIR, health.json.lastRefresh is not null", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "hl-cycles-export-state-data-"));
    const outDir = await mkdtemp(join(tmpdir(), "hl-cycles-export-state-out-"));
    await writeMinimalFixture(dataDir);
    await writeFile(join(dataDir, "state.json"), JSON.stringify({ lastRefresh: 1234567, lastError: null }));

    const proc = Bun.spawn({
      cmd: ["bun", "src/export.ts", outDir],
      cwd: join(import.meta.dir, ".."),
      env: { ...process.env, DATA_DIR: dataDir, NO_SCHEDULER: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error(await new Response(proc.stderr).text());
    }
    expect(exitCode).toBe(0);

    const health = JSON.parse(await readFile(join(outDir, "health.json"), "utf8"));
    expect(health.lastRefresh).toBe(1234567);
  });
});
