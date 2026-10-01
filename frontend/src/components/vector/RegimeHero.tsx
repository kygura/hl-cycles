// Regime word, allocation, since, inputs as-of, D7 note, confirm/invalidate — DESIGN.md §14.4.1.
import type { HtfPhase, Vector } from "../../api";
import { daysBetween, fmtDate, fmtRaw } from "../../format";
import { PHASE_TOKEN, REGIME_TOKEN, REGIME_WORD } from "../../tokens";

// regime.htfNote is produced server-side (SPEC 4.7 #5); the UI only colours the phase word in it (§3.3).
const PHASE_WORD = /\b(ACCUMULATION|EXPANSION|EUPHORIA|DISTRIBUTION|MARKDOWN|CAPITULATION)\b/;

function HtfNote({ note }: { note: string }) {
  const m = PHASE_WORD.exec(note);
  if (!m) return <>{note}</>;
  const phase = m[1]!.toLowerCase() as HtfPhase;
  return (
    <>
      {note.slice(0, m.index)}
      <span className="mono" style={{ color: PHASE_TOKEN[phase] }}>
        {m[1]}
      </span>
      {note.slice(m.index + m[1]!.length)}
    </>
  );
}

export function RegimeHero({
  regime,
  asOf,
  oldestInputAsOf,
  stale,
  brief,
}: {
  regime: Vector["regime"];
  asOf: number | null;
  oldestInputAsOf: number | null;
  stale: boolean;
  brief: Vector["brief"];
}) {
  const color = regime.state ? REGIME_TOKEN[regime.state] : "var(--ink-300)";
  const alloc = regime.allocation;
  const active = regime.conditions.filter((c) => c.on).length;

  return (
    <div className="vx-hero" style={{ borderLeftColor: regime.state ? color : "var(--border)" }}>
      <div className="vx-hero-main">
        <div className="t-figure-xl" style={{ color }}>
          {regime.state ? REGIME_WORD[regime.state] : "—"}
        </div>
        {regime.state == null && <div className="t-body vx-muted">insufficient history</div>}
        <div className="vx-alloc">
          <span className="t-figure">{alloc == null ? "—" : `${Math.round(alloc)}% BTC`}</span>
          <span
            className="vx-alloc-track"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={alloc ?? undefined}
            aria-valuetext={alloc == null ? "allocation unavailable" : `${Math.round(alloc)}% BTC`}
          >
            {alloc != null && <span className="vx-alloc-fill" style={{ width: `${alloc}%`, background: color }} />}
          </span>
          {alloc != null && <span className="t-figure-sm vx-muted">· {Math.round(100 - alloc)}% cash</span>}
        </div>
      </div>
      <div className="vx-hero-meta">
        <div className="t-figure-sm" style={{ color: "var(--ink-200)" }}>
          {regime.since == null ? "since —" : `since ${fmtDate(regime.since)}${asOf == null ? "" : ` · day ${daysBetween(regime.since, asOf)}`}`}
        </div>
        <div className="t-figure-sm vx-muted vx-inputs-asof">
          inputs as of {fmtDate(oldestInputAsOf)}
          {stale && <span className="vx-pill vx-pill-warning">● stale · carrying forward</span>}
        </div>
        {regime.htfNote && (
          <div className="t-body" style={{ color: "var(--ink-200)" }}>
            <HtfNote note={regime.htfNote} />
          </div>
        )}
        <div className="vx-trigger">
          <span className="t-label vx-muted">Confirm</span>
          <span className="t-body">{brief.confirm ?? "—"}</span>
          <span className="t-label vx-muted">Invalidate</span>
          <span className="t-body">{brief.invalidate ?? "—"}</span>
        </div>
        <details className="vx-conditions">
          <summary className="t-label vx-muted">
            stress conditions ·{" "}
            <span style={{ color: active > 0 ? "var(--regime-strong-off)" : undefined }}>{active}</span> of{" "}
            {regime.conditions.length} active
          </summary>
          <table className="t-figure-sm">
            <tbody>
              {regime.conditions.map((c) => (
                <tr key={c.key}>
                  <td>
                    <span className={`vx-pill ${c.on ? "vx-pill-active" : "vx-pill-clear"}`}>{c.on ? "active" : "clear"}</span>
                  </td>
                  <td className="t-body">{c.label}</td>
                  <td className="num mono">{fmtRaw(c.value)}</td>
                  <td className="num vx-muted vx-cond-asof">{fmtDate(c.asOf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
