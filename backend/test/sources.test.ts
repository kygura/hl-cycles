import { describe, expect, test, beforeAll } from "bun:test";
import {
  fetchCandles,
  fetchFunding,
  fetchSnapshot,
  fetchOi,
  weightWaitMs,
  __resetWeightLogForTests,
} from "../src/sources/hyperliquid";
import { fetchBitstampDaily } from "../src/sources/bitstamp";

// This file's tests fire many real postInfo calls (via mocked fetch). Start with a clean weight
// budget so an unrelated test file's calls in the same 60s window can't push this one over and
// force a real (test-breaking) sleep.
beforeAll(() => {
  __resetWeightLogForTests();
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function candleRow(t: number, v: string) {
  return { t, T: t + 3599999, s: "BTC", i: "1h", o: "10", c: "11", h: "12", l: "9", v, n: 1 };
}

describe("fetchCandles", () => {
  test("parses and converts strings to numbers", async () => {
    const fetchImpl = (async () => jsonRes([candleRow(1000, "1.5")])) as unknown as typeof fetch;
    const rows = await fetchCandles("BTC", "1h", 0, 2000, fetchImpl);
    expect(rows).toEqual([{ t: 1000, o: 10, h: 12, l: 9, c: 11, v: 1.5, src: "hl" }]);
  });

  test("drops rows with NaN or non-numeric close, keeps valid rows", async () => {
    const fetchImpl = (async () =>
      jsonRes([
        candleRow(1000, "1"),
        { t: 1100, T: 4699, s: "BTC", i: "1h", o: "10", c: "abc", h: "12", l: "9", v: "1", n: 1 },
        { t: 1200, T: 4799, s: "BTC", i: "1h", o: "10", c: "NaN", h: "12", l: "9", v: "1", n: 1 },
        candleRow(1300, "2"),
      ])) as unknown as typeof fetch;
    const rows = await fetchCandles("BTC", "1h", 0, 2000, fetchImpl);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.t)).toEqual([1000, 1300]);
  });

  test("paginates when a full page comes back, stops on short page", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) {
        // full page of 5000 forces another call
        const rows = Array.from({ length: 5000 }, (_, i) => candleRow(i * 3600000, "1"));
        return jsonRes(rows);
      }
      return jsonRes([candleRow(5000 * 3600000, "1")]);
    }) as unknown as typeof fetch;
    const rows = await fetchCandles("BTC", "1h", 0, Date.now(), fetchImpl);
    expect(calls).toBe(2);
    expect(rows.length).toBe(5001);
  });

  test("dedups by t", async () => {
    const fetchImpl = (async () =>
      jsonRes([candleRow(1000, "1"), candleRow(1000, "2")])) as unknown as typeof fetch;
    const rows = await fetchCandles("BTC", "1h", 0, 2000, fetchImpl);
    expect(rows.length).toBe(1);
  });

  test("retries once on 429 then throws if it fails again", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return jsonRes({ error: "rate limited" }, 429);
    }) as unknown as typeof fetch;
    await expect(fetchCandles("BTC", "1h", 0, 2000, fetchImpl)).rejects.toThrow();
    expect(calls).toBe(2);
  });

  test("passes the interval through in the request body (e.g. 15m)", async () => {
    let capturedBody: any = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return jsonRes([]);
    }) as unknown as typeof fetch;
    await fetchCandles("ETH", "15m", 0, 2000, fetchImpl);
    expect(capturedBody).toMatchObject({ type: "candleSnapshot", req: { coin: "ETH", interval: "15m" } });
  });
});

describe("fetchFunding", () => {
  function fundingRow(time: number) {
    return { coin: "BTC", fundingRate: "0.0000125", premium: "-0.0003460577", time };
  }

  test("paginates with startTime = last + 1 until short page", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) {
        const rows = Array.from({ length: 500 }, (_, i) => fundingRow(i * 3600000));
        return jsonRes(rows);
      }
      return jsonRes([fundingRow(500 * 3600000)]);
    }) as unknown as typeof fetch;
    const rows = await fetchFunding("BTC", 0, fetchImpl);
    expect(calls).toBe(2);
    expect(rows.length).toBe(501);
    expect(rows[0]).toEqual({ t: 0, rate: 0.0000125, premium: -0.0003460577 });
  });

  test("stops immediately on empty response", async () => {
    const fetchImpl = (async () => jsonRes([])) as unknown as typeof fetch;
    const rows = await fetchFunding("BTC", 0, fetchImpl);
    expect(rows).toEqual([]);
  });
});

