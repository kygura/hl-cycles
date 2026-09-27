import type { Health, Overview } from "../api";
import type { Status } from "../useDashboardData";
import { fmtPriceUsd, fmtTimestamp, fmtRelativeAge } from "../format";

export function StatusBar({
  health,
  overview,
  status,
  onOpenGuide,
}: {
  health: Health | null;
  overview: Overview | null;
  status: Status;
  onOpenGuide: () => void;
}) {
  // DESIGN.md §6.1/§7: health.lastRefresh is the one source for age/staleness
  // (health is polled alongside overview) — not overview.lastRefresh.
  const refreshTs = health?.lastRefresh ?? null;

  let pillText: string;
  let color: string;
  if (status === "loading") {
    pillText = "loading…";
    color = "var(--text-3)";
  } else if (status === "error") {
    pillText = "● offline — retrying in 30s";
    color = "var(--bad)";
  } else if (refreshTs == null) {
    pillText = "not refreshed yet";
    color = "var(--text-3)";
  } else {
    const age = fmtRelativeAge(refreshTs);
    pillText = status === "stale" ? `● stale ${age}` : `● live ${age}`;
    color = status === "stale" ? "var(--warn)" : "var(--ok)";
  }

  return (
    <div className="status-bar">
      <div className="left">
        <span className="wordmark">hl-cycles · BTC</span>
        {overview && <span className="price mono">{fmtPriceUsd(overview.price)}</span>}
        {overview && <span>· as of {fmtTimestamp(overview.asOf)} UTC</span>}
        <span className="pill mono" style={{ color }}>
          {pillText}
        </span>
        {health?.lastError && (
          <span className="pill mono" style={{ color: "var(--bad)" }} title={health.lastError}>
            ● refresh error
          </span>
        )}
      </div>
      <button className="guide-btn" onClick={onOpenGuide} aria-haspopup="dialog">
        ? Phase guide
      </button>
    </div>
  );
}
