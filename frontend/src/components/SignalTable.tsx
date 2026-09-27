import type { HtfPhase, LtfState, Signal } from "../api";
import { fmtDate, fmtTimestamp, fmtPrice, fmtScore } from "../format";

const PHASE_TOKEN: Record<HtfPhase, string> = {
  accumulation: "var(--ph-accumulation)",
  expansion: "var(--ph-expansion)",
  euphoria: "var(--ph-euphoria)",
  distribution: "var(--ph-distribution)",
  markdown: "var(--ph-markdown)",
  capitulation: "var(--ph-capitulation)",
};
const STATE_TOKEN: Record<LtfState, string> = {
  crowded_long: "var(--st-crowded-long)",
  healthy_uptrend: "var(--st-healthy-uptrend)",
  short_squeeze_fuel: "var(--st-squeeze)",
  crowded_short: "var(--st-crowded-short)",
  deleveraging: "var(--st-deleveraging)",
  downtrend: "var(--st-downtrend)",
  neutral: "var(--st-neutral)",
  insufficient_data: "var(--st-nodata)",
};

function tokenFor(frame: "HTF" | "LTF", label: string | null): string {
  if (label == null) return "var(--text-3)";
  return frame === "HTF" ? PHASE_TOKEN[label as HtfPhase] : STATE_TOKEN[label as LtfState];
}

function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color, width: 8, height: 8 }} />;
}

export function SignalTable({
  signals,
  filter,
  onFilterChange,
}: {
  signals: Signal[];
  filter: "ALL" | "HTF" | "LTF";
  onFilterChange: (f: "ALL" | "HTF" | "LTF") => void;
}) {
  const filtered = (filter === "ALL" ? signals : signals.filter((s) => s.frame === filter)).slice(0, 200);

  return (
    <section className="region">
      <div className="region-header">
        <span>SignalTable</span>
        <span className="segmented" role="tablist">
          {(["ALL", "HTF", "LTF"] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => onFilterChange(f)}>
              {f}
            </button>
          ))}
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="region-empty">no signals yet — labels are recorded when they change</div>
      ) : (
        <div className="signal-table-body">
          <table className="signal-table">
            <thead>
              <tr>
                <th>time</th>
                <th>frame</th>
                <th>from &#8594; to</th>
                <th className="num">price</th>
                <th className="num col-scores">scores</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const fromColor = tokenFor(s.frame, s.from);
                const toColor = tokenFor(s.frame, s.to);
                const timeStr = s.frame === "HTF" ? fmtDate(s.t) : fmtTimestamp(s.t);
                const scoresStr =
                  s.frame === "HTF"
                    ? `tr ${fmtScore(s.trend)}  ht ${fmtScore(s.heat)}`
                    : `lev ${fmtScore(s.leverage)}  mom ${fmtScore(s.momentum)}`;
                return (
                  <tr key={`${s.frame}-${s.t}`}>
                    <td>{timeStr}</td>
                    <td>{s.frame}</td>
                    <td>
                      {s.from != null && <Swatch color={fromColor} />} {s.from ?? "—"} &#8594; <Swatch color={toColor} /> {s.to}
                    </td>
                    <td className="num">{fmtPrice(s.price)}</td>
                    <td className="num col-scores">{scoresStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
