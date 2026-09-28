import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clamp,
  blend,
  sma,
  roc,
  realizedVol,
  percentileRank,
  emaSeeded,
  rsiWilder,
  commitWithHysteresis,
} from "../src/model/indicators";
import { computeHtf, resampleWeekly, cycleInfo, HALVINGS, NEXT_HALVING_ESTIMATE } from "../src/model/htf";
import { computeLtf, resampleCandles } from "../src/model/ltf";
import { computeBias, biasLabel, summaryText, signals, overview } from "../src/model/composite";
import type { Candle, FundingRow, Snapshot } from "../src/types";

const DAY = 86_400_000;

function loadFixture(): Candle[] {
  const raw = readFileSync(join(import.meta.dir, "fixtures/bitstamp-1d.json"), "utf8");
  return JSON.parse(raw) as Candle[];
}

function dateIndex(points: { t: number }[], date: string): number {
  const target = Date.parse(date + "T00:00:00Z");
  return points.findIndex((p) => p.t === target);
}

describe("indicators", () => {
  test("sma", () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  test("roc", () => {
    const r = roc([100, 110, 121], 2);
    expect(r[0]).toBeNull();
    expect(r[1]).toBeNull();
    expect(r[2]).toBeCloseTo(0.21, 10);
  });

  test("percentileRank: mid value in small window", () => {
    // window [10,20,30], x[2]=30 -> 2 less, 1 equal (itself), count 3 -> (2+0.5)/3
    const r = percentileRank([10, 20, 30], 3, 1);
    expect(r[2]).toBeCloseTo(2.5 / 3, 6);
    expect(r[1]).toBeCloseTo(0.75, 6); // window [10,20], x[1]=20 -> 1 less, 1 equal -> 1.5/2
  });

  test("percentileRank: null below min count", () => {
    const r = percentileRank([1, 2], 5, 3);
    expect(r).toEqual([null, null]);
  });

  test("emaSeeded seeds with sma then recurses", () => {
    const c = [1, 2, 3, 4];
    const e = emaSeeded(c, 2); // period 2 -> seed at i=1 with mean(c[0..1])=1.5
    expect(e[0]).toBeNull();
    expect(e[1]).toBeCloseTo(1.5, 6);
    const k = 2 / 3;
    expect(e[2]).toBeCloseTo(3 * k + 1.5 * (1 - k), 6);
  });

  test("rsiWilder: all gains gives rsi 100", () => {
    const c = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const r = rsiWilder(c, 14);
    expect(r[14]).toBe(100);
  });

  test("blend renormalizes over non-null parts, null if none", () => {
    expect(blend([[0.6, 1], [0.4, null]])).toBeCloseTo(1, 6);
    expect(blend([[0.6, null], [0.4, null]])).toBeNull();
  });

  test("clamp", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
  });

  test("commitWithHysteresis: needs run length, and away fallback", () => {
    const raw = ["A", "B", "B", "A", "A"];
    const committed = commitWithHysteresis(raw, () => 2);
    expect(committed).toEqual(["A", "A", "B", "B", "A"]);
  });
});

