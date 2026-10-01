// Key-levels price ladder with Status — DESIGN.md §14.4.5.
import { Fragment } from "react";
import type { Level } from "../../api";
import { fmtPercentSigned, fmtPrice } from "../../format";

// distancePct is in percent (SPEC 4.7 #2); fmtPercentSigned takes a fraction.
export const TITLE = "Key levels · cost-basis map";

const fmtDist = (d: number | null) => (d == null ? "—" : fmtPercentSigned(d / 100));

export function LevelsTable({ levels, price }: { levels: Level[]; price: number | null }) {
  const sorted = [...levels].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const dividerAt = price == null ? -1 : sorted.findIndex((l) => l.value == null || l.value < price);
  const available = levels.filter((l) => l.value != null).length;
  const divider = (
    <tr className="vx-price-row">
      <td colSpan={4}>
        <span className="t-figure-sm">price {fmtPrice(price)}</span>
      </td>
    </tr>
  );

  return (
    <section className="region vx-levels">
      <div className="region-header">
        <span>{TITLE}</span>
      </div>
      <div className="region-body">
        <table className="vx-table vx-levels-table t-figure">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">Level</th>
              <th className="num vx-col-dist">Distance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l, i) => (
              <Fragment key={l.key}>
                {i === dividerAt && divider}
                <tr>
                  <td className="t-body">
                    {l.label}
                    {l.proxy && (
                      <span className="vx-muted" title="proxy: flow-weighted ETF cost basis, inflows only">
                        {" "}~
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {fmtPrice(l.value)}
                    <div className="t-figure-sm vx-muted vx-dist-inline">{fmtDist(l.distancePct)}</div>
                  </td>
                  <td className="num vx-col-dist">{fmtDist(l.distancePct)}</td>
                  <td>{l.status ? <span className={`vx-pill vx-pill-${l.status}`}>● {l.status}</span> : "—"}</td>
                </tr>
              </Fragment>
            ))}
            {price != null && dividerAt === -1 && divider}
          </tbody>
        </table>
        {available < 5 && (
          <div className="t-figure-sm vx-muted" style={{ marginTop: 8 }}>
            {available} of {levels.length} levels available
          </div>
        )}
      </div>
    </section>
  );
}
