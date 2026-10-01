// Macro context strip — DESIGN.md §14.4.6. No colour by sign: context, not a verdict.
import type { Vector } from "../../api";
import { fmtDate, fmtPercentSigned, fmtScore, fmtYield } from "../../format";

export function MacroStrip({ macro }: { macro: Vector["macro"] }) {
  const cells: [string, string][] = [
    // dollarVs200d is in percent (SPEC 4.7 #2); fmtPercentSigned takes a fraction.
    ["Dollar vs 200D", macro.dollarVs200d == null ? "—" : fmtPercentSigned(macro.dollarVs200d / 100)],
    ["US 10Y", fmtYield(macro.us10y)],
    ["US 2Y", fmtYield(macro.us2y)],
    ["Fed funds", fmtYield(macro.fedFundsUpper)],
    ["Curve 10Y−2Y", fmtScore(macro.curve)],
    ["BTC·SPX corr 30D", fmtScore(macro.spxCorr30d)],
  ];
  return (
    <section className="region span-12 vx-macro">
      <dl className="vx-macro-row">
        {cells.map(([k, v]) => (
          <div key={k} className="vx-macro-cell">
            <dt className="t-label vx-muted">{k}</dt>
            <dd className="t-figure">{v}</dd>
          </div>
        ))}
        <div className="vx-macro-cell vx-macro-asof t-figure-sm vx-muted">as of {fmtDate(macro.asOf)}</div>
      </dl>
    </section>
  );
}