describe("computeHtf on bitstamp fixture", () => {
  const fixture = loadFixture();
  // fixture's last day (2026-09-26) is not yet "closed" relative to real now, but the model's
  // closed-candle rule only drops a candle while t + DAY > now; use a fixed "now" past the
  // fixture end (not Date.now()) so the test is deterministic.
  const now = Date.parse("2026-09-27T00:00:00Z") + DAY;
  const points = computeHtf(fixture, now);

  test("keeps all 5493 rows, none dropped", () => {
    expect(points.length).toBe(5493);
  });

  test("MODEL 5.2 numeric checks: 2021-11-10", () => {
    const p = points[dateIndex(points, "2021-11-10")];
    expect(p.c).toBeCloseTo(64921.43, 2);
    expect(p.sma200).toBeCloseTo(45662.5953, 3);
    expect(p.trend).toBeCloseTo(0.750546, 4);
    expect(p.heat).toBeCloseTo(0.693424, 4);
    expect(p.mayerPct).toBeCloseTo(0.744178, 4);
    expect(p.drawdown).toBeCloseTo(-0.039041, 4);
    expect(p.sma200Slope30).toBeCloseTo(0.013759, 4);
    expect(p.roc365).toBeCloseTo(3.239448, 4);
    expect(p.rv30).toBeCloseTo(0.584640, 4);
    expect(p.rv30Pct).toBeCloseTo(0.319521, 4);
    expect(p.daysSinceLow365).toBe(364);
    expect(p.phase).toBe("expansion");
  });

  test("MODEL 5.2 numeric checks: 2022-11-21", () => {
    const p = points[dateIndex(points, "2022-11-21")];
    expect(p.c).toBeCloseTo(15766, 2);
    expect(p.sma200).toBeCloseTo(22323.23745, 3);
    expect(p.trend).toBeCloseTo(-0.969084, 4);
    expect(p.heat).toBeCloseTo(-0.789659, 4);
    expect(p.mayerPct).toBeCloseTo(0.155822, 4);
    expect(p.drawdown).toBeCloseTo(-0.766634, 4);
    expect(p.sma200Slope30).toBeCloseTo(-0.125564, 4);
    expect(p.roc365).toBeCloseTo(-0.731315, 4);
    expect(p.rv30).toBeCloseTo(0.834485, 4);
    expect(p.rv30Pct).toBeCloseTo(0.772260, 4);
    expect(p.daysSinceLow365).toBe(0);
    expect(p.phase).toBe("capitulation");
  });

  test("MODEL 5.2 warmup: T null before 2012-04-29, non-null from that day", () => {
    const idx = dateIndex(points, "2012-04-29");
    expect(idx).toBe(229);
    expect(points[idx - 1].trend).toBeNull();
    expect(points[idx].trend).not.toBeNull();
  });

  test("MODEL 5.2 warmup: H and phase null before 2013-03-29, first phase euphoria that day", () => {
    const idx = dateIndex(points, "2013-03-29");
    expect(idx).toBe(563);
    expect(points[idx - 1].heat).toBeNull();
    expect(points[idx - 1].phase).toBeNull();
    expect(points[idx].heat).not.toBeNull();
    expect(points[idx].phase).toBe("euphoria");
  });

  test("MODEL 5.3 anchor dates", () => {
    const anchors: [string, string][] = [
      ["2013-12-01", "euphoria"],
      ["2015-01-15", "capitulation"],
      ["2015-08-01", "accumulation"],
      ["2016-06-01", "expansion"],
      ["2017-12-15", "euphoria"],
      ["2018-12-15", "capitulation"],
      ["2019-02-15", "accumulation"],
      ["2020-03-30", "capitulation"],
      ["2021-03-15", "euphoria"],
      ["2022-04-15", "markdown"],
      ["2022-07-01", "capitulation"],
      ["2022-12-01", "capitulation"],
      ["2023-01-20", "accumulation"],
      ["2024-03-13", "euphoria"],
      ["2024-10-01", "distribution"],
      ["2025-06-15", "expansion"],
    ];
    for (const [date, phase] of anchors) {
      const idx = dateIndex(points, date);
      expect(points[idx].phase).toBe(phase);
    }
  });

  test("MODEL 5.4 full phase-change table (60 switches + initial)", () => {
    const expected: [string, string | null, string][] = [
      ["2013-03-29", null, "euphoria"],
      ["2013-04-30", "euphoria", "expansion"],
      ["2013-11-08", "expansion", "euphoria"],
      ["2014-02-03", "euphoria", "expansion"],
      ["2014-04-09", "expansion", "accumulation"],
      ["2014-07-01", "accumulation", "markdown"],
      ["2014-07-24", "markdown", "accumulation"],
      ["2014-08-26", "accumulation", "markdown"],
      ["2014-09-30", "markdown", "accumulation"],
      ["2014-12-21", "accumulation", "capitulation"],
      ["2015-02-27", "capitulation", "accumulation"],
      ["2015-11-09", "accumulation", "expansion"],
      ["2017-03-02", "expansion", "euphoria"],
      ["2017-04-12", "euphoria", "expansion"],
      ["2017-05-04", "expansion", "euphoria"],
      ["2018-01-27", "euphoria", "distribution"],
      ["2018-02-14", "distribution", "expansion"],
      ["2018-04-04", "expansion", "capitulation"],
      ["2018-05-04", "capitulation", "accumulation"],
      ["2018-07-29", "accumulation", "markdown"],
      ["2018-10-24", "markdown", "accumulation"],
      ["2018-11-20", "accumulation", "capitulation"],
      ["2019-01-28", "capitulation", "accumulation"],
      ["2019-05-17", "accumulation", "expansion"],
      ["2019-11-18", "expansion", "accumulation"],
      ["2020-01-16", "accumulation", "markdown"],
      ["2020-03-05", "markdown", "accumulation"],
      ["2020-03-16", "accumulation", "capitulation"],
      ["2020-04-13", "capitulation", "markdown"],
      ["2020-05-29", "markdown", "expansion"],
      ["2020-12-20", "expansion", "euphoria"],
      ["2021-05-14", "euphoria", "distribution"],
      ["2021-05-31", "distribution", "expansion"],
      ["2021-07-13", "expansion", "markdown"],
      ["2021-08-20", "markdown", "distribution"],
      ["2021-10-21", "distribution", "expansion"],
      ["2021-12-01", "expansion", "distribution"],
      ["2022-01-18", "distribution", "accumulation"],
      ["2022-02-17", "accumulation", "markdown"],
      ["2022-06-16", "markdown", "capitulation"],
      ["2022-08-01", "capitulation", "accumulation"],
      ["2022-09-10", "accumulation", "capitulation"],
      ["2022-11-04", "capitulation", "accumulation"],
      ["2022-11-13", "accumulation", "capitulation"],
      ["2023-01-04", "capitulation", "accumulation"],
      ["2023-02-16", "accumulation", "expansion"],
      ["2023-09-13", "expansion", "accumulation"],
      ["2023-11-05", "accumulation", "expansion"],
      ["2024-03-03", "expansion", "euphoria"],
      ["2024-04-26", "euphoria", "distribution"],
      ["2024-05-28", "distribution", "expansion"],
      ["2024-08-24", "expansion", "distribution"],
      ["2024-11-23", "distribution", "euphoria"],
      ["2025-01-14", "euphoria", "distribution"],
      ["2025-03-20", "distribution", "expansion"],
      ["2025-09-05", "expansion", "distribution"],
      ["2025-12-06", "distribution", "markdown"],
      ["2026-03-30", "markdown", "accumulation"],
      ["2026-04-26", "accumulation", "markdown"],
      ["2026-08-13", "markdown", "accumulation"],
      ["2026-09-24", "accumulation", "expansion"],
    ];
    const actual: [string, string | null][] = [];
    let prev: string | null = null;
    for (const p of points) {
      if (p.phase == null) continue;
      if (p.phase !== prev) actual.push([new Date(p.t).toISOString().slice(0, 10), p.phase]);
      prev = p.phase;
    }
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(actual[i][0]).toBe(expected[i][0]);
      expect(actual[i][1]).toBe(expected[i][2]);
    }
  });

  test("weekly resample: Monday week keys, ohlcv rollup, indicators copied from last day", () => {
    const weekly = resampleWeekly(points.slice(0, 10)); // 2011-09-13 (Tue) .. 2011-09-22 (Thu)
    // 2011-09-13 through 2011-09-18 (Sun) is one week (Mon 2011-09-12), rest is next week
    expect(weekly.length).toBe(2);
    expect(new Date(weekly[0].t).getUTCDay()).toBe(1); // Monday
    expect(weekly[0].o).toBe(points[0].o);
    expect(weekly[0].c).toBe(points[5].c);
    expect(weekly[0].h).toBe(Math.max(...points.slice(0, 6).map((p) => p.h)));
    expect(weekly[0].l).toBe(Math.min(...points.slice(0, 6).map((p) => p.l)));
    expect(weekly[0].v).toBeCloseTo(points.slice(0, 6).reduce((a, p) => a + p.v, 0), 6);
    expect(weekly[0].sma200).toBe(points[5].sma200);
    expect(weekly[0].phase).toBe(points[5].phase);
  });
});

