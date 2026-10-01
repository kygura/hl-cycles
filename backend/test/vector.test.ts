import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchCoinMetrics, parseCoinMetricsPages } from "../src/sources/coinmetrics";
import { fetchBGeometrics, parseBgSeries } from "../src/sources/bgeometrics";
import { fetchFred, parseFredCsv, parseFredJson } from "../src/sources/fred";
import { parseStablecoins } from "../src/sources/defillama";
import { computeOptionsSnapshot, fetchDvol, parseDvol } from "../src/sources/deribit";
import { parseFearGreed } from "../src/sources/feargreed";
import { loadSeriesFile, loadState, mergeSeriesFile, saveSeriesFile } from "../src/store";
import { redact, refreshVector, type VectorSource } from "../src/vectorSources";
import { shouldFail, staleVectorSources } from "../src/cronLogic";

const FX = join(import.meta.dir, "fixtures");
const fx = (name: string) => Bun.file(join(FX, name)).json();
const D = (s: string) => Date.parse(`${s}T00:00:00Z`);

function jsonRes(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

async function withTmpDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "hl-cycles-vector-"));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prev;
  }
}

describe("coinmetrics", () => {
  test("parses string decimals, ignores -status fields, derives realized cap/price", async () => {
    const s = parseCoinMetricsPages([await fx("coinmetrics-page.json")]);
    expect(s.CapMVRVCur![0]!.t).toBe(D("2026-09-28"));
    expect(s.FlowInExNtv).toHaveLength(3);
    const mcap = s.CapMrktCurUSD![0]!.v;
    const mvrv = s.CapMVRVCur![0]!.v;
    expect(s.RealizedCapUSD![0]!.v).toBeCloseTo(mcap / mvrv, 0);
    expect(s.RealizedPriceUSD![0]!.v).toBeCloseTo(mcap / mvrv / s.SplyCur![0]!.v, 6);
  });

  test("follows next_page_url and passes start_time for incremental runs", async () => {
    const page = await fx("coinmetrics-page.json");
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return jsonRes(urls.length === 1 ? { data: page.data.slice(0, 1), next_page_url: page.next_page_url } : { data: page.data.slice(1) });
    }) as unknown as typeof fetch;
    const { series } = await fetchCoinMetrics(D("2026-09-20"), fetchImpl);
    expect(urls[0]).toContain("start_time=2026-09-20");
    expect(urls[1]).toBe(page.next_page_url);
    expect(series.CapMVRVCur).toHaveLength(3);
  });

  test("refuses a next_page_url that leaves the CoinMetrics API", async () => {
    const page = await fx("coinmetrics-page.json");
    for (const next of ["https://evil.example/x", "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics.evil.example/?a=1"]) {
      const fetchImpl = (async () => jsonRes({ data: page.data, next_page_url: next })) as unknown as typeof fetch;
      await expect(fetchCoinMetrics(null, fetchImpl)).rejects.toThrow("refusing next_page_url");
    }
  });
});

describe("bgeometrics", () => {
  test("parses string and numeric value keys", async () => {
    expect(parseBgSeries(await fx("bg-sth-realized-price.json"))).toEqual([
      { t: D("2026-09-22"), v: 72763.08 },
      { t: D("2026-09-23"), v: 72797.88 },
      { t: D("2026-09-24"), v: 72875.88 },
    ]);
    expect(parseBgSeries(await fx("bg-sth-sopr.json")).map((r) => r.v)).toEqual([1.0121, 1.0002, 1.0026]);
  });

  test("drops blank values and rows with ambiguous value keys", () => {
    expect(parseBgSeries([{ d: "2026-01-01", unixTs: "1767225600", x: "" }, { d: "2026-01-02", a: 1, b: 2 }])).toEqual([]);
  });

  test("429 stops the loop without retry and names the missing metrics", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return calls === 1 ? jsonRes([{ d: "2026-09-22", unixTs: 1790035200, sthRealizedPrice: 1 }]) : jsonRes({}, 429);
    }) as unknown as typeof fetch;
    const r = await fetchBGeometrics(fetchImpl, undefined);
    expect(calls).toBe(2);
    expect(Object.keys(r.series)).toEqual(["sth-realized-price"]);
    expect(r.error).toContain("rate limited; missing true-market-mean");
    expect(r.error).toContain("etf-flow-btc");
  });

  test("stops early when the hourly quota header hits 0", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return jsonRes([{ d: "2026-09-22", unixTs: 1790035200, v: 1 }], 200, { "X-RateLimit-Remaining-Hour": "0" });
    }) as unknown as typeof fetch;
    const r = await fetchBGeometrics(fetchImpl, undefined);
    expect(calls).toBe(1);
    expect(r.error).toContain("hourly quota exhausted");
  });
});

