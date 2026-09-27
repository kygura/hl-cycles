// Shared HTF phase / LTF state colour tokens — DESIGN.md §3. Single source of
// truth for theme.css var names; every component/chart imports from here
// instead of re-declaring its own copy.
import type { HtfPhase, LtfState } from "./api";

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