describe("cycleInfo", () => {
  test("null before first halving", () => {
    expect(cycleInfo(HALVINGS[0] - DAY).lastHalving).toBeNull();
  });
  test("100 days after a halving", () => {
    const info = cycleInfo(HALVINGS[2] + 100 * DAY);
    expect(info.lastHalving).toBe(HALVINGS[2]);
    expect(info.daysSinceHalving).toBe(100);
    expect(info.cycleProgress).toBeCloseTo(100 / 1460, 6);
    expect(info.nextHalvingEstimate).toBe(NEXT_HALVING_ESTIMATE);
  });
});

describe("computeHtf closed-candle boundary (MODEL: drop while t + DAY > now)", () => {
  test("t + DAY === now is included (closed); t + DAY === now + 1 is excluded", () => {
    const now = 20 * DAY;
    const tClosed = now - DAY; // t + DAY === now -> kept
    const tOpen = now - DAY + 1; // t + DAY === now + 1 -> dropped
    const bar = (t: number): Candle => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1, src: "hl" });

    // day 0 forward-filled through tClosed (day 19) -> 20 daily points, last is tClosed.
    const closedIncluded = computeHtf([bar(0), bar(tClosed)], now);
    expect(closedIncluded.length).toBe(20);
    expect(closedIncluded[closedIncluded.length - 1]!.t).toBe(tClosed);

    // tOpen is dropped before gap-filling, leaving only the day-0 candle.
    const openExcluded = computeHtf([bar(0), bar(tOpen)], now);
    expect(openExcluded.length).toBe(1);
    expect(openExcluded[0]!.t).toBe(0);
  });
});

