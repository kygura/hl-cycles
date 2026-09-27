// Composite bias/summary, signal history, and /api/overview builder. Pure functions only.
// See docs/MODEL.md section 3 and 4.
import { blend, clamp } from "./indicators";
import { cycleInfo, type HtfPoint, type HtfPhase } from "./htf";
import type { LtfPoint, LtfState } from "./ltf";

export type BiasLabel = "strongly bullish" | "bullish" | "neutral" | "bearish" | "strongly bearish";

export type Signal =
  | { t: number; frame: "HTF"; from: HtfPhase | null; to: HtfPhase; price: number; trend: number | null; heat: number | null }
  | { t: number; frame: "LTF"; from: LtfState | null; to: LtfState; price: number; leverage: number | null; momentum: number | null };

const HTF_TEXT: Record<HtfPhase, string> = {
  accumulation: "HTF accumulation: price is basing well below prior highs",
  expansion: "HTF expansion: trend is up and not yet overheated",
  euphoria: "HTF euphoria: trend is up and price is extremely extended",
  distribution: "HTF distribution: still elevated but momentum is fading",
  markdown: "HTF markdown: trend is down",
  capitulation: "HTF capitulation: deep drawdown with fresh lows",
};
const HTF_TEXT_NULL = "HTF data insufficient";

const LTF_TEXT: Record<LtfState, string> = {
  crowded_long: "perps are crowded long (funding and premium hot)",
  healthy_uptrend: "short-term uptrend with balanced leverage",
  short_squeeze_fuel: "price is rising while shorts pay (squeeze fuel)",
  crowded_short: "perps are crowded short",
  deleveraging: "open interest is flushing out on a sharp move",
  downtrend: "short-term downtrend with balanced leverage",
  neutral: "short-term neutral",
  insufficient_data: "LTF data insufficient",
};

/** MODEL 3. bLev then bias = clamp(base - bLev), base = blend of 0.6*T and 0.4*M. */
export function computeBias(T: number | null, M: number | null, L: number | null): number | null {
  const bLev = L == null ? 0 : Math.sign(L) * 0.3 * Math.max(0, (Math.abs(L) - 0.5) / 0.5);
  const base = blend([
    [0.6, T],
    [0.4, M],
  ]);
  return base == null ? null : clamp(base - bLev);
}

export function biasLabel(bias: number): BiasLabel {
  if (bias >= 0.5) return "strongly bullish";
  if (bias >= 0.15) return "bullish";
  if (bias > -0.15) return "neutral";
  if (bias > -0.5) return "bearish";
  return "strongly bearish";
}

function fmt(x: number): string {
  return (x >= 0 ? "+" : "-") + Math.abs(x).toFixed(2);
}

/** MODEL 3.1 summary string. */
export function summaryText(htfPhase: HtfPhase | null, ltfState: LtfState, bias: number | null): string {
  const htfText = htfPhase == null ? HTF_TEXT_NULL : HTF_TEXT[htfPhase];
  const ltfTextStr = LTF_TEXT[ltfState];
  const biasText = bias == null ? "unavailable" : `${biasLabel(bias)} (${fmt(bias)})`;
  return `${htfText}; ${ltfTextStr}. Bias: ${biasText}.`;
}

/** Every committed HTF phase change and LTF state change, newest first. */
export function signals(htf: HtfPoint[], ltf: LtfPoint[], limit = 200): Signal[] {
  const out: Signal[] = [];
  let prevHtf: HtfPhase | null = null;
  let seenHtf = false;
  for (const p of htf) {
    if (p.phase == null) continue;
    if (!seenHtf || p.phase !== prevHtf) {
      out.push({ t: p.t, frame: "HTF", from: seenHtf ? prevHtf : null, to: p.phase, price: p.c, trend: p.trend, heat: p.heat });
    }
    prevHtf = p.phase;
    seenHtf = true;
  }
  let prevLtf: LtfState | null = null;
  let seenLtf = false;
  for (const p of ltf) {
    if (!seenLtf || p.state !== prevLtf) {
      out.push({ t: p.t, frame: "LTF", from: seenLtf ? prevLtf : null, to: p.state, price: p.c, leverage: p.leverage, momentum: p.momentum });
    }
    prevLtf = p.state;
    seenLtf = true;
  }
  out.sort((a, b) => b.t - a.t);
  return out.slice(0, limit);
}

