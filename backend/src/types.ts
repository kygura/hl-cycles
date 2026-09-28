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
  premium: number;
  // Provenance: missing/undefined means Hyperliquid (the original source, before this field
  // existed). "binance" marks hourly-equivalent rows backfilled from Binance BTCUSDT perp
  // history for hours before Hyperliquid's funding history starts. See docs/MODEL.md.
  src?: "hl" | "binance";
};

export type OiRow = {
  t: number;
  oiCoins: number;
  oiUsd: number;
  src: "binance";
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
