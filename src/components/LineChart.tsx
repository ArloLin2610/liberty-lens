import { useEffect, useMemo, useRef, useState } from 'react';
import { dayToIso } from '@/lib/series';

export interface ChartSeries {
  name: string;
  /** CSS color (use the chart tokens: var(--c-ink), var(--c-1) ...). */
  color: string;
  t: number[];
  v: Array<number | null>;
  width?: number;
}
export interface ChartBand { from: number; to: number }
export interface ChartMarker { t: number; v: number; kind: 'in' | 'out' }

interface Props {
  series: ChartSeries[];
  /** Shaded spans (periods the rule was in the market). */
  bands?: ChartBand[];
  bandLabel?: string;
  markers?: ChartMarker[];
  log?: boolean;
  height?: number;
  format?: (value: number) => string;
  /** Fixed y domain, e.g. [0, 100] for percentages. */
  domain?: [number, number];
  /** Horizontal reference line. */
  reference?: { value: number; label: string };
  ariaLabel: string;
}

const niceTicks = (min: number, max: number, count: number): number[] => {
  const span = max - min || 1, raw = span / count, power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? power * 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(10)));
  return ticks;
};
const logTicks = (min: number, max: number): number[] => {
  const ticks: number[] = [];
  for (let power = Math.floor(Math.log10(min)); power <= Math.ceil(Math.log10(max)); power += 1) for (const m of [1, 2, 5]) { const v = m * 10 ** power; if (v >= min && v <= max) ticks.push(Number(v.toPrecision(6))); }
  return ticks.length > 8 ? ticks.filter((v) => /^1/.test(String(v).replace(/[0.]/g, '') || '1')) : ticks;
};

export function LineChart({ series, bands = [], bandLabel, markers = [], log = false, height = 300, format = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }), domain, reference, ariaLabel }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const pad = { l: 8, r: 58, t: 10, b: 24 };
    const ts = series.flatMap((s) => s.t), vs = series.flatMap((s) => s.v).filter((v): v is number => v != null && Number.isFinite(v) && (!log || v > 0));
    if (!ts.length || !vs.length) return null;
    const t0 = Math.min(...ts), t1 = Math.max(...ts);
    let lo = domain ? domain[0] : Math.min(...vs), hi = domain ? domain[1] : Math.max(...vs);
    if (!domain) { if (log) { lo *= 0.94; hi *= 1.06; } else { const margin = (hi - lo || Math.abs(hi) || 1) * 0.06; lo -= margin; hi += margin; } }
    const scale = (v: number) => (log ? Math.log(v) : v);
    const x = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (width - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (scale(v) - scale(lo)) / (scale(hi) - scale(lo) || 1)) * (height - pad.t - pad.b);
    const yTicks = (log ? logTicks(lo, hi) : niceTicks(lo, hi, 5)).filter((v) => v >= lo && v <= hi);
    const years: number[] = [];
    const firstYear = new Date(t0 * 86_400_000).getUTCFullYear() + 1, lastYear = new Date(t1 * 86_400_000).getUTCFullYear();
    const yearStep = Math.max(1, Math.ceil((lastYear - firstYear + 1) / Math.max(2, Math.floor(width / 70))));
    for (let year = lastYear; year >= firstYear; year -= yearStep) years.push(year);
    return { pad, t0, t1, x, y, yTicks, years };
  }, [series, width, height, log, domain]);

  if (!geometry) return <div ref={wrap} className="chart-empty">沒有可畫的資料</div>;
  const { pad, t0, t1, x, y, yTicks, years } = geometry;
  const path = (s: ChartSeries) => {
    let d = '', pen = false;
    s.t.forEach((t, i) => {
      const v = s.v[i];
      if (v == null || !Number.isFinite(v) || (log && v <= 0)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
    });
    return d;
  };
  const valueAt = (s: ChartSeries, t: number): number | null => {
    let lo = 0, hi = s.t.length - 1;
    if (!s.t.length || s.t[0] > t) return null;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s.t[mid] <= t) lo = mid; else hi = mid - 1; }
    return s.v[lo];
  };
  const primary = series[0];
  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const t = t0 + ((event.clientX - rect.left - pad.l) / (width - pad.l - pad.r)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < primary.t.length; i += 1) if (Math.abs(primary.t[i] - t) < Math.abs(primary.t[best] - t)) best = i;
    setHover(primary.t[best]);
  };
  const hoverX = hover == null ? null : x(hover);
  const yearDay = (year: number) => Date.UTC(year, 0, 1) / 86_400_000;

  return (
    <div ref={wrap} className="chart">
      {series.length > 1 || bandLabel ? (
        <div className="chart-legend">
          {series.length > 1 ? series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>) : null}
          {bandLabel ? <span><i className="band-swatch" />{bandLabel}</span> : null}
          {markers.length ? <><span><i className="mark-in" />進場</span><span><i className="mark-out" />出場</span></> : null}
        </div>
      ) : null}
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {bands.map((band, i) => <rect key={i} x={x(Math.max(band.from, t0))} y={pad.t} width={Math.max(0, x(Math.min(band.to, t1)) - x(Math.max(band.from, t0)))} height={height - pad.t - pad.b} className="chart-band" />)}
        {yTicks.map((v) => <g key={v}><line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className="chart-grid" /><text x={width - pad.r + 6} y={y(v) + 4} className="chart-tick">{format(v)}</text></g>)}
        {years.map((year) => <text key={year} x={x(yearDay(year))} y={height - 6} className="chart-tick" textAnchor="middle">{year}</text>)}
        {reference ? <g><line x1={pad.l} x2={width - pad.r} y1={y(reference.value)} y2={y(reference.value)} className="chart-ref" /><text x={pad.l + 4} y={y(reference.value) - 5} className="chart-tick">{reference.label}</text></g> : null}
        {[...series].reverse().map((s) => <path key={s.name} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeLinejoin="round" strokeLinecap="round" />)}
        {markers.filter((m) => m.t >= t0 && m.t <= t1).map((m, i) => (
          m.kind === 'in'
            ? <path key={i} d={`M${x(m.t)},${y(m.v) + 7} l-6,10 h12 z`} className="chart-mark-in" />
            : <path key={i} d={`M${x(m.t)},${y(m.v) - 7} l-6,-10 h12 z`} className="chart-mark-out" />
        ))}
        {hoverX != null ? <line x1={hoverX} x2={hoverX} y1={pad.t} y2={height - pad.b} className="chart-cross" /> : null}
        {hover != null ? series.map((s) => { const v = valueAt(s, hover); return v == null ? null : <circle key={s.name} cx={hoverX as number} cy={y(v)} r={4.5} fill={s.color} className="chart-dot" />; }) : null}
      </svg>
      {hover != null && hoverX != null ? (
        <div className="chart-tip" style={hoverX > width / 2 ? { right: width - hoverX + 12 } : { left: hoverX + 12 }}>
          <strong>{dayToIso(hover).replace(/-/g, '/')}</strong>
          {series.map((s) => { const v = valueAt(s, hover); return v == null ? null : <div key={s.name}><i style={{ background: s.color }} />{s.name}<b>{format(v)}</b></div>; })}
        </div>
      ) : null}
    </div>
  );
}
