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
  const HOUR = 3_600_000;

  // calc_time T pays for the 8h period [T-8h, T), matching Hyperliquid's own funding-row
  // convention (t = when the value became known, covering [t-1h, t)) — never T..T+7h, which
  // would date each hourly slice up to 7h into a future that hadn't happened yet.
  test("splits an 8h event into hourly rows ending AT calc_time, not starting from it", () => {
    const events = [{ t: 0, intervalHours: 8, rate: 0.0008 }];
    const rows = expandFundingHourly(events, []);
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.t)).toEqual([-7 * HOUR, -6 * HOUR, -5 * HOUR, -4 * HOUR, -3 * HOUR, -2 * HOUR, -1 * HOUR, 0]);
    for (const r of rows) {
      expect(r.t).toBeLessThanOrEqual(0); // no row is timestamped after calc_time T=0
      expect(r.rate).toBeCloseTo(0.0001, 10);
    }
    // no premium rows given -> null (never a fabricated 0, which is itself a real premium value)
    expect(rows.every((r) => r.premium === null)).toBe(true);
  });

  test("attaches the close of the 1h kline that CLOSES at the row's own time, not the one opening at it", () => {
    const events = [{ t: 0, intervalHours: 2, rate: 0.0002 }];
    // row times will be -1h and 0 (see above). Row -1h needs the kline covering [-2h,-1h);
    // row 0 needs the kline covering [-1h, 0).
    const premiumRows = [
      { t: -2 * HOUR, premium: -0.001 }, // covers [-2h,-1h), closes at -1h
      { t: -1 * HOUR, premium: 0.002 }, // covers [-1h,0), closes at 0
      { t: 0, premium: 99 }, // covers [0,1h) — closes AFTER row 0's own time; must never be picked
    ];
    const rows = expandFundingHourly(events, premiumRows);
    expect(rows.map((r) => r.t)).toEqual([-1 * HOUR, 0]);
    expect(rows.map((r) => r.premium)).toEqual([-0.001, 0.002]);
  });
});

describe("downsampleHourlyOi", () => {
  const HOUR = 3_600_000;

  // Raw rows are 5m samples inside [h, h+1h); the last one (e.g. h:55) is the best OI estimate
  // for the hour, but it isn't actually known until the hour closes at h+1h. Keying it at h would
  // let a query for any earlier time in that same hour see a value that didn't exist yet.
  test("keys the last 5m row per hour by the hour's CLOSE, never its start", () => {
    const rows = [
      { t: 0, oiCoins: 1, oiUsd: 10 },
      { t: 5 * 60_000, oiCoins: 2, oiUsd: 20 },
      { t: 55 * 60_000, oiCoins: 3, oiUsd: 30 }, // last row in hour [0, 1h)
      { t: HOUR, oiCoins: 4, oiUsd: 40 }, // hour [1h, 2h)
    ];
    const hourly = downsampleHourlyOi(rows);
    expect(hourly).toEqual([
      { t: HOUR, oiCoins: 3, oiUsd: 30, src: "binance" }, // hour [0,1h) closes at 1h
      { t: 2 * HOUR, oiCoins: 4, oiUsd: 40, src: "binance" }, // hour [1h,2h) closes at 2h
    ]);
    // no-look-ahead: every emitted row's key is strictly after every raw sample that fed it
    for (const raw of rows) {
      const own = hourly.find((h) => raw.t >= h.t - HOUR && raw.t < h.t);
      expect(own).toBeDefined();
      expect(own!.t).toBeGreaterThan(raw.t);
    }
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
