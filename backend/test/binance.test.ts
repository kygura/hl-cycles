import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseFundingCsv,
  parsePremiumCsv,
  parseMetricsCsv,
  expandFundingHourly,
  downsampleHourlyOi,
} from "../src/sources/binance";
import { mergeByT } from "../src/store";
import { computeLtf } from "../src/model/ltf";
import type { Candle, FundingRow } from "../src/types";

function fixture(name: string): string {
  return readFileSync(join(import.meta.dir, "fixtures", name), "utf8");
}

describe("parseFundingCsv", () => {
  test("parses header CSV into raw 8h events", () => {
    const rows = parseFundingCsv(fixture("binance-funding.csv"));
    expect(rows).toEqual([
      { t: 1577836800000, intervalHours: 8, rate: -0.00012 },
      { t: 1577865600000, intervalHours: 8, rate: 0.00024 },
    ]);
  });
});

describe("parsePremiumCsv", () => {
  test("parses headerless kline CSV, keeps only t + close", () => {
    const rows = parsePremiumCsv(fixture("binance-premium-headerless.csv"));
    expect(rows).toEqual([
      { t: 1577836800000, premium: -0.00080868 },
      { t: 1577840400000, premium: -0.00080084 },
    ]);
  });

  test("parses header kline CSV the same way", () => {
    const rows = parsePremiumCsv(fixture("binance-premium-header.csv"));
    expect(rows).toEqual([{ t: 1704067200000, premium: 0.00068158 }]);
  });
});

describe("parseMetricsCsv", () => {
  test("parses header CSV, dedups exact-duplicate rows by t", () => {
    const rows = parseMetricsCsv(fixture("binance-metrics.csv"));
    expect(rows).toEqual([
      { t: Date.parse("2020-09-01T00:00:00Z"), oiCoins: 39080.231, oiUsd: 456144339.23360443 },
      { t: Date.parse("2020-09-01T00:05:00Z"), oiCoins: 39106.413, oiUsd: 455693833.60853225 },
      { t: Date.parse("2020-09-01T00:55:00Z"), oiCoins: 39200, oiUsd: 458000000 },
    ]);
  });
});

describe("expandFundingHourly", () => {
  test("splits an 8h event into hourly-equivalent rows with rate/intervalHours each", () => {
    const events = [{ t: 0, intervalHours: 8, rate: 0.0008 }];
    const rows = expandFundingHourly(events, []);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ t: 0, rate: 0.0001, premium: 0, src: "binance" });
    expect(rows[7]!.t).toBe(7 * 3_600_000);
    for (const r of rows) expect(r.rate).toBeCloseTo(0.0001, 10);
  });

  test("attaches the latest premium close at or before each hour", () => {
    const events = [{ t: 0, intervalHours: 2, rate: 0.0002 }];
    const premiumRows = [
      { t: 0, premium: -0.001 },
      { t: 3_600_000, premium: 0.002 },
    ];
    const rows = expandFundingHourly(events, premiumRows);
    expect(rows.map((r) => r.premium)).toEqual([-0.001, 0.002]);
  });
});

describe("downsampleHourlyOi", () => {
  test("keeps the last 5m row per UTC hour", () => {
    const rows = [
      { t: 0, oiCoins: 1, oiUsd: 10 },
      { t: 5 * 60_000, oiCoins: 2, oiUsd: 20 },
      { t: 55 * 60_000, oiCoins: 3, oiUsd: 30 }, // last row in hour 0
      { t: 3_600_000, oiCoins: 4, oiUsd: 40 }, // hour 1
    ];
    const hourly = downsampleHourlyOi(rows);
    expect(hourly).toEqual([
      { t: 0, oiCoins: 3, oiUsd: 30, src: "binance" },
      { t: 3_600_000, oiCoins: 4, oiUsd: 40, src: "binance" },
    ]);
  });
});

describe("Binance backfill never overwrites Hyperliquid funding rows", () => {
  test("mergeByT keeps HL rows when HL is the incoming (second) argument", () => {
    const hlRows: FundingRow[] = [{ t: 1000, rate: 0.00005, premium: 0.0001 }]; // no src = HL
    const binanceRows: FundingRow[] = [{ t: 1000, rate: 0.99, premium: 0.99, src: "binance" }];
    const merged = mergeByT(binanceRows, hlRows);
    expect(merged).toEqual(hlRows);
  });
});

describe("computeLtf OI fallback to oi-history", () => {
  const BAR = 3_600_000; // 1h
  function candle(t: number): Candle {
    return { t, o: 1, h: 1, l: 1, c: 1, v: 1, src: "hl" };
  }

  test("falls back to oi-history when no snapshot is near the bar, snapshot wins when present", () => {
    const now = 10 * BAR;
    const candles = [candle(1 * BAR), candle(2 * BAR)];
    const oiHistory = [
      { t: 2 * BAR, oiCoins: 111, oiUsd: 222, src: "binance" as const },
      { t: 3 * BAR, oiCoins: 333, oiUsd: 444, src: "binance" as const },
    ];
    const points = computeLtf(candles, [], [], "1h", now, oiHistory);
    // bar 0 closes at t=2*BAR, no snapshot -> falls back to oi-history row at 2*BAR
    expect(points[0]!.oiUsd).toBe(222);
    // bar 1 closes at t=3*BAR -> falls back to oi-history row at 3*BAR
    expect(points[1]!.oiUsd).toBe(444);
  });
});
