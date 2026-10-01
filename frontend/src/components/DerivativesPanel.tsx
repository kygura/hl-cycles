// Hyperliquid derivatives panel — DESIGN.md 6.8. Data is /api/derivatives (derivatives.json
// static), contract in SPEC.md 3b.3. One row per metric: value, 24h delta, 30d percentile,
// sparkline over the selected window. Funding and OI are backfilled hourly series; premium and
// volume are snapshot-only, so they show a number and only get a sparkline once snapshots
// cover >= 80% of the window.
import { useState } from "react";
import type { Derivatives, Pt } from "../api";
import { DAY, fmtApr, fmtBp, fmtCompactUsd, fmtDate, fmtPercentSigned } from "../format";
import { Sparkline } from "./Sparkline";

type Win = "7d" | "30d" | "90d";
const WINS: readonly Win[] = ["7d", "30d", "90d"];
const HOUR_MS = 3_600_000;
const WIN_MS: Record<Win, number> = { "7d": 7 * DAY, "30d": 30 * DAY, "90d": 90 * DAY };
const MIN_COVERAGE = 0.8;

const since = (points: Pt[], now: number, ms: number): Pt[] => points.filter(([t]) => t > now - ms);

/** Share of hourly buckets in the window that have at least one point. */
function coverage(points: Pt[], windowMs: number): number {
  return new Set(points.map(([t]) => Math.floor(t / HOUR_MS))).size / (windowMs / HOUR_MS);
}

/** Value ~24h before the last point (1h tolerance), or null. */
function valueDayAgo(points: Pt[]): number | null {
  if (!points.length) return null;
  const tLast = points[points.length - 1]![0];
  const then = points.filter(([t]) => t >= tLast - DAY - HOUR_MS && t <= tLast - DAY).pop();
  return then ? then[1] : null;
}

/** Percentile rank of the last value within the trailing 30d, as "p42", when coverage allows. */
function pct30d(points: Pt[], now: number): string {
  const win = since(points, now, 30 * DAY);
  if (win.length < 2 || coverage(win, 30 * DAY) < MIN_COVERAGE) return "—";
  const last = win[win.length - 1]![1];
  return `p${Math.round((win.filter(([, v]) => v <= last).length / win.length) * 100)}`;
}

function Row({
  label,
  value,
  delta,
  deltaSign,
  pct,
  points,
  windowMs,
  zeroLine,
  markers,
  ariaLabel,
}: {
  label: string;
  value: string;
  delta: string;
  deltaSign: number | null;
  pct: string;
  points: Pt[];
  windowMs: number;
  zeroLine?: boolean;
  markers?: { label: string; value: number }[];
  ariaLabel: string;
}) {
  const drawable = points.length >= 2 && coverage(points, windowMs) >= MIN_COVERAGE;
  const deltaColor = deltaSign == null ? undefined : deltaSign > 0 ? "var(--positive)" : deltaSign < 0 ? "var(--negative)" : "var(--flat)";
  return (
    <tr>
      <td className="t-label">{label}</td>
      <td className="num deriv-value">{value}</td>
      <td className="num" style={{ color: deltaColor }}>{delta}</td>
      <td className="num">{pct}</td>
      <td className="deriv-spark">
        {drawable ? (
          <Sparkline points={points} height={22} zeroLine={zeroLine} markers={markers} ariaLabel={ariaLabel} />
        ) : (
          <span title="n/a">–</span>
        )}
      </td>
    </tr>
  );
}

export function DerivativesPanel({ data, error, onRetry }: { data: Derivatives | null; error: boolean; onRetry: () => void }) {
  const [win, setWin] = useState<Win>("30d");
  const windowMs = WIN_MS[win];
  const now = data?.now ?? Date.now();
  const w = (points: Pt[]) => since(points, now, windowMs);
  const absDelta = (points: Pt[], fmt: (x: number | null) => string) => {
    const then = valueDayAgo(points);
    const last = points.length ? points[points.length - 1]![1] : null;
    if (then == null || last == null) return { text: "—", sign: null };
    return { text: fmt(last - then), sign: Math.sign(last - then) };
  };

  return (
    <section className="region">
      <div className="region-header">
        <span>Hyperliquid derivatives · BTC-PERP</span>
        <span className="deriv-header-right">
          {data?.collecting && (
            <span className="deriv-pill">
              {data.firstSnapshot != null ? `collecting since ${fmtDate(data.firstSnapshot)}` : "collecting — no snapshot yet"}
            </span>
          )}
          <span className="segmented" role="tablist">
            {WINS.map((x) => (
              <button key={x} role="tab" aria-selected={win === x} onClick={() => setWin(x)}>
                {x}
              </button>
            ))}
          </span>
        </span>
      </div>
      <div className="region-body deriv-body" style={{ padding: 0 }}>
        {error ? (
          <div className="region-error">
            failed to load — retry
            <button onClick={onRetry}>retry</button>
          </div>
        ) : data == null ? (
          <div className="region-loading" style={{ height: 100 }} />
        ) : (
          <table className="deriv-table">
            <thead>
              <tr>
                <th>metric</th>
                <th className="num">now</th>
                <th className="num">24h</th>
                <th className="num">30d pct</th>
                <th>{win}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const d = absDelta(data.premium.points, fmtBp);
                return (
                  <Row label="mark vs oracle" value={fmtBp(data.premium.last)} delta={d.text} deltaSign={d.sign}
                    pct={pct30d(data.premium.points, now)} points={w(data.premium.points)} windowMs={windowMs} zeroLine ariaLabel="Premium sparkline" />
                );
              })()}
              {(() => {
                const d = absDelta(data.fundingApr.points, fmtApr);
                return (
                  <Row label="funding apr" value={fmtApr(data.fundingApr.last)} delta={d.text} deltaSign={d.sign}
                    pct={pct30d(data.fundingApr.points, now)} points={w(data.fundingApr.points)} windowMs={windowMs} zeroLine
                    markers={data.fundingApr.predicted.map((p) => ({ label: p.short, value: p.apr }))} ariaLabel="Funding APR sparkline" />
                );
              })()}
              <Row label={data.oiUsd.src === "binance" ? "open interest · binance proxy" : "open interest"} value={fmtCompactUsd(data.oiUsd.last)}
                delta={data.oiUsd.change24h == null ? "—" : fmtPercentSigned(data.oiUsd.change24h)}
                deltaSign={data.oiUsd.change24h == null ? null : Math.sign(data.oiUsd.change24h)}
                pct={pct30d(data.oiUsd.points, now)} points={w(data.oiUsd.points)} windowMs={windowMs} ariaLabel="Open interest sparkline" />
              {(() => {
                const then = valueDayAgo(data.volume24h.points);
                const last = data.volume24h.last;
                const r = then != null && then > 0 && last != null ? last / then - 1 : null;
                return (
                  <Row label="volume 24h" value={fmtCompactUsd(last)} delta={r == null ? "—" : fmtPercentSigned(r)} deltaSign={r == null ? null : Math.sign(r)}
                    pct={pct30d(data.volume24h.points, now)} points={w(data.volume24h.points)} windowMs={windowMs} ariaLabel="Volume 24h sparkline" />
                );
              })()}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
