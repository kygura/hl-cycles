// Hyperliquid derivatives series for the DerivativesPanel — display only, no new model math.
// See docs/MODEL.md section 3.4 and SPEC.md 3b.3. Pure functions, stored data only.
import type { FundingRow, OiRow, Snapshot } from "../types";

// 90 days hourly: the panel offers 7d/30d/90d client-side slices of one payload. Funding and OI
// come from the multi-year backfill (funding.json, oi-history.json); premium and volume only
// exist in snapshots, so those series stay sparse until snapshots cover the window.
const WINDOW_MS = 7_776_000_000; // 90 days
const OI_BACKFILL_MAX_AGE_MS = 6 * 3_600_000; // older backfill loses to fresher HL snapshots
const HOUR_MS = 3_600_000;

export type Pt = [t: number, v: number];

export type Derivatives = {
  now: number;
  windowMs: number;
  asOf: number | null;
  firstSnapshot: number | null;
  collecting: boolean;
  premium: { points: Pt[]; last: number | null };
  fundingApr: {
    points: Pt[];
    last: number | null;
    predicted: { venue: string; short: string; apr: number }[];
  };
  /** src: "binance" = hourly Binance-proxy backfill (oi-history.json), "hl" = Hyperliquid snapshots. */
  oiUsd: { points: Pt[]; last: number | null; change24h: number | null; src: "binance" | "hl" };
  volume24h: { points: Pt[]; last: number | null };
};

/** rate is per venue interval; annualize by the venue's own hours-per-interval. */
export function predictedApr(p: Snapshot["predicted"][number]): number {
  return (p.rate * 8760) / p.intervalHours;
}

const VENUE_ORDER = ["HlPerp", "BinPerp", "BybitPerp"];
const VENUE_SHORT: Record<string, string> = { HlPerp: "HL", BinPerp: "BIN", BybitPerp: "BYB" };

function orderedPredicted(snap: Snapshot | null): { venue: string; short: string; apr: number }[] {
  if (!snap) return [];
  const known = VENUE_ORDER.map((v) => snap.predicted.find((p) => p.venue === v)).filter(
    (p): p is Snapshot["predicted"][number] => p != null,
  );
  const rest = snap.predicted.filter((p) => !VENUE_ORDER.includes(p.venue));
  return [...known, ...rest].map((p) => ({ venue: p.venue, short: VENUE_SHORT[p.venue] ?? p.venue, apr: predictedApr(p) }));
}

function seriesFromBucketed(bucketed: Snapshot[], pick: (s: Snapshot) => number | null): Pt[] {
  const out: Pt[] = [];
  for (const s of bucketed) {
    const v = pick(s);
    if (v == null || !Number.isFinite(v)) continue;
    out.push([s.t, v]);
  }
  return out;
}

export function derivatives(snapshots: Snapshot[], funding: FundingRow[], now: number, oiHistory: OiRow[] = []): Derivatives {
  const windowStart = now - WINDOW_MS;

  const firstSnapshot = snapshots.length ? Math.min(...snapshots.map((s) => s.t)) : null;

  const inWindow = snapshots.filter((s) => s.t > windowStart && s.t <= now).sort((a, b) => a.t - b.t);

  // Hourly-bucket downsample: last snapshot per UTC hour wins (ascending iteration order).
  const byBucket = new Map<number, Snapshot>();
  for (const s of inWindow) byBucket.set(Math.floor(s.t / HOUR_MS), s);
  const bucketed = [...byBucket.values()].sort((a, b) => a.t - b.t);

  const nowSnap = inWindow.length ? inWindow[inWindow.length - 1]! : null;

  let change24h: number | null = null;
  if (nowSnap) {
    const lo = nowSnap.t - 86_400_000 - HOUR_MS;
    const hi = nowSnap.t - 86_400_000;
    let then: Snapshot | null = null;
    for (const s of snapshots) {
      if (s.t >= lo && s.t <= hi && (!then || s.t > then.t)) then = s;
    }
    if (then && then.oiCoins > 0) change24h = nowSnap.oiCoins / then.oiCoins - 1;
  }

  const premiumPts = seriesFromBucketed(bucketed, (s) => (s.oraclePx > 0 ? s.markPx / s.oraclePx - 1 : null));
  // One source per series: Binance-proxy OI (backfill) and Hyperliquid OI (snapshots) differ by
  // 2-3x, so mixing them draws a fake cliff. Backfill wins when present and fresh (last point
  // within 6h of now); change24h then comes from the same series (1h tolerance) instead of the
  // snapshot coins. A stale backfill falls back to snapshots so a dead feed cannot win forever.
  let oiHist: Pt[] = oiHistory
    .filter((r) => r.t > windowStart && r.t <= now && Number.isFinite(r.oiUsd))
    .map((r) => [r.t, r.oiUsd] as Pt)
    .sort((a, b) => a[0] - b[0]);
  if (oiHist.length && now - oiHist[oiHist.length - 1]![0] > OI_BACKFILL_MAX_AGE_MS) oiHist = [];
  const oiPts = oiHist.length ? oiHist : seriesFromBucketed(bucketed, (s) => s.oiUsd);
  if (oiHist.length) {
    const [tNow, vNow] = oiHist[oiHist.length - 1]!;
    const then = oiHist.filter(([t]) => t >= tNow - 86_400_000 - HOUR_MS && t <= tNow - 86_400_000).pop();
    change24h = then && then[1] > 0 ? vNow / then[1] - 1 : null;
  }
  const volumePts = seriesFromBucketed(bucketed, (s) => s.dayNtlVlm);

  const fundingPts: Pt[] = funding
    .filter((f) => f.t > windowStart && f.t <= now)
    .map((f) => [f.t, f.rate * 8760] as Pt)
    .sort((a, b) => a[0] - b[0]);

  const last = (pts: Pt[]): number | null => (pts.length ? pts[pts.length - 1]![1] : null);

  return {
    now,
    windowMs: WINDOW_MS,
    asOf: nowSnap?.t ?? null,
    firstSnapshot,
    collecting: bucketed.length < 24,
    premium: { points: premiumPts, last: last(premiumPts) },
    fundingApr: { points: fundingPts, last: last(fundingPts), predicted: orderedPredicted(nowSnap) },
    oiUsd: { points: oiPts, last: last(oiPts), change24h, src: oiHist.length ? "binance" : "hl" },
    volume24h: { points: volumePts, last: last(volumePts) },
  };
}