// ---- LTF synthetic series ----

function ltfCandles(closes: number[], bar: number, startT = 0): Candle[] {
  return closes.map((c, i) => ({ t: startT + i * bar, o: c, h: c, l: c, c, v: 1, src: "hl" as const }));
}

describe("computeLtf synthetic series", () => {
  const BAR = 14_400_000;
  const now = 100_000 * BAR; // far in the future, all bars closed

  test("closed-candle boundary: t + BAR === now included, t + BAR === now + 1 excluded", () => {
    const boundaryNow = 20 * BAR;
    const tClosed = boundaryNow - BAR; // t + BAR === now -> kept
    const tOpen = boundaryNow - BAR + 1; // t + BAR === now + 1 -> dropped
    const bar = (t: number): Candle => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1, src: "hl" });

    const closedIncluded = computeLtf([bar(0), bar(tClosed)], [], [], "4h", boundaryNow);
    expect(closedIncluded.some((p) => p.t === tClosed)).toBe(true);

    const openExcluded = computeLtf([bar(0), bar(tOpen)], [], [], "4h", boundaryNow);
    expect(openExcluded.some((p) => p.t === tOpen)).toBe(false);
    expect(openExcluded.length).toBe(1);
  });

  test("missing OI renormalizes leverage without lOi", () => {
    const n = 100; // enough bars for premiumZ's W30/2=90 minimum (4h)
    const closes = Array.from({ length: n }, (_, i) => 100 + i * 0.01);
    const candles = ltfCandles(closes, BAR);
    // constant funding/premium: lFunding saturates high, lPremium is exactly 0 (zero variance)
    const funding: FundingRow[] = candles.map((c) => ({ t: c.t, rate: 0.001, premium: 0.001 }));
    const points = computeLtf(candles, funding, [], "4h", now);
    const p = points[n - 1];
    expect(p.oiUsd).toBeNull();
    expect(p.oiChange24h).toBeNull();
    expect(p.lOi).toBeNull();
    expect(p.lFunding).not.toBeNull();
    expect(p.lPremium).toBeCloseTo(0, 6);
    expect(p.leverage).not.toBeNull();
    // renormalized over the two present parts (weights 0.4, 0.3), lOi excluded entirely
    expect(p.leverage).toBeCloseTo((p.lFunding! * 0.4 + p.lPremium! * 0.3) / 0.7, 6);
  });

  test("all funding/premium missing gives insufficient_data", () => {
    const closes = Array.from({ length: 5 }, (_, i) => 100 + i);
    const candles = ltfCandles(closes, BAR);
    const points = computeLtf(candles, [], [], "4h", now);
    for (const p of points) {
      expect(p.leverage).toBeNull();
      expect(p.state).toBe("insufficient_data");
    }
  });

  test("debounce needs 2 bars in a row before a new state commits", () => {
    // build funding that flips raw state on one bar only, to check debounce doesn't commit it
    const n = 10;
    const closes = Array.from({ length: n }, () => 100);
    const candles = ltfCandles(closes, BAR);
    const funding: FundingRow[] = candles.map((c, i) => ({
      t: c.t,
      rate: i === 5 ? 0.01 : 0.001, // one-bar spike at i=5
      premium: 0.001,
    }));
    const points = computeLtf(candles, funding, [], "4h", now);
    // whatever raw[5] is, since it doesn't repeat at i=6, committed state must not have switched at i=5
    expect(points[5].state).toBe(points[4].state);
  });

  // MODEL 2.5 rule 2: oiChange24h <= -0.08 and abs(roc6) >= 0.03 wins raw "deleveraging",
  // regardless of L/M. 24h = 6 bars at 4h, so a snapshot at every bar close lets bar i's
  // oiChange24h compare against bar (i-6)'s OI.
  test("deleveraging: sharp OI (coins) drop with a big move, committed after 2-bar debounce", () => {
    const n = 10;
    // flat at 100 through bar 7, then a -20% move that holds at bars 8 and 9
    const closes = [100, 100, 100, 100, 100, 100, 100, 100, 80, 80];
    const candles = ltfCandles(closes, BAR);
    // funding held exactly at the resting APR baseline -> lFunding = 0, neutral baseline
    const funding: FundingRow[] = candles.map((c) => ({ t: c.t, rate: 0.0000125, premium: 0 }));
    const snapshots: Snapshot[] = candles.map((c, i) => ({
      t: c.t + BAR, // snapshot at each bar's close time
      markPx: closes[i],
      oraclePx: closes[i],
      oiCoins: i < 8 ? 1000 : 900, // sharp coin-OI drop starting at bar 8
      oiUsd: (i < 8 ? 1000 : 900) * closes[i],
      funding: 0.0000125,
      premium: 0,
      dayNtlVlm: 0,
      predicted: [],
    }));
    const points = computeLtf(candles, funding, snapshots, "4h", now);

    // roc6[8] = 80/100 - 1 = -0.2, roc6[9] = 80/100 - 1 = -0.2 (both |roc6| >= 0.03)
    expect(points[8].roc6).toBeCloseTo(-0.2, 6);
    expect(points[9].roc6).toBeCloseTo(-0.2, 6);
    // oiChange24h[8] = 900/1000 - 1 = -0.1, oiChange24h[9] = 900/1000 - 1 = -0.1 (both <= -0.08)
    expect(points[8].oiChange24h).toBeCloseTo(-0.1, 6);
    expect(points[9].oiChange24h).toBeCloseTo(-0.1, 6);

    // raw state flips to deleveraging at bar 8, but debounce (need=2) only commits it
    // once the raw state repeats at bar 9.
    expect(points[7].rawState).not.toBe("deleveraging");
    expect(points[8].rawState).toBe("deleveraging");
    expect(points[8].state).not.toBe("deleveraging"); // not yet committed (run=1)
    expect(points[9].rawState).toBe("deleveraging");
    expect(points[9].state).toBe("deleveraging"); // committed (run=2)
  });

  // Snapshot OI (Hyperliquid, coins) and oi-history OI (Binance proxy, a different venue) are not
  // the same series. Comparing "now" from one against "24h ago" from the other would report a
  // change that's really just a cross-venue offset, not a real leverage move.
  test("oiChange24h is null when 'now' and '24h-ago' OI come from different sources", () => {
    const closes = Array.from({ length: 7 }, () => 100);
    const candles = ltfCandles(closes, BAR); // bars 0..6, bar 6 closes at 7*BAR
    const snapshots: Snapshot[] = [
      {
        t: 7 * BAR, // only near bar 6's close -> "now" OI comes from the snapshot
        markPx: 100,
        oraclePx: 100,
        oiCoins: 1000,
        oiUsd: 100_000,
        funding: 0,
        premium: 0,
        dayNtlVlm: 0,
        predicted: [],
      },
    ];
    // 24h before bar 6's close (7*BAR) is 1*BAR (6 bars at 4h = 24h) — no snapshot there, only
    // oi-history, so "24h-ago" OI comes from a different source than "now".
    const oiHistory = [{ t: 1 * BAR, oiCoins: 900, oiUsd: 90_000, src: "binance" as const }];
    const points = computeLtf(candles, [], snapshots, "4h", now, oiHistory);
    expect(points[6].oiUsd).toBe(100_000); // "now" itself is still populated
    expect(points[6].oiChange24h).toBeNull(); // but the 24h comparison is cross-source -> null
  });
});

