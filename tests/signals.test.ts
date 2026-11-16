import { describe, expect, it } from 'vitest';
import { analyzeHorizon, percentileAmong } from '@/lib/analyze';
import { LONG, MID, listTrades, readAll, readAt, runRule, strengthAt, zoneOf } from '@/lib/signals';
import type { Bar } from '@/lib/types';

const bars = (closes: number[]): Bar[] => closes.map((c, index) => ({ t: 10_000 + index * 7, c }));
const ramp = (from: number, to: number, steps: number) => Array.from({ length: steps }, (_, index) => from + ((to - from) * index) / (steps - 1));

describe('mid-term rule (10/40 weeks)', () => {
  it('has no opinion until 40 weeks exist', () => {
    const series = runRule(bars(ramp(100, 139, 40)), MID);
    expect(series.state.slice(0, 39).every((value) => value == null)).toBe(true);
    expect(series.state[39]).toBe(true);
  });
  it('turns out only when the close and the 10-week average are both under the 40-week average', () => {
    const closes = [...ramp(100, 200, 60), ...ramp(198, 100, 40)];
    const series = runRule(bars(closes), MID);
    const flip = series.state.findIndex((value, index) => index > 40 && value === false);
    expect(flip).toBeGreaterThan(60);
    expect(closes[flip]).toBeLessThan(series.slow[flip] as number);
    expect(series.fast[flip] as number).toBeLessThan(series.slow[flip] as number);
    // The bar before the flip was already under the slow line but the fast line had not crossed: still in.
    expect(series.state[flip - 1]).toBe(true);
    expect(closes[flip - 1]).toBeLessThan(series.slow[flip - 1] as number);
  });
  it('does not flip on a one-week dip under the slow line', () => {
    const closes = ramp(100, 180, 80);
    closes[70] = 120; // sharp one-week drop under the 40-week average
    const series = runRule(bars(closes), MID);
    expect(closes[70]).toBeLessThan(series.slow[70] as number);
    expect(series.state[70]).toBe(true);
    expect(zoneOf(readAt(series, 70, MID)!, 50, MID)).toBe('warn');
  });
});

describe('long-term rule (10-month average + 12-month return)', () => {
  it('needs both conditions to enter and both to leave', () => {
    const closes = [...ramp(100, 100, 13), ...ramp(102, 160, 20), ...ramp(155, 80, 14)];
    const monthly = closes.map((c, index) => ({ t: 10_000 + index * 30, c }));
    const series = runRule(monthly, LONG);
    expect(series.state[11]).toBeNull();
    expect(series.state[12]).toBe(false); // flat: 12-month return is not positive
    const enter = series.state.findIndex((value) => value === true);
    expect(series.momentum[enter] as number).toBeGreaterThan(0);
    expect(closes[enter]).toBeGreaterThan(series.slow[enter] as number);
    const leave = series.state.findIndex((value, index) => index > enter && value === false);
    expect(series.momentum[leave] as number).toBeLessThan(0);
    expect(closes[leave]).toBeLessThan(series.slow[leave] as number);
  });
});

describe('readings, zones and trades', () => {
  const closes = [...ramp(100, 60, 50), ...ramp(62, 150, 50), ...ramp(148, 70, 40)];
  const weekly = bars(closes);
  const series = runRule(weekly, MID);
  it('readAt agrees with readAll at every bar', () => {
    const all = readAll(series, MID);
    for (const index of [45, 60, 80, 99, 120, 139]) expect(readAt(series, index, MID)).toEqual(all[index]);
  });
  it('marks a flip as fresh for four bars and classifies zones', () => {
    const enter = series.state.findIndex((value, index) => index > 50 && value === true);
    expect(readAt(series, enter, MID)).toMatchObject({ inMarket: true, barsSinceFlip: 0, fresh: true });
    expect(readAt(series, enter + 4, MID)?.fresh).toBe(false);
    expect(zoneOf(readAt(series, enter + 10, MID)!, 90, MID)).toBe('lead');
    expect(zoneOf(readAt(series, enter + 10, MID)!, 79, MID)).toBe('hold');
    const leave = series.state.findIndex((value, index) => index > enter && value === false);
    expect(zoneOf(readAt(series, leave, MID)!, 5, MID)).toBe('exit');
    expect(zoneOf(readAt(series, leave + 6, MID)!, 5, MID)).toBe('avoid');
    expect(zoneOf({ inMarket: false, fresh: false, vsSlow: 2 }, 50, MID)).toBe('watch');
  });
  it('lists round trips and ignores a state that starts in', () => {
    const trades = listTrades(weekly, series.state);
    expect(trades).toHaveLength(1);
    expect(trades[0].open).toBe(false);
    expect(trades[0].returnPct).toBeCloseTo((trades[0].exitClose! / trades[0].entryClose - 1) * 100);
    const alwaysUp = bars(ramp(100, 300, 90));
    expect(listTrades(alwaysUp, runRule(alwaysUp, MID).state)).toHaveLength(0);
  });
  it('measures strength over the configured window', () => {
    const values = ramp(100, 200, 60);
    expect(strengthAt(values, 59, MID)).toBeCloseTo((values[59] / values[33] - 1) * 100);
    expect(strengthAt(values, 59, LONG)).toBeCloseTo((values[58] / values[47] - 1) * 100);
    expect(strengthAt(values, 10, MID)).toBeNull();
  });
});

describe('analyzeHorizon', () => {
  it('judges on completed bars and reports what the unfinished bar would change', () => {
    const closes = ramp(100, 200, 80);
    const withCrash = [...closes, 40];
    const done = analyzeHorizon(bars(closes), true, MID);
    expect(done.reading?.inMarket).toBe(true);
    expect(done.pending).toBeNull();
    const provisional = analyzeHorizon(bars(withCrash), false, MID);
    expect(provisional.bars).toHaveLength(80);
    expect(provisional.reading?.inMarket).toBe(true); // confirmed state unchanged
    expect(provisional.pending).toBeNull(); // one crash week does not pull the 10-week average under the 40-week one
    const longSlide = [...closes, ...ramp(190, 90, 30)];
    const sliding = analyzeHorizon(bars(longSlide), false, MID);
    const confirmedOnly = analyzeHorizon(bars(longSlide.slice(0, -1)), true, MID);
    expect(sliding.reading).toEqual(confirmedOnly.reading);
  });
  it('places a value among a sorted pool', () => {
    expect(percentileAmong(5, [1, 2, 3, 4])).toBe(100);
    expect(percentileAmong(0, [1, 2, 3, 4])).toBe(0);
    expect(percentileAmong(2, [1, 2, 3, 4])).toBe(37.5);
  });
});
