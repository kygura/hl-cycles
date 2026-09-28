import { useMemo, useState } from "react";
import { api, type Asset, type LtfInterval } from "../api";
import { fmtApr, fmtCompactUsd, fmtPercentSigned, fmtScore } from "../format";
import { useFetch } from "../useFetch";
import { LtfChart } from "./LtfChart";

const INTERVALS: readonly LtfInterval[] = ["15m", "1h", "4h"];
const DEFAULT_COIN = "ETH";

export function AssetsView() {
  const [coin, setCoin] = useState(DEFAULT_COIN);
  const [interval, setInterval_] = useState<LtfInterval>("1h");

  const { data: assets, error: assetsError, retry: retryAssets } = useFetch(() => api.assets().then((r) => r.assets), []);
  const { data: ltf, error: ltfError, retry: retryLtf } = useFetch(() => api.assetLtf(coin, interval), [coin, interval]);

  const bySector = useMemo(() => {
    const groups = new Map<string, Asset[]>();
    for (const a of assets ?? []) {
      if (!groups.has(a.sector)) groups.set(a.sector, []);
      groups.get(a.sector)!.push(a);
    }
    return groups;
  }, [assets]);

  const last = ltf && ltf.points.length > 0 ? ltf.points[ltf.points.length - 1] : null;
  const firstSnapshotAt = ltf?.points.find((p) => p.oiUsd != null)?.t ?? null;

  return (
    <div className="app-grid">
      <section className="region span-12">
        <div className="region-header">
          <span>Asset picker</span>
        </div>
        <div className="region-body">
          {assetsError ? (
            <div className="region-error">
              failed to load assets
              <button onClick={retryAssets}>retry</button>
            </div>
          ) : assets ? (
            <select aria-label="Asset" value={coin} onChange={(e) => setCoin(e.target.value)}>
              {[...bySector.entries()].map(([sector, coins]) => (
                <optgroup key={sector} label={sector}>
                  {coins.map((a) => (
                    <option key={a.coin} value={a.coin}>
                      {a.coin}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : (
            <div className="region-loading">loading…</div>
          )}
          {last && (
            <div className="mono" style={{ marginTop: 8, color: "var(--ink-200)" }}>
              {last.state} · lev {fmtScore(last.leverage)} · mom {fmtScore(last.momentum)} · funding {fmtApr(last.fundingApr)} · OI{" "}
              {fmtCompactUsd(last.oiUsd)} ({fmtPercentSigned(last.oiChange24h)} 24h)
            </div>
          )}
        </div>
      </section>

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
            interval={interval}
            onIntervalChange={setInterval_}
            firstSnapshotAt={firstSnapshotAt}
            coin={coin}
            intervals={INTERVALS}
            note="thresholds calibrated on BTC"
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
    </div>
  );
}
