import { useCallback, useEffect, useState } from "react";

// Generic fetch-on-deps-change hook with a stale-response guard: every dep change (or retry())
// clears data/error and starts a fresh fetch, and a fetch that resolves after its effect was
// superseded (deps changed again, or the component unmounted) is dropped instead of overwriting
// newer state. retry() re-runs the same effect (via `tick`), so it shares this same guard rather
// than duplicating its own fetch/cancel logic.
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: boolean; retry: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    fn()
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // fn is expected to be stable relative to the caller-supplied deps, same contract as useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, retry };
}
