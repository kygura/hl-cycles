export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  src: "hl" | "bitstamp";
};

export type FundingRow = {
  t: number;
  rate: number;
  // null only occurs on Binance-backfilled rows for an hour with no matching 1h premium kline
  // (e.g. Binance premium history starts later than funding history in some months) — never
  // fabricated as 0, since 0 is a real premium value. Hyperliquid rows always have a real number.
  premium: number | null;
  // Provenance: missing/undefined means Hyperliquid (the original source, before this field
  // existed). "binance" marks hourly-equivalent rows backfilled from Binance BTCUSDT perp
  // history for hours before Hyperliquid's funding history starts. See docs/MODEL.md.
  src?: "hl" | "binance";
};

export type OiRow = {
  t: number;
  oiCoins: number;
  oiUsd: number;
  // "binance": Binance-proxy hourly OI (BTC backfill, data/oi-history.json). "hl": Hyperliquid
  // metaAndAssetCtxs OI snapshots for alts (data/oi-hl-<COIN>.json), see SPEC.md 3.3.
  src: "binance" | "hl";
};

export type Snapshot = {
  t: number;
  markPx: number;
  oraclePx: number;
  oiCoins: number;
  oiUsd: number;
  funding: number;
  premium: number | null;
  dayNtlVlm: number;
  predicted: Array<{
    venue: string;
    rate: number;
    intervalHours: number;
  }>;
};
