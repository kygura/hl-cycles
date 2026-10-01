// Number/date formatting — DESIGN.md section 5. Every renderer goes through here.

const MINUS = "−";

/** One day in ms. */
export const DAY = 86_400_000;

function sign(x: number): string {
  return x < 0 ? MINUS : "+";
}

export function fmtPrice(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const dp = Math.abs(x) >= 10_000 ? 0 : 2;
  return x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtPriceUsd(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return "$" + fmtPrice(x);
}

/** Signed 2dp score (trend, heat, leverage, momentum, bias). */
export function fmtScore(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const v = Object.is(x, -0) ? 0 : x;
  return sign(v) + Math.abs(v).toFixed(2);
}

/** Fraction -> signed percent, 1dp. */
export function fmtPercentSigned(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const v = Object.is(x, -0) ? 0 : x;
  return sign(v) + (Math.abs(v) * 100).toFixed(1) + "%";
}

/** Fraction -> unsigned percent, 1dp (cycleProgress). */
export function fmtPercent(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return (x * 100).toFixed(1) + "%";
}

/** Fraction -> signed APR percent, 1dp. */
export function fmtApr(x: number | null | undefined): string {
  return fmtPercentSigned(x);
}

/** Fraction -> signed basis points, 0dp (premium). */
export function fmtBp(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const v = Object.is(x, -0) ? 0 : x;
  return sign(v) + Math.round(Math.abs(v) * 10_000) + " bp";
}

/** Open interest USD, compact, 2 significant digits. */
export function fmtCompactUsd(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const abs = Math.abs(x);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [scale, suffix] of units) {
    if (abs >= scale) {
      const v = abs / scale;
      const dp = v >= 10 ? 1 : 2;
      return (x < 0 ? MINUS : "") + v.toFixed(dp) + suffix;
    }
  }
  return (x < 0 ? MINUS : "") + abs.toFixed(0);
}

/** Mayer, rv30 — 2dp unsigned. */
export function fmtUnsigned2(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toFixed(2);
}

export function fmtDate(t: number | null | undefined): string {
  if (t == null || Number.isNaN(t)) return "—";
  return new Date(t).toISOString().slice(0, 10);
}

export function fmtTimestamp(t: number | null | undefined): string {
  if (t == null || Number.isNaN(t)) return "—";
  const d = new Date(t);
  return d.toISOString().slice(0, 10) + " " + d.toISOString().slice(11, 16);
}

export function fmtRelativeAge(fromMs: number, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function fmtRawOrDash(x: number | null | undefined, dp = 2): string {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toFixed(dp);
}

// ---- Phase 4 Vector formats (DESIGN.md §14.6) ----

/** Integer, unsigned (compass score, 0–100 gauge values). */
export function fmtInt(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const v = Math.round(x);
  return (v < 0 ? MINUS : "") + Math.abs(v);
}

/** Signed integer, no unit (compass d7/d30, momentum). Zero prints as `0`. */
export function fmtDeltaPts(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const v = Math.round(x);
  return v === 0 ? "0" : sign(v) + Math.abs(v);
}

/** Percent points (5.29 = 5.29%) -> `5.29%`. */
export function fmtYield(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return (x < 0 ? MINUS : "") + Math.abs(x).toFixed(2) + "%";
}

/** Raw lens input: ≤ 4 significant digits, thousands separator above 1,000, trailing zeros trimmed. */
export function fmtRaw(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const abs = Math.abs(x);
  const body = abs >= 1000 ? Math.round(abs).toLocaleString("en-US") : String(Number(abs.toPrecision(4)));
  return (x < 0 ? MINUS : "") + body;
}

/** Whole UTC days from `from` to `to` (day 0 on the same day). */
export function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / DAY);
}
