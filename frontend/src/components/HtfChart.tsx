import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { HtfPhase, HtfPoint } from "../api";
import { fmtDate, fmtPrice, fmtUnsigned2, fmtPercentSigned, fmtScore } from "../format";
import { PHASE_TOKEN, PHASE_VAR } from "../tokens";

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function css(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

export function HtfChart({
  data,
  halvings,
  interval,
  onIntervalChange,
}: {
  data: HtfPoint[];
  halvings: number[];
  interval: "1d" | "1w";
  onIntervalChange: (i: "1d" | "1w") => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const bandRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: css("--surface-1") }, textColor: css("--text-3"), fontFamily: css("--font-mono"), fontSize: 11 },
      grid: {
        vertLines: { color: alpha(css("--line") || "#22262d", 0.6) },
        horzLines: { color: alpha(css("--line") || "#22262d", 0.6) },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { mode: 1, borderColor: css("--line") },
      // minBarSpacing default (0.5px) blocks fitContent() from showing full
      // history once there are more daily bars than px available (5000+ bars
      // since 2011 vs. ~1400px container) — it clamps to whatever fits at
      // 0.5px/bar instead of compressing further. Full history (DESIGN §6.4)
      // needs bars allowed to compress well below that.
      timeScale: { timeVisible: false, borderColor: css("--line"), rightOffset: 4, minBarSpacing: 0.05 },
      localization: {
        priceFormatter: fmtPrice,
        timeFormatter: (time: UTCTimestamp) => fmtDate((time as number) * 1000),
      },
      autoSize: true,
    });
    chartRef.current = chart;

    bandRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: "phase",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("phase").applyOptions({ scaleMargins: { top: 0, bottom: 0 } });

    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: css("--up"),
      downColor: css("--down"),
      wickUpColor: css("--up"),
      wickDownColor: css("--down"),
      borderVisible: false,
    });

    smaRef.current = chart.addSeries(LineSeries, {
      color: css("--text-2"),
      lineWidth: 1,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      bandRef.current = null;
      smaRef.current = null;
    };
  }, []);

  // Crosshair tooltip; rebound whenever data changes so lookups see current points.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: Parameters<Parameters<IChartApi["subscribeCrosshairMove"]>[0]>[0]) => {
      if (!param.time) {
        setTooltip(null);
        return;
      }
      const timeSec = param.time as number;
      const d = data.find((c) => Math.floor(c.t / 1000) === timeSec);
      if (!d) {
        setTooltip(null);
        return;
      }
      const phaseWord = d.phase ? d.phase.toUpperCase() : "—";
      setTooltip(
        `${fmtDate(d.t)} · O ${fmtPrice(d.o)} H ${fmtPrice(d.h)} L ${fmtPrice(d.l)} C ${fmtPrice(d.c)} · SMA200 ${fmtPrice(
          d.sma200
        )} · Mayer ${fmtUnsigned2(d.mayer)} · DD ${fmtPercentSigned(d.drawdown)} · trend ${fmtScore(d.trend)} heat ${fmtScore(
          d.heat
        )} · ${phaseWord} · src ${d.src}`
      );
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [data]);

  useEffect(() => {
    const candleSeries = candleRef.current;
    const bandSeries = bandRef.current;
    const smaSeries = smaRef.current;
    const chart = chartRef.current;
    if (!chart || !candleSeries || !bandSeries || !smaSeries) return;

    candleSeries.setData(data.map((d) => ({ time: (d.t / 1000) as UTCTimestamp, open: d.o, high: d.h, low: d.l, close: d.c })));

    bandSeries.setData(
      data.map((d) => ({
        time: (d.t / 1000) as UTCTimestamp,
        value: 1,
        color: d.phase ? alpha(css(PHASE_VAR[d.phase]), 0.14) : "rgba(0,0,0,0)",
      }))
    );

    smaSeries.setData(data.filter((d) => d.sma200 != null).map((d) => ({ time: (d.t / 1000) as UTCTimestamp, value: d.sma200 as number })));

    if (halvings.length) {
      createSeriesMarkers(
        candleSeries,
        halvings
          .filter((h) => h >= (data[0]?.t ?? 0) && h <= (data[data.length - 1]?.t ?? Infinity))
          .map((h) => ({
            time: (Math.floor(h / 86_400_000) * 86_400) as UTCTimestamp,
            position: "belowBar" as const,
            shape: "arrowUp" as const,
            color: css("--text-2"),
            text: `halving ${new Date(h).getUTCFullYear()}`,
          }))
      );
    }

    // autoSize measures the container width via ResizeObserver, which fires
    // asynchronously — fitContent() here (same tick as setData) can run before
    // that first measurement, computing the visible range against a 0-width
    // chart. Defer one frame so the real width is in place (DESIGN §6.4: full
    // history on initial load).
    const raf = requestAnimationFrame(() => chart.timeScale().fitContent());
    return () => cancelAnimationFrame(raf);
  }, [data, halvings]);

  return (
    <section className="region">
      <div className="region-header">
        <span>
          BTC/USD daily · log
          <span className="segmented" style={{ marginLeft: 8, display: "inline-flex" }}>
            {(["1d", "1w"] as const).map((i) => (
              <button key={i} role="tab" aria-selected={interval === i} onClick={() => onIntervalChange(i)}>
                {i}
              </button>
            ))}
          </span>
        </span>
        <span className="chart-legend">
          {(Object.keys(PHASE_TOKEN) as HtfPhase[]).map((p) => (
            <span className="item" key={p}>
              <span className="swatch" style={{ background: PHASE_TOKEN[p] }} />
              {p}
            </span>
          ))}
        </span>
      </div>
      <div className="region-body htf-chart-container" style={{ padding: 0 }}>
        <div ref={containerRef} style={{ height: 480, width: "100%" }} aria-label="HTF daily candlestick chart with phase bands" role="img" />
        {tooltip && <div className="chart-tooltip">{tooltip}</div>}
      </div>
    </section>
  );
}
