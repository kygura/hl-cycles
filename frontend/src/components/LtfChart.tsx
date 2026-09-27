import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { LtfPoint, LtfState } from "../api";
import { fmtDate, fmtPrice, fmtApr, fmtBp, fmtCompactUsd, fmtScore, fmtPercentSigned } from "../format";

const STATE_COLOR: Record<LtfState, string> = {
  crowded_long: "#e66767",
  healthy_uptrend: "#199e70",
  short_squeeze_fuel: "#c98500",
  crowded_short: "#d55181",
  deleveraging: "#9085e9",
  downtrend: "#736aa8",
  neutral: "#9aa3ad",
  insufficient_data: "#5f6873",
};

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const PRICE_H = 300;
const FUNDING_H = 110;
const OI_H = 110;

export function LtfChart({
  data,
  interval,
  onIntervalChange,
  firstSnapshotAt,
}: {
  data: LtfPoint[];
  interval: "4h" | "1h";
  onIntervalChange: (i: "4h" | "1h") => void;
  firstSnapshotAt: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stripRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const fundingRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const oiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [noFunding, setNoFunding] = useState(false);
  const [noOi, setNoOi] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: css("--surface-1") }, textColor: css("--text-3"), fontFamily: css("--font-mono"), fontSize: 11 },
      grid: { vertLines: { color: alpha(css("--line") || "#22262d", 0.6) }, horzLines: { color: alpha(css("--line") || "#22262d", 0.6) } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: css("--line") },
      timeScale: { timeVisible: true, borderColor: css("--line"), rightOffset: 4 },
      autoSize: true,
    });
    chartRef.current = chart;

    candleRef.current = chart.addSeries(
      CandlestickSeries,
      { upColor: css("--up"), downColor: css("--down"), wickUpColor: css("--up"), wickDownColor: css("--down"), borderVisible: false },
      0
    );
    emaRef.current = chart.addSeries(LineSeries, { color: css("--text-2"), lineWidth: 1, lastValueVisible: false, crosshairMarkerVisible: false }, 0);
    stripRef.current = chart.addSeries(HistogramSeries, { priceScaleId: "state-strip", priceLineVisible: false, lastValueVisible: false }, 0);
    chart.priceScale("state-strip").applyOptions({ scaleMargins: { top: 0.97, bottom: 0 } });

    fundingRef.current = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 1);
    fundingRef.current.createPriceLine({ price: 0, color: css("--line-strong"), lineWidth: 1, lineStyle: 0, axisLabelVisible: false, title: "" });

    oiRef.current = chart.addSeries(LineSeries, { color: css("--text-1"), lineWidth: 1, lastValueVisible: false, crosshairMarkerVisible: false }, 2);

    chart.panes()[0]?.setStretchFactor(PRICE_H);
    chart.panes()[1]?.setStretchFactor(FUNDING_H);
    chart.panes()[2]?.setStretchFactor(OI_H);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      emaRef.current = null;
      stripRef.current = null;
      fundingRef.current = null;
      oiRef.current = null;
    };
  }, []);

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
      setTooltip(
        `${fmtDate(d.t)} ${new Date(d.t).toISOString().slice(11, 16)} · O ${fmtPrice(d.o)} H ${fmtPrice(d.h)} L ${fmtPrice(d.l)} C ${fmtPrice(
          d.c
        )} · ema50 ${fmtPrice(d.ema50)} · RSI ${d.rsi14 == null ? "—" : d.rsi14.toFixed(1)} · funding ${fmtApr(
          d.fundingApr
        )} · premium ${fmtBp(d.premium)} · OI ${fmtCompactUsd(d.oiUsd)} (${fmtPercentSigned(d.oiChange24h)} 24h) · lev ${fmtScore(
          d.leverage
        )} mom ${fmtScore(d.momentum)} · ${d.state}`
      );
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [data]);

  useEffect(() => {
    const candleSeries = candleRef.current;
    const emaSeries = emaRef.current;
    const stripSeries = stripRef.current;
    const fundingSeries = fundingRef.current;
    const oiSeries = oiRef.current;
    const chart = chartRef.current;
    if (!chart || !candleSeries || !emaSeries || !stripSeries || !fundingSeries || !oiSeries) return;

    candleSeries.setData(data.map((d) => ({ time: (d.t / 1000) as UTCTimestamp, open: d.o, high: d.h, low: d.l, close: d.c })));
    emaSeries.setData(data.filter((d) => d.ema50 != null).map((d) => ({ time: (d.t / 1000) as UTCTimestamp, value: d.ema50 as number })));
    stripSeries.setData(data.map((d) => ({ time: (d.t / 1000) as UTCTimestamp, value: 1, color: alpha(STATE_COLOR[d.state], 0.7) })));

    const allFundingNull = data.every((d) => d.fundingApr == null);
    setNoFunding(allFundingNull);
    fundingSeries.setData(
      data.map((d) => ({
        time: (d.t / 1000) as UTCTimestamp,
        value: d.fundingApr ?? 0,
        color: (d.fundingApr ?? 0) >= 0 ? alpha(css("--up") || "#199e70", 0.6) : alpha(css("--down") || "#e66767", 0.6),
      }))
    );

    const allOiNull = data.every((d) => d.oiUsd == null);
    setNoOi(allOiNull);
    oiSeries.setData(
      data.map((d) => (d.oiUsd == null ? { time: (d.t / 1000) as UTCTimestamp } : { time: (d.t / 1000) as UTCTimestamp, value: d.oiUsd }))
    );

    chart.timeScale().fitContent();
  }, [data]);

  return (
    <section className="region">
      <div className="region-header">
        <span>
          LtfChart &nbsp; BTC-PERP · Hyperliquid · {interval}
          <span className="segmented" style={{ marginLeft: 8, display: "inline-flex" }}>
            {(["4h", "1h"] as const).map((i) => (
              <button key={i} role="tab" aria-selected={interval === i} onClick={() => onIntervalChange(i)}>
                {i}
              </button>
            ))}
          </span>
        </span>
      </div>
      <div className="region-body ltf-chart-container" style={{ padding: 0, position: "relative" }}>
        <div ref={containerRef} style={{ height: PRICE_H + FUNDING_H + OI_H, width: "100%" }} aria-label="LTF price, funding, and open interest chart" role="img" />
        {tooltip && <div className="chart-tooltip">{tooltip}</div>}
        <div className="chart-pane-label" style={{ top: PRICE_H + 4, left: 8 }}>
          funding APR
        </div>
        <div className="chart-pane-label" style={{ top: PRICE_H + FUNDING_H + 4, left: 8 }}>
          open interest
        </div>
        {noFunding && (
          <div className="chart-empty-overlay" style={{ top: PRICE_H, left: 0, right: 0, height: FUNDING_H }}>
            no funding data
          </div>
        )}
        {noOi && (
          <div className="chart-empty-overlay" style={{ top: PRICE_H + FUNDING_H, left: 0, right: 0, height: OI_H }}>
            {firstSnapshotAt ? `collecting OI snapshots since ${fmtDate(firstSnapshotAt)}` : "collecting OI snapshots — no snapshot yet"}
          </div>
        )}
      </div>
    </section>
  );
}
