// Display thresholds that mirror docs/MODEL.md §8 (DESIGN.md §14.4.2). If the model moves a
// threshold, this file changes and nothing else. Gauge min/max come from the API
// (`gauges.<key>.scale`, SPEC 4.7 #1); only the zone bands and words live here.
import type { GaugeKey } from "../../api";
import { BAND_VAR } from "../../tokens";
import { DAY } from "../../format";

export type GaugeZone = { to: number; color: string; word: string };
export type GaugeZones = { zones: GaugeZone[] };

const band = (i: 1 | 2 | 3 | 4 | 5): string => `var(${BAND_VAR[i - 1]})`;

export const GAUGE_LABEL: Record<GaugeKey, string> = {
  risk: "Risk",
  momentum: "Momentum",
  fundamentals: "Fundamentals",
  flows: "Flows",
};

export const GAUGE_ZONES: Record<GaugeKey, GaugeZones> = {
  // riskOff × 100; SPEC 4.3 state rule edges 0.25 / 0.5.
  risk: { zones: [{ to: 25, color: band(4), word: "low risk" }, { to: 50, color: band(3), word: "elevated" }, { to: 100, color: band(2), word: "high risk" }] },
  // Sign only.
  momentum: { zones: [{ to: 0, color: band(2), word: "bearish" }, { to: 100, color: band(4), word: "bullish" }] },
  // D4 band edges.
  fundamentals: { zones: [{ to: 40, color: band(2), word: "weak" }, { to: 60, color: band(3), word: "neutral" }, { to: 100, color: band(4), word: "strong" }] },
  // SPEC 4.7 #1 made flows the Capital Flows lens score (0–100), so the §14.4.2 sign zones
  // become D4 band edges like fundamentals. Fundamentals/flows words are replaced by the
  // matching lens band at render time (§14.9); these are only the fallback.
  flows: { zones: [{ to: 40, color: band(2), word: "outflow" }, { to: 60, color: band(3), word: "flat" }, { to: 100, color: band(4), word: "inflow" }] },
};

export function zoneFor(z: GaugeZones, v: number): GaugeZone {
  return z.zones.find((zone) => v <= zone.to) ?? z.zones[z.zones.length - 1]!;
}

/** D4 fixes compass bands at 20/40/60/80: score → band index 1..5. */
export function bandIndex(score: number): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, Math.floor(score / 20) + 1)) as 1 | 2 | 3 | 4 | 5;
}
export const bandColor = (score: number): string => band(bandIndex(score));

/** Lens input `asOf` older than the lens' freshest input by more than this is flagged (§14.4.4). */
export const INPUT_STALE_MS = 7 * DAY;
