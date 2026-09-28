// Typed fetchers. Types mirrored from backend/src/types.ts and model outputs
// (SPEC.md "API" + "API amendments", docs/MODEL.md section 4).

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number; src: "hl" | "bitstamp" };

export type HtfPhase = "accumulation" | "expansion" | "euphoria" | "distribution" | "markdown" | "capitulation";

export type LtfState =
  | "insufficient_data"
  | "deleveraging"
  | "crowded_long"
  | "short_squeeze_fuel"
  | "crowded_short"
  | "healthy_uptrend"
  | "downtrend"
  | "neutral";

export type HtfPoint = Candle & {
  sma200: number | null;
  sma50: number | null;
  mayer: number | null;
  mayerPct: number | null;
  drawdown: number | null;
  sma200Slope30: number | null;
  roc30: number | null;
  roc365: number | null;
  rv30: number | null;
  rv30Pct: number | null;
  daysSinceLow365: number;
  tMayer: number | null;
  tSlope: number | null;
  tCross: number | null;
  hMayer: number | null;
  hDrawdown: number | null;
  hRoc365: number | null;
  trend: number | null;
  heat: number | null;
  rawPhase: HtfPhase | null;
  phase: HtfPhase | null;
};

export type LtfPoint = Candle & {
  ema50: number | null;
  rsi14: number | null;
  roc6: number | null;
  fundingApr: number | null;
  premium: number | null;
  premiumZ: number | null;
  oiUsd: number | null;
  oiChange24h: number | null;
  rv42: number | null;
  rv42Pct: number | null;
  lFunding: number | null;
  lPremium: number | null;
  lOi: number | null;
  mEma: number | null;
  mRsi: number | null;
  mRoc: number | null;
  leverage: number | null;
  momentum: number | null;
  rawState: LtfState;
  state: LtfState;
};

export type CycleInfo = {
  lastHalving: number | null;
  daysSinceHalving: number | null;
  cycleProgress: number | null;
  nextHalvingEstimate: number;
};

export type BiasLabel = "strongly bullish" | "bullish" | "neutral" | "bearish" | "strongly bearish";
export type ComponentKey = "trend" | "heat" | "leverage" | "momentum";
export type Component = { key: ComponentKey; score: number | null; word: string | null };

export type Overview = {
  asOf: number;
  price: number;
  lastRefresh: number;
  htf: {
    phase: HtfPhase | null;
    trend: number | null;
    heat: number | null;
    features: Record<string, number | null>;
    cycle: CycleInfo;
  };
  ltf: {
    state: LtfState | null;
    leverage: number | null;
    momentum: number | null;
    features: Record<string, number | null>;
  };
  composite: {
    bias: number | null;
    summary: string;
    label: BiasLabel | null;
    sentence: string;
    components: Component[];
  };
  crossVenueFunding: { venue: string; apr: number }[];
};

// SPEC.md 3b.3 / docs/MODEL.md 3.4. Mirrors backend/src/model/derivatives.ts's Derivatives type.
export type Pt = [t: number, v: number];
export type Derivatives = {
  now: number;
  windowMs: 604800000;
  asOf: number | null;
  firstSnapshot: number | null;
  collecting: boolean;
  premium: { points: Pt[]; last: number | null };
  fundingApr: {
    points: Pt[];
    last: number | null;
    predicted: { venue: string; short: string; apr: number }[];
  };
  oiUsd: { points: Pt[]; last: number | null; change24h: number | null };
  volume24h: { points: Pt[]; last: number | null };
};

export type Health = {
  ok: boolean;
  lastRefresh: number | null;
  lastSnapshot: number | null;
  firstSnapshot: number | null;
  counts: { candles1d: number; candles4h: number; candles1h: number; funding: number; snapshots: number };
  /** Optional — not yet in every backend response; guard with `?.` (see backend/src/refresh.ts state.lastError). */
  lastError?: string | null;
};

export type HtfResponse = { candles: HtfPoint[]; halvings: number[] };
export type LtfResponse = { points: LtfPoint[] };

export type LtfInterval = "15m" | "1h" | "4h";
export type Asset = { coin: string; sector: string };
export type AssetsResponse = { assets: Asset[] };

export type Signal =
  | { t: number; frame: "HTF"; from: HtfPhase | null; to: HtfPhase; price: number; trend: number | null; heat: number | null }
  | { t: number; frame: "LTF"; from: LtfState | null; to: LtfState; price: number; leverage: number | null; momentum: number | null };

export type SignalsResponse = { signals: Signal[] };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

// GitHub Pages serves no backend: the build pre-renders every route to frontend/dist/api/*.json
// (see backend/src/export.ts) and this flag swaps live fetches for those static files. Static
// files are pre-rendered with a fixed limit=200, so `limit` is ignored in that mode.
const STATIC = import.meta.env.VITE_STATIC === "1";

export const api = {
  health: () => getJson<Health>(STATIC ? "./api/health.json" : "/api/health"),
  overview: () => getJson<Overview>(STATIC ? "./api/overview.json" : "/api/overview"),
  htf: (interval: "1d" | "1w") =>
    getJson<HtfResponse>(STATIC ? `./api/htf-${interval}.json` : `/api/htf?interval=${interval}`),
  ltf: (interval: "4h" | "1h") =>
    getJson<LtfResponse>(STATIC ? `./api/ltf-${interval}.json` : `/api/ltf?interval=${interval}`),
  signals: (frame: "HTF" | "LTF", limit = 200) =>
    getJson<SignalsResponse>(
      STATIC ? `./api/signals-${frame}.json` : `/api/signals?frame=${frame}&limit=${limit}`,
    ),
  assets: () => getJson<AssetsResponse>(STATIC ? "./api/assets.json" : "/api/assets"),
  derivatives: () => getJson<Derivatives>(STATIC ? "./api/derivatives.json" : "/api/derivatives"),
  assetLtf: (coin: string, interval: LtfInterval) =>
    getJson<LtfResponse>(
      STATIC ? `./api/ltf-${coin}-${interval}.json` : `/api/ltf?interval=${interval}&coin=${coin}`,
    ),
};
