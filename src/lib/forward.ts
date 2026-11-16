// Forward test: every completed week the site's lists are frozen into
// track/<ISO week>.json (committed by CI, so the record cannot be edited after
// the fact), and each frozen list is later scored against what prices did.

import { RULES_VERSION } from './signals';
import type { Bar, SymbolRow, TrackResultRow, TrackSnapshot } from './types';

export const LIST_SIZE = 20;
export const LIST_KEYS = ['midLead', 'midExit', 'longLead', 'longExit'] as const;
export type ListKey = (typeof LIST_KEYS)[number];

const view = (row: SymbolRow, horizon: 'mid' | 'long') => row[horizon];

/** Entry candidates: stocks in the leader zone, strongest first. */
export function leadList(rows: SymbolRow[], horizon: 'mid' | 'long', limit = LIST_SIZE): SymbolRow[] {
  return rows.filter((row) => row.kind === 'stock' && view(row, horizon)?.zone === 'lead')
    .sort((a, b) => (view(b, horizon)?.strengthPct ?? 0) - (view(a, horizon)?.strengthPct ?? 0) || a.ticker.localeCompare(b.ticker)).slice(0, limit);
}

/** Exit / reduce candidates: fresh exits first (most recent flip first), then unconfirmed breaks (furthest below the trend line first). */
export function exitList(rows: SymbolRow[], horizon: 'mid' | 'long', limit = LIST_SIZE): SymbolRow[] {
  const rank = (row: SymbolRow) => (view(row, horizon)?.zone === 'exit' ? 0 : 1);
  return rows.filter((row) => row.kind === 'stock' && ['exit', 'warn'].includes(view(row, horizon)?.zone ?? ''))
    .sort((a, b) => rank(a) - rank(b)
      || (rank(a) === 0 ? (view(b, horizon)?.sinceT ?? 0) - (view(a, horizon)?.sinceT ?? 0) : 0)
      || (view(a, horizon)?.vsSlow ?? 0) - (view(b, horizon)?.vsSlow ?? 0) || a.ticker.localeCompare(b.ticker)).slice(0, limit);
}

export function buildSnapshot(rows: SymbolRow[], week: string, signalDate: string, stance: number): TrackSnapshot {
  const tickers = (list: SymbolRow[]) => list.map((row) => row.ticker);
  return {
    week, signalDate, rulesVersion: RULES_VERSION, stance,
    lists: { midLead: tickers(leadList(rows, 'mid')), midExit: tickers(exitList(rows, 'mid')), longLead: tickers(leadList(rows, 'long')), longExit: tickers(exitList(rows, 'long')) },
    universe: rows.filter((row) => row.kind === 'stock').length,
  };
}

/** Percent total return from the last close on or before day `fromT` to the latest close; null without both prices. */
export function returnSince(daily: Bar[], fromT: number): number | null {
  if (!daily.length || daily[0].t > fromT) return null;
  let lo = 0, hi = daily.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (daily[mid].t <= fromT) lo = mid; else hi = mid - 1; }
  const start = daily[lo].c, end = daily[daily.length - 1].c;
  return start > 0 ? (end / start - 1) * 100 : null;
}

const mean = (values: Array<number | null>): { n: number; ret: number | null } => {
  const present = values.filter((value): value is number => value != null);
  return { n: present.length, ret: present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null };
};

/** Score one frozen snapshot against current prices. */
export function scoreSnapshot(snapshot: TrackSnapshot, signalT: number, latestT: number, lookup: (ticker: string) => Bar[] | undefined, stockTickers: string[]): TrackResultRow {
  const since = (ticker: string) => { const daily = lookup(ticker); return daily ? returnSince(daily, signalT) : null; };
  const lists: TrackResultRow['lists'] = {};
  for (const key of LIST_KEYS) lists[key] = mean(snapshot.lists[key].map(since));
  return { week: snapshot.week, signalDate: snapshot.signalDate, weeksElapsed: Math.max(0, Math.round((latestT - signalT) / 7)), lists, spy: since('SPY'), all: mean(stockTickers.map(since)).ret };
}
