// Shared data shapes. Prices are US dollars; `t` values are UTC days since 1970-01-01.

export type AssetKind = 'stock' | 'etf';

export interface UniverseItem {
  /** Display ticker, e.g. BRK.B */
  ticker: string;
  name: string;
  kind: AssetKind;
  /** GICS sector for stocks, a category label for ETFs. */
  sector: string;
  industry: string;
  /** Index memberships: SP = S&P 500, NDX = Nasdaq-100. */
  indexes: Array<'SP' | 'NDX'>;
}

/** One daily bar: day number, dividend/split-adjusted close, raw close. */
export interface DailyBar { t: number; a: number; c: number }

/** A period (weekly or monthly) close on the adjusted series. */
export interface Bar { t: number; c: number }

export type ZoneName = 'lead' | 'hold' | 'warn' | 'exit' | 'watch' | 'avoid';

export interface SimSummary { years: number; ruleCagr: number; holdCagr: number; ruleDd: number; holdDd: number; timeIn: number; trades: number }

/** One rule's view of one symbol, as of the last completed week (mid) or month (long). */
export interface HorizonView {
  in: boolean;
  zone: ZoneName;
  /** The state flipped recently enough to act on. */
  fresh: boolean;
  /** Day the current state began; null if it predates the data. */
  sinceT: number | null;
  /** Percent change (total return) since the current state began. */
  sinceRet: number | null;
  /** Percent distance of the close from the fast line and from the trend line. */
  vsFast: number | null;
  vsSlow: number | null;
  /** Trend line level in today's dollars (dividend-adjusted). */
  line: number | null;
  /** Trailing percent return used for ranking, and its percentile among the stocks. */
  strength: number | null;
  strengthPct: number | null;
  /** What the unfinished week / month would do to the state if it closed at the latest price. */
  pending: 'in' | 'out' | null;
  sim: SimSummary | null;
}

export interface SymbolRow extends UniverseItem {
  price: number;
  /** Day of the latest close. */
  asOf: number;
  r1w: number | null; r4w: number | null; r13w: number | null; r26w: number | null; r52w: number | null;
  cagr3y: number | null; cagr5y: number | null;
  /** Percent below the 52-week high (zero or negative). */
  fromHigh: number | null;
  /** Worst peak-to-trough decline over the last five years (negative percent). */
  dd5y: number | null;
  /** Annualized volatility of weekly returns over the last year, percent. */
  vol: number | null;
  mid: HorizonView | null;
  long: HorizonView | null;
}

export interface UniversePayload {
  meta: {
    generatedAt: string; asOf: string;
    /** Last completed week / month the rules were evaluated on (ISO date of its last trading day). */
    midBar: string; longBar: string; weekDone: boolean; monthDone: boolean;
    stocks: number; etfs: number; universeSource: 'live' | 'fallback'; failed: string[]; rulesVersion: number;
  };
  rows: SymbolRow[];
}

export interface StudyStatRow { samples: number; average: number | null; winRate: number | null; benchmark: number | null; excess: number | null }

export interface StudyPayload {
  bars: [number, number, number];
  from: string; to: string;
  groups: Record<string, StudyStatRow[]>;
  /** Middle horizon, by calendar year of the signal. */
  byYear: Array<{ year: number; lead: StudyStatRow; exit: StudyStatRow; all: StudyStatRow }>;
}

export interface StockSimAggregate {
  n: number; medianHold: number | null; medianRule: number | null; medianHoldDd: number | null; medianRuleDd: number | null;
  /** Percent of stocks where the rule's return beat holding / where its drawdown was shallower. */
  beatPct: number; shallowerPct: number; medianTimeIn: number | null; medianTradesPerYear: number | null;
}

export interface BacktestPayload {
  meta: { generatedAt: string; stocks: number; cashNote: string };
  etf: Array<{ ticker: string; name: string; mid: SimSummary | null; long: SimSummary | null }>;
  curves: Record<string, { mid: { t: number[]; rule: number[]; hold: number[] }; long: { t: number[]; rule: number[] } }>;
  stocks: { mid: StockSimAggregate; long: StockSimAggregate };
  study: { mid: StudyPayload; long: StudyPayload };
}

export interface DipBucket { label: string; n1: number; avg1: number | null; win1: number | null; n3: number; avg3: number | null; win3: number | null; current: boolean }

export interface MarketPayload {
  asOf: string;
  stance: { score: number; spyMid: boolean; spyLong: boolean; breadthOk: boolean };
  indexes: SymbolRow[];
  breadth: { t: number[]; midIn: number[]; aboveLine: number[]; midInNow: number; aboveLineNow: number; longInNow: number; leadMid: number; leadLong: number };
  vix: { last: number; pct1y: number } | null;
  rates: { tenYear: number; threeMonth: number; spread: number } | null;
  sectors: Array<{ sector: string; n: number; midIn: number; longIn: number; etf: string | null }>;
  dip: Array<{ ticker: string; drawdown: number; buckets: DipBucket[]; from: string }>;
}

/** Compact per-symbol history for the chart: period-end days and adjusted closes. */
export interface HistoryPayload { wt: number[]; wc: number[]; mt: number[]; mc: number[]; wDone: boolean; mDone: boolean }

export interface TrackList { tickers: string[] }
export interface TrackSnapshot {
  week: string; signalDate: string; rulesVersion: number;
  stance: number;
  lists: { midLead: string[]; midExit: string[]; longLead: string[]; longExit: string[] };
  /** Reference closes (adjusted, as of signalDate) for every listed ticker plus SPY, so results survive later re-adjustment only approximately; returns are recomputed from fresh history. */
  universe: number;
}
export interface TrackResultRow { week: string; signalDate: string; weeksElapsed: number; lists: Record<string, { n: number; ret: number | null }>; spy: number | null; all: number | null }
export interface TrackPayload { startedOn: string | null; weeks: number; rulesVersion: number; latest: TrackSnapshot | null; rows: TrackResultRow[] }
