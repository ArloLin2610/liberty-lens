// Turns a symbol's stored history into what the chart draws for one rule:
// price and trend lines, the spans the rule was in the market, and its trades.

import { analyzeHorizon, type HorizonAnalysis } from './analyze';
import { specFor, type Horizon } from './signals';
import type { Bar, HistoryPayload } from './types';
import type { ChartBand, ChartMarker, ChartSeries } from '@/components/LineChart';

export interface ChartModel { analysis: HorizonAnalysis; series: ChartSeries[]; bands: ChartBand[]; markers: ChartMarker[] }

export function barsOf(history: HistoryPayload, horizon: Horizon): { bars: Bar[]; done: boolean } {
  const t = horizon === 'mid' ? history.wt : history.mt, c = horizon === 'mid' ? history.wc : history.mc;
  return { bars: t.map((day, index) => ({ t: day, c: c[index] })), done: horizon === 'mid' ? history.wDone : history.mDone };
}

/** @param years how many trailing years to show (null = everything) */
export function buildChartModel(history: HistoryPayload, horizon: Horizon, years: number | null): ChartModel {
  const { bars, done } = barsOf(history, horizon);
  const analysis = analyzeHorizon(bars, done, specFor(horizon));
  const { series: rule } = analysis;
  const confirmed = analysis.bars;
  const lastT = confirmed.length ? confirmed[confirmed.length - 1].t : 0;
  const cutoff = years == null ? -Infinity : lastT - Math.round(years * 365.25);
  const from = Math.max(0, confirmed.findIndex((bar) => bar.t >= cutoff));
  const t = confirmed.slice(from).map((bar) => bar.t);
  const series: ChartSeries[] = [{ name: '收盤（含息還原）', color: 'var(--c-ink)', t, v: rule.closes.slice(from), width: 2 }];
  if (horizon === 'mid') {
    series.push({ name: '10 週線', color: 'var(--c-1)', t, v: rule.fast.slice(from), width: 1.5 });
    series.push({ name: '40 週線', color: 'var(--c-2)', t, v: rule.slow.slice(from), width: 1.5 });
  } else series.push({ name: '10 月線', color: 'var(--c-2)', t, v: rule.slow.slice(from), width: 1.5 });

  const bands: ChartBand[] = [];
  let start: number | null = null;
  rule.state.forEach((state, index) => {
    if (state && start == null) start = confirmed[index].t;
    if (!state && start != null) { bands.push({ from: start, to: confirmed[index].t }); start = null; }
  });
  if (start != null) bands.push({ from: start, to: lastT });
  const markers: ChartMarker[] = [];
  for (const trade of analysis.trades) {
    markers.push({ t: trade.entryT, v: trade.entryClose, kind: 'in' });
    if (trade.exitT != null && trade.exitClose != null) markers.push({ t: trade.exitT, v: trade.exitClose, kind: 'out' });
  }
  return { analysis, series, bands: bands.filter((band) => band.to >= cutoff), markers: markers.filter((marker) => marker.t >= cutoff) };
}
