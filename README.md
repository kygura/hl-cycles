# hl-cycles

A local web dashboard that explains where Bitcoin sits in its cycle using open data only. It uses Hyperliquid derivatives data (primary) and Bitstamp price history (supplementary pre-2023 backfill) to compute deterministic cycle phases and scores.

## Setup

```bash
bun install
bun run dev
```

Backend runs on `127.0.0.1:8787`, frontend on `http://localhost:5173`.

## Behavior

**First boot** backfills ~1 minute:
- Bitstamp daily OHLC: 2011-09-13 through 2022-12-31
- Hyperliquid candles: 1h, 4h, 1d at full history
- Hyperliquid funding: 2023-05-12 onward

**Refresh cycle**: every 15 minutes, incremental candle fetch + OI/funding snapshot (no replays, only new data).

Data stored in `data/` as JSON (git-ignored). Use `NO_SCHEDULER=1` to serve cached data only (e.g., for testing or offline replay).

## Commands

- `bun run dev` — start backend + frontend  
- `bun test` — run backend test suite  
- `bun run build` — build frontend to `frontend/dist/`

## Data sources

- **Hyperliquid** (primary, keyless public API)  
  Candles, funding rates, open interest; no rate limits enforced (fire at will, mutable universe)
- **Bitstamp** (supplementary, keyless public API)  
  Daily OHLC from 2011 to 2022; removed once Hyperliquid history matures (optional adapter at `backend/src/sources/bitstamp.ts`)

## Documentation

- **Data model & computation**: see `docs/MODEL.md`  
- **System design**: see `docs/DESIGN.md`  
- **Specification**: see `docs/SPEC.md`

## Limitations

- **OI history**: captured only from local snapshots (15-min intervals from first boot). Historical OI requires replaying snapshots from an earlier boot.
- **Candle cap**: 5000-row limit per API call for 1h/4h (architectural cap, not a soft UI limit; 1d/1w have no practical ceiling)
- **Not financial advice**: this is a data dashboard for educational use only; make your own trading decisions
- **No execution**: read-only analysis; no order placement or risk management
