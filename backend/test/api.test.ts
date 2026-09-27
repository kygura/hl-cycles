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
