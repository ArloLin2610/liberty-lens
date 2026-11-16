// The two timing rules. Both are trend rules with hysteresis: getting in and
// getting out each need two conditions to agree, so one noisy close does not
// flip the state. Everything is computed on completed period closes of the
// dividend-adjusted series, so the rules can be replayed on history exactly.
//
//   Mid-term (weekly bars, holds of months)
//     in  when close > 40-week average AND 10-week average > 40-week average
//     out when close < 40-week average AND 10-week average < 40-week average
//   Long-term (monthly bars, holds of a year or more)
//     in  when close > 10-month average AND 12-month return > 0
//     out when close < 10-month average AND 12-month return < 0
//
// The trend parameters are the textbook ones (10/40 weeks is the 50/200-day
// pair, the 10-month average is Faber's, the 12-month return is absolute
// momentum) and were fixed before looking at results. The "leader" filter
// (top 20% by trailing return) was added after the first backtest showed that
// buying near the trend line did worse than buying strength; treat its
// backtest numbers as in-sample.

import { changeOver, sma } from './series';
import type { Bar } from './types';

export type Horizon = 'mid' | 'long';

export interface RuleSpec {
  horizon: Horizon;
  /** Bars after a flip during which it still counts as a fresh signal. */
  freshBars: number;
  /** Bars of trailing return used as the strength measure (26 weeks / 12 months). */
  strengthBars: number;
  /** Most recent bars skipped by the strength measure (0 weeks / 1 month). */
  strengthSkip: number;
  /** Strength percentile at or above which an in-trend symbol is a leader. */
  leadPct: number;
  barsPerYear: number;
  /** Forward horizons (in bars) used by the event study. */
  studyBars: [number, number, number];
}

export const MID: RuleSpec = { horizon: 'mid', freshBars: 4, strengthBars: 26, strengthSkip: 0, leadPct: 80, barsPerYear: 52, studyBars: [13, 26, 52] };
export const LONG: RuleSpec = { horizon: 'long', freshBars: 3, strengthBars: 12, strengthSkip: 1, leadPct: 80, barsPerYear: 12, studyBars: [12, 36, 60] };
export const specFor = (horizon: Horizon): RuleSpec => (horizon === 'mid' ? MID : LONG);
/** Bump when a rule, a parameter, or a list definition changes: the forward test only counts the current version. */
export const RULES_VERSION = 1;

export interface RuleSeries {
  closes: number[];
  /** Mid: 10-week average. Long: 10-month average. */
  fast: Array<number | null>;
  /** Mid: 40-week average. Long: the same 10-month average (the single trend line). */
  slow: Array<number | null>;
  /** Long only: 12-month percent return. */
  momentum: Array<number | null>;
  /** null until the rule has enough history, then true = in the market. */
  state: Array<boolean | null>;
}

export function runRule(bars: Bar[], spec: RuleSpec): RuleSeries {
  const closes = bars.map((bar) => bar.c);
  const state: Array<boolean | null> = new Array(closes.length).fill(null);
  const mid = spec.horizon === 'mid';
  const fast = sma(closes, 10), slow = mid ? sma(closes, 40) : fast;
  const momentum = closes.map((_, index) => (mid ? null : changeOver(closes, index, 12)));
  let current: boolean | null = null;
  for (let index = 0; index < closes.length; index += 1) {
    const f = fast[index], s = slow[index], m = momentum[index];
    if (f == null || s == null || (!mid && m == null)) continue;
    const up = mid ? closes[index] > s && f > s : closes[index] > s && (m as number) > 0;
    const down = mid ? closes[index] < s && f < s : closes[index] < s && (m as number) < 0;
    if (current == null) current = up; else if (!current && up) current = true; else if (current && down) current = false;
    state[index] = current;
  }
  return { closes, fast, slow, momentum, state };
}

/** Trailing percent return used to rank symbols against each other. */
export const strengthAt = (closes: number[], index: number, spec: RuleSpec): number | null => {
  const end = index - spec.strengthSkip, start = index - spec.strengthBars;
  return start >= 0 && closes[start] > 0 ? (closes[end] / closes[start] - 1) * 100 : null;
};

/**
 * What the rule says now:
 *   lead   in an uptrend and among the strongest 20%: entry candidate
 *   hold   in an uptrend: keep holding, not a first-choice new entry
 *   warn   still in, but the close has slipped under the trend line (exit not yet confirmed)
 *   exit   the trend just turned down: exit / reduce
 *   watch  out, but the close is back above the trend line (entry not yet confirmed)
 *   avoid  out
 */
