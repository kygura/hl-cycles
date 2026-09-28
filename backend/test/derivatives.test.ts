import { describe, expect, test } from "bun:test";
import { derivatives, predictedApr } from "../src/model/derivatives";
import type { FundingRow, OiRow, Snapshot } from "../src/types";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 0, 8, 12, 0, 0);

function snap(t: number, overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    t,
    markPx: 100,
    oraclePx: 100,
    oiCoins: 1000,
    oiUsd: 100_000,
    funding: 0.0000125,
    premium: 0.0001,
    dayNtlVlm: 5_000_000,
    predicted: [
      { venue: "HlPerp", rate: 0.0000125, intervalHours: 1 },
      { venue: "BinPerp", rate: 0.00003, intervalHours: 8 },
      { venue: "BybitPerp", rate: 0.00002, intervalHours: 8 },
    ],
    ...overrides,
  };
}

function fundingRow(t: number, rate = 0.0000125): FundingRow {
  return { t, rate, premium: 0.0001 };
}

describe("derivatives", () => {
  test("empty snapshots, 200 hourly funding rows", () => {
    // t = NOW - i*HOUR for i = 0..2199; window keeps t > NOW - 2160h, i.e. i = 0..2159 (2160 rows).
    const funding: FundingRow[] = [];
    for (let i = 0; i < 2200; i++) funding.push(fundingRow(NOW - i * HOUR, 0.00001 + i * 1e-8));
    const d = derivatives([], funding, NOW);
    expect(d.collecting).toBe(true);
    expect(d.premium).toEqual({ points: [], last: null });
    expect(d.oiUsd).toEqual({ points: [], last: null, change24h: null, src: "hl" });
    expect(d.volume24h).toEqual({ points: [], last: null });
    expect(d.fundingApr.predicted).toEqual([]);
    expect(d.firstSnapshot).toBeNull();
    expect(d.fundingApr.points.length).toBe(2160);
    for (const [t, v] of d.fundingApr.points) {
      const row = funding.find((f) => f.t === t)!;
      expect(v).toBeCloseTo(row.rate * 8760, 10);
    }
  });

  test("three snapshots in the same UTC hour collapse to one point", () => {
    const hourStart = Math.floor(NOW / HOUR) * HOUR;
    const snaps = [snap(hourStart + 1000, { oiUsd: 1 }), snap(hourStart + 2000, { oiUsd: 2 }), snap(hourStart + 3000, { oiUsd: 3 })];
    const d = derivatives(snaps, [], hourStart + 3000);
    expect(d.oiUsd.points.length).toBe(1);
    expect(d.oiUsd.points[0]).toEqual([hourStart + 3000, 3]);
    expect(d.oiUsd.last).toBe(3);
  });

  test("a snapshot older than 90d is excluded from points but sets firstSnapshot", () => {
    const old = NOW - 91 * DAY;
    const recent = NOW - HOUR;
    const d = derivatives([snap(old), snap(recent)], [], NOW);
    expect(d.firstSnapshot).toBe(old);
    expect(d.oiUsd.points.every(([t]) => t !== old)).toBe(true);
  });

  test("premium = markPx/oraclePx - 1; oraclePx 0 gives no point", () => {
    const t1 = NOW - 2 * HOUR;
    const t2 = NOW - HOUR;
    const d = derivatives([snap(t1, { markPx: 110, oraclePx: 100 }), snap(t2, { oraclePx: 0 })], [], NOW);
    expect(d.premium.points.length).toBe(1);
    expect(d.premium.points[0]![1]).toBeCloseTo(0.1, 10);
  });

  test("change24h: 1h tolerance boundary, and then.oiCoins=0 gives null", () => {
    const nowT = NOW;
    const included = nowT - DAY - HOUR; // exactly lo, counts
    const excluded = nowT - DAY - HOUR - 1; // 1ms earlier, excluded
    const d1 = derivatives(
      [snap(included, { oiCoins: 50, t: included }), snap(nowT, { oiCoins: 100 })],
      [],
      nowT,
    );
    expect(d1.oiUsd.change24h).toBeCloseTo(100 / 50 - 1, 10);

    const d2 = derivatives([snap(excluded, { oiCoins: 50 }), snap(nowT, { oiCoins: 100 })], [], nowT);
    expect(d2.oiUsd.change24h).toBeNull();

    const d3 = derivatives([snap(included, { oiCoins: 0 }), snap(nowT, { oiCoins: 100 })], [], nowT);
    expect(d3.oiUsd.change24h).toBeNull();
  });

  test("oiHistory replaces snapshot OI (single source) and change24h comes from it", () => {
    const hist: OiRow[] = [];
    for (let i = 48; i >= 2; i--) hist.push({ t: NOW - i * HOUR, oiCoins: 1, oiUsd: 100 + i, src: "binance" });
    const d = derivatives([snap(NOW - HOUR, { oiUsd: 999 })], [], NOW, hist);
    expect(d.oiUsd.src).toBe("binance");
    expect(d.oiUsd.points.length).toBe(47);
    expect(d.oiUsd.last).toBe(102);
    // then = point at NOW-26h (value 126); newest = NOW-2h (value 102)
    expect(d.oiUsd.change24h).toBeCloseTo(102 / 126 - 1, 10);
    expect(derivatives([snap(NOW - HOUR)], [], NOW).oiUsd.src).toBe("hl");
  });

  test("stale oiHistory (last point 3d old) loses to fresh HL snapshots", () => {
    const hist: OiRow[] = [];
    for (let i = 10 * 24; i >= 3 * 24; i--) hist.push({ t: NOW - i * HOUR, oiCoins: 1, oiUsd: 100 + i, src: "binance" });
    const d = derivatives([snap(NOW - 2 * HOUR, { oiUsd: 500 }), snap(NOW - HOUR, { oiUsd: 600 })], [], NOW, hist);
    expect(d.oiUsd.src).toBe("hl");
    expect(d.oiUsd.points.map(([, v]) => v)).toEqual([500, 600]);
    expect(d.oiUsd.last).toBe(600);
  });

  test("predictedApr formula", () => {
    expect(predictedApr({ venue: "BinPerp", rate: 0.00003732, intervalHours: 8 })).toBeCloseTo(0.00003732 * 1095, 12);
  });

  test("predicted order HL, BIN, BYB then stored order; unknown venue keeps its name", () => {
    const t = NOW - HOUR;
    const s = snap(t, {
      predicted: [
        { venue: "BybitPerp", rate: 0.00002, intervalHours: 8 },
        { venue: "SomeOther", rate: 0.00004, intervalHours: 4 },
        { venue: "HlPerp", rate: 0.0000125, intervalHours: 1 },
        { venue: "BinPerp", rate: 0.00003, intervalHours: 8 },
      ],
    });
    const d = derivatives([s], [], NOW);
    expect(d.fundingApr.predicted.map((p) => p.short)).toEqual(["HL", "BIN", "BYB", "SomeOther"]);
    expect(d.fundingApr.predicted.map((p) => p.venue)).toEqual(["HlPerp", "BinPerp", "BybitPerp", "SomeOther"]);
  });

  test("collecting: 23 hourly buckets true, 24 false", () => {
    const snaps23: Snapshot[] = [];
    for (let i = 0; i < 23; i++) snaps23.push(snap(NOW - (23 - i) * HOUR));
    expect(derivatives(snaps23, [], NOW).collecting).toBe(true);

    const snaps24: Snapshot[] = [];
    for (let i = 0; i < 24; i++) snaps24.push(snap(NOW - (24 - i) * HOUR));
    expect(derivatives(snaps24, [], NOW).collecting).toBe(false);
  });
});
