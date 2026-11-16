import { describe, expect, it } from 'vitest';
import { cagr, changeOver, dayToIso, isoToDay, isoWeekLabel, maxDrawdown, monthComplete, percentileRanks, sma, toMonthly, toWeekly, weekComplete, weekday, weekIndex } from '@/lib/series';

const day = isoToDay;

describe('calendar helpers', () => {
  it('round-trips ISO dates and knows weekdays', () => {
    expect(dayToIso(day('2026-11-13'))).toBe('2026-11-13');
    expect(weekday(day('2026-11-13'))).toBe(5); // Friday
    expect(weekday(day('2026-11-16'))).toBe(1); // Monday
  });
  it('keeps Monday to Sunday in one week and splits at Monday', () => {
    expect(weekIndex(day('2026-11-09'))).toBe(weekIndex(day('2026-11-15')));
    expect(weekIndex(day('2026-11-16'))).toBe(weekIndex(day('2026-11-15')) + 1);
    expect(isoWeekLabel(day('2026-11-13'))).toBe('2026-W46');
    expect(isoWeekLabel(day('2027-01-01'))).toBe('2026-W53');
  });
  it('decides when a week or month can no longer change', () => {
    expect(weekComplete(day('2026-11-13'), day('2026-11-13'))).toBe(true); // Friday close
    expect(weekComplete(day('2026-11-12'), day('2026-11-12'))).toBe(false); // Thursday
    expect(weekComplete(day('2026-11-12'), day('2026-11-16'))).toBe(true); // Friday was a holiday, now Monday
    expect(monthComplete(day('2026-10-30'), day('2026-10-30'))).toBe(true); // Oct 31 is a Saturday
    expect(monthComplete(day('2026-11-13'), day('2026-11-16'))).toBe(false);
    expect(monthComplete(day('2026-11-27'), day('2026-12-01'))).toBe(true);
  });
});

describe('aggregation and statistics', () => {
  it('takes the last close of each week and month', () => {
    const daily = ['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-06', '2026-11-09'].map((iso, index) => ({ t: day(iso), c: 100 + index }));
    expect(toWeekly(daily).map((bar) => bar.c)).toEqual([101, 103, 104]);
    expect(toMonthly(daily).map((bar) => bar.c)).toEqual([101, 104]);
  });
  it('computes moving averages, changes, drawdown and growth rate', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(changeOver([100, 110, 121], 2, 2)).toBeCloseTo(21);
    expect(changeOver([100, 110], 1, 5)).toBeNull();
    expect(maxDrawdown([100, 120, 60, 90, 130])).toBeCloseTo(-50);
    expect(cagr(100, 121, 2)).toBeCloseTo(10);
  });
  it('ranks percentiles with ties and gaps', () => {
    expect(percentileRanks([10, null, 30, 20])).toEqual([0, null, 100, 50]);
    expect(percentileRanks([5, 5, 5])).toEqual([50, 50, 50]);
  });
});
