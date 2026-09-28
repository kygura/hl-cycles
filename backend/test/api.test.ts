import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Candle, FundingRow } from "../src/types";

const BAR_4H = 14_400_000;
const BAR_1H = 3_600_000;

// Fixed anchor instead of Date.now() so the fixture data (and the server's live Date.now() calls
// against it) is deterministic across runs.
const FIXED_NOW = Date.UTC(2026, 0, 1);

function syntheticCandles(n: number, bar: number, endBeforeNow: number): Candle[] {
  const startT = FIXED_NOW - endBeforeNow - n * bar;
  return Array.from({ length: n }, (_, i) => {
    const t = startT + i * bar;
    const c = 90_000 + i * 8 + Math.sin(i / 5) * 200;
    return { t, o: c - 5, h: c + 15, l: c - 15, c, v: 10, src: "hl" as const };
  });
}

function syntheticFunding(fromT: number, toT: number, step: number): FundingRow[] {
  const out: FundingRow[] = [];
  for (let t = fromT; t < toT; t += step) {
    out.push({ t, rate: 0.0000125 + Math.sin(t / 1e10) * 0.000002, premium: Math.sin(t / 1e10) * 0.0002 });
  }
  return out;
}

let app: { request: (input: string, init?: RequestInit) => Promise<Response> };
let dir: string;
const prevEnv = { DATA_DIR: process.env.DATA_DIR, NO_SCHEDULER: process.env.NO_SCHEDULER };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "hl-cycles-api-test-"));
  process.env.DATA_DIR = dir;
  process.env.NO_SCHEDULER = "1";

  const bitstampRaw = await readFile(join(import.meta.dir, "fixtures/bitstamp-1d.json"), "utf8");
  await writeFile(join(dir, "candles-bitstamp-1d.json"), bitstampRaw);
  await writeFile(join(dir, "candles-hl-1d.json"), "[]");

  const hl4h = syntheticCandles(80, BAR_4H, BAR_4H * 2);
  const hl1h = syntheticCandles(80, BAR_1H, BAR_1H * 2);
  await writeFile(join(dir, "candles-hl-4h.json"), JSON.stringify(hl4h));
  await writeFile(join(dir, "candles-hl-1h.json"), JSON.stringify(hl1h));

  const funding = syntheticFunding(hl4h[0]!.t, FIXED_NOW, BAR_1H);
  await writeFile(join(dir, "funding.json"), JSON.stringify(funding));

  // NO_SCHEDULER must be set before server.ts (module-level scheduler guard) loads.
  const mod = await import("../src/server");
  app = mod.app;
});

afterAll(() => {
  if (prevEnv.DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = prevEnv.DATA_DIR;
  if (prevEnv.NO_SCHEDULER === undefined) delete process.env.NO_SCHEDULER;
  else process.env.NO_SCHEDULER = prevEnv.NO_SCHEDULER;
});

describe("GET /api/health", () => {
  test("200 with expected shape", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
    expect(body).toHaveProperty("lastRefresh");
    expect(body).toHaveProperty("lastSnapshot");
    expect(body).toHaveProperty("firstSnapshot");
    expect(body).toHaveProperty("lastError");
    expect(body.counts).toEqual(
      expect.objectContaining({
        candles1d: expect.any(Number),
        candles4h: expect.any(Number),
        candles1h: expect.any(Number),
        funding: expect.any(Number),
        snapshots: expect.any(Number),
      }),
    );
  });
});