export type Zone = 'lead' | 'hold' | 'warn' | 'exit' | 'watch' | 'avoid';
export const IN_ZONES: Zone[] = ['lead', 'hold', 'warn'];

export interface Reading {
  inMarket: boolean;
  /** Bars since the state last flipped (0 = flipped on this bar); null if it never flipped in the data. */
  barsSinceFlip: number | null;
  flipIndex: number | null;
  /** True while a flip is recent enough to act on. */
  fresh: boolean;
  close: number;
  fast: number | null;
  slow: number | null;
  /** Percent distance of the close from the fast / slow line. */
  vsFast: number | null;
  vsSlow: number | null;
  momentum: number | null;
}

const reading = (series: RuleSeries, index: number, flipIndex: number | null, spec: RuleSpec): Reading | null => {
  const inMarket = series.state[index];
  if (inMarket == null) return null;
  const close = series.closes[index], fast = series.fast[index], slow = series.slow[index];
  const barsSinceFlip = flipIndex == null ? null : index - flipIndex;
  return {
    inMarket, barsSinceFlip, flipIndex, fresh: barsSinceFlip != null && barsSinceFlip < spec.freshBars,
    close, fast, slow, vsFast: fast ? (close / fast - 1) * 100 : null, vsSlow: slow ? (close / slow - 1) * 100 : null, momentum: series.momentum[index],
  };
};

/** The reading at every bar (null during warmup). */
export function readAll(series: RuleSeries, spec: RuleSpec): Array<Reading | null> {
  let flipIndex: number | null = null;
  return series.state.map((now, index) => {
    if (now == null) return null;
    const before = index > 0 ? series.state[index - 1] : null;
    if (before != null && before !== now) flipIndex = index;
    return reading(series, index, flipIndex, spec);
  });
}

export function readAt(series: RuleSeries, index: number, spec: RuleSpec): Reading | null {
  const inMarket = series.state[index];
  if (inMarket == null) return null;
  let flipIndex: number | null = null;
  for (let i = index; i > 0; i -= 1) {
    if (series.state[i - 1] == null) break;
    if (series.state[i - 1] !== inMarket) { flipIndex = i; break; }
  }
  return reading(series, index, flipIndex, spec);
}

/** Zone from a reading and the symbol's strength percentile among all symbols on the same bar. */
export function zoneOf(r: Pick<Reading, 'inMarket' | 'fresh' | 'vsSlow'>, strengthPct: number | null, spec: RuleSpec): Zone {
  if (r.inMarket) {
    if (r.vsSlow != null && r.vsSlow < 0) return 'warn';
    return strengthPct != null && strengthPct >= spec.leadPct ? 'lead' : 'hold';
  }
  if (r.fresh) return 'exit';
  return r.vsSlow != null && r.vsSlow > 0 ? 'watch' : 'avoid';
}

export interface Trade {
  /** Bar index and day of the entry (the close at which the state turned in). */
  entryIndex: number; entryT: number; entryClose: number;
  exitIndex: number | null; exitT: number | null; exitClose: number | null;
  /** Percent return; for an open trade, to the last close. */
  returnPct: number;
  bars: number;
  open: boolean;
}

/** Round trips implied by the state series (enter at the close that turns the state in, leave at the close that turns it out). */
export function listTrades(bars: Bar[], state: Array<boolean | null>): Trade[] {
  const trades: Trade[] = [];
  let entry: number | null = null;
  for (let index = 0; index < bars.length; index += 1) {
    const now = state[index];
    if (now == null) continue;
    const before = index > 0 ? state[index - 1] : null;
    if (now && before === false) entry = index; // a state that starts "in" at warmup is not a trade: its entry point is unknown
    if (!now) {
      if (before === true && entry != null) {
        trades.push({ entryIndex: entry, entryT: bars[entry].t, entryClose: bars[entry].c, exitIndex: index, exitT: bars[index].t, exitClose: bars[index].c, returnPct: (bars[index].c / bars[entry].c - 1) * 100, bars: index - entry, open: false });
      }
      entry = null;
    }
  }
  if (entry != null) {
    const last = bars.length - 1;
    trades.push({ entryIndex: entry, entryT: bars[entry].t, entryClose: bars[entry].c, exitIndex: null, exitT: null, exitClose: null, returnPct: (bars[last].c / bars[entry].c - 1) * 100, bars: last - entry, open: true });
  }
  return trades;
}
