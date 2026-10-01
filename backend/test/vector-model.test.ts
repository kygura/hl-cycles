import { describe, expect, test } from "bun:test";
import { carry } from "../src/model/indicators";
import { inputPct, inputScore, meanIfHalf, computeCompass, bandOf, HEADLINE_BANDS, type CompassInput, type LensSpec } from "../src/model/compass";
import {
  rawState,
  commitRegime,
  riskOffShare,
  levelStatus,
  flipsOf,
  stateSince,
  wocPhase,
  htfNote,
  momentumScore,
  buildVector,
  type RegimeState,
} from "../src/model/vector";
import { computeHtf } from "../src/model/htf";
import type { Candle } from "../src/types";

const DAY = 86_400_000;
const T0 = Date.UTC(2024, 5, 1);
const inp = (values: (number | null)[], polarity: 1 | -1 = 1): CompassInput => ({ key: "x", label: "x", unit: "ratio", polarity, values, asOf: null });

describe("compass percentile and polarity (D4)", () => {
  test("expanding window: null before 365 values, then rank includes today", () => {
    const xs = Array.from({ length: 400 }, (_, i) => i);
    const p = inputPct(inp(xs));
    expect(p[363]).toBeNull();
    expect(p[364]).toBeCloseTo(((364 + 0.5) / 365) * 100, 9);
    expect(p[399]).toBeCloseTo(((399 + 0.5) / 400) * 100, 9);
  });

  test("polarity −1 mirrors the score, pct stays raw", () => {
    const xs = Array.from({ length: 400 }, (_, i) => i);
    expect(inputScore(inp(xs, -1))[399]).toBeCloseTo(100 - ((399 + 0.5) / 400) * 100, 9);
  });

  test("rolling 4y window forgets values older than 1460 days", () => {
    // 500 huge values, then 1460 small rising ones: the last value is the window max.
    const xs = [...Array(500).fill(1e9), ...Array.from({ length: 1460 }, (_, i) => i)];
    expect(inputPct(inp(xs))[xs.length - 1]).toBeCloseTo(((1459 + 0.5) / 1460) * 100, 9);
  });

  test("raw (breadth) inputs are scored as-is", () => {
    expect(inputPct({ values: [42], raw: true })[0]).toBe(42);
  });

  test("lens = mean of non-null inputs, null when fewer than half are present", () => {
    expect(meanIfHalf([[10], [null], [30], [null]], 1)[0]).toBe(20); // 2 of 4 = half
    expect(meanIfHalf([[10], [null], [null], [null]], 1)[0]).toBeNull();
    expect(meanIfHalf([[10], [20], [null], [null], [null]], 1)[0]).toBeNull(); // 2 of 5
    expect(meanIfHalf([[10], [20], [30], [null], [null]], 1)[0]).toBe(20); // 3 of 5
  });

  test("headline averages only the four forward lenses; bands at 20/40/60/80", () => {
    const lens = (key: string, v: number, standalone = false): LensSpec => ({
      key, label: key, standalone, bands: HEADLINE_BANDS, inputs: [{ ...inp([v]), raw: true }],
    });
    const { headline, lenses } = computeCompass(
      [lens("macro", 10), lens("flows", 20), lens("behaviour", 30), lens("fundamentals", 40), lens("cycle", 100, true)],
      1,
    );
    expect(headline[0]).toBe(25);
    expect(lenses[4]!.score[0]).toBe(100);
    expect([0, 19.9, 20, 59.9, 80, 100].map((s) => bandOf(s, HEADLINE_BANDS))).toEqual([
      "Risk-Off", "Risk-Off", "Defensive", "Neutral", "Risk-On", "Risk-On",
    ]);
  });
});