describe("GET /api/overview", () => {
  test("200 with expected shape, feature key order matches MODEL section 4, units are fractions", async () => {
    const res = await app.request("/api/overview");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("asOf");
    expect(body).toHaveProperty("price");
    expect(body).toHaveProperty("lastRefresh");
    expect(body).toHaveProperty("crossVenueFunding");
    expect(body.htf).toHaveProperty("phase");
    expect(body.htf).toHaveProperty("trend");
    expect(body.htf).toHaveProperty("heat");
    expect(body.htf.cycle).toHaveProperty("cycleProgress");
    expect(body.ltf).toHaveProperty("state");
    expect(body.composite).toHaveProperty("bias");
    expect(body.composite).toHaveProperty("summary");

    // 3b.2: composite.components is always 4, in key order, each word matching componentWord.
    const { componentWord } = await import("../src/model/composite");
    expect(body.composite.components.map((c: any) => c.key)).toEqual(["trend", "heat", "leverage", "momentum"]);
    for (const c of body.composite.components) {
      expect(c.word).toBe(componentWord(c.key, c.score));
    }
    expect(body.composite.label === null || typeof body.composite.label === "string").toBe(true);
    expect(typeof body.composite.sentence).toBe("string");

    // composite.summary stays byte-identical to summaryText() (pre-3b.2 regression guard).
    const { summaryText } = await import("../src/model/composite");
    expect(body.composite.summary).toBe(summaryText(body.htf.phase, body.ltf.state, body.composite.bias));

    expect(Object.keys(body.htf.features)).toEqual([
      "close", "sma50", "sma200", "mayer", "mayerPct", "drawdown", "sma200Slope30",
      "roc30", "roc365", "rv30", "rv30Pct", "daysSinceLow365", "tMayer", "tSlope",
      "tCross", "hMayer", "hDrawdown", "hRoc365",
    ]);
    expect(Object.keys(body.ltf.features)).toEqual([
      "close", "ema50", "rsi14", "roc6", "fundingApr", "premium", "premiumZ", "oiUsd",
      "oiChange24h", "rv42", "rv42Pct", "lFunding", "lPremium", "lOi", "mEma", "mRsi", "mRoc",
    ]);

    // units are fractions, not percents
    if (body.htf.features.drawdown != null) {
      expect(body.htf.features.drawdown).toBeLessThanOrEqual(0);
      expect(body.htf.features.drawdown).toBeGreaterThanOrEqual(-1);
    }
    if (body.htf.cycle.cycleProgress != null) {
      expect(body.htf.cycle.cycleProgress).toBeGreaterThanOrEqual(0);
      expect(body.htf.cycle.cycleProgress).toBeLessThanOrEqual(1);
    }
    if (body.ltf.features.fundingApr != null) {
      expect(Math.abs(body.ltf.features.fundingApr)).toBeLessThan(2); // percent form would be ~10+
    }
  });
});

