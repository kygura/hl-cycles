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
- `bun run cron` — one-shot headless collection (refresh + snapshot, persists `data/state.json`); add `-- --backfill` to also run the incremental daily backfill
- `bun run export` — render `frontend/dist/api/*.json` from current data (no network calls) — this is what the Vercel build runs

## Data sources

- **Hyperliquid** (primary, keyless public API)  
  Candles, funding rates, open interest; no rate limits enforced (fire at will, mutable universe)
- **Bitstamp** (supplementary, keyless public API)  
  Daily OHLC from 2011 to 2022; removed once Hyperliquid history matures (optional adapter at `backend/src/sources/bitstamp.ts`)

## Deploy

The dashboard runs as a static site, deployed to two targets that serve the same static build:

- **GitHub Pages** — deployed by `.github/workflows/collect.yml` itself, every 15 minutes (plus one daily backfill run). The workflow collects data, commits the raw `data/` files, builds the static export, and pushes it to Pages in the same run.
- **Vercel** — deployed via Vercel's Git integration on every push to `main`. The Vercel build is offline: it makes no network calls, because `bun run export` renders `frontend/dist/api/*.json` straight from the `data/` files already committed by `collect.yml`.

Setup:

1. `git remote add origin <your-repo-url>`
2. `git push -u origin main` (this repo's current branch)
3. In GitHub, Settings → Secrets and variables → Actions → **Variables**, add:
   - `DATA_AUTHOR_NAME` / `DATA_AUTHOR_EMAIL` — set to the identity your own commits already use (`git log --format='%an <%ae>'`). This matters on a Vercel Hobby plan: Vercel only deploys commits authored by the Hobby team owner, and a `github-actions[bot]` author gets silently blocked from triggering a deploy. If these vars are unset, `collect.yml` falls back to the bot identity and data still gets committed, but Vercel won't redeploy on it.
4. In GitHub, Settings → Pages, set Source to "GitHub Actions". Go to the Actions tab and run the "collect" workflow once manually (`workflow_dispatch`, with the daily/backfill branch) to populate `data/` and publish the first Pages deployment.
5. In Vercel, import the repo as a new project:
   - Framework Preset: **Other**
   - Root Directory: repo root
   - Install Command: `bun install --frozen-lockfile` (from `vercel.json`)
   - Build Command: `VITE_STATIC=1 bun run build && bun run export` (from `vercel.json`)
   - Output Directory: `frontend/dist` (from `vercel.json`)
   - Ignore Build Step: uses `vercel.json`'s `ignoreCommand` (see below)
6. Deploy. The site is live at both the Pages URL and the Vercel-assigned URL (or your own domain, once attached).

Notes:
- Cron schedule drift of a few minutes at busy times is normal for GitHub Actions; don't expect an exact 15-minute cadence.
- GitHub auto-disables scheduled workflows on public repos after 60 days with no repo activity. If the schedule ever stops firing, re-enable it with one click from the Actions tab.
- Every run (15-minute and daily) commits the full `data/` directory — both deployed sites are built straight from it, so it must never go stale between commits.
- Locally, `bun run cron` runs a single collection pass (useful for testing without waiting for the schedule). `bun run dev` is unaffected by any of this.
- Vercel would otherwise build on every push from `collect.yml` (96/day at a 15-minute cadence) plus human pushes, which risks the Hobby plan's 100 deploys/day limit. `collect.yml` appends ` [vercel-skip]` to the data commit's subject on odd `github.run_number` runs (the daily/backfill run never skips); `vercel.json`'s `ignoreCommand` skips the Vercel build (exit 0) when the last commit subject contains that marker, and always builds (exit 1) otherwise, including every human push — thinning the automated pushes down to roughly every 30 minutes.
- If a build log shows `--frozen-lockfile` rejecting the committed lockfile version, drop `--frozen-lockfile` from `installCommand` in `vercel.json` rather than pinning Bun by hand.
- **No staleness alerting.** Nothing pages you if the schedule silently stops firing (rate limits, a broken run, the vars above going missing). Check `/api/health.json` on either deployed site for `lastRefresh`/`lastSnapshot` manually if the dashboard looks stale.

## Documentation

- **Data model & computation**: see `docs/MODEL.md`  
- **System design**: see `docs/DESIGN.md`  
- **Specification**: see `docs/SPEC.md`

## Limitations

- **OI history**: captured only from local snapshots (15-min intervals from first boot). Historical OI requires replaying snapshots from an earlier boot.
- **Candle cap**: 5000-row limit per API call for 1h/4h (architectural cap, not a soft UI limit; 1d/1w have no practical ceiling)
- **Not financial advice**: this is a data dashboard for educational use only; make your own trading decisions
- **No execution**: read-only analysis; no order placement or risk management