describe("regime raw state (MODEL §8.3)", () => {
  test("four-state rule", () => {
    expect(rawState(0, 10, 1)).toBe("strong_risk_on");
    expect(rawState(0, 10, -1)).toBe("mild_risk_on");
    expect(rawState(0, 10, null)).toBe("mild_risk_on");
    expect(rawState(1 / 6, 10, 1)).toBe("mild_risk_on");
    expect(rawState(2 / 6, 10, 1)).toBe("mild_risk_off");
    expect(rawState(0.5, -1, 1)).toBe("strong_risk_off");
    expect(rawState(0.5, 1, 1)).toBe("mild_risk_off");
    expect(rawState(1 / 6, -5, 1)).toBe("mild_risk_off");
    expect(rawState(null, 10, 1)).toBeNull();
  });

  test("riskOff never renormalises: a missing condition counts as not stressed", () => {
    expect(riskOffShare([true, null, false, true, null, null])).toBeCloseTo(2 / 6, 12);
  });

  test("a new state commits only after 3 consecutive closes", () => {
    const on: RegimeState = "mild_risk_on";
    const off: RegimeState = "mild_risk_off";
    expect(commitRegime([on, on, off, off, on, off, off, off])).toEqual([on, on, on, on, on, on, on, off]);
  });

  test("flips are extreme-to-extreme only; since = start of the current state", () => {
    const s: RegimeState[] = ["strong_risk_off", "mild_risk_off", "mild_risk_on", "mild_risk_off", "strong_risk_on", "mild_risk_on", "strong_risk_on"];
    const t = s.map((_, i) => T0 + i * DAY);
    const f = flipsOf(t, s, s.map((_, i) => 100 + i));
    expect(f).toEqual([{ t: T0 + 4 * DAY, from: "mild_risk_off", to: "strong_risk_on", price: 104 }]);
    expect(stateSince(t, s)).toBe(T0 + 6 * DAY);
  });

  test("momentum is bounded and signed", () => {
    const up = Array.from({ length: 300 }, (_, i) => 100 * 1.01 ** i);
    const m = momentumScore(up);
    expect(m[199]).toBeNull();
    expect(m[299]!).toBeGreaterThan(0);
    expect(m[299]!).toBeLessThanOrEqual(100);
    expect(momentumScore([...up].reverse())[299]!).toBeLessThan(0);
  });

  test("momentum matches the closed form on a constant log-return path", () => {
    const r = 0.002;
    const c = Array.from({ length: 260 }, (_, i) => Math.exp(r * i));
    // ln(c[i]/c[i-k]) = r·k, so each leg is tanh(r·√k / σ).
    const expected = (100 * [20, 50, 200].reduce((a, k) => a + Math.tanh((r * Math.sqrt(k)) / 0.035), 0)) / 3;
    expect(momentumScore(c)[250]!).toBeCloseTo(expected, 9);
  });
});

describe("carry-forward and staleness (D5)", () => {
  test("carry fills at most 10 days", () => {
    const c = carry([1, ...Array(12).fill(null)], 10);
    expect(c.slice(0, 11)).toEqual(Array(11).fill(1));
    expect(c[11]).toBeNull();
  });

  // 700 synthetic daily candles: a steady uptrend so the regime is defined at the end.
  const candles: Candle[] = Array.from({ length: 700 }, (_, i) => {
    const c = 20_000 * 1.002 ** i * (1 + 0.02 * Math.sin(i / 7));
    return { t: T0 + i * DAY, o: c, h: c, l: c, c, v: 1, src: "bitstamp" };
  });
  const htf = computeHtf(candles, T0 + 700 * DAY);
  const last = htf[htf.length - 1]!.t;
  const rows = (endAgo: number, f: (c: number, i: number) => number) =>
    htf.filter((p) => p.t <= last - endAgo * DAY).map((p, i) => ({ t: p.t, v: f(p.c, i) }));
  const data = (cbAgo: number) => ({
    htf,
    series: {
      "sth-realized-price": rows(cbAgo, (c) => c * 1.5), // above price: the condition is stressed while fresh
      "true-market-mean": rows(0, (c) => c * 0.8),
      "sth-sopr": rows(0, () => 1.02),
      totalStablecoinMcapUSD: rows(0, (_, i) => 1e11 + i * 1e8),
      RealizedCapUSD: rows(0, (_, i) => 1e11 + i * 1e8),
    },
    funding: [],
    oi: [],
    alts: [],
    sources: {},
  });

  test("an input up to 10 days old is carried and counted", () => {
    const v = buildVector(data(5));
    const cond = v.regime.conditions.find((c) => c.key === "price_below_sth")!;
    expect(cond.on).toBe(true);
    expect(v.stale).toBe(true); // etf-flow-btc missing entirely after 2024 is stale too
    expect(cond.asOf).toBe(last - 5 * DAY);
  });

  test("beyond 10 days the input counts as not stressed and marks the regime stale", () => {
    const fresh = buildVector({ ...data(5), series: { ...data(5).series, "etf-flow-btc": rows(0, () => 10) } });
    const old = buildVector({ ...data(12), series: { ...data(12).series, "etf-flow-btc": rows(0, () => 10) } });
    expect(fresh.stale).toBe(false);
    expect(old.stale).toBe(true);
    expect(old.regime.conditions.find((c) => c.key === "price_below_sth")!.on).toBe(false);
    expect(old.oldestInputAsOf).toBe(last - 12 * DAY);
  });

  test("ETF tail: zero-filled up to the last row, carried after it; revised when delayed rows land", () => {
    const etfCond = (v: ReturnType<typeof buildVector>) => v.regime.conditions.find((c) => c.key === "etf_outflow_7d")!;
    // Rows end 3 days before the last close, with one interior day (last-5) missing.
    const etf = rows(3, () => 10).filter((r) => r.t !== last - 5 * DAY);
    const base = data(0);
    const v = buildVector({ ...base, series: { ...base.series, "etf-flow-btc": etf } });
    expect(etfCond(v).value).toBe(60); // days last-9..last-3, the gap read as 0, carried to the last close
    expect(etfCond(v).on).toBe(false);
    const late = [-3, -2, -1, 0].map((k) => ({ t: last + k * DAY, v: k === -3 ? 10 : -100 }));
    const revised = buildVector({ ...base, series: { ...base.series, "etf-flow-btc": [...etf.filter((r) => r.t < last - 3 * DAY), ...late] } });
    expect(etfCond(revised).value).toBe(-270);
    expect(etfCond(revised).on).toBe(true);
  });
});

