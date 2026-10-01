// Numbered claims with triggers — DESIGN.md §14.4.7. Text is verbatim from the API.
import type { Vector, WocPhase } from "../../api";

export const TITLE = "Brief";

export function Brief({ brief, wocPhase }: { brief: Vector["brief"]; wocPhase: WocPhase | null }) {
  return (
    <section className="region vx-brief">
      <div className="region-header">
        <span>{TITLE}{wocPhase ? ` · ${wocPhase.replace(/_/g, " ")}` : ""}</span>
      </div>
      <div className="region-body">
        {brief.sentences.length === 0 ? (
          <div className="region-empty">no brief — the model has not produced a reading yet</div>
        ) : (
          <ol className="vx-brief-list">
            {brief.sentences.map((s, i) => (
              <li key={i}>
                <span className="t-figure-sm vx-muted">{i + 1}</span>
                <span className="t-body">{s}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
