import { describe, expect, it } from 'vitest';
import { addSample, median, simulate, studyStat, type StudyAggregate } from '@/lib/backtest';
import { buildSnapshot, exitList, leadList, returnSince, scoreSnapshot } from '@/lib/forward';
import type { Bar, HorizonView, SymbolRow } from '@/lib/types';

const bars = (closes: number[], step = 7): Bar[] => closes.map((c, index) => ({ t: 10_000 + index * step, c }));

describe('simulate', () => {
  it('earns the symbol while in and the cash yield while out', () => {
    const closes = Array.from({ length: 105 }, (_, index) => (index < 52 ? 100 * 1.01 ** index : 100 * 1.01 ** 52 * 0.99 ** (index - 52)));
    const state = closes.map((_, index) => index < 52);
    const result = simulate(bars(closes), state, 52, () => 5.2)!;
    expect(result.hold[result.hold.length - 1]).toBeCloseTo(closes[104] / closes[0]);
    // In for the first 52 steps, then cash at 5.2%/yr = 0.1% a week for the remaining 52.
    expect(result.rule[result.rule.length - 1]).toBeCloseTo(1.01 ** 52 * 1.001 ** 52, 6);
    expect(result.timeIn).toBeCloseTo(50);
    expect(result.ruleMaxDd).toBeCloseTo(0);
    expect(result.holdMaxDd).toBeLessThan(-40);
    expect(result.trades).toBe(0); // started in: entry point unknown, not counted
  });
  it('counts entries after an out period and refuses short histories', () => {
    const closes = Array.from({ length: 120 }, (_, index) => 100 + index);
    const state = closes.map((_, index) => (index < 10 ? null : index >= 30 && index < 60) || index >= 90);
    const result = simulate(bars(closes), state as Array<boolean | null>, 52)!;
    expect(result.trades).toBe(2);
    expect(simulate(bars(closes.slice(0, 50)), state.slice(0, 50) as Array<boolean | null>, 52)).toBeNull();
  });
});

describe('event study', () => {
  it('reports excess over the same-period average of all symbols', () => {
    const aggregate: StudyAggregate = new Map();
    addSample(aggregate, 1, { zone: 'lead', freshIn: true, riskOn: true, forward: [10, null] });
    addSample(aggregate, 1, { zone: 'avoid', freshIn: false, riskOn: true, forward: [-2, 4] });
    addSample(aggregate, 2, { zone: 'lead', freshIn: false, riskOn: false, forward: [-6, 2] });
    addSample(aggregate, 2, { zone: 'hold', freshIn: false, riskOn: false, forward: [0, 2] });
    const lead = studyStat(aggregate, 'lead', 0);
    expect(lead.samples).toBe(2);
    expect(lead.average).toBeCloseTo(2);
    expect(lead.benchmark).toBeCloseTo((4 + -3) / 2); // period 1 all-average 4, period 2 all-average -3
    expect(lead.excess).toBeCloseTo(1.5);
    expect(lead.winRate).toBe(50);
    expect(studyStat(aggregate, 'leadRiskOn', 0).average).toBe(10);
    expect(studyStat(aggregate, 'leadRiskOff', 0).average).toBe(-6);
    expect(studyStat(aggregate, 'in', 0).samples).toBe(3);
    expect(studyStat(aggregate, 'freshIn', 0).samples).toBe(1);
    expect(studyStat(aggregate, 'lead', 1).samples).toBe(1); // null forward return skipped
    expect(studyStat(aggregate, 'lead', 0, (key) => key === 2).average).toBe(-6);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
  });
});

describe('forward test', () => {
  const view = (patch: Partial<HorizonView>): HorizonView => ({ in: true, zone: 'hold', fresh: false, sinceT: 100, sinceRet: 0, vsFast: 0, vsSlow: 5, line: 1, strength: 0, strengthPct: 50, pending: null, sim: null, ...patch });
  const row = (ticker: string, mid: Partial<HorizonView>, kind: 'stock' | 'etf' = 'stock'): SymbolRow => ({
    ticker, name: ticker, kind, sector: 's', industry: 'i', indexes: [], price: 1, asOf: 0, r1w: 0, r4w: 0, r13w: 0, r26w: 0, r52w: 0, cagr3y: 0, cagr5y: 0, fromHigh: 0, dd5y: 0, vol: 0, mid: view(mid), long: null,
  });
  const rows = [
    row('AAA', { zone: 'lead', strengthPct: 90 }), row('BBB', { zone: 'lead', strengthPct: 99 }), row('ETF', { zone: 'lead', strengthPct: 100 }, 'etf'),
    row('CCC', { zone: 'warn', in: true, vsSlow: -8 }), row('DDD', { zone: 'exit', in: false, sinceT: 200 }), row('EEE', { zone: 'exit', in: false, sinceT: 300 }), row('FFF', { zone: 'warn', vsSlow: -2 }),
  ];
  it('builds stock-only lists in a stable order', () => {
    expect(leadList(rows, 'mid').map((item) => item.ticker)).toEqual(['BBB', 'AAA']);
    expect(exitList(rows, 'mid').map((item) => item.ticker)).toEqual(['EEE', 'DDD', 'CCC', 'FFF']);
    expect(leadList(rows, 'long')).toEqual([]);
    const snapshot = buildSnapshot(rows, '2026-W46', '2026-11-13', 3);
    expect(snapshot.lists.midLead).toEqual(['BBB', 'AAA']);
    expect(snapshot.universe).toBe(6);
  });
  it('scores a snapshot from the close on or before the signal date', () => {
    const history: Record<string, Bar[]> = { AAA: bars([100, 100, 110], 1), BBB: bars([50, 50, 60], 1), SPY: bars([10, 10, 10.5], 1), NEW: [{ t: 10_002, c: 5 }] };
    expect(returnSince(history.AAA, 10_001)).toBeCloseTo(10);
    expect(returnSince(history.NEW, 10_001)).toBeNull();
    const snapshot = buildSnapshot(rows, '2026-W46', '1997-05-20', 3);
    const scored = scoreSnapshot(snapshot, 10_001, 10_015, (ticker) => history[ticker], ['AAA', 'BBB', 'NEW']);
    expect(scored.lists.midLead.n).toBe(2);
    expect(scored.lists.midLead.ret).toBeCloseTo(15);
    expect(scored.lists.midExit).toEqual({ n: 0, ret: null });
    expect(scored.spy).toBeCloseTo(5);
    expect(scored.all).toBeCloseTo(15);
    expect(scored.weeksElapsed).toBe(2);
  });
});
