import type { Overview } from "../api";
import { fmtScore, fmtDate, fmtPercent, fmtRawOrDash, fmtApr } from "../format";

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const pct = value == null ? 50 : ((value + 1) / 2) * 100;
  return (
    <div className="score-row">
      <span className="label">{label}</span>
      <span className="value mono">{fmtScore(value)}</span>
      <span className="score-track">
        <span className="tick0" />
        <span className="marker" style={{ left: `${pct}%` }} />
      </span>
    </div>
  );
}

const PHASE_TOKEN: Record<string, string> = {
  accumulation: "var(--ph-accumulation)",
  expansion: "var(--ph-expansion)",
  euphoria: "var(--ph-euphoria)",
  distribution: "var(--ph-distribution)",
  markdown: "var(--ph-markdown)",
  capitulation: "var(--ph-capitulation)",
};

const STATE_TOKEN: Record<string, string> = {
  crowded_long: "var(--st-crowded-long)",
  healthy_uptrend: "var(--st-healthy-uptrend)",
  short_squeeze_fuel: "var(--st-squeeze)",
  crowded_short: "var(--st-crowded-short)",
  deleveraging: "var(--st-deleveraging)",
  downtrend: "var(--st-downtrend)",
  neutral: "var(--st-neutral)",
  insufficient_data: "var(--st-nodata)",
};

export function PhaseReadout({ overview }: { overview: Overview }) {
  const { htf, ltf, composite, crossVenueFunding } = overview;
  const phaseColor = htf.phase ? PHASE_TOKEN[htf.phase] : "var(--text-3)";
  const stateColor = ltf.state ? STATE_TOKEN[ltf.state] : "var(--st-nodata)";
  const cycle = htf.cycle;
  const progressPct = cycle.cycleProgress == null ? 0 : cycle.cycleProgress * 100;

  // HL first if present (DESIGN.md 6.2), others in API order.
  const orderedFunding = [...crossVenueFunding].sort((a, b) => {
    const aHl = /hl/i.test(a.venue) ? 0 : 1;
    const bHl = /hl/i.test(b.venue) ? 0 : 1;
    return aHl - bHl;
  });
  const fundingLine =
    orderedFunding.length === 0
      ? "funding —"
      : "funding  " + orderedFunding.map((f) => `${f.venue} ${fmtApr(f.apr)}`).join("  ");

  return (
    <div className="readout-cols">
      <div>
        <div className="readout-col-title">HTF</div>
        <div className="readout-phase-word" style={{ color: phaseColor }}>
          <span className="swatch" style={{ background: phaseColor }} />
          {htf.phase ? htf.phase.toUpperCase() : "—"}
        </div>
        <ScoreBar label="trend" value={htf.trend} />
        <ScoreBar label="heat" value={htf.heat} />
      </div>
      <div>
        <div className="readout-col-title">LTF</div>
        <div className={`readout-state-badge ${ltf.state === "insufficient_data" ? "nodata" : ""}`} style={{ color: stateColor, borderColor: stateColor }}>
          <span className="swatch" style={{ background: stateColor }} />
          {ltf.state ?? "—"}
        </div>
        <ScoreBar label="leverage" value={ltf.leverage} />
        <ScoreBar label="momentum" value={ltf.momentum} />
      </div>

      <div style={{ gridColumn: "1 / -1" }}>
        <div className="readout-bias-row">
          <span className="readout-bias-number mono">{fmtScore(composite.bias)}</span>
          <span className="readout-summary" title={composite.summary}>
            {composite.summary}
          </span>
        </div>

        <div className="readout-cycle">
          {cycle.daysSinceHalving != null
            ? `cycle  day ${cycle.daysSinceHalving} since ${fmtDate(cycle.lastHalving)} · ${fmtPercent(cycle.cycleProgress)} of cycle`
            : "cycle —"}
          {cycle.nextHalvingEstimate != null && <span> · next ~{fmtDate(cycle.nextHalvingEstimate)}</span>}
          <div className="bar">
            <span className="fill" style={{ width: `${progressPct}%` }} />
            {[25, 50, 75, 100].map((p) => (
              <span key={p} className="tick" style={{ left: `${p}%` }} />
            ))}
          </div>
        </div>

        <div className="readout-funding mono">{fundingLine}</div>

        <details className="readout-features">
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
    </div>
  );
}
