import { useEffect, useRef } from "react";
import type { HtfPhase, LtfState } from "../api";
import { PHASE_TOKEN, STATE_TOKEN } from "../tokens";

const HTF_ROWS: { phase: HtfPhase; text: string }[] = [
  { phase: "accumulation", text: "trend flat-to-negative and heat low after a long decline; patient buyers absorb supply and price bases." },
  { phase: "expansion", text: "trend turns positive while heat is still moderate; the healthiest part of the cycle, price rises with room to run." },
  { phase: "euphoria", text: "trend and heat both high; price is far above its long averages and momentum is extreme, historically near cycle tops." },
  { phase: "distribution", text: "heat stays high but trend rolls over; strong hands sell into strength and the top forms." },
  { phase: "markdown", text: "trend negative with heat cooling; the sustained decline of a bear market." },
  { phase: "capitulation", text: "trend and heat both deeply negative with high volatility; forced selling flushes out leverage and sets up the next accumulation." },
];

const LTF_ROWS: { state: LtfState; text: string }[] = [
  { state: "crowded_long", text: "positive funding and rising open interest with stalling momentum; longs are paying to stay in and are vulnerable." },
  { state: "healthy_uptrend", text: "positive momentum with moderate leverage; the trend is being driven by spot demand, not just perps." },
  { state: "short_squeeze_fuel", text: "negative funding or heavy shorts against a market that refuses to fall; fuel for a sharp move up." },
  { state: "crowded_short", text: "negative funding with rising open interest and falling price; shorts are extended." },
  { state: "deleveraging", text: "open interest dropping fast with volatility up; positions are being liquidated in either direction." },
  { state: "downtrend", text: "negative momentum with balanced leverage; an orderly short-term decline, added after design (docs/MODEL.md 2.5)." },
  { state: "neutral", text: "nothing extreme; funding near zero and leverage unremarkable." },
  { state: "insufficient_data", text: "not enough snapshots yet to score leverage; OI-based components are dropped and the label is withheld." },
];

export function PhaseGuide({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current: { phase: HtfPhase | null; state: LtfState | null };
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      headingRef.current?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("keydown", onKey);
        triggerRef.current?.focus();
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="guide-backdrop" onClick={onClose} />
      <div className="guide-drawer" role="dialog" aria-modal="true" aria-labelledby="phase-guide-heading">
        <button className="guide-close" onClick={onClose} aria-label="Close phase guide">
          &times;
        </button>
        <h2 id="phase-guide-heading" tabIndex={-1} ref={headingRef}>
          How to read the two scores
        </h2>
        <p>
          <em>Trend</em> (−1..+1): where price sits versus its long averages and recent direction; positive means the market is structurally rising.
        </p>
        <p>
          <em>Heat</em> (−1..+1): how stretched price is versus fair-value proxies (Mayer multiple, drawdown, long-horizon momentum, realized volatility); positive means expensive and crowded, negative means washed out.
        </p>
        <p>The phase is a rule over (trend, heat) plus the cycle clock; the CycleVector plane is those two scores drawn as a point, and the trailing path shows the market rotating through the cycle.</p>

        <h3>HTF phases</h3>
        {HTF_ROWS.map((r) => (
          <div className="guide-row" key={r.phase}>
            <span className="swatch" style={{ background: PHASE_TOKEN[r.phase], marginTop: 4 }} />
            <span>
              <strong className="mono">{r.phase}</strong>
              {current.phase === r.phase && <span className="now">← now</span>} — {r.text}
            </span>
          </div>
        ))}

        <h3>LTF states</h3>
        {LTF_ROWS.map((r) => (
          <div className="guide-row" key={r.state}>
            <span className="swatch" style={{ background: STATE_TOKEN[r.state], marginTop: 4 }} />
            <span>
              <strong className="mono">{r.state}</strong>
              {current.state === r.state && <span className="now">← now</span>} — {r.text}
            </span>
          </div>
        ))}

        <h3>Composite bias</h3>
        <p>
          The bias combines HTF phase (direction and stretch) with LTF leverage (whether the crowd already agrees); a positive bias means the
          long-term frame is constructive and short-term leverage is not fighting it; a negative bias means either the cycle is late/hot or leverage
          is crowded against the trend. Read the summary line, then look at where the vector point sits.
        </p>

        <h3>Cycle clock</h3>
        <p>
          Halvings (2012, 2016, 2020, 2024) cut new supply in half; prior cycles peaked roughly 12–18 months after a halving and bottomed
          roughly a year after that, so days since halving and % of cycle are context, not a prediction.
        </p>
      </div>
    </>
  );
}
