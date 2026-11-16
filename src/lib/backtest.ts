// Two ways of checking the rules against history.
//
// 1. simulate(): follow one rule on one symbol. Invested while the state is
//    "in", otherwise in cash earning the T-bill yield. Compared with simply
//    holding the symbol over the same span.
// 2. Event study: at every bar, what did the next N bars return for symbols in
//    each zone, versus the equal-weight average of every symbol on that bar.
//
// Trades happen at the close that produced the signal (no slippage or costs),
// and the universe is today's index members, so absolute returns are flattered
// by survivorship. The comparison against "all symbols" shares that bias and is
// the fairer number.

import { cagr, maxDrawdown } from './series';
import { IN_ZONES, type Zone } from './signals';
import type { Bar } from './types';

export interface SimResult {
  fromT: number; toT: number; years: number;
  ruleCagr: number; holdCagr: number;
  /** Negative percents. */
  ruleMaxDd: number; holdMaxDd: number;
  /** Percent of bars spent invested. */
  timeIn: number;
  /** Completed round trips plus one if currently in after a recorded entry. */
  trades: number;
  /** Equity curves (start = 1), one value per bar from the first decided bar. */
  rule: number[]; hold: number[]; t: number[];
}

/**
 * @param cashYield annual percent yield earned while out of the market at day t (default 0)
 * @param barsPerYear 52 for weekly bars, 12 for monthly
 */
export function simulate(bars: Bar[], state: Array<boolean | null>, barsPerYear: number, cashYield: (t: number) => number = () => 0): SimResult | null {
  const start = state.findIndex((value) => value != null);
  if (start < 0 || bars.length - start < barsPerYear * 2) return null;
  const rule = [1], hold = [1], t = [bars[start].t];
  let inBars = 0, trades = 0;
  for (let index = start; index < bars.length - 1; index += 1) {
    const growth = bars[index + 1].c / bars[index].c;
    const invested = state[index] as boolean;
    if (invested) inBars += 1;
    if (invested && state[index - 1] === false) trades += 1;
    const cash = 1 + Math.max(0, cashYield(bars[index].t)) / 100 / barsPerYear;
    rule.push(rule[rule.length - 1] * (invested ? growth : cash));
    hold.push(hold[hold.length - 1] * growth);
    t.push(bars[index + 1].t);
  }
  const years = (bars[bars.length - 1].t - bars[start].t) / 365.25;
  return {
    fromT: bars[start].t, toT: bars[bars.length - 1].t, years,
    ruleCagr: cagr(1, rule[rule.length - 1], years) as number, holdCagr: cagr(1, hold[hold.length - 1], years) as number,
    ruleMaxDd: maxDrawdown(rule), holdMaxDd: maxDrawdown(hold),
    timeIn: (inBars / (bars.length - 1 - start)) * 100, trades, rule, hold, t,
  };
}

// ---------------------------------------------------------------------------
// Event study

export type StudyGroup = 'all' | 'in' | 'out' | Zone | 'freshIn' | 'leadRiskOn' | 'leadRiskOff';
export const STUDY_GROUPS: StudyGroup[] = ['all', 'in', 'out', 'lead', 'hold', 'warn', 'exit', 'watch', 'avoid', 'freshIn', 'leadRiskOn', 'leadRiskOff'];

/** Per-period sums for one group at one horizon: n samples, s sum of forward returns (%), w wins (> 0). */
export interface Cell { n: number; s: number; w: number }
/** periodKey -> group -> one cell per horizon. */
export type StudyAggregate = Map<number, Record<string, Cell[]>>;

export interface Sample { zone: Zone; freshIn: boolean; riskOn: boolean | null; forward: Array<number | null> }

export function addSample(aggregate: StudyAggregate, periodKey: number, sample: Sample): void {
  let period = aggregate.get(periodKey);
  if (!period) { period = {}; aggregate.set(periodKey, period); }
  const groups: StudyGroup[] = ['all', sample.zone, IN_ZONES.includes(sample.zone) ? 'in' : 'out'];
  if (sample.freshIn) groups.push('freshIn');
  if (sample.zone === 'lead' && sample.riskOn != null) groups.push(sample.riskOn ? 'leadRiskOn' : 'leadRiskOff');
  for (const group of groups) {
    const cells = period[group] ?? (period[group] = sample.forward.map(() => ({ n: 0, s: 0, w: 0 })));
    sample.forward.forEach((value, h) => {
      if (value == null) return;
      cells[h].n += 1; cells[h].s += value; if (value > 0) cells[h].w += 1;
    });
  }
}

export interface StudyStat {
  samples: number;
  average: number | null;
  winRate: number | null;
  /** Equal-weight average of every symbol over the same periods, weighted by this group's sample count. */
  benchmark: number | null;
  excess: number | null;
}

export function studyStat(aggregate: StudyAggregate, group: StudyGroup, h: number, keep: (periodKey: number) => boolean = () => true): StudyStat {
  let n = 0, s = 0, w = 0, benchmarkWeighted = 0;
  for (const [key, period] of aggregate) {
    if (!keep(key)) continue;
    const cell = period[group]?.[h], all = period.all?.[h];
    if (!cell?.n || !all?.n) continue;
    n += cell.n; s += cell.s; w += cell.w;
    benchmarkWeighted += (all.s / all.n) * cell.n;
  }
  const average = n ? s / n : null, benchmark = n ? benchmarkWeighted / n : null;
  return { samples: n, average, winRate: n ? (w / n) * 100 : null, benchmark, excess: average != null && benchmark != null ? average - benchmark : null };
}

export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
