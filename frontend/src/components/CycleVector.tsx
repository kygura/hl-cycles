import { useState } from "react";
import type { HtfPhase } from "../api";
import { fmtDate, fmtScore } from "../format";
import { PHASE_TOKEN } from "../tokens";

export type VectorPoint = { t: number; trend: number; heat: number; phase: HtfPhase };

const PAD = 24;
const SIZE = 320;
const PLOT = SIZE - 2 * PAD;

function toX(trend: number): number {
  return PAD + ((trend + 1) / 2) * PLOT;
}
function toY(heat: number): number {
  return PAD + ((1 - heat) / 2) * PLOT;
}

export function CycleVector({
  points,
  current,
}: {
  points: VectorPoint[];
  current: { trend: number | null; heat: number | null; phase: HtfPhase | null };
}) {
  const [hover, setHover] = useState<VectorPoint | null>(null);

  const hasPath = points.length >= 2;
  const currentColor = current.phase ? PHASE_TOKEN[current.phase] : "var(--ink-300)";

  return (
    <div>
      <div className="vector-svg-wrap" style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" aria-label="Cycle vector: trend vs heat, last 90 days">
          {/* quadrant fills */}
          <rect x={PAD + PLOT / 2} y={PAD} width={PLOT / 2} height={PLOT / 2} fill="var(--ph-euphoria)" opacity={0.08} />
          <rect x={PAD} y={PAD} width={PLOT / 2} height={PLOT / 2} fill="var(--ph-distribution)" opacity={0.08} />
          <rect x={PAD} y={PAD + PLOT / 2} width={PLOT / 2} height={PLOT / 2} fill="var(--ph-capitulation)" opacity={0.08} />
          <rect x={PAD + PLOT / 2} y={PAD + PLOT / 2} width={PLOT / 2} height={PLOT / 2} fill="var(--ph-accumulation)" opacity={0.08} />

          {/* quadrant labels */}
          <text x={SIZE - PAD - 4} y={PAD + 12} textAnchor="end" fontSize="11" fill="var(--ink-300)">
            EUPHORIA
          </text>
          <text x={PAD + 4} y={PAD + 12} fontSize="11" fill="var(--ink-300)">
            DISTRIBUTION
          </text>
          <text x={PAD + 4} y={SIZE - PAD - 4} fontSize="11" fill="var(--ink-300)">
            CAPITULATION
          </text>
          <text x={SIZE - PAD - 4} y={SIZE - PAD - 4} textAnchor="end" fontSize="11" fill="var(--ink-300)">
            ACCUMULATION
          </text>

          {/* axes */}
          <line x1={PAD} y1={toY(0)} x2={SIZE - PAD} y2={toY(0)} stroke="var(--border-strong)" strokeWidth={1} />
          <line x1={toX(0)} y1={PAD} x2={toX(0)} y2={SIZE - PAD} stroke="var(--border-strong)" strokeWidth={1} />
          <line x1={toX(-0.5)} y1={toY(0) - 4} x2={toX(-0.5)} y2={toY(0) + 4} stroke="var(--border-strong)" strokeWidth={1} />
          <line x1={toX(0.5)} y1={toY(0) - 4} x2={toX(0.5)} y2={toY(0) + 4} stroke="var(--border-strong)" strokeWidth={1} />
          <line x1={toX(0) - 4} y1={toY(-0.5)} x2={toX(0) + 4} y2={toY(-0.5)} stroke="var(--border-strong)" strokeWidth={1} />
          <line x1={toX(0) - 4} y1={toY(0.5)} x2={toX(0) + 4} y2={toY(0.5)} stroke="var(--border-strong)" strokeWidth={1} />
          <text x={SIZE - PAD} y={SIZE - PAD + 14} textAnchor="end" fontSize="11" fill="var(--ink-200)">
            trend &#8594;
          </text>
          <text x={PAD} y={PAD - 8} fontSize="11" fill="var(--ink-200)">
            heat &#8593;
          </text>

          {hasPath ? (
            <>
              {points.slice(1).map((p, idx) => {
                const prev = points[idx];
                const opacity = 0.15 + (0.85 * idx) / Math.max(1, points.length - 2);
                return (
                  <line
                    key={p.t}
                    x1={toX(prev.trend)}
                    y1={toY(prev.heat)}
                    x2={toX(p.trend)}
                    y2={toY(p.heat)}
                    stroke="var(--ink-200)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    opacity={opacity}
                  />
                );
              })}
              {points.map((p, idx) =>
                idx % 30 === 0 ? (
                  <circle key={`m-${p.t}`} cx={toX(p.trend)} cy={toY(p.heat)} r={3} fill="none" stroke="var(--ink-200)" strokeWidth={1} />
                ) : null
              )}
              {points.map((p) => (
                <circle
                  key={`hit-${p.t}`}
                  cx={toX(p.trend)}
                  cy={toY(p.heat)}
                  r={6}
                  fill="transparent"
                  onMouseEnter={() => setHover(p)}
                  onMouseLeave={() => setHover((h) => (h?.t === p.t ? null : h))}
                />
              ))}
            </>
          ) : (
            <text x={SIZE / 2} y={SIZE / 2} textAnchor="middle" fontSize="12" fill="var(--ink-300)">
              not enough HTF history
            </text>
          )}

          {current.trend != null && current.heat != null && (
            <>
              <circle cx={toX(current.trend)} cy={toY(current.heat)} r={9} fill="none" stroke="var(--surface-100)" strokeWidth={2} />
              <circle cx={toX(current.trend)} cy={toY(current.heat)} r={7} fill={currentColor} stroke="var(--ink-100)" strokeWidth={1} />
            </>
          )}
        </svg>
        {current.trend != null && current.heat != null && (
          <div
            className="mono"
            style={{
              position: "absolute",
              left: `${(toX(current.trend) / SIZE) * 100}%`,
              top: `${(toY(current.heat) / SIZE) * 100}%`,
              // Flip the label to the left near the right edge so it is not clipped.
              transform: current.trend > 0.4 ? "translate(calc(-100% - 10px), -8px)" : "translate(10px, -8px)",
              fontSize: "12px",
              color: "var(--ink-100)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {fmtScore(current.trend)}, {fmtScore(current.heat)}
          </div>
        )}
        {hover && (
          <div
            className="vector-tooltip"
            style={{ left: `${(toX(hover.trend) / SIZE) * 100}%`, top: `${(toY(hover.heat) / SIZE) * 100}%`, transform: "translate(10px, 10px)" }}
          >
            {fmtDate(hover.t)} · {hover.phase.toUpperCase()} · trend {fmtScore(hover.trend)} · heat {fmtScore(hover.heat)}
          </div>
        )}
      </div>
      <div className="vector-legend">expansion / markdown = moving right / left across the axis</div>
    </div>
  );
}