describe("D5: ETF before its launch", () => {
  test("a 2023 regime without ETF rows reads the ETF condition false and is not stale", () => {
    const t0 = Date.UTC(2022, 0, 1);
    const candles: Candle[] = Array.from({ length: 700 }, (_, i) => {
      const c = 20_000 * 1.002 ** i * (1 + 0.02 * Math.sin(i / 7));
      return { t: t0 + i * DAY, o: c, h: c, l: c, c, v: 1, src: "bitstamp" };
    });
    const htf = computeHtf(candles, t0 + 700 * DAY);
    const end = htf[htf.length - 1]!.t;
    expect(end).toBeLessThan(Date.UTC(2024, 0, 11));
    const rows = (f: (c: number, i: number) => number) => htf.map((p, i) => ({ t: p.t, v: f(p.c, i) }));
    const v = buildVector({
      htf,
      series: {
        "sth-realized-price": rows((c) => c * 0.9),
        "true-market-mean": rows((c) => c * 0.8),
        "sth-sopr": rows(() => 1.02),
        totalStablecoinMcapUSD: rows((_, i) => 1e11 + i * 1e8),
        RealizedCapUSD: rows((_, i) => 1e11 + i * 1e8),
      },
      funding: [], oi: [], alts: [], sources: {},
    });
    const etf = v.regime.conditions.find((c) => c.key === "etf_outflow_7d")!;
    expect(v.regime.state).not.toBeNull();
    expect(etf.on).toBe(false);
    expect(etf.asOf).toBe(end);
    expect(v.stale).toBe(false);
  });
});

describe("levels, WoC phase, D7 note", () => {
  test("level status over the last two closes", () => {
    const lv = [11, 11];
    expect(levelStatus([12, 13], lv, 1)).toBe("holding");
    expect(levelStatus([10, 9], lv, 1)).toBe("lost");
    expect(levelStatus([10, 12], lv, 1)).toBe("contested");
    expect(levelStatus([12, 10], lv, 1)).toBe("contested");
    expect(levelStatus([12, 10], [null, 11], 1)).toBeNull();
    expect(levelStatus([11, 11], lv, 1)).toBe("lost"); // price == level counts as below (MODEL §8.4)
  });

  test("WoC phase rule", () => {
    expect(wocPhase(100, 90, 95)).toBe("strong_uptrend");
    expect(wocPhase(80, 90, 95)).toBe("capitulation");
    expect(wocPhase(80, 95, 90)).toBe("bear");
    expect(wocPhase(92, 90, 95)).toBe("transition");
    expect(wocPhase(92, null, 95)).toBeNull();
  });

  test("htfNote follows the DESIGN 14.4.1 table exactly", () => {
    expect(htfNote("strong_risk_on", "distribution")).toBe("HTF phase reads DISTRIBUTION — the cycle frame disagrees with the regime.");
    expect(htfNote("mild_risk_on", "markdown")).not.toBeNull();
    expect(htfNote("mild_risk_off", "expansion")).toBe("HTF phase reads EXPANSION — the cycle frame disagrees with the regime.");
    expect(htfNote("mild_risk_off", "accumulation")).toBeNull();
    expect(htfNote("strong_risk_on", "euphoria")).toBeNull();
    expect(htfNote("strong_risk_off", "euphoria")).toBeNull();
    expect(htfNote(null, "expansion")).toBeNull();
  });
});