describe("fetchSnapshot", () => {
  test("builds Snapshot from metaAndAssetCtxs + predictedFundings", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) {
        return jsonRes([
          { universe: [{ szDecimals: 5, name: "BTC", maxLeverage: 40, marginTableId: 56 }] },
          [
            {
              funding: "0.0000073111",
              openInterest: "37470.12454",
              prevDayPx: "83995.0",
              dayNtlVlm: "1134990950.9098792076",
              premium: "-0.000390177",
              oraclePx: "84577.0",
              markPx: "84543.0",
              midPx: "84543.5",
              impactPxs: ["84543.0", "84544.0"],
              dayBaseVlm: "13415.0319",
            },
          ],
        ]);
      }
      return jsonRes([
        [
          "BTC",
          [
            ["BinPerp", { fundingRate: "0.00002801", nextFundingTime: 1, fundingIntervalHours: 8 }],
            ["HlPerp", { fundingRate: "0.0000072019", nextFundingTime: 1, fundingIntervalHours: 1 }],
          ],
        ],
      ]);
    }) as unknown as typeof fetch;

    const snap = await fetchSnapshot("BTC", fetchImpl);
    expect(snap.markPx).toBe(84543.0);
    expect(snap.oiCoins).toBeCloseTo(37470.12454);
    expect(snap.oiUsd).toBeCloseTo(37470.12454 * 84543.0);
    expect(snap.predicted).toEqual([
      { venue: "BinPerp", rate: 0.00002801, intervalHours: 8 },
      { venue: "HlPerp", rate: 0.0000072019, intervalHours: 1 },
    ]);
  });
});

describe("fetchOi", () => {
  function metaAndCtxsRes(names: string[]) {
    return jsonRes([
      { universe: names.map((name) => ({ szDecimals: 5, name, maxLeverage: 20, marginTableId: 1 })) },
      names.map((_name, i) => ({
        funding: "0.00001",
        openInterest: String(1000 + i),
        prevDayPx: "10",
        dayNtlVlm: "0",
        premium: "0",
        oraclePx: "10",
        markPx: String(10 + i),
        midPx: "10",
        impactPxs: null,
        dayBaseVlm: "0",
      })),
    ]);
  }

  test("parses metaAndAssetCtxs into per-coin OI; a coin missing from the universe is an error entry, not a throw", async () => {
    const fetchImpl = (async () => metaAndCtxsRes(["ETH", "SOL"])) as unknown as typeof fetch;
    const results = await fetchOi(["ETH", "NOPE"], fetchImpl);
    expect(results).toEqual([
      { coin: "ETH", oiCoins: 1000, oiUsd: 10000 },
      { coin: "NOPE", error: "NOPE not found in Hyperliquid universe" },
    ]);
  });
});

describe("weightWaitMs", () => {
  test("returns 0 when the trailing-60s sum is under budget", () => {
    const log = [{ t: 1000, weight: 100 }];
    expect(weightWaitMs(log, 2000, 1000)).toBe(0);
  });

  test("returns the wait until the oldest entry expires when sum + 20 > budget", () => {
    const log = [{ t: 1000, weight: 990 }];
    const now = 31_000; // still within the 60s window starting at t=1000
    expect(weightWaitMs(log, now, 1000)).toBe(1000 + 60_000 - now);
  });

  test("ignores entries already outside the 60s window", () => {
    const log = [{ t: 0, weight: 990 }];
    expect(weightWaitMs(log, 61_000, 1000)).toBe(0);
  });
});

describe("fetchBitstampDaily", () => {
  function ohlcRow(timestamp: number) {
    return {
      timestamp: String(timestamp),
      open: "5.80",
      high: "6.00",
      low: "5.65",
      close: "5.97",
      volume: "58.37",
    };
  }

  test("drops rows with NaN or non-numeric close, keeps valid rows", async () => {
    const day0 = 1315872000;
    const todayStartSec = Math.floor(Date.now() / 1000 / 86400) * 86400;
    const fetchImpl = (async () =>
      jsonRes({
        data: {
          pair: "BTC/USD",
          ohlc: [
            ohlcRow(day0),
            { timestamp: String(day0 + 86400), open: "5.80", high: "6.00", low: "5.65", close: "abc", volume: "58.37" },
            { timestamp: String(day0 + 172800), open: "5.80", high: "6.00", low: "5.65", close: "NaN", volume: "58.37" },
            ohlcRow(day0 + 259200),
          ],
        },
      })) as unknown as typeof fetch;

    const rows = await fetchBitstampDaily(day0, fetchImpl);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.t)).toEqual([day0 * 1000, (day0 + 259200) * 1000]);
  });

  test("walks forward and drops today's partial candle", async () => {
    const day0 = 1315872000;
    const todayStartSec = Math.floor(Date.now() / 1000 / 86400) * 86400;
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) {
        return jsonRes({
          data: { pair: "BTC/USD", ohlc: [ohlcRow(day0), ohlcRow(day0 + 86400), ohlcRow(todayStartSec)] },
        });
      }
      return jsonRes({ data: { pair: "BTC/USD", ohlc: [] } });
    }) as unknown as typeof fetch;

    const rows = await fetchBitstampDaily(day0, fetchImpl);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.src === "bitstamp")).toBe(true);
    expect(rows[0]!.t).toBe(day0 * 1000);
  });
});
