// Regime-coloured daily log price, dot strip, numbered flips, key levels — DESIGN.md §14.4.3.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { RegimeState, Vector } from "../../api";
import { DAY, fmtDate, fmtInt, fmtDeltaPts, fmtPrice } from "../../format";
import { alpha, css, REGIME_TOKEN, REGIME_VAR, REGIME_WORD } from "../../tokens";

export const TITLE = "Regime · BTC/USD daily · log";

type Preset = "1Y" | "4Y" | "All";
const PRESETS: readonly Preset[] = ["1Y", "4Y", "All"];
const YEAR_S = (365 * DAY) / 1000;
const STATES: readonly RegimeState[] = ["strong_risk_off", "mild_risk_off", "mild_risk_on", "strong_risk_on"];
const isOff = (s: RegimeState) => s.endsWith("risk_off");
const RECENT = 4;

/** ①–⑳ in UI text; plain digits past 20. */
const circled = (n: number): string => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : String(n));
const word = (s: RegimeState) => REGIME_WORD[s].toLowerCase();

export function RegimeChart({
  history,
  flips,
  levels,
  asOf,
}: {
  history: Vector["history"];
  flips: Vector["flips"];
  levels: Vector["levels"];
  asOf: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stripRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [preset, setPreset] = useState<Preset>("4Y");
  const [showLevels, setShowLevels] = useState(false);
  const [tooltip, setTooltip] = useState<{ head: string; state: RegimeState | null; tail: string } | null>(null);

  const byTime = useMemo(() => new Map(history.map((h) => [Math.floor(h.t / 1000), h])), [history]);

  useEffect(() => {
    if (!containerRef.current) return;
    const grid = alpha(css("--border-subtle") || "#212328", 0.6);
    const chart = createChart(containerRef.current, {
      layout: { background: { color: css("--surface-100") }, textColor: css("--ink-300"), fontFamily: css("--font-mono"), fontSize: 11 },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: 0, vertLine: { color: css("--border-strong"), labelBackgroundColor: css("--surface-200") }, horzLine: { color: css("--border-strong"), labelBackgroundColor: css("--surface-200") } },
      // entireTextOnly: no half-clipped tick label at the top edge.
      rightPriceScale: { mode: PriceScaleMode.Logarithmic, borderColor: css("--border-subtle"), entireTextOnly: true },
      timeScale: { timeVisible: false, borderColor: css("--border-subtle"), rightOffset: 4, minBarSpacing: 0.05 },
      localization: {
        priceFormatter: fmtPrice,
        timeFormatter: (time: UTCTimestamp) => fmtDate((time as number) * 1000),
      },
      autoSize: true,
    });
    chartRef.current = chart;
    stripRef.current = chart.addSeries(HistogramSeries, { priceScaleId: "regime", priceLineVisible: false, lastValueVisible: false });
    chart.priceScale("regime").applyOptions({ scaleMargins: { top: 0.965, bottom: 0 } });
    // §14.4.3 asks for 1.5px; the LineWidth type only lists integers but the canvas accepts it.
    priceRef.current = chart.addSeries(LineSeries, { lineWidth: 1.5 as 1, lastValueVisible: true, priceLineVisible: false, color: css("--ink-300") });
    markersRef.current = createSeriesMarkers(priceRef.current, []);
    return () => {
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      stripRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Data, strip and flip markers.
  useEffect(() => {
    const price = priceRef.current;
    const strip = stripRef.current;
    if (!price || !strip || !markersRef.current) return;
    const hex = Object.fromEntries(STATES.map((s) => [s, css(REGIME_VAR[s])])) as Record<RegimeState, string>;
    const none = css("--ink-300");
    const time = (t: number) => Math.floor(t / 1000) as UTCTimestamp;
    price.setData(history.map((h) => ({ time: time(h.t), value: h.price, color: h.state ? hex[h.state] : none })));
    strip.setData(history.map((h) => ({ time: time(h.t), value: 1, color: h.state ? alpha(hex[h.state], 0.85) : "rgba(0,0,0,0)" })));
    // Markers must sit on an existing bar: snap each flip to its UTC day. Every flip gets a dot;
    // only the last four carry numbers, matching the list under the chart (§14.9).
    const ink = css("--ink-200");
    const firstNumbered = flips.length - RECENT;
    markersRef.current.setMarkers(
      flips.map((f, i) => ({
        time: time(Math.floor(f.t / DAY) * DAY),
        position: isOff(f.to) ? ("aboveBar" as const) : ("belowBar" as const),
        shape: "circle" as const,
        color: ink,
        size: 1,
        text: i >= firstNumbered ? String(i + 1) : undefined,
      }))
    );
  }, [history, flips]);

  // Range preset → visible range.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || history.length === 0) return;
    const apply = () => {
      if (preset === "All" || asOf == null) chart.timeScale().fitContent();
      else {
        const to = Math.floor(asOf / 1000);
        chart.timeScale().setVisibleRange({ from: (to - (preset === "1Y" ? 1 : 4) * YEAR_S) as UTCTimestamp, to: to as UTCTimestamp });
      }
    };
    // Same autoSize/ResizeObserver race as HtfChart: defer to the next frame.
    const raf = requestAnimationFrame(apply);
    const el = containerRef.current;
    el?.addEventListener("dblclick", apply);
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener("dblclick", apply);
    };
  }, [preset, asOf, history]);

  // Key levels as dashed price lines.
  useEffect(() => {
    const price = priceRef.current;
    if (!price || !showLevels) return;
    const color = css("--ink-300");
    const lines: IPriceLine[] = levels
      .filter((l) => l.value != null)
      .map((l) =>
        price.createPriceLine({
          price: l.value as number,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: l.proxy ? `${l.label} ~` : l.label,
        })
      );
    return () => lines.forEach((pl) => price.removePriceLine(pl));
  }, [levels, showLevels]);

  // Tooltip.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: Parameters<Parameters<IChartApi["subscribeCrosshairMove"]>[0]>[0]) => {
      const h = param.time == null ? undefined : byTime.get(param.time as number);
      if (!h) return setTooltip(null);
      setTooltip({
        head: `${fmtDate(h.t)} · ${fmtPrice(h.price)} · `,
        state: h.state,
        tail: ` · risk ${fmtInt(h.riskOff == null ? null : h.riskOff * 100)} · mom ${fmtDeltaPts(h.momentum)}`,
      });
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [byTime]);

  const recent = flips.slice(-RECENT);
  const older = flips.slice(0, -RECENT);
  const olderTitle = older.map((f, i) => `${i + 1}. ${fmtDate(f.t)} ${word(f.from)} → ${word(f.to)} ${fmtPrice(f.price)}`).join("\n");
  const first = history[0];

  return (
    <section className="region vx-chart-region">
      <div className="region-header">
        <span>{TITLE}</span>
        <span className="vx-chart-controls">
          <span className="segmented" role="tablist" aria-label="Range">
            {PRESETS.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={preset === p}
                onClick={() => {
                  setPreset(p);
                  // Each preset change resets the levels toggle to that preset's default (on at 1Y only).
                  setShowLevels(p === "1Y");
                }}
              >
                {p}
              </button>
            ))}
          </span>
          <span className="segmented">
            <button aria-pressed={showLevels} onClick={() => setShowLevels((v) => !v)}>
              levels
            </button>
          </span>
        </span>
      </div>
      <div className="region-body vx-chart-body">
        <div
          ref={containerRef}
          className="vx-chart"
          role="img"
          aria-label={`Bitcoin daily log price coloured by Vector regime, ${fmtDate(first?.t)} to ${fmtDate(asOf)}`}
        />
        {tooltip && (
          <div className="chart-tooltip">
            {tooltip.head}
            <span style={{ color: tooltip.state ? REGIME_TOKEN[tooltip.state] : "var(--ink-300)" }}>
              {tooltip.state ? REGIME_WORD[tooltip.state] : "—"}
            </span>
            {tooltip.tail}
          </div>
        )}
        {history.length === 0 && <div className="chart-empty-overlay" style={{ inset: 0 }}>insufficient history</div>}
      </div>
      <div className="vx-chart-foot t-figure-sm">
        <span className="vx-legend">
          {STATES.map((s) => (
            <span key={s} className="item">
              <span className="swatch" style={{ background: REGIME_TOKEN[s] }} />
              {word(s)}
            </span>
          ))}
        </span>
        <span className="vx-flips" title={olderTitle || undefined}>
          {flips.length === 0
            ? "no regime flips in history"
            : recent.map((f, i) => {
                const n = flips.length - recent.length + i + 1;
                return (
                  <span key={f.t}>
                    {circled(n)} {fmtDate(f.t)} · <span className="vx-nw">{word(f.from)}</span> →{" "}
                    <span className="vx-nw">{word(f.to)}</span> · {fmtPrice(f.price)}
                  </span>
                );
              })}
        </span>
      </div>
    </section>
  );
}
