// Speedometer gauge, plain SVG — DESIGN.md §14.4.2.
import type { GaugeReading } from "../../api";
import { zoneFor, type GaugeZones } from "./scales";

const CX = 80;
const CY = 84;
const R = 62;

function point(theta: number, r: number): [number, number] {
  return [CX + r * Math.cos(theta), CY - r * Math.sin(theta)];
}
function arc(a0: number, a1: number): string {
  const [x0, y0] = point(a0, R);
  const [x1, y1] = point(a1, R);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function radial(theta: number, r0: number, r1: number) {
  const [x0, y0] = point(theta, r0);
  const [x1, y1] = point(theta, r1);
  return { x1: x0, y1: y0, x2: x1, y2: y1 };
}

export function Gauge({
  label,
  reading,
  zones,
  fmt,
  word,
}: {
  label: string;
  reading: GaugeReading;
  zones: GaugeZones;
  fmt: (v: number | null) => string;
  /** Overrides the zone word (fundamentals/flows use the matching lens band, §14.9). */
  word?: string | null;
}) {
  const { now, lastWeek, avg52w } = reading;
  const { min, max } = reading.scale;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const angle = (v: number) => Math.PI * (1 - (clamp(v) - min) / (max - min));

  const zone = now == null ? null : zoneFor(zones, now);
  const zoneWord = zone ? word ?? zone.word : null;
  const suffix = now == null ? "" : now > max ? "›" : now < min ? "‹" : "";
  const nowText = now == null ? "—" : fmt(now) + suffix;
  const valuetext = `${label} ${nowText}${zoneWord ? `, ${zoneWord}` : ""}; last week ${fmt(lastWeek)}; 52-week average ${fmt(avg52w)}`;

  let from = min;
  const zoneArcs = zones.zones.map((z) => {
    const d = arc(angle(from), angle(z.to));
    from = z.to;
    return { d, color: z.color, to: z.to };
  });

  return (
    <div
      className="vx-gauge"
      role="meter"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={now ?? undefined}
      aria-valuetext={valuetext}
    >
      <div className="t-label vx-gauge-label">{label}</div>
      <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path d={arc(Math.PI, 0)} stroke="var(--surface-300)" strokeWidth={10} fill="none" />
        {zoneArcs.map((z) => (
          <path key={z.to} d={z.d} stroke={z.color} strokeOpacity={0.4} strokeWidth={10} fill="none" />
        ))}
        {zoneArcs.slice(0, -1).map((z) => (
          <line key={z.to} {...radial(angle(z.to), R - 7, R + 7)} stroke="var(--border-strong)" strokeWidth={1} />
        ))}
        {avg52w != null && <line {...radial(angle(avg52w), 68, 84)} stroke="var(--ink-300)" strokeWidth={2} />}
        {lastWeek != null && (() => {
          const [x, y] = point(angle(lastWeek), R);
          return <circle cx={x} cy={y} r={5} fill="none" stroke="var(--ink-200)" strokeWidth={1.5} />;
        })()}
        {now != null && zone && (() => {
          const [x, y] = point(angle(now), R);
          return <circle cx={x} cy={y} r={5.5} fill={zone.color} stroke="var(--ink-100)" strokeWidth={1.5} />;
        })()}
      </svg>
      <div className="t-figure-lg" style={{ color: zone ? zone.color : "var(--ink-300)" }}>
        {nowText}
      </div>
      <div className="t-body vx-gauge-word">{zoneWord ?? "insufficient history"}</div>
      <div className="t-figure-sm vx-gauge-sub">
        last wk {fmt(lastWeek)} · 52w {fmt(avg52w)}
      </div>
    </div>
  );
}
