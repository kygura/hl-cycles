// Vector block composition — DESIGN.md §14.4.9. Renders straight into the parent `.app-grid`.
import type { GaugeKey, Overview, Vector } from "../../api";
import { DAY, fmtDeltaPts, fmtInt } from "../../format";
import { Gauge } from "./Gauge";
import { RegimeHero } from "./RegimeHero";
import { RegimeChart, TITLE as CHART_TITLE } from "./RegimeChart";
import { CompassPanel, TITLE as COMPASS_TITLE } from "./CompassPanel";
import { LevelsTable, TITLE as LEVELS_TITLE } from "./LevelsTable";
import { MacroStrip } from "./MacroStrip";
import { Brief, TITLE as BRIEF_TITLE } from "./Brief";
import { SourcesFooter } from "./SourcesFooter";
import { GAUGE_LABEL, GAUGE_ZONES } from "./scales";

const GAUGES: readonly GaugeKey[] = ["risk", "momentum", "fundamentals", "flows"];

// Placeholder regions for loading / error (§14.5): header + flat block of final height, or the retry line.
const SLOTS = [
  { cls: "span-12 vx-hero-region", title: null, h: 210 },
  { cls: "span-8 vx-chart-slot", title: CHART_TITLE, h: 420 },
  { cls: "span-4 vx-compass-slot vx-compass", title: COMPASS_TITLE, h: 420 },
  { cls: "span-5 vx-levels-slot", title: LEVELS_TITLE, h: 260 },
  { cls: "span-7 vx-brief-slot", title: BRIEF_TITLE, h: 160 },
  { cls: "span-12 vx-macro", title: null, h: 56 },
];

function Divider() {
  return (
    <div className="span-12 vx-divider t-label">
      <span>Drill-down · HTF phase · leverage · chart · signals</span>
    </div>
  );
}

export function VectorView({
  vector,
  error,
  onRetry,
  overview,
}: {
  vector: Vector | null;
  error: boolean;
  onRetry: () => void;
  overview: Overview | null;
}) {
  if (!vector) {
    return (
      <>
        {SLOTS.map((s) => (
          <section key={s.cls} className={`region ${s.cls}`}>
            {s.title && (
              <div className="region-header">
                <span>{s.title}</span>
              </div>
            )}
            {error ? (
              <div className="region-error">
                failed to load
                <button onClick={onRetry}>retry</button>
              </div>
            ) : (
              <div className="vx-loading" style={{ height: s.h }} />
            )}
          </section>
        ))}
        <Divider />
      </>
    );
  }

  // The static export freezes `stale` at export time, so age out `asOf` client-side too (§14.9).
  const stale = vector.stale || (vector.asOf != null && Date.now() - vector.asOf > 3 * DAY);
  // Fundamentals/flows gauges print the matching lens band so gauge and tile agree (§14.9).
  const lensBand = (k: GaugeKey) => vector.compass.lenses.find((l) => l.key === k)?.band;

  return (
    <>
      <section className={`region span-12 vx-hero-region${stale ? " market-read-top-warn" : ""}`}>
        <RegimeHero
          regime={vector.regime}
          asOf={vector.asOf}
          oldestInputAsOf={vector.oldestInputAsOf}
          stale={stale}
          brief={vector.brief}
        />
        <div className="vx-gauges">
          <div className="vx-gauge-row">
            {GAUGES.map((k) => (
              <Gauge
                key={k}
                label={GAUGE_LABEL[k]}
                reading={vector.gauges[k]}
                zones={GAUGE_ZONES[k]}
                fmt={k === "momentum" ? fmtDeltaPts : fmtInt}
                word={k === "fundamentals" || k === "flows" ? lensBand(k) : undefined}
              />
            ))}
          </div>
          <div className="t-figure-sm vx-muted vx-gauge-legend">● today&nbsp;&nbsp;○ last week&nbsp;&nbsp;| 52w avg</div>
        </div>
      </section>
      <div className="span-8 vx-chart-slot">
        <RegimeChart history={vector.history} flips={vector.flips} levels={vector.levels} asOf={vector.asOf} />
      </div>
      <div className="span-4 vx-compass-slot">
        <CompassPanel compass={vector.compass} />
      </div>
      <div className="span-5 vx-levels-slot">
        <LevelsTable levels={vector.levels} price={overview?.price ?? null} />
      </div>
      <div className="span-7 vx-brief-slot">
        <Brief brief={vector.brief} wocPhase={vector.wocPhase} />
      </div>
      <MacroStrip macro={vector.macro} />
      <SourcesFooter sources={vector.sources} now={Date.now()} />
      <Divider />
    </>
  );
}
