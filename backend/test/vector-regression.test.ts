// Frozen-input regression for buildVector (fixtures/vector-regression/inputs.json: real data trimmed
// to the series the regime and the Compass headline need, 2022-09-01 -> 2026-09-28, price from
// 2021-08 for warm-up). Expected values were captured from the model before the Phase 4 fix-loop
// refactor; a change here is a model change and must be deliberate (update MODEL.md §8 too).
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildVector } from "../src/model/vector";
import type { HtfPoint } from "../src/model/htf";
import { DAY, type Row } from "../src/model/indicators";

type Daily = { start: string; v: (number | null)[] };
const D = (s: string) => Date.parse(`${s}T00:00:00Z`);
const fx = await Bun.file(join(import.meta.dir, "fixtures", "vector-regression", "inputs.json")).json();
const toRows = ({ start, v }: Daily): Row[] => v.flatMap((x, i) => (x == null ? [] : [{ t: D(start) + i * DAY, v: x }]));

function regressionInput() {
  const h = fx.htf;
  const htf = h.c.map((c: number, i: number) => ({ t: D(h.start) + i * DAY, c, heat: h.heat[i], sma200: h.sma200[i], phase: h.phase[i] })) as HtfPoint[];
  const series = Object.fromEntries(Object.entries(fx.series as Record<string, Daily>).map(([k, d]) => [k, toRows(d)]));
  return { htf, series, funding: [], oi: [], alts: [], sources: {} };
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

describe("vector regression (frozen real inputs)", () => {
  const v = buildVector(regressionInput());
  const at = (day: string) => v.history.find((p) => p.t === D(day))!;
  const compassAt = (day: string) => v.compass.history.find((p) => p.t === D(day))!;

  test("regime start day", () => {
    expect(iso(v.history.find((p) => p.state != null)!.t)).toBe(EXPECTED.start);
  });

  test("full flip list", () => {
    expect(v.flips.map((f) => [iso(f.t), f.from, f.to])).toEqual(EXPECTED.flips);
  });

  test("anchors: riskOff, momentum, compass headline", () => {
    for (const [day, riskOff, momentum, headline] of EXPECTED.anchors) {
      expect(at(day).riskOff!).toBeCloseTo(riskOff, 4);
      expect(at(day).momentum!).toBeCloseTo(momentum, 4);
      expect(compassAt(day).headline!).toBeCloseTo(headline, 4);
    }
  });
});

const EXPECTED: { start: string; flips: [string, string, string][]; anchors: [string, number, number, number][] } = {
  start: "2022-10-07",
  flips: [
    ["2023-10-28", "mild_risk_on", "strong_risk_on"],
    ["2024-05-02", "mild_risk_off", "strong_risk_off"],
    ["2024-06-01", "mild_risk_on", "strong_risk_on"],
    ["2024-06-26", "mild_risk_off", "strong_risk_off"],
    ["2024-09-28", "mild_risk_on", "strong_risk_on"],
    ["2025-02-27", "mild_risk_off", "strong_risk_off"],
    ["2025-05-04", "mild_risk_on", "strong_risk_on"],
    ["2025-08-31", "mild_risk_off", "strong_risk_off"],
    ["2025-09-15", "mild_risk_on", "strong_risk_on"],
    ["2025-10-23", "mild_risk_off", "strong_risk_off"],
    ["2026-05-06", "mild_risk_off", "strong_risk_on"],
    ["2026-05-21", "strong_risk_on", "strong_risk_off"],
    ["2026-08-26", "mild_risk_on", "strong_risk_on"],
  ],
  // [day, riskOff, momentum, compass headline] as rounded in the payload history.
  anchors: [
    ["2023-11-15", 0, 65.5, 72.9],
    ["2025-02-27", 0.667, -16.3, 40.5],
    ["2026-09-28", 0, 49.1, 49.8],
  ],
};