describe("resampleCandles", () => {
  const HOUR = 3_600_000;

  test("1h -> 4h: correct O/H/L/C/V per bucket, leading partial bucket dropped", () => {
    // hours 2,3 fall in the [0,4h) bucket (only 2 of 4 rows -> partial, dropped since it's the
    // leading bucket). Hours 4..7 fill the [4h,8h) bucket completely (4 of 4 rows -> kept).
    const rows = [2, 3, 4, 5, 6, 7].map((h) => ({
      t: h * HOUR,
      o: h,
      h: h + 0.5,
      l: h - 0.5,
      c: h + 0.2,
      v: 1,
      src: "hl" as const,
    }));
    const out = resampleCandles(rows, 4 * HOUR);
    expect(out.length).toBe(1);
    expect(out[0]!.t).toBe(4 * HOUR);
    expect(out[0]!.o).toBe(4); // open = first row in bucket
    expect(out[0]!.c).toBeCloseTo(7.2, 6); // close = last row in bucket
    expect(out[0]!.h).toBe(7.5); // max high across the bucket
    expect(out[0]!.l).toBe(3.5); // min low across the bucket
    expect(out[0]!.v).toBe(4); // summed volume
  });

  test("a fully-populated leading bucket is kept", () => {
    const rows = [0, 1, 2, 3].map((h) => ({ t: h * HOUR, o: h, h, l: h, c: h, v: 1, src: "hl" as const }));
    const out = resampleCandles(rows, 4 * HOUR);
    expect(out.length).toBe(1);
    expect(out[0]!.t).toBe(0);
  });
});

