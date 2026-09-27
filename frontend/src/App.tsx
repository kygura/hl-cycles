import { useMemo, useState } from "react";
import { useDashboardData } from "./useDashboardData";
import { StatusBar } from "./components/StatusBar";
import { PhaseReadout } from "./components/PhaseReadout";
import { CycleVector, type VectorPoint } from "./components/CycleVector";
import { HtfChart } from "./components/HtfChart";
import { LtfChart } from "./components/LtfChart";
import { SignalTable } from "./components/SignalTable";
import { PhaseGuide } from "./components/PhaseGuide";

function App() {
  const [htfInterval, setHtfInterval] = useState<"1d" | "1w">("1d");
  const [ltfInterval, setLtfInterval] = useState<"4h" | "1h">("4h");
  const [signalFilter, setSignalFilter] = useState<"ALL" | "HTF" | "LTF">("ALL");
  const [guideOpen, setGuideOpen] = useState(false);

  const { health, overview, status, htf, htfError, ltf, ltfError, signals, signalsError, retryHtf, retryLtf, retrySignals } = useDashboardData(
    htfInterval,
    ltfInterval
  );

  const vectorPoints: VectorPoint[] = useMemo(() => {
    if (!htf) return [];
    const daily = htf.candles.filter((c) => c.trend != null && c.heat != null && c.phase != null).slice(-90);
    return daily.map((c) => ({ t: c.t, trend: c.trend as number, heat: c.heat as number, phase: c.phase! }));
  }, [htf]);

  if (status === "loading" && !overview) {
    return (
      <div>
        <StatusBar health={health} overview={overview} status={status} onOpenGuide={() => setGuideOpen(true)} />
        <div className="app">
          <div className="region-loading">loading…</div>
        </div>
      </div>
    );
  }

  if (status === "error" && !overview) {
    return (
      <div>
        <StatusBar health={health} overview={overview} status={status} onOpenGuide={() => setGuideOpen(true)} />
        <div className="app">
          <div className="region-error">backend unreachable at :8787 — run bun run dev</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StatusBar health={health} overview={overview} status={status} onOpenGuide={() => setGuideOpen(true)} />
      <div className="app">
        <div className="app-grid">
          <section className={`region span-7 ${status === "stale" ? "readout-top-warn" : ""}`}>
            <div className="region-header">
              <span>Phase readout</span>
            </div>
            <div className="region-body">{overview && <PhaseReadout overview={overview} />}</div>
          </section>

          <section className="region span-5">
            <div className="region-header">
              <span>Cycle vector · trend vs heat · last 90 days</span>
            </div>
            <div className="region-body">
              <CycleVector
                points={vectorPoints}
                current={{ trend: overview?.htf.trend ?? null, heat: overview?.htf.heat ?? null, phase: overview?.htf.phase ?? null }}
              />
            </div>
          </section>

          <div className="span-12">
            {htfError ? (
              <section className="region">
                <div className="region-header">
                  <span>HTF chart</span>
                </div>
                <div className="region-error">
                  failed to load
                  <button onClick={retryHtf}>retry</button>
                </div>
              </section>
            ) : htf ? (
              <HtfChart data={htf.candles} halvings={htf.halvings} interval={htfInterval} onIntervalChange={setHtfInterval} />
            ) : (
              <section className="region">
                <div className="region-header">
                  <span>HTF chart</span>
                </div>
                <div className="region-loading" style={{ height: 480 }} />
              </section>
            )}
          </div>

          <div className="span-12">
            {ltfError ? (
              <section className="region">
                <div className="region-header">
                  <span>LTF chart</span>
                </div>
                <div className="region-error">
                  failed to load
                  <button onClick={retryLtf}>retry</button>
                </div>
              </section>
            ) : ltf ? (
              <LtfChart data={ltf.points} interval={ltfInterval} onIntervalChange={setLtfInterval} firstSnapshotAt={health?.firstSnapshot ?? null} />
            ) : (
              <section className="region">
                <div className="region-header">
                  <span>LTF chart</span>
                </div>
                <div className="region-loading" style={{ height: 520 }} />
              </section>
            )}
          </div>

          <div className="span-12">
            {signalsError ? (
              <section className="region">
                <div className="region-header">
                  <span>Signal history</span>
                </div>
                <div className="region-error">
                  failed to load
                  <button onClick={retrySignals}>retry</button>
                </div>
              </section>
            ) : (
              <SignalTable signals={signals ?? []} filter={signalFilter} onFilterChange={setSignalFilter} />
            )}
          </div>
        </div>
      </div>
      <PhaseGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        current={{ phase: overview?.htf.phase ?? null, state: overview?.ltf.state ?? null }}
      />
    </div>
  );
}

export default App;
