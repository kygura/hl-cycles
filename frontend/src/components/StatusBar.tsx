import type { Health, Overview } from "../api";
import type { Status } from "../useDashboardData";
import { fmtPriceUsd, fmtTimestamp, fmtRelativeAge } from "../format";

export function StatusBar({
  health,
  overview,
  status,
  onOpenGuide,
  view,
  onViewChange,
}: {
  health: Health | null;
  overview: Overview | null;
  status: Status;
  onOpenGuide: () => void;
  view: "btc" | "assets";
  onViewChange: (v: "btc" | "assets") => void;
}) {
  // DESIGN.md §6.1/§7: health.lastRefresh is the one source for age/staleness
  // (health is polled alongside overview) — not overview.lastRefresh.
  const refreshTs = health?.lastRefresh ?? null;

  let pillText: string;
  let color: string;
  if (status === "loading") {
    pillText = "loading…";
    color = "var(--ink-300)";
  } else if (status === "error") {
    pillText = "● offline — retrying in 30s";
    color = "var(--negative)";
  } else if (refreshTs == null) {
    pillText = "not refreshed yet";
    color = "var(--ink-300)";
  } else {
    const age = fmtRelativeAge(refreshTs);
    pillText = status === "stale" ? `● stale ${age}` : `● live ${age}`;
    color = status === "stale" ? "var(--warning)" : "var(--positive)";
  }

  return (
    <div className="status-bar">
      <div className="left">
        <span className="wordmark">hl-cycles · BTC</span>
        {overview && <span className="price mono">{fmtPriceUsd(overview.price)}</span>}
        {overview && <span className="asof">· as of {fmtTimestamp(overview.asOf)} UTC</span>}
        <span className="pill mono" style={{ color }}>
          {pillText}
        </span>
        {health?.lastError && (
          <span className="pill mono" style={{ color: "var(--negative)" }} title={health.lastError}>
            ● refresh error
          </span>
        )}
      </div>
      <div className="right">
        <span className="segmented" role="tablist" aria-label="View">
          {(["btc", "assets"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => onViewChange(v)}>
              {v === "btc" ? "BTC" : "Assets"}
            </button>
          ))}
        </span>
        <button className="guide-btn" onClick={onOpenGuide} aria-haspopup="dialog" aria-label="Phase guide">
          ? <span className="guide-text">Phase guide</span>
        </button>
      </div>
    </div>
  );
}
