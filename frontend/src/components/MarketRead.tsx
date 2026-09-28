// Replaces PhaseReadout.tsx — DESIGN.md 6.2. All words and the sentence come from the API
// (overview.composite.*, docs/MODEL.md 3.2-3.3); this component computes only pixel positions.
import type { Overview } from "../api";
import { fmtScore, fmtDate, fmtPercent, fmtRawOrDash } from "../format";
import { PHASE_TOKEN } from "../tokens";

// Matches backend/src/model/composite.ts biasLabel()'s thresholds exactly.
const BIAS_LABEL_THRESHOLDS = [-0.5, -0.15, 0.15, 0.5];

// trend/heat/leverage/momentum (composite.ts Component.score) are all clamp()/tanh-blended into
// [-1, 1] (docs/MODEL.md 0/3.3), not [-2, 2] -- a score at the edge of its range should fill the
// "why" bar all the way, not to 50%.
const COMPONENT_SCORE_MAX = 1;

function toGaugePct(score: number | null): number {
  if (score == null) return 0;
  return (Math.abs(score) / COMPONENT_SCORE_MAX) * 100;
}

function WhyCell({ label, score, word }: { label: string; score: number | null; word: string | null }) {
  const pct = toGaugePct(score);
  const fromCenter = score != null && score < 0;
  return (
    <div>
      <div className="mr-why-eyebrow t-label">{label}</div>
      <div className="mr-why-track">
        <span className="center-tick" />
        <span
          className="fill"
          style={
            fromCenter
              ? { right: "50%", width: `${pct}%` }
              : { left: "50%", width: `${pct}%` }
          }
        />
      </div>
      <div className="mr-why-value">
        {word ?? "—"} {fmtScore(score)}
      </div>
    </div>
  );
}

export function MarketRead({ overview, stale }: { overview: Overview; stale: boolean }) {
  const { htf, ltf, composite } = overview;
  const phaseColor = htf.phase ? PHASE_TOKEN[htf.phase] : "var(--ink-300)";
  const cycle = htf.cycle;
  const cycleProgressPct = cycle.cycleProgress == null ? 0 : cycle.cycleProgress * 100;

  const bias = composite.bias;
  const markerLeft = bias == null ? null : ((Math.max(-1, Math.min(1, bias)) + 1) / 2) * 100;

  return (
    <div className={stale ? "market-read-top-warn" : ""}>
      <div className="market-read-headline">
        <div className="market-read-bias">
          <span className="bias-number t-figure-lg">{fmtScore(composite.bias)}</span>
          <span className="bias-label t-body">{composite.label ?? "unavailable"}</span>
        </div>
        <div className="market-read-phase" style={{ color: phaseColor }}>
          {htf.phase ? htf.phase.toUpperCase() : "—"}
          <span className="swatch" style={{ background: phaseColor }} />
        </div>
      </div>

      <div
        className="mr-gauge"
        role="meter"
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={bias ?? undefined}
        aria-valuetext={`${composite.label ?? "unavailable"} ${fmtScore(bias)}`}
      >
        <div className="mr-gauge-track">
          <span className="mr-gauge-tick zero" style={{ left: "50%" }} />
          {BIAS_LABEL_THRESHOLDS.map((t) => (
            <span key={t} className="mr-gauge-tick" style={{ left: `${((t + 1) / 2) * 100}%` }} />
          ))}
          {markerLeft != null && <span className="mr-gauge-marker" style={{ left: `${markerLeft}%` }} />}
        </div>
        <div className="mr-gauge-captions">
          <span>−1</span>
          <span>0</span>
          <span>+1</span>
        </div>
      </div>

      <div className="market-read-sentence t-body" title={composite.summary}>
        {composite.sentence}
      </div>

      <div className="market-read-why">
        {composite.components.map((c) => (
          <WhyCell key={c.key} label={c.key} score={c.score} word={c.word} />
        ))}
      </div>

      <div className="market-read-cycle">
        {cycle.daysSinceHalving != null
          ? `cycle  day ${cycle.daysSinceHalving} since ${fmtDate(cycle.lastHalving)} · ${fmtPercent(cycle.cycleProgress)} of cycle`
          : "cycle —"}
        {cycle.nextHalvingEstimate != null && <span> · next ~{fmtDate(cycle.nextHalvingEstimate)}</span>}
        <div className="bar">
          <span className="fill" style={{ width: `${cycleProgressPct}%` }} />
          {[25, 50, 75, 100].map((p) => (
            <span key={p} className="tick" style={{ left: `${p}%` }} />
          ))}
        </div>
      </div>

      <details className="market-read-features">
        <summary>▸ features ({Object.keys(htf.features).length + Object.keys(ltf.features).length})</summary>
        <table>
          <tbody>
            {Object.entries(htf.features).map(([k, v]) => (
              <tr key={`h-${k}`}>
                <td className="k">{k}</td>
                <td className="v">{fmtRawOrDash(v)}</td>
              </tr>
            ))}
            {Object.entries(ltf.features).map(([k, v]) => (
              <tr key={`l-${k}`}>
                <td className="k">{k}</td>
                <td className="v">{fmtRawOrDash(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