describe("GET /api/htf", () => {
  test("200, default 1d, full history shape", async () => {
    const res = await app.request("/api/htf");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.candles)).toBe(true);
    expect(Array.isArray(body.halvings)).toBe(true);
    expect(body.candles.length).toBeGreaterThan(1000);
    const p = body.candles[body.candles.length - 1];
    expect(p).toHaveProperty("sma200");
    expect(p).toHaveProperty("phase");
  });

  test("200, ?interval=1w resamples weekly", async () => {
    const res = await app.request("/api/htf?interval=1w");
    expect(res.status).toBe(200);
    const body = await res.json();
    const daily = await (await app.request("/api/htf?interval=1d")).json();
    expect(body.candles.length).toBeLessThan(daily.candles.length);
  });

  test("400 on bad interval", async () => {
    const res = await app.request("/api/htf?interval=bogus");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("GET /api/ltf", () => {
  test("200, default 4h shape", async () => {
    const res = await app.request("/api/ltf");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points.length).toBeGreaterThan(0);
    const p = body.points[body.points.length - 1];
    expect(p).toHaveProperty("ema50");
    expect(p).toHaveProperty("state");
  });

  test("200, ?interval=1h", async () => {
    const res = await app.request("/api/ltf?interval=1h");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.points)).toBe(true);
  });

  test("400 on bad interval", async () => {
    const res = await app.request("/api/ltf?interval=bogus");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  // Regression guard (SPEC.md 3.5): the no-coin response must stay byte-identical to the
  // pre-Phase-3 BTC view — full history, no slicing, computed the same way the endpoint always
  // has (same fixture candles/funding, no snapshots/oi-history in this fixture set).
  // NOTE: this only guards ROUTING (that the endpoint wires request -> computeLtf() -> response
  // unchanged) — `expected` is computed with the same computeLtf() under test, so a bug shared by
  // both sides would not be caught here. The golden check right below pins 3 fixed fixture points
  // against hardcoded values so a model regression (not just a routing one) fails this file too.
  test("?interval=4h with and without coin=BTC equals direct computeLtf() over the same fixture data (full history, no slicing)", async () => {
    const { computeLtf } = await import("../src/model/ltf");
    const hl4h = JSON.parse(await readFile(join(dir, "candles-hl-4h.json"), "utf8"));
    const funding = JSON.parse(await readFile(join(dir, "funding.json"), "utf8"));
    const expected = computeLtf(hl4h, funding, [], "4h", Date.now(), []);
    const plain = await (await app.request("/api/ltf?interval=4h")).json();
    expect(plain.points).toEqual(expected);
    // The main chart fetches coin=BTC (frontend api.ts), which must not be trimmed like alts.
    const btc = await (await app.request("/api/ltf?interval=4h&coin=BTC")).json();
    expect(btc.points).toEqual(expected);
  });

  // Golden check: 3 fixed points (first/mid/last of the 80-bar fixture) pinned to hardcoded
  // state/leverage/momentum values, independent of computeLtf() itself, so a model regression in
  // rawStateOf/blend/etc. fails even if routing stays correct.
  test("?interval=4h golden values for 3 fixed fixture points", async () => {
    const res = await app.request("/api/ltf?interval=4h");
    const body = await res.json();
    const at = (i: number) => {
      const p = body.points[i];
      return { state: p.state, leverage: p.leverage, momentum: p.momentum };
    };
    expect(at(0)).toEqual({ state: "insufficient_data", leverage: 0.10915898739070878, momentum: null });
    expect(at(40)).toEqual({ state: "healthy_uptrend", leverage: 0.11674803673422095, momentum: 0.5203284527858406 });
    expect(at(body.points.length - 1)).toEqual({
      state: "neutral",
      leverage: 0.12376566931617729,
      momentum: 0.05637901587834538,
    });
  });

  test("coin=ETH&interval=15m returns at most 1500 points", async () => {
    const res = await app.request("/api/ltf?interval=15m&coin=ETH");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points.length).toBeLessThanOrEqual(1500);
  });

  test("coin=NOPE -> 400", async () => {
    const res = await app.request("/api/ltf?interval=1h&coin=NOPE");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("GET /api/assets", () => {
  test("200, equals ASSETS", async () => {
    const { ASSETS } = await import("../src/assets");
    const res = await app.request("/api/assets");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assets).toEqual(ASSETS);
  });
});

describe("GET /api/derivatives", () => {
  test("200 with every key from SPEC.md 3b.3; empty DATA_DIR snapshot file still returns 200 with collecting: true", async () => {
    const res = await app.request("/api/derivatives");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("now");
    expect(body.windowMs).toBe(7_776_000_000);
    expect(body).toHaveProperty("asOf");
    expect(body).toHaveProperty("firstSnapshot");
    expect(body.collecting).toBe(true); // this fixture's DATA_DIR has no snapshots.jsonl
    expect(body.premium).toEqual({ points: [], last: null });
    expect(body.oiUsd).toEqual({ points: [], last: null, change24h: null, src: "hl" });
    expect(body.volume24h).toEqual({ points: [], last: null });
    expect(body.fundingApr).toHaveProperty("points");
    expect(body.fundingApr).toHaveProperty("last");
    expect(body.fundingApr).toHaveProperty("predicted");
  });
});

describe("GET /api/signals", () => {
  test("200, newest first, from null on the first record of its frame", async () => {
    const res = await app.request("/api/signals?limit=1000");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.signals)).toBe(true);
    expect(body.signals.length).toBeGreaterThan(0);
    for (let i = 1; i < body.signals.length; i++) {
      expect(body.signals[i - 1].t).toBeGreaterThanOrEqual(body.signals[i].t);
    }
    const htfRows = body.signals.filter((s: any) => s.frame === "HTF");
    const oldestHtf = htfRows[htfRows.length - 1];
    expect(oldestHtf.from).toBeNull();
  });

  test("default limit is 200, requests above 1000 are capped, not rejected", async () => {
    const res = await app.request("/api/signals");
    const body = await res.json();
    expect(body.signals.length).toBeLessThanOrEqual(200);

    const capped = await app.request("/api/signals?limit=5000");
    expect(capped.status).toBe(200);
    const cappedBody = await capped.json();
    expect(cappedBody.signals.length).toBeLessThanOrEqual(1000);
  });

  test("400 on non-numeric limit", async () => {
    const res = await app.request("/api/signals?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("?frame=HTF filters to HTF-only rows", async () => {
    const res = await app.request("/api/signals?frame=HTF&limit=1000");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signals.every((s: any) => s.frame === "HTF")).toBe(true);
  });

  test("400 on bad frame", async () => {
    const res = await app.request("/api/signals?frame=WRONG");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
