# hl-cycles

A local web dashboard that explains where Bitcoin sits in its cycle using open data only. It uses Hyperliquid derivatives data and Bitstamp price history to compute deterministic cycle phases and scores.

## Quick start

```bash
bun install
bun run dev
```

Backend runs on http://localhost:8787, frontend on http://localhost:5173.

## Commands

- `bun run dev` — start both backend and frontend
- `bun test` — run backend tests
- `bun run build` — build frontend
