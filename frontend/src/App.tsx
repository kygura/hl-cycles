import { useMemo, useState } from "react";
import type { LtfInterval } from "./api";
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

const BTC_LTF_INTERVALS: readonly Extract<LtfInterval, "4h" | "1h">[] = ["4h", "1h"];

function App() {
  const [view, setView] = useState<"btc" | "assets">("btc");
  const [htfInterval, setHtfInterval] = useState<"1d" | "1w">("1d");
  const [ltfInterval, setLtfInterval] = useState<Extract<LtfInterval, "4h" | "1h">>("4h");
  const [signalFilter, setSignalFilter] = useState<"ALL" | "HTF" | "LTF">("ALL");
  const [guideOpen, setGuideOpen] = useState(false);

  // LtfChart is generic over all 3 LtfInterval values (AssetsView also uses 15m), but the BTC
  // view only offers 4h/1h -- narrow here instead of casting at the call site.
  const handleLtfIntervalChange = (i: LtfInterval) => {
    if (i === "4h" || i === "1h") setLtfInterval(i);
  };

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
  } = useDashboardData(htfInterval, ltfInterval);

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
        <span className="segmented">
          {(["btc", "assets"] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "btc" ? "BTC" : "Assets"}
            </button>
          ))}
        </span>
        {view === "assets" && <AssetsView />}
        {view === "btc" && (
        <div className="app-grid">
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
              <LtfChart
                data={ltf.points}
                interval={ltfInterval}
                onIntervalChange={handleLtfIntervalChange}
                intervals={BTC_LTF_INTERVALS}
                firstSnapshotAt={health?.firstSnapshot ?? null}
              />
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