describe("fred", () => {
  test("CSV: skips header and blank holiday values", async () => {
    const rows = parseFredCsv(await Bun.file(join(FX, "fred-dgs10.csv")).text());
    expect(rows.map((r) => r.v)).toEqual([4.07, 4.05, 4.03, 4.03]);
    expect(rows.some((r) => r.t === D("1962-02-12"))).toBe(false);
  });

  test("JSON API: '.' is missing", () => {
    expect(parseFredJson({ observations: [{ date: "2026-01-02", value: "4.1" }, { date: "2026-01-05", value: "." }] })).toEqual([
      { t: D("2026-01-02"), v: 4.1 },
    ]);
  });

  test("retries a failed series once, records a series that fails twice", async () => {
    const csv = await Bun.file(join(FX, "fred-dgs10.csv")).text();
    const hits: Record<string, number> = {};
    const fetchImpl = (async (url: string) => {
      const id = new URL(url).searchParams.get("id")!;
      hits[id] = (hits[id] ?? 0) + 1;
      if (id === "DGS10" && hits[id] === 1) throw new Error("timeout");
      if (id === "SP500") throw new Error("timeout");
      return new Response(csv);
    }) as unknown as typeof fetch;
    const r = await fetchFred(fetchImpl, undefined, 0);
    expect(hits.DGS10).toBe(2);
    expect(hits.SP500).toBe(2);
    expect(r.series.DGS10).toHaveLength(4);
    expect(r.series.SP500).toBeUndefined();
    expect(r.error).toContain("timeout");
  });
});

describe("defillama", () => {
  test("sums every peg's USD circulating supply per day", async () => {
    const { series } = parseStablecoins(await fx("defillama-stablecoins.json"));
    expect(series.totalStablecoinMcapUSD).toEqual([
      { t: 1511913600000, v: 110105 },
      { t: 1790812800000, v: 312370612190.2001 },
    ]);
  });
});

describe("deribit", () => {
  test("DVOL: close per 1D candle, continuation exposed", async () => {
    const { rows, continuation } = parseDvol(await fx("deribit-dvol.json"));
    expect(rows.map((r) => r.v)).toEqual([82.61, 84.5, 88.64]);
    expect(rows[0]!.t).toBe(1618099200000);
    expect(continuation).toBe(1618012800000);
  });

  test("DVOL: pages backwards until continuation is null", async () => {
    const page = await fx("deribit-dvol.json");
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return jsonRes(calls === 1 ? page : { result: { data: [[1617926400000, 1, 1, 1, 80]], continuation: null } });
    }) as unknown as typeof fetch;
    const { series } = await fetchDvol(null, fetchImpl, 1618300000000);
    expect(calls).toBe(2);
    expect(series.dvol!.map((r) => r.v)).toEqual([80, 82.61, 84.5, 88.64]);
  });

  test("skew/PCR snapshot from a real book (two expiries bracketing 30d)", async () => {
    const book = await fx("deribit-book.json");
    const snap = computeOptionsSnapshot(book, book.usIn / 1000);
    expect(snap.skew25d).toBeCloseTo(1.2085, 3);
    expect(snap.putCallOi).toBeCloseTo(0.38701, 4);
  });

  test("flat smile -> zero skew; PCR = put OI / call OI", () => {
    const now = Date.UTC(2026, 9, 1, 8);
    const result: unknown[] = [];
    for (const exp of ["16OCT26", "27NOV26"]) {
      for (let k = 50_000; k <= 130_000; k += 2_000) {
        for (const cp of ["C", "P"]) {
          result.push({ instrument_name: `BTC-${exp}-${k}-${cp}`, mark_iv: 50, underlying_price: 90_000, open_interest: cp === "P" ? 1 : 2 });
        }
      }
    }
    const snap = computeOptionsSnapshot({ result }, now);
    expect(snap.skew25d).toBeCloseTo(0, 9);
    expect(snap.putCallOi).toBeCloseTo(0.5, 9);
  });

  test("throws when no expiries bracket 30 days", () => {
    const result = [{ instrument_name: "BTC-16OCT26-90000-C", mark_iv: 50, underlying_price: 90_000, open_interest: 1 }];
    expect(() => computeOptionsSnapshot({ result }, Date.UTC(2026, 9, 1))).toThrow("bracketing 30d");
  });
});