describe("computeLtf 15m", () => {
  test("2000 synthetic bars, HOURLY funding: premiumZ is null before bar 1440 (W30/2 for 15m), non-null after, and some bars escape insufficient_data", () => {
    const BAR = 900_000;
    const HOUR = 3_600_000;
    const n = 2000;
    const now = (n + 10) * BAR;
    const closes = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 50) * 5);
    const candles = ltfCandles(closes, BAR);
    // Hyperliquid funding rows are hourly, not per-bar: one row per 4 15m bars.
    const hours = Math.ceil((n * BAR) / HOUR) + 1;
    const funding: FundingRow[] = Array.from({ length: hours }, (_, i) => ({
      t: i * HOUR,
      rate: 0.0000125,
      premium: Math.sin(i / 8) * 0.0005,
    }));
    expect(() => computeLtf(candles, funding, [], "15m", now)).not.toThrow();
    const points = computeLtf(candles, funding, [], "15m", now);
    expect(points[1439]!.premiumZ).toBeNull();
    expect(points[1440]!.premiumZ).not.toBeNull();
    // most bars should now have forward-filled funding (bounded to 1h staleness)
    const withFunding = points.filter((p) => p.fundingApr != null).length;
    expect(withFunding).toBeGreaterThan(points.length * 0.9);
    const nonInsufficient = points.filter((p) => p.state !== "insufficient_data").length;
    expect(nonInsufficient).toBeGreaterThan(0);
  });
});

describe("computeLtf oiAt window (1h, was 30m — SPEC.md 3.4)", () => {
  test("a BTC snapshot 45 minutes before a bar close now yields oiUsd", () => {
    const BAR = 14_400_000; // 4h
    const candles = ltfCandles([100, 100], BAR);
    const snapshots: Snapshot[] = [
      {
        t: BAR - 45 * 60_000, // 45 min before bar 0's close: inside the new 1h window, outside the old 30m one
        markPx: 100,
        oraclePx: 100,
        oiCoins: 500,
        oiUsd: 50_000,
        funding: 0,
        premium: 0,
        dayNtlVlm: 0,
        predicted: [],
      },
    ];
    const now = 100_000 * BAR;
    const points = computeLtf(candles, [], snapshots, "4h", now);
    expect(points[0]!.oiUsd).toBe(50_000);
  });
});

