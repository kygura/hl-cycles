import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs export.ts as a real subprocess rather than importing it in-process: bun test shares one
// module registry across all test files, and api.test.ts already loads "../src/server" against
// its own fixture DATA_DIR — a second in-process import would just return that cached module.
describe("bun run export", () => {
  test("writes all 8 static routes as 200s to the given out dir", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "hl-cycles-export-data-"));
    const outDir = await mkdtemp(join(tmpdir(), "hl-cycles-export-out-"));

    const bitstampRaw = await readFile(join(import.meta.dir, "fixtures/bitstamp-1d.json"), "utf8");
    await writeFile(join(dataDir, "candles-bitstamp-1d.json"), bitstampRaw);
    await writeFile(join(dataDir, "candles-hl-1d.json"), "[]");
    await writeFile(join(dataDir, "candles-hl-4h.json"), "[]");
    await writeFile(join(dataDir, "candles-hl-1h.json"), "[]");
    await writeFile(join(dataDir, "funding.json"), "[]");

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
    expect(files).toEqual([
      "health.json",
      "htf-1d.json",
      "htf-1w.json",
      "ltf-1h.json",
      "ltf-4h.json",
      "overview.json",
      "signals-HTF.json",
      "signals-LTF.json",
    ]);
    for (const f of files) {
      const raw = await readFile(join(outDir, f), "utf8");
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  });
});
