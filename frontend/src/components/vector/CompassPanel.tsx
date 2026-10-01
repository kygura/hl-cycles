// Compass headline + seven lens tiles — DESIGN.md §14.4.4.
import type { Lens, LensInput, Vector } from "../../api";
import { DAY, fmtDate, fmtDeltaPts, fmtInt, fmtRaw } from "../../format";
import { Sparkline } from "../Sparkline";
import { bandColor, bandIndex, INPUT_STALE_MS } from "./scales";

export const TITLE = "Market compass · 7 lenses · 4y percentile";

function fmtInput(i: LensInput): string {
  const v = fmtRaw(i.value);
  if (i.value == null) return v;
  if (i.unit === "pct") return v + "%";
  if (i.unit === "usd") return "$" + v;
  if (i.unit === "btc") return v + " BTC";
  return v;
}

function Track({ score, color }: { score: number | null; color: string }) {
  const filled = score == null ? 0 : bandIndex(score);
  return (
    <span className="vx-track" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ background: i <= filled ? color : "var(--surface-300)" }} />
      ))}
    </span>
  );
}

function LensTile({ lens }: { lens: Lens }) {
  const has = lens.score != null;
  const color = !has ? "var(--ink-300)" : lens.standalone ? "var(--ink-100)" : bandColor(lens.score!);
  const trackColor = lens.standalone ? "var(--ink-300)" : color;
  const freshest = Math.max(...lens.inputs.map((i) => i.asOf ?? -Infinity));
  return (
    <details className="vx-tile">
      <summary>
        <span className="vx-tile-row">
          <span className="t-body vx-tile-name">{lens.label}</span>
          <span className="t-figure" style={{ color }}>
            {has ? fmtInt(lens.score) : "—"}
          </span>
          <span className="t-figure-sm" style={{ color: has ? "var(--ink-200)" : "var(--ink-300)" }}>
            {has ? lens.band ?? "—" : "insufficient history"}
          </span>
          <span className="t-figure-sm vx-muted">
            7d {fmtDeltaPts(lens.d7)} · 30d {fmtDeltaPts(lens.d30)}
          </span>
          <span className="vx-tile-caret" aria-hidden="true" />
        </span>
        <Track score={lens.score} color={trackColor} />
      </summary>
      <table className="vx-table t-figure-sm">
        <thead>
          <tr>
            <th>input</th>
            <th className="num">value</th>
            <th className="num">pct</th>
            <th className="num">as of</th>
          </tr>
        </thead>
        <tbody>
          {lens.inputs.map((i) => (
            <tr key={i.key}>
              <td>{i.label}</td>
              <td className="num">{fmtInput(i)}</td>
              <td className="num">{i.pct == null ? "—" : `p${Math.round(i.pct)}`}</td>
              <td className="num" style={i.asOf != null && freshest - i.asOf > INPUT_STALE_MS ? { color: "var(--warning)" } : undefined}>
                {fmtDate(i.asOf)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function CompassPanel({ compass }: { compass: Vector["compass"] }) {
  const { headline } = compass;
  const spark: [number, number][] = compass.history
    .slice(-365)
    .filter((h) => h.headline != null)
    .map((h) => [h.t, h.headline as number]);
  const forward = compass.lenses.filter((l) => !l.standalone);
  const standalone = compass.lenses.filter((l) => l.standalone);

  return (
    <section className="region vx-compass">
      <div className="region-header">
        <span>{TITLE}</span>
      </div>
      <div className="region-body vx-compass-body">
        <div className="vx-headline">
          <div className="t-label vx-muted">Compass · headline</div>
          <div className="vx-headline-row">
            <span className="t-figure-lg" style={{ color: headline.score == null ? "var(--ink-300)" : bandColor(headline.score) }}>
              {headline.score == null ? "—" : fmtInt(headline.score)}
            </span>
            <span className="t-body">{headline.score == null ? "insufficient history" : headline.band ?? "—"}</span>
            <span className="t-figure-sm vx-muted vx-push">
              7d {fmtDeltaPts(headline.d7)} · 30d {fmtDeltaPts(headline.d30)}
            </span>
          </div>
          {spark.length < 2 ? (
            <div className="t-figure-sm vx-muted vx-spark-empty">collecting — no history yet</div>
          ) : (
            <Sparkline points={spark} height={32} maxGapMs={2 * DAY} ariaLabel="Compass headline, last 365 days" />
          )}
        </div>
        <div className="vx-tiles">
          <div className="vx-tiles-forward">
            {forward.map((l) => (
              <LensTile key={l.key} lens={l} />
            ))}
          </div>
          <div className="vx-standalone-rule t-label vx-muted">Standalone · not in headline</div>
          <div className="vx-tiles-standalone">
            {standalone.map((l) => (
              <LensTile key={l.key} lens={l} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
