// Inline SVG sparkline, no chart library — DESIGN.md 6.9.
import { fmtApr } from "../format";

const WIDTH = 200;
const MARKER_GUTTER = 16;
const GAP_MS = 7_200_000; // 2h — breaks the line rather than drawing a fake straight join

export function Sparkline({
  points,
  height = 48,
  zeroLine = false,
  markers = [],
  ariaLabel,
}: {
  points: [number, number][];
  height?: number;
  zeroLine?: boolean;
  markers?: { label: string; value: number }[];
  ariaLabel: string;
}) {
  const plotW = WIDTH - MARKER_GUTTER;

  if (points.length === 0) {
    return (
      <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={ariaLabel} />
    );
  }

  const t0 = points[0]![0];
  const t1 = points[points.length - 1]![0];
  const toX = (t: number): number => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * plotW);

  const values = points.map((p) => p[1]);
  const markerValues = markers.map((m) => m.value);
  const allValues = zeroLine ? [...values, ...markerValues, 0] : [...values, ...markerValues];
  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (max === min) {
    const pad = Math.abs(max) > 0 ? Math.abs(max) : 1;
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * 0.1;
    min -= pad;
    max += pad;
  }
  const toY = (v: number): number => height - ((v - min) / (max - min)) * height;

  // Break the path into segments wherever the gap between consecutive points exceeds GAP_MS.
  const segments: [number, number][][] = [];
  let current: [number, number][] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const [t] = points[i]!;
    const [prevT] = points[i - 1]!;
    if (t - prevT > GAP_MS) {
      segments.push(current);
      current = [];
    }
    current.push(points[i]!);
  }
  segments.push(current);

  const pathD = segments
    .filter((seg) => seg.length > 0)
    .map((seg) => seg.map(([t, v], i) => `${i === 0 ? "M" : "L"} ${toX(t).toFixed(2)} ${toY(v).toFixed(2)}`).join(" "))
    .join(" ");

  const last = points[points.length - 1]!;

  // Sort marker labels by value then nudge apart to a minimum 12px vertical gap so they don't overlap.
  const sortedMarkers = [...markers].sort((a, b) => a.value - b.value).map((m) => ({ ...m, y: toY(m.value) }));
  for (let i = 1; i < sortedMarkers.length; i++) {
    const prev = sortedMarkers[i - 1]!;
    const cur = sortedMarkers[i]!;
    if (cur.y - prev.y < 12) cur.y = prev.y + 12;
  }

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={ariaLabel}>
        {zeroLine && (
          <line
            x1={0}
            y1={toY(0)}
            x2={plotW}
            y2={toY(0)}
            stroke="var(--border-strong)"
            strokeWidth={1}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={pathD} fill="none" stroke="var(--ink-200)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <circle cx={toX(last[0])} cy={toY(last[1])} r={2.5} fill="var(--accent)" />
        {markers.map((m) => (
          <line
            key={m.label}
            x1={plotW}
            y1={toY(m.value)}
            x2={plotW + 6}
            y2={toY(m.value)}
            stroke="var(--ink-300)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {sortedMarkers.map((m) => (
        <span
          key={m.label}
          className="sparkline-marker-label"
          style={{ top: `${(m.y / height) * 100}%` }}
          title={`${m.label} predicted ${fmtApr(m.value)}`}
        >
          {m.label}
        </span>
      ))}
    </div>
  );
}
