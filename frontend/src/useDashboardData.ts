// DESIGN.md section 7 state machine + polling.
//
// Deviation from DESIGN.md 7 (instructed by the task brief, which supersedes
// this section for payload size): htf/ltf are fetched once per mount and once
// per interval switch only, never on the poll tick — the htf payload is ~3.6MB
// and must not be re-fetched every 60s. Only /api/overview, /api/health (small)
// and /api/signals are polled.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Derivatives, type Health, type HtfInterval, type HtfResponse, type LtfInterval, type LtfResponse, type Overview, type Signal } from "./api";

export type Status = "loading" | "ok" | "stale" | "error";

const STALE_MS = 30 * 60 * 1000;
const POLL_OK_MS = 60_000;
const POLL_ERROR_MS = 30_000;

// ltfInterval null = main chart is on an HTF frame, so no LTF fetch is needed.
export function useDashboardData(htfInterval: HtfInterval, ltfInterval: LtfInterval | null) {
  const [health, setHealth] = useState<Health | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewFailed, setOverviewFailed] = useState(false);

  const [htf, setHtf] = useState<HtfResponse | null>(null);
  const [htfError, setHtfError] = useState(false);
  const [ltf, setLtf] = useState<LtfResponse | null>(null);
  const [ltfError, setLtfError] = useState(false);
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [signalsError, setSignalsError] = useState(false);
  const [derivatives, setDerivatives] = useState<Derivatives | null>(null);
  const [derivativesError, setDerivativesError] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedRef = useRef(false);

  const pollOnce = useCallback(async () => {
    try {
      const [ov, h] = await Promise.all([api.overview(), api.health()]);
      setOverview(ov);
      setHealth(h);
      setOverviewFailed(false);
      failedRef.current = false;
    } catch {
      setOverviewFailed(true);
      failedRef.current = true;
    }
    // Derivatives is small (~20KB, SPEC.md 3b.3), so it is fetched every poll tick alongside
    // overview/health rather than gated behind an interval switch like htf/ltf.
    try {
      setDerivatives(await api.derivatives());
      setDerivativesError(false);
    } catch {
      setDerivativesError(true);
    }
    try {
      const [htfSig, ltfSig] = await Promise.all([api.signals("HTF", 200), api.signals("LTF", 200)]);
      const merged = [...htfSig.signals, ...ltfSig.signals].sort((a, b) => b.t - a.t);
      setSignals(merged);
      setSignalsError(false);
    } catch {
      setSignalsError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loop() {
      await pollOnce();
      if (cancelled) return;
      const delay = failedRef.current ? POLL_ERROR_MS : POLL_OK_MS;
      timerRef.current = setTimeout(loop, delay);
    }
    void loop();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pollOnce]);

  // Fetch htf once on mount and once per interval switch.
  useEffect(() => {
    let cancelled = false;
    setHtfError(false);
    api
      .htf(htfInterval)
      .then((r) => !cancelled && setHtf(r))
      .catch(() => !cancelled && setHtfError(true));
    return () => {
      cancelled = true;
    };
  }, [htfInterval]);

  useEffect(() => {
    let cancelled = false;
    setLtfError(false);
    setLtf(null);
    if (ltfInterval == null) return;
    api
      .ltf(ltfInterval)
      .then((r) => !cancelled && setLtf(r))
      .catch(() => !cancelled && setLtfError(true));
    return () => {
      cancelled = true;
    };
  }, [ltfInterval]);

  // DESIGN.md §6.1/§7: staleness is derived from health.lastRefresh (health is
  // polled alongside overview), not overview.lastRefresh — one source. A null
  // health.lastRefresh (never refreshed) is not "stale", it's "not refreshed
  // yet"; StatusBar renders that distinction.
  const refreshTs = health?.lastRefresh ?? null;
  const status: Status = overview == null
    ? (overviewFailed ? "error" : "loading")
    : overviewFailed
    ? "error"
    : refreshTs != null && Date.now() - refreshTs > STALE_MS
    ? "stale"
    : "ok";

  return {
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
    retryDerivatives: () => {
      setDerivativesError(false);
      api.derivatives().then(setDerivatives).catch(() => setDerivativesError(true));
    },
    retryHtf: () => {
      setHtfError(false);
      api.htf(htfInterval).then(setHtf).catch(() => setHtfError(true));
    },
    retryLtf: () => {
      if (ltfInterval == null) return;
      setLtfError(false);
      api.ltf(ltfInterval).then(setLtf).catch(() => setLtfError(true));
    },
    retrySignals: () => {
      setSignalsError(false);
      Promise.all([api.signals("HTF", 200), api.signals("LTF", 200)])
        .then(([a, b]) => setSignals([...a.signals, ...b.signals].sort((x, y) => y.t - x.t)))
        .catch(() => setSignalsError(true));
    },
  };
}
