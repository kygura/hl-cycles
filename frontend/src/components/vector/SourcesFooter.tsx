// Per-source health line — DESIGN.md §14.4.8.
import type { Vector } from "../../api";
import { fmtRelativeAge } from "../../format";

export function SourcesFooter({ sources, now }: { sources: Vector["sources"]; now: number }) {
  const rows = Object.entries(sources);
  const failing = rows.filter(([, s]) => s.lastError != null).length;
  return (
    <details className="span-12 vx-sources t-figure-sm">
      <summary>
        sources · {rows.length - failing} ok{failing > 0 ? ` · ${failing} failing` : ""}
      </summary>
      <table className="vx-table">
        <thead>
          <tr>
            <th>source</th>
            <th>last ok</th>
            <th>error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, s]) => (
            <tr key={name}>
              <td>
                <span style={{ color: s.lastError == null ? "var(--positive)" : "var(--negative)" }}>●</span>{" "}
                {s.lastError == null ? "ok" : "failing"} · {name}
              </td>
              <td>{s.lastOk == null ? "—" : fmtRelativeAge(s.lastOk, now)}</td>
              <td style={{ color: "var(--ink-200)", whiteSpace: "normal" }}>{s.lastError ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