export type Overview = {
  asOf: number;
  price: number;
  lastRefresh: number;
  htf: {
    phase: HtfPhase | null;
    trend: number | null;
    heat: number | null;
    features: Record<string, number | null>;
    cycle: ReturnType<typeof cycleInfo>;
  };
  ltf: {
    state: LtfState | null;
    leverage: number | null;
    momentum: number | null;
    features: Record<string, number | null>;
  };
  composite: { bias: number | null; summary: string };
  crossVenueFunding: { venue: string; apr: number }[];
};

/**
 * Builds the exact /api/overview shape. `htf` = full daily history, `ltf` = the requested (or
 * default 4h) interval's points. `price`/`lastRefresh` are resolved by the caller (they may need
 * the live snapshot, which this pure module never touches).
 */
export function overview(params: {
  htf: HtfPoint[];
  ltf: LtfPoint[];
  price: number;
  lastRefresh: number;
  crossVenueFunding: { venue: string; apr: number }[];
}): Overview {
  const { htf, ltf, price, lastRefresh, crossVenueFunding } = params;
  const h = htf[htf.length - 1];
  const l = ltf[ltf.length - 1];
  const ltfState: LtfState = l ? l.state : "insufficient_data";

  const bias = computeBias(h?.trend ?? null, l?.momentum ?? null, l?.leverage ?? null);

  const htfFeatures: Record<string, number | null> = h
    ? {
        close: h.c,
        sma50: h.sma50,
        sma200: h.sma200,
        mayer: h.mayer,
        mayerPct: h.mayerPct,
        drawdown: h.drawdown,
        sma200Slope30: h.sma200Slope30,
        roc30: h.roc30,
        roc365: h.roc365,
        rv30: h.rv30,
        rv30Pct: h.rv30Pct,
        daysSinceLow365: h.daysSinceLow365,
        tMayer: h.tMayer,
        tSlope: h.tSlope,
        tCross: h.tCross,
        hMayer: h.hMayer,
        hDrawdown: h.hDrawdown,
        hRoc365: h.hRoc365,
      }
    : {
        close: null, sma50: null, sma200: null, mayer: null, mayerPct: null, drawdown: null,
        sma200Slope30: null, roc30: null, roc365: null, rv30: null, rv30Pct: null,
        daysSinceLow365: null, tMayer: null, tSlope: null, tCross: null, hMayer: null,
        hDrawdown: null, hRoc365: null,
      };

  const ltfFeatures: Record<string, number | null> = l
    ? {
        close: l.c,
        ema50: l.ema50,
        rsi14: l.rsi14,
        roc6: l.roc6,
        fundingApr: l.fundingApr,
        premium: l.premium,
        premiumZ: l.premiumZ,
        oiUsd: l.oiUsd,
        oiChange24h: l.oiChange24h,
        rv42: l.rv42,
        rv42Pct: l.rv42Pct,
        lFunding: l.lFunding,
        lPremium: l.lPremium,
        lOi: l.lOi,
        mEma: l.mEma,
        mRsi: l.mRsi,
        mRoc: l.mRoc,
      }
    : {
        close: null, ema50: null, rsi14: null, roc6: null, fundingApr: null, premium: null,
        premiumZ: null, oiUsd: null, oiChange24h: null, rv42: null, rv42Pct: null,
        lFunding: null, lPremium: null, lOi: null, mEma: null, mRsi: null, mRoc: null,
      };

  return {
    asOf: h ? h.t : 0,
    price,
    lastRefresh,
    htf: {
      phase: h?.phase ?? null,
      trend: h?.trend ?? null,
      heat: h?.heat ?? null,
      features: htfFeatures,
      cycle: cycleInfo(h ? h.t : Date.now()),
    },
    ltf: {
      state: l?.state ?? null,
      leverage: l?.leverage ?? null,
      momentum: l?.momentum ?? null,
      features: ltfFeatures,
    },
    composite: {
      bias,
      summary: summaryText(h?.phase ?? null, ltfState, bias),
    },
    crossVenueFunding,
  };
}
