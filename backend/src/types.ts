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
