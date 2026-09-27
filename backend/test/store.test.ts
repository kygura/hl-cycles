import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mergeByT,
  loadCandles,
  saveCandles,
  loadFunding,
  saveFunding,
  appendSnapshot,
  readSnapshots,
} from "../src/store";
import { mergeHtfDaily } from "../src/refresh";
import type { Candle, Snapshot } from "../src/types";

async function withTmpDataDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "hl-cycles-test-"));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prev;
  }
}

function candle(t: number, v: number, src: "hl" | "bitstamp" = "hl"): Candle {
  return { t, o: 1, h: 2, l: 0.5, c: 1.5, v, src };
}

describe("mergeByT", () => {
  test("dedups by t, sorts ascending, newer (incoming) row wins", () => {
    const existing = [candle(1000, 1), candle(2000, 1)];
    const incoming = [candle(2000, 2), candle(3000, 1)];
    const merged = mergeByT(existing, incoming);
    expect(merged.map((c) => c.t)).toEqual([1000, 2000, 3000]);
    expect(merged.find((c) => c.t === 2000)!.v).toBe(2);
  });
});

describe("candle store roundtrip", () => {
  test("saveCandles then loadCandles round-trips via atomic tmp+rename", async () => {
    await withTmpDataDir(async () => {
      const rows = [candle(1000, 1), candle(2000, 2)];
      await saveCandles("hl-1h", rows);
      const loaded = await loadCandles("hl-1h");
      expect(loaded).toEqual(rows);
    });
  });

  test("loadCandles returns [] when file does not exist", async () => {
    await withTmpDataDir(async () => {
      const loaded = await loadCandles("hl-1d");
      expect(loaded).toEqual([]);
    });
  });
});

describe("funding store roundtrip", () => {
  test("saveFunding then loadFunding round-trips", async () => {
    await withTmpDataDir(async () => {
      const rows = [{ t: 1, rate: 0.001, premium: -0.0001 }];
      await saveFunding(rows);
      expect(await loadFunding()).toEqual(rows);
    });
  });
});

describe("snapshots append", () => {
  test("appendSnapshot appends jsonl lines, readSnapshots parses them all", async () => {
    await withTmpDataDir(async () => {
      const snap = (t: number): Snapshot => ({
        t,
        markPx: 1,
        oraclePx: 1,
        oiCoins: 1,
        oiUsd: 1,
        funding: 0,
        premium: null,
        dayNtlVlm: 0,
        predicted: [],
      });
      await appendSnapshot(snap(1));
      await appendSnapshot(snap(2));
      const all = await readSnapshots();
      expect(all.map((s) => s.t)).toEqual([1, 2]);
    });
  });
});

describe("mergeHtfDaily", () => {
  const DAY = 86400000;

  test("uses bitstamp before first non-zero-volume HL day, HL from that day on", () => {
    const bitstamp = [candle(0, 1, "bitstamp"), candle(DAY, 1, "bitstamp"), candle(2 * DAY, 1, "bitstamp")];
    const hl = [candle(DAY, 0, "hl"), candle(2 * DAY, 5, "hl"), candle(3 * DAY, 5, "hl")];
    const merged = mergeHtfDaily(bitstamp, hl);
    // day 0: bitstamp only (before cutoff)
    // day 1: bitstamp still wins (HL day1 has v=0, cutoff is day2)
    // day 2 onward: HL wins (first non-zero-volume day)
    expect(merged.map((c) => c.t)).toEqual([0, DAY, 2 * DAY, 3 * DAY]);
    expect(merged.find((c) => c.t === 2 * DAY)!.src).toBe("hl");
    expect(merged.find((c) => c.t === DAY)!.src).toBe("bitstamp");
  });

  test("falls back to all-bitstamp when HL has no non-zero-volume candle", () => {
    const bitstamp = [candle(0, 1, "bitstamp")];
    const hl = [candle(0, 0, "hl")];
    const merged = mergeHtfDaily(bitstamp, hl);
    expect(merged).toEqual(bitstamp);
  });
});