describe("composite", () => {
  test("computeBias applies leverage penalty and clamps", () => {
    expect(computeBias(1, 1, 0)).toBeCloseTo(1, 6); // no L penalty
    expect(computeBias(1, 1, 1)).toBeCloseTo(0.7, 6); // bLev = 0.3 at |L|=1
    expect(computeBias(null, null, 0)).toBeNull();
  });

  test("biasLabel thresholds", () => {
    expect(biasLabel(0.5)).toBe("strongly bullish");
    expect(biasLabel(0.15)).toBe("bullish");
    expect(biasLabel(0)).toBe("neutral");
    expect(biasLabel(-0.2)).toBe("bearish");
    expect(biasLabel(-0.6)).toBe("strongly bearish");
  });

  test("summary string template, and unavailable when bias null", () => {
    const s = summaryText("expansion", "crowded_long", 0.34);
    expect(s).toBe(
      "HTF expansion: trend is up and not yet overheated; perps are crowded long (funding and premium hot). Bias: bullish (+0.34).",
    );
    expect(summaryText(null, "neutral", null)).toBe("HTF data insufficient; short-term neutral. Bias: unavailable.");
  });

  test("signals: HTF phase changes plus LTF state changes, newest first, first from is null", () => {
    const htf = [
      { t: 1000, c: 10, phase: "expansion", trend: 0.5, heat: 0.5 } as any,
      { t: 2000, c: 11, phase: "expansion", trend: 0.5, heat: 0.5 } as any,
      { t: 3000, c: 12, phase: "euphoria", trend: 0.9, heat: 0.9 } as any,
    ];
    const ltf = [
      { t: 1500, c: 10.5, state: "neutral", leverage: 0, momentum: 0 } as any,
      { t: 2500, c: 10.8, state: "crowded_long", leverage: 0.6, momentum: 0.1 } as any,
    ];
    const rows = signals(htf, ltf, 200);
    expect(rows[0]).toMatchObject({ t: 3000, frame: "HTF", from: "expansion", to: "euphoria" });
    expect(rows[1]).toMatchObject({ t: 2500, frame: "LTF", from: "neutral", to: "crowded_long" });
    expect(rows[2]).toMatchObject({ t: 1500, frame: "LTF", from: null, to: "neutral" });
    expect(rows[3]).toMatchObject({ t: 1000, frame: "HTF", from: null, to: "expansion" });
  });

  test("overview: feature key order matches MODEL section 4", () => {
    const htf = [
      {
        t: 1000, o: 1, h: 1, l: 1, c: 10, v: 0, src: "bitstamp",
        sma200: 9, sma50: 9.5, mayer: 1.1, mayerPct: 0.5, drawdown: -0.1, sma200Slope30: 0.01,
        roc30: 0.02, roc365: 0.3, rv30: 0.4, rv30Pct: 0.5, daysSinceLow365: 10,
        tMayer: 0.1, tSlope: 0.1, tCross: 0.1, hMayer: 0, hDrawdown: 0.5, hRoc365: 0.2,
        trend: 0.3, heat: 0.2, rawPhase: "expansion", phase: "expansion",
      } as any,
    ];
    const ltf = [
      {
        t: 900, o: 1, h: 1, l: 1, c: 10, v: 0, src: "hl",
        ema50: 9.8, rsi14: 55, roc6: 0.01, fundingApr: 0.11, premium: 0.001, premiumZ: 0.2,
        oiUsd: 100, oiChange24h: 0.01, rv42: 0.3, rv42Pct: 0.4,
        lFunding: 0.1, lPremium: 0.1, lOi: 0, mEma: 0.1, mRsi: 0.1, mRoc: 0.1,
        leverage: 0.1, momentum: 0.1, rawState: "neutral", state: "neutral",
      } as any,
    ];
    const ov = overview({ htf, ltf, price: 10, lastRefresh: 12345, crossVenueFunding: [], now: 999999 });
    expect(Object.keys(ov.htf.features)).toEqual([
      "close", "sma50", "sma200", "mayer", "mayerPct", "drawdown", "sma200Slope30",
      "roc30", "roc365", "rv30", "rv30Pct", "daysSinceLow365", "tMayer", "tSlope",
      "tCross", "hMayer", "hDrawdown", "hRoc365",
    ]);
    expect(Object.keys(ov.ltf.features)).toEqual([
      "close", "ema50", "rsi14", "roc6", "fundingApr", "premium", "premiumZ", "oiUsd",
      "oiChange24h", "rv42", "rv42Pct", "lFunding", "lPremium", "lOi", "mEma", "mRsi", "mRoc",
    ]);
    expect(ov.htf.phase).toBe("expansion");
    expect(ov.ltf.state).toBe("neutral");
    expect(ov.price).toBe(10);
  });
});
