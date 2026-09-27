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
  const color = status === "ok" ? "var(--ok)" : status === "stale" ? "var(--warn)" : status === "error" ? "var(--bad)" : "var(--text-3)";

  let pillText: string;
  if (status === "loading") pillText = "loading…";
  else if (status === "error") pillText = "● offline — retrying in 30s";
  else if (overview) {
    const age = fmtRelativeAge(overview.lastRefresh);
    pillText = status === "stale" ? `● stale ${age}` : `● live ${age}`;
  } else {
    pillText = "● —";
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
      </div>
      <button className="guide-btn" onClick={onOpenGuide} aria-haspopup="dialog">
        ? Phase guide
      </button>
    </div>
  );
}
