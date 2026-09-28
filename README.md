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

Data stored in `data/` as JSON, committed to the repo (this is how the deployed static dashboard gets its history — see Deploy below). Use `NO_SCHEDULER=1` to serve cached data only (e.g., for testing or offline replay).

## Commands

- `bun run dev` — start backend + frontend
- `bun test` — run backend test suite
- `bun run build` — build frontend to `frontend/dist/`
- `bun run cron` — one-shot headless collection (refresh + snapshot + static export); add `-- --backfill` to also run the incremental daily backfill
- `bun run export` — re-render `frontend/dist/api/*.json` from current data, without collecting anything new

## Data sources

- **Hyperliquid** (primary, keyless public API)  
  Candles, funding rates, open interest; no rate limits enforced (fire at will, mutable universe)
- **Bitstamp** (supplementary, keyless public API)  
  Daily OHLC from 2011 to 2022; removed once Hyperliquid history matures (optional adapter at `backend/src/sources/bitstamp.ts`)

## Deploy

The dashboard runs as a free static site on GitHub Pages, kept current by a GitHub Actions workflow (`.github/workflows/collect.yml`) that collects data every 15 minutes and re-renders the static API. No server to host, no secrets.

1. Create a **public** GitHub repo. Public matters here: Actions minutes and Pages are free and unlimited on public repos; the private free tier is ~2000 min/mo, and this schedule burns roughly that much on its own.
2. `git remote add origin <your-repo-url>`
3. `git push -u origin main` (this repo's current branch)
4. In the repo's Settings → Pages, set **Source** to "GitHub Actions".
5. Go to the Actions tab and run the "collect" workflow once manually (`workflow_dispatch`) to populate `frontend/dist/api/` and trigger the first deploy. (No need to touch Settings → Actions → Workflow permissions — the workflow already declares the `contents: write` / `pages: write` / `id-token: write` it needs per-job.)
6. The site is live at `https://<your-username>.github.io/hl-cycles/`.

Notes:
- Cron schedule drift of 5-30 minutes at busy times is normal for GitHub Actions; don't expect exact 15-minute cadence.
- GitHub auto-disables scheduled workflows on public repos after 60 days with no repo activity. The bot's own data commits likely count as activity, but this isn't documented by GitHub — if the schedule stops firing, re-enable it with one click from the Actions tab.
- Every run commits `data/snapshots.jsonl`; the daily run (and manual dispatch) also commits the full `data/` directory and runs the incremental backfill.
- Locally, `bun run cron` runs a single collection pass (useful for testing without waiting for the schedule). `bun run dev` is unaffected by any of this.
- **No staleness alerting.** Nothing pages you if the schedule silently stops firing (rate limits, the 60-day auto-disable above, a broken run). Check `https://<your-username>.github.io/hl-cycles/api/health.json` for `lastRefresh`/`lastSnapshot` manually if the dashboard looks stale.

## Documentation

- **Data model & computation**: see `docs/MODEL.md`  
- **System design**: see `docs/DESIGN.md`  
- **Specification**: see `docs/SPEC.md`

## Limitations

- **OI history**: captured only from local snapshots (15-min intervals from first boot). Historical OI requires replaying snapshots from an earlier boot.
- **Candle cap**: 5000-row limit per API call for 1h/4h (architectural cap, not a soft UI limit; 1d/1w have no practical ceiling)
- **Not financial advice**: this is a data dashboard for educational use only; make your own trading decisions
- **No execution**: read-only analysis; no order placement or risk management
