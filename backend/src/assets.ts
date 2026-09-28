// Single source of truth for tradable assets (SPEC.md 3.2). Adding/removing a coin means
// editing only this file — the frontend reads it via /api/assets, never duplicates it.
export const ASSETS = [
  { coin: "BTC", sector: "Majors" },
  { coin: "ETH", sector: "Majors" },
  { coin: "SOL", sector: "Majors" },
  { coin: "XRP", sector: "Majors" },
  { coin: "HYPE", sector: "Perp DEX" },
  { coin: "LIT", sector: "Perp DEX" },
  { coin: "SUI", sector: "L1" },
  { coin: "NEAR", sector: "L1" },
  { coin: "ENA", sector: "DeFi" },
  { coin: "DOGE", sector: "Memes" },
  { coin: "PUMP", sector: "Memes" },
  { coin: "TAO", sector: "AI" },
] as const;

export type Asset = (typeof ASSETS)[number];

export const ALTS = ASSETS.filter((a) => a.coin !== "BTC").map((a) => a.coin);
