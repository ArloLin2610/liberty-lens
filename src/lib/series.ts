// Calendar helpers and period aggregation. Days are UTC day numbers since
// 1970-01-01 (a Thursday); every series is sorted ascending.

import type { Bar } from './types';

export const dayToIso = (t: number): string => new Date(t * 86_400_000).toISOString().slice(0, 10);
export const isoToDay = (iso: string): number => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);
/** 0 = Sunday ... 6 = Saturday. */
export const weekday = (t: number): number => (((t + 4) % 7) + 7) % 7;
/** Monday-based week number: all days of one Mon-Sun week share it. */
export const weekIndex = (t: number): number => Math.floor((t + 3) / 7);
/** Month number (year * 12 + month). */
export const monthIndex = (t: number): number => { const d = new Date(t * 86_400_000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };

/** ISO week label such as 2026-W47 for the week containing day t. */
export function isoWeekLabel(t: number): string {
  const date = new Date(t * 86_400_000);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const lastPer = (bars: Bar[], key: (t: number) => number): Bar[] => {
  const out: Bar[] = [];
  let current = Number.NaN;
  for (const bar of bars) {
    const k = key(bar.t);
    if (k === current) out[out.length - 1] = bar; else { out.push(bar); current = k; }
  }
  return out;
};
/** Last close of each Monday-Sunday week. */
export const toWeekly = (daily: Bar[]): Bar[] => lastPer(daily, weekIndex);
/** Last close of each calendar month. */
export const toMonthly = (daily: Bar[]): Bar[] => lastPer(daily, monthIndex);

/** True when the week containing `lastT` can no longer change, given today's date `asOf`. */
export const weekComplete = (lastT: number, asOf: number): boolean => weekday(lastT) === 5 || weekIndex(asOf) > weekIndex(lastT);
/** True when no weekday remains in the month after `lastT`, or `asOf` is already in a later month. */
export function monthComplete(lastT: number, asOf: number): boolean {
  if (monthIndex(asOf) > monthIndex(lastT)) return true;
  for (let t = lastT + 1; monthIndex(t) === monthIndex(lastT); t += 1) { const w = weekday(t); if (w >= 1 && w <= 5) return false; }
  return true;
}

/** Simple moving average aligned to each index; null until `period` values exist. */
export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index + 1 >= period) out[index] = sum / period;
  }
  return out;
}

/** Percent change from `lag` bars earlier; null when there is not enough history. */
export const changeOver = (values: number[], index: number, lag: number): number | null =>
  index - lag >= 0 && values[index - lag] > 0 ? (values[index] / values[index - lag] - 1) * 100 : null;

/** Worst peak-to-trough decline (percent, negative or zero) over values[from..to]. */
export function maxDrawdown(values: number[], from = 0, to = values.length - 1): number {
  let peak = -Infinity, worst = 0;
  for (let index = Math.max(0, from); index <= to; index += 1) {
    peak = Math.max(peak, values[index]);
    worst = Math.min(worst, (values[index] / peak - 1) * 100);
  }
  return worst;
}

/** Annualized growth rate in percent from a start/end value over `years`. */
export const cagr = (start: number, end: number, years: number): number | null =>
  start > 0 && end > 0 && years > 0 ? (Math.pow(end / start, 1 / years) - 1) * 100 : null;

/** Percentile rank (0-100) of each value among the non-null values; ties share the average rank. */
export function percentileRanks(values: Array<number | null>): Array<number | null> {
  const present = values.map((value, index) => ({ value, index })).filter((item): item is { value: number; index: number } => item.value != null && Number.isFinite(item.value));
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (present.length < 2) { for (const item of present) out[item.index] = 50; return out; }
  present.sort((a, b) => a.value - b.value);
  let i = 0;
  while (i < present.length) {
    let j = i;
    while (j + 1 < present.length && present[j + 1].value === present[i].value) j += 1;
    const rank = ((i + j) / 2 / (present.length - 1)) * 100;
    for (let k = i; k <= j; k += 1) out[present[k].index] = rank;
    i = j + 1;
  }
  return out;
}
