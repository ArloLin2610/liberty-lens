// Per-symbol analysis shared by the data pipeline and the stock page, so the
// chart on the site replays exactly what the pipeline decided.

import { listTrades, readAt, runRule, strengthAt, type Reading, type RuleSeries, type RuleSpec, type Trade } from './signals';
import type { Bar } from './types';

export interface HorizonAnalysis {
  /** Completed bars only. */
  bars: Bar[];
  series: RuleSeries;
  reading: Reading | null;
  strength: number | null;
  /** State change the unfinished bar would cause if it closed at the latest price. */
  pending: 'in' | 'out' | null;
  trades: Trade[];
}

/**
 * @param bars period bars, the last of which may be unfinished
 * @param done whether the last bar is complete
 */
export function analyzeHorizon(bars: Bar[], done: boolean, spec: RuleSpec): HorizonAnalysis {
  const confirmed = done ? bars : bars.slice(0, -1);
  const series = runRule(confirmed, spec);
  const last = confirmed.length - 1;
  const reading = last >= 0 ? readAt(series, last, spec) : null;
  let pending: 'in' | 'out' | null = null;
  if (!done && reading) {
    const provisional = runRule(bars, spec).state[bars.length - 1];
    if (provisional != null && provisional !== reading.inMarket) pending = provisional ? 'in' : 'out';
  }
  return { bars: confirmed, series, reading, strength: last >= 0 ? strengthAt(series.closes, last, spec) : null, pending, trades: listTrades(confirmed, series.state) };
}

/** Share (0-100) of `sorted` values that are below `value`; `sorted` must be ascending. */
export function percentileAmong(value: number, sorted: number[]): number {
  if (!sorted.length) return 50;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < value) lo = mid + 1; else hi = mid; }
  let upper = lo;
  while (upper < sorted.length && sorted[upper] === value) upper += 1;
  return ((lo + upper) / 2 / sorted.length) * 100;
}