describe("feargreed", () => {
  test("parses newest-first rows into ascending daily rows", async () => {
    expect(parseFearGreed(await fx("feargreed.json")).series.fearGreed).toEqual([
      { t: 1790640000000, v: 73 },
      { t: 1790726400000, v: 71 },
      { t: 1790812800000, v: 74 },
    ]);
  });
});

describe("series file merge", () => {
  test("re-fetch overwrites overlapping days, keeps older days and untouched series", () => {
    const existing = {
      series: {
        a: [
          { t: D("2026-09-01"), v: 1 },
          { t: D("2026-09-20"), v: 2 },
        ],
        b: [{ t: D("2026-09-01"), v: 9 }],
      },
      fetchedAt: 1,
    };
    const merged = mergeSeriesFile(existing, { a: [{ t: D("2026-09-20"), v: 20 }, { t: D("2026-09-21"), v: 21 }] }, 5);
    expect(merged.series.a!.map((r) => r.v)).toEqual([1, 20, 21]);
    expect(merged.series.b).toEqual(existing.series.b);
    expect(merged.fetchedAt).toBe(5);
  });

  test("corrupt file throws instead of loading as empty", async () => {
    await withTmpDataDir(async (dir) => {
      await writeFile(join(dir, "bad.json"), "{not json");
      await expect(loadSeriesFile("bad.json")).rejects.toThrow();
    });
  });
});

