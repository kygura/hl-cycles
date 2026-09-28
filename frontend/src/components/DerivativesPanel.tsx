// Hyperliquid derivatives panel — DESIGN.md 6.8. Data is /api/derivatives (derivatives.json
// static), contract in SPEC.md 3b.3.
import { useState } from "react";
import type { Derivatives, Pt } from "../api";
import { fmtApr, fmtBp, fmtCompactUsd, fmtDate, fmtPercentSigned } from "../format";
import { Sparkline } from "./Sparkline";

type SparkWindow = "24h" | "7d";
const DAY_MS = 86_400_000;

function slice(points: Pt[], range: SparkWindow): Pt[] {
  if (range === "7d" || points.length === 0) return points;
  const lastT = points[points.length - 1]![0];
  return points.filter(([t]) => t >= lastT - DAY_MS);
}

function Cell({
  eyebrow,
  last,
  secondary,
  secondaryColor,
  points,
  zeroLine,
  markers,
  emptyText,
  ariaLabel,
}: {
  eyebrow: string;
  last: string;
  secondary: string;
  secondaryColor?: string;
  points: Pt[];
  zeroLine?: boolean;
  markers?: { label: string; value: number }[];
  emptyText: string;
  ariaLabel: string;
}) {
  return (
    <div>
      <div className="deriv-cell-eyebrow t-label">{eyebrow}</div>
      <div>
        <span className="deriv-cell-last">{last}</span>
        <span className="deriv-cell-secondary" style={secondaryColor ? { color: secondaryColor } : undefined}>
          {secondary}
        </span>
      </div>
      <div className="deriv-cell-sparkline">
        {points.length < 2 ? (
          <div className="deriv-cell-collecting">{emptyText}</div>
        ) : (
          <Sparkline points={points} zeroLine={zeroLine} markers={markers} ariaLabel={ariaLabel} />
        )}
      </div>
    </div>
  );
}

export function DerivativesPanel({ data, error, onRetry }: { data: Derivatives | null; error: boolean; onRetry: () => void }) {
  const [range, setRange] = useState<SparkWindow>("7d");

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
            {(["24h", "7d"] as const).map((w) => (
              <button key={w} role="tab" aria-selected={range === w} onClick={() => setRange(w)}>
                {w}
              </button>
            ))}
          </span>
        </span>
      </div>
      <div className="region-body">
        {error ? (
          <div className="region-error">
            failed to load — retry
            <button onClick={onRetry}>retry</button>
          </div>
        ) : data == null ? (
          <div className="region-loading" style={{ height: 100 }} />
        ) : (
          <div className="deriv-grid">
            <Cell
              eyebrow="mark vs oracle"
              last={fmtBp(data.premium.last)}
              secondary="premium"
              points={slice(data.premium.points, range)}
              zeroLine
              emptyText="collecting"
              ariaLabel="Premium sparkline"
            />
            <Cell
              eyebrow="funding apr"
              last={fmtApr(data.fundingApr.last)}
              secondary="HL hourly, annualized"
              points={slice(data.fundingApr.points, range)}
              zeroLine
              markers={data.fundingApr.predicted.map((p) => ({ label: p.short, value: p.apr }))}
              emptyText="no funding data"
              ariaLabel="Funding APR sparkline"
            />
            <Cell
              eyebrow="open interest"
              last={fmtCompactUsd(data.oiUsd.last)}
              secondary={data.oiUsd.change24h == null ? "—" : `${fmtPercentSigned(data.oiUsd.change24h)} 24h`}
              secondaryColor={
                data.oiUsd.change24h == null
                  ? undefined
                  : data.oiUsd.change24h > 0
                  ? "var(--positive)"
                  : data.oiUsd.change24h < 0
                  ? "var(--negative)"
                  : "var(--flat)"
              }
              points={slice(data.oiUsd.points, range)}
              emptyText="collecting"
              ariaLabel="Open interest sparkline"
            />
            <Cell
              eyebrow="volume 24h"
              last={fmtCompactUsd(data.volume24h.last)}
              secondary="notional"
              points={slice(data.volume24h.points, range)}
              emptyText="collecting"
              ariaLabel="Volume 24h sparkline"
            />
          </div>
        )}
      </div>
    </section>
  );
}
