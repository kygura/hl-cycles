// Shared HTF phase / LTF state colour tokens — DESIGN.md §3. Single source of
// truth for theme.css var names; every component/chart imports from here
// instead of re-declaring its own copy.
import type { HtfPhase, LtfState, RegimeState } from "./api";

/** Raw CSS custom-property names (no `var()` wrapper) — for resolving to a
 * computed hex value at runtime, e.g. `css(PHASE_VAR[phase])`. */
export const PHASE_VAR: Record<HtfPhase, string> = {
  accumulation: "--ph-accumulation",
  expansion: "--ph-expansion",
  euphoria: "--ph-euphoria",
  distribution: "--ph-distribution",
  markdown: "--ph-markdown",
  capitulation: "--ph-capitulation",
};

export const STATE_VAR: Record<LtfState, string> = {
  crowded_long: "--st-crowded-long",
  healthy_uptrend: "--st-healthy-uptrend",
  short_squeeze_fuel: "--st-squeeze",
  crowded_short: "--st-crowded-short",
  deleveraging: "--st-deleveraging",
  downtrend: "--st-downtrend",
  neutral: "--st-neutral",
  insufficient_data: "--st-nodata",
};

/** `var(--ph-*)` / `var(--st-*)` strings — for direct use in inline styles. */
export const PHASE_TOKEN: Record<HtfPhase, string> = Object.fromEntries(
  (Object.keys(PHASE_VAR) as HtfPhase[]).map((k) => [k, `var(${PHASE_VAR[k]})`])
) as Record<HtfPhase, string>;

export const STATE_TOKEN: Record<LtfState, string> = Object.fromEntries(
  (Object.keys(STATE_VAR) as LtfState[]).map((k) => [k, `var(${STATE_VAR[k]})`])
) as Record<LtfState, string>;

// ---- Phase 4 Vector (DESIGN.md §14.3) ----

export const REGIME_VAR: Record<RegimeState, string> = {
  strong_risk_off: "--regime-strong-off",
  mild_risk_off: "--regime-mild-off",
  mild_risk_on: "--regime-mild-on",
  strong_risk_on: "--regime-strong-on",
};

export const REGIME_TOKEN: Record<RegimeState, string> = Object.fromEntries(
  (Object.keys(REGIME_VAR) as RegimeState[]).map((k) => [k, `var(${REGIME_VAR[k]})`])
) as Record<RegimeState, string>;

export const REGIME_WORD: Record<RegimeState, string> = {
  strong_risk_off: "STRONG RISK-OFF",
  mild_risk_off: "MILD RISK-OFF",
  mild_risk_on: "MILD RISK-ON",
  strong_risk_on: "STRONG RISK-ON",
};

/** Lowest -> highest compass band (§14.3.2), raw property names like PHASE_VAR. */
export const BAND_VAR = ["--band-1", "--band-2", "--band-3", "--band-4", "--band-5"] as const;

/** `#rrggbb` → `rgba(r,g,b,a)`; canvas charts need resolved colours, not `var()`. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Resolve a CSS custom property (e.g. `--ink-300`) to its computed value. */
export function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