describe("refreshVector", () => {
  test("a forced source failure keeps last-good file, records lastError, other sources still save; cron does not fail", async () => {
    await withTmpDataDir(async (dir) => {
      const good = { series: { x: [{ t: D("2026-09-01"), v: 1 }] }, fetchedAt: 1 };
      await saveSeriesFile("broken.json", good);
      let sinceSeen: number | null | undefined;
      const sources: VectorSource[] = [
        { name: "broken", file: "broken.json", fetch: async () => { throw new Error("HTTP 503"); } },
        {
          name: "ok",
          file: "ok.json",
          fetch: async (since) => {
            sinceSeen = since;
            return { series: { y: [{ t: D("2026-09-30"), v: 7 }] } };
          },
        },
      ];
      const prev = { broken: { lastOk: 100, lastError: null } };
      const out = await refreshVector(prev, sources, fetch, 999);

      expect(out.broken).toEqual({ lastOk: 100, lastError: "broken: HTTP 503" });
      expect(out.ok).toEqual({ lastOk: 999, lastError: null });
      expect(JSON.parse(await readFile(join(dir, "broken.json"), "utf8"))).toEqual(good);
      expect((await loadSeriesFile("ok.json")).series.y).toHaveLength(1);
      expect(sinceSeen).toBeNull(); // first run -> full history
      // A one-off failure with a recent lastOk is not stale, so cron stays green.
      expect(staleVectorSources(out, ["broken", "ok"], 100 + 86_400_000)).toEqual([]);
    });
  });

  test("incremental run asks for the trailing 14 days from the oldest series end", async () => {
    await withTmpDataDir(async () => {
      await saveSeriesFile("s.json", {
        series: { a: [{ t: D("2026-09-30"), v: 1 }], b: [{ t: D("2026-09-20"), v: 1 }] },
        fetchedAt: 1,
      });
      let since: number | null = null;
      const src: VectorSource = { name: "s", file: "s.json", fetch: async (s) => ((since = s), { series: { a: [{ t: D("2026-10-01"), v: 2 }] } }) };
      await refreshVector({}, [src], fetch, 1);
      expect(since).toBe(D("2026-09-06"));
    });
  });

  test("empty fetch result is an error, not a save", async () => {
    await withTmpDataDir(async () => {
      const src: VectorSource = { name: "e", file: "e.json", fetch: async () => ({ series: { a: [] } }) };
      const out = await refreshVector({}, [src], fetch, 1);
      expect(out.e!.lastError).toContain("no rows");
      expect((await loadSeriesFile("e.json")).fetchedAt).toBeNull();
    });
  });

  test("corrupt file is moved aside and full history re-fetched", async () => {
    await withTmpDataDir(async (dir) => {
      await writeFile(join(dir, "c.json"), '{"series":{"a":[{"t":"x"}]}}');
      let since: number | null | undefined;
      const src: VectorSource = { name: "c", file: "c.json", fetch: async (s) => ((since = s), { series: { a: [{ t: D("2026-09-30"), v: 1 }] } }) };
      const out = await refreshVector({}, [src], fetch, 42);
      expect(since).toBeNull();
      expect(out.c).toEqual({ lastOk: 42, lastError: null });
      expect((await readdir(dir)).sort()).toEqual(["c.json", "c.json.corrupt-42", "state.json"]);
      expect((await loadSeriesFile("c.json")).series.a).toHaveLength(1);
    });
  });

  test("a corrupt snapshot-only file (options-skew) is never discarded", async () => {
    await withTmpDataDir(async (dir) => {
      await writeFile(join(dir, "skew.json"), "{not json");
      let called = false;
      const src: VectorSource = { name: "skew", file: "skew.json", snapshotOnly: true, fetch: async () => ((called = true), { series: { s: [{ t: 1, v: 1 }] } }) };
      const out = await refreshVector({ skew: { lastOk: 7, lastError: null } }, [src], fetch, 42);
      expect(called).toBe(false);
      expect(out.skew!.lastOk).toBe(7);
      expect(out.skew!.lastError).toContain("skew:");
      expect(await readFile(join(dir, "skew.json"), "utf8")).toBe("{not json");
    });
  });

  test("a once-per-day source is skipped when it already succeeded the same UTC day", async () => {
    await withTmpDataDir(async () => {
      let calls = 0;
      const src: VectorSource = { name: "bg", file: "bg.json", oncePerDay: true, fetch: async () => (calls++, { series: { a: [{ t: 1, v: 1 }] } }) };
      const now = Date.UTC(2026, 9, 1, 18);
      const prev = { bg: { lastOk: Date.UTC(2026, 9, 1, 0, 5), lastError: null } };
      expect(await refreshVector(prev, [src], fetch, now)).toEqual(prev);
      expect(calls).toBe(0);
      await refreshVector({ bg: { lastOk: Date.UTC(2026, 8, 30, 23), lastError: null } }, [src], fetch, now);
      expect(calls).toBe(1);
    });
  });

  test("credentials are masked in recorded errors", async () => {
    await withTmpDataDir(async () => {
      const src: VectorSource = { name: "k", file: "k.json", fetch: async () => { throw new Error("GET https://x/y?series_id=A&api_key=SECRET1&token=SECRET2 failed"); } };
      const out = await refreshVector({}, [src], fetch, 1);
      expect(out.k!.lastError).not.toContain("SECRET");
      expect(out.k!.lastError).toContain("api_key=***&token=***");
      expect(redact("partial: token=abc")).toBe("partial: token=***");
    });
  });

  test("one overall deadline aborts slow fetches; finished sources are already persisted", async () => {
    await withTmpDataDir(async () => {
      const hang = ((_url: string, init?: RequestInit) =>
        new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("deadline"))))) as unknown as typeof fetch;
      const sources: VectorSource[] = [
        { name: "fast", file: "fast.json", fetch: async () => ({ series: { a: [{ t: 1, v: 1 }] } }) },
        { name: "slow", file: "slow.json", fetch: async (_s, f) => { await f("https://slow"); return { series: {} }; } },
      ];
      const out = await refreshVector({}, sources, hang, 5, 50);
      expect(out.slow!.lastError).toContain("deadline");
      expect((await loadState())!.vectorSources).toEqual(out);
    });
  });
});

describe("vector staleness alert (cron)", () => {
  const now = Date.UTC(2026, 9, 1, 0, 10);
  const DAYS = (k: number) => now - k * 86_400_000;
  test("a source never fetched, or not fetched for over 3 days, fails the run", () => {
    const states = { a: { lastOk: DAYS(1) }, b: { lastOk: null }, c: { lastOk: DAYS(3.1) } };
    const stale = staleVectorSources(states, ["a", "b", "c", "d"], now);
    expect(stale.map((e) => e.split(":")[0])).toEqual(["vector b", "vector c", "vector d"]);
    expect(shouldFail(stale, [], 10)).toBe(true);
  });
  test("a single-day failure within 3 days is only a warning", () => {
    expect(staleVectorSources({ a: { lastOk: DAYS(2.9) } }, ["a"], now)).toEqual([]);
  });
});
