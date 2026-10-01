import { useMemo, useState } from "react";
import { FRAMES, isHtfInterval, type Frame } from "./api";
import { useDashboardData } from "./useDashboardData";
import { StatusBar } from "./components/StatusBar";
import { MarketRead } from "./components/MarketRead";
import { DerivativesPanel } from "./components/DerivativesPanel";
import { CycleVector, type VectorPoint } from "./components/CycleVector";
import { HtfChart } from "./components/HtfChart";
import { LtfChart } from "./components/LtfChart";
import { SignalTable } from "./components/SignalTable";
import { PhaseGuide } from "./components/PhaseGuide";
import { AssetsView } from "./components/AssetsView";
import { VectorView } from "./components/vector/VectorView";

function App() {
  const [view, setView] = useState<"btc" | "assets">("btc");
  // One timeframe for the main BTC chart. 1d/1w render HtfChart (SMA200, phase bands, halvings);
  // 15m/1h/4h render LtfChart (ema50, state strip, funding, OI). Daily HTF stays loaded on LTF
  // frames because CycleVector reads it.
  const [frame, setFrame] = useState<Frame>("1d");
  const htfInterval = frame === "1w" ? "1w" : "1d";
  const ltfInterval = isHtfInterval(frame) ? null : frame;
  const [signalFilter, setSignalFilter] = useState<"ALL" | "HTF" | "LTF">("ALL");
  const [guideOpen, setGuideOpen] = useState(false);

  const {
    health,
    overview,
    status,
    htf,
    htfError,
    ltf,
    ltfError,
    signals,
    signalsError,
    derivatives,
    derivativesError,
    retryDerivatives,
    retryHtf,
    retryLtf,
    retrySignals,
    vector,
    vectorError,
    retryVector,
  } = useDashboardData(htfInterval, ltfInterval);

  const vectorPoints: VectorPoint[] = useMemo(() => {
    if (!htf) return [];
    const daily = htf.candles.filter((c) => c.trend != null && c.heat != null && c.phase != null).slice(-90);
    return daily.map((c) => ({ t: c.t, trend: c.trend as number, heat: c.heat as number, phase: c.phase! }));
  }, [htf]);

  if (status === "loading" && !overview) {
    return (
      <div>
        <StatusBar health={health} overview={overview} status={status} onOpenGuide={() => setGuideOpen(true)} view={view} onViewChange={setView} />
        <div className="app">
          <div className="region-loading">loading…</div>
        </div>
      </div>
    );
  }

  if (status === "error" && !overview) {
    return (
      <div>
        <StatusBar health={health} overview={overview} status={status} onOpenGuide={() => setGuideOpen(true)} view={view} onViewChange={setView} />
        <div className="app">
          <div className="region-error">backend unreachable at :8787 — run bun run dev</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StatusBar health={health} overview={overview} status={status} onOpenGuide={() => setGuideOpen(true)} view={view} onViewChange={setView} />
      <div className="app">
        {view === "assets" && <AssetsView />}
        {view === "btc" && (
        <div className="app-grid">
          <VectorView vector={vector} error={vectorError} onRetry={retryVector} overview={overview} />

          <section className="region span-7">
            <div className="region-header">
              <span>Market read</span>
            </div>
            <div className="region-body">{overview && <MarketRead overview={overview} stale={status === "stale"} />}</div>
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
            <DerivativesPanel data={derivatives} error={derivativesError} onRetry={retryDerivatives} />
          </div>

          <div className="span-12">
            {(ltfInterval ? ltfError : htfError) ? (
              <section className="region">
                <div className="region-header">
                  <span>BTC chart · {frame}</span>
                </div>
                <div className="region-error">
                  failed to load
                  <button onClick={ltfInterval ? retryLtf : retryHtf}>retry</button>
                </div>
              </section>
            ) : ltfInterval ? (
              ltf ? (
                <LtfChart
                  data={ltf.points}
                  interval={frame}
                  onIntervalChange={setFrame}
                  intervals={FRAMES}
                  firstSnapshotAt={health?.firstSnapshot ?? null}
                />
              ) : (
                <section className="region">
                  <div className="region-header">
                    <span>BTC chart · {frame}</span>
                  </div>
                  <div className="region-loading" style={{ height: 520 }} />
                </section>
              )
            ) : htf ? (
              <HtfChart data={htf.candles} halvings={htf.halvings} interval={frame} onIntervalChange={setFrame} />
            ) : (
              <section className="region">
                <div className="region-header">
                  <span>BTC chart · {frame}</span>
                </div>
                <div className="region-loading" style={{ height: 480 }} />
              </section>
            )}
          </div>

          <details className="span-12">
            <summary className="mono" style={{ cursor: "pointer", color: "var(--ink-200)", marginBottom: 8 }}>Signal history</summary>
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
          </details>
        </div>
        )}
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
