// Daily data pipeline (GitHub Actions, or locally with `npm run data:build`).
// Downloads 25 years of daily history for every symbol and writes the static
// JSON the site reads:
//   public/data/universe.json   one row per symbol: prices, returns, both rule readings
//   public/data/market.json     market backdrop: index states, breadth, VIX, rates, sectors, dip table
//   public/data/backtest.json   rule-following simulations and the event study
//   public/data/track.json      forward test: frozen weekly lists and what happened since
//   public/data/h/<TICKER>.json weekly + monthly closes for the chart
// It also freezes the lists of each completed week into track/<ISO week>.json (CI only).

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadUniverse } from './universe';
import { fetchAll } from './yahoo';
import { analyzeHorizon, percentileAmong, type HorizonAnalysis } from '../../src/lib/analyze';
import { addSample, median, simulate, studyStat, STUDY_GROUPS, type SimResult, type StudyAggregate } from '../../src/lib/backtest';
import { buildSnapshot, scoreSnapshot } from '../../src/lib/forward';
import { cagr, changeOver, dayToIso, isoToDay, isoWeekLabel, maxDrawdown, monthComplete, monthIndex, percentileRanks, toMonthly, toWeekly, weekComplete, weekIndex } from '../../src/lib/series';
import { LONG, MID, RULES_VERSION, readAll, strengthAt, zoneOf, type RuleSpec } from '../../src/lib/signals';
import type { BacktestPayload, Bar, DipBucket, HistoryPayload, HorizonView, MarketPayload, SimSummary, StockSimAggregate, StudyPayload, SymbolRow, TrackPayload, TrackSnapshot, UniverseItem, UniversePayload } from '../../src/lib/types';

const outDir = resolve(process.cwd(), 'public/data');
const started = Date.now();
const log = (message: string) => console.log(`[data] ${message} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
const round = (value: number | null | undefined, digits = 2): number | null => (value == null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);

await mkdir(resolve(outDir, 'h'), { recursive: true });

// --- 1. Universe and prices -------------------------------------------------
const universe = await loadUniverse();
log(`universe (${universe.source}): ${universe.note}`);
const AUX = ['^VIX', '^TNX', '^IRX'];
const { data, failed } = await fetchAll([...universe.items.map((item) => item.ticker), ...AUX], 6);
if (failed.length) console.warn(`[data] ${failed.length} symbols failed: ${failed.map((item) => `${item.ticker} (${item.error})`).join(', ')}`);
const items = universe.items.filter((item) => (data.get(item.ticker)?.bars.length ?? 0) >= 30);
if (items.length < universe.items.length * 0.95) throw new Error(`Only ${items.length}/${universe.items.length} symbols have price history; refusing to publish`);
const spyDaily = data.get('SPY')?.bars;
if (!spyDaily?.length) throw new Error('SPY history missing');
const asOfT = spyDaily[spyDaily.length - 1].t;
// "Today" on the US east coast decides whether the latest week / month is finished.
const todayT = process.env.LL_TODAY ? isoToDay(process.env.LL_TODAY) : isoToDay(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()));
if (todayT - asOfT > 6) throw new Error(`Latest price is ${dayToIso(asOfT)}, more than 6 days old; refusing to publish stale data`);
const weekDone = weekComplete(asOfT, todayT), monthDone = monthComplete(asOfT, todayT);
log(`prices: ${items.length} symbols, latest close ${dayToIso(asOfT)}, week ${weekDone ? 'complete' : 'in progress'}, month ${monthDone ? 'complete' : 'in progress'}`);

// Cash yield while out of the market: 13-week T-bill rate (^IRX, percent).
const irx = (data.get('^IRX')?.bars ?? []).map((bar) => ({ t: bar.t, c: bar.c }));
const cashYield = (t: number): number => {
  if (!irx.length || irx[0].t > t) return 0;
  let lo = 0, hi = irx.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (irx[mid].t <= t) lo = mid; else hi = mid - 1; }
  return irx[lo].c;
};

// --- 2. Per-symbol analysis --------------------------------------------------
interface Analyzed { item: UniverseItem; daily: Bar[]; weekly: Bar[]; monthly: Bar[]; mid: HorizonAnalysis; long: HorizonAnalysis; simMid: SimResult | null; simLong: SimResult | null; price: number }
const analyzed: Analyzed[] = items.map((item) => {
  const raw = data.get(item.ticker)!.bars;
  // A symbol can lag the market by a day (halt, late print); its own last bar decides its own period completeness.
  const daily = raw.map((bar) => ({ t: bar.t, c: bar.a }));
  const lastT = daily[daily.length - 1].t;
  const weekly = toWeekly(daily), monthly = toMonthly(daily);
  const mid = analyzeHorizon(weekly, weekComplete(lastT, todayT), MID), long = analyzeHorizon(monthly, monthComplete(lastT, todayT), LONG);
  return { item, daily, weekly, monthly, mid, long, simMid: simulate(mid.bars, mid.series.state, 52, cashYield), simLong: simulate(long.bars, long.series.state, 12, cashYield), price: raw[raw.length - 1].c };
});
const stocksA = analyzed.filter((entry) => entry.item.kind === 'stock');

const simSummary = (sim: SimResult | null): SimSummary | null => sim && {
  years: round(sim.years, 1) as number, ruleCagr: round(sim.ruleCagr, 1) as number, holdCagr: round(sim.holdCagr, 1) as number,
  ruleDd: round(sim.ruleMaxDd, 1) as number, holdDd: round(sim.holdMaxDd, 1) as number, timeIn: round(sim.timeIn, 0) as number, trades: sim.trades,
};

const strengthPool = (key: 'mid' | 'long') => stocksA.map((entry) => entry[key].strength).filter((value): value is number => value != null).sort((a, b) => a - b);
const pools = { mid: strengthPool('mid'), long: strengthPool('long') };

const horizonView = (entry: Analyzed, key: 'mid' | 'long', spec: RuleSpec): HorizonView | null => {
  const analysis = entry[key], reading = analysis.reading;
  if (!reading) return null;
  const strengthPct = analysis.strength == null ? null : percentileAmong(analysis.strength, pools[key]);
  const flip = reading.flipIndex;
  return {
    in: reading.inMarket, zone: zoneOf(reading, strengthPct, spec), fresh: reading.fresh,
    sinceT: flip == null ? null : analysis.bars[flip].t,
    sinceRet: flip == null ? null : round((reading.close / analysis.bars[flip].c - 1) * 100, 1),
    vsFast: round(reading.vsFast, 1), vsSlow: round(reading.vsSlow, 1), line: round(reading.slow, 2),
    strength: round(analysis.strength, 1), strengthPct: round(strengthPct, 0), pending: analysis.pending,
    sim: simSummary(key === 'mid' ? entry.simMid : entry.simLong),
  };
};

const weeklyVol = (closes: number[]): number | null => {
  const window = closes.slice(-53);
  if (window.length < 27) return null;
  const returns = window.slice(1).map((value, index) => Math.log(value / window[index]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  return Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length) * Math.sqrt(52) * 100;
};

const rows: SymbolRow[] = analyzed.map((entry) => {
  const closes = entry.weekly.map((bar) => bar.c), last = closes.length - 1;
  const lastT = entry.daily[entry.daily.length - 1].t;
  const yearsBack = (years: number) => { const index = last - Math.round(years * 52.18); return index >= 0 ? cagr(closes[index], closes[last], years) : null; };
  const year = closes.slice(-53);
  return {
    ...entry.item, price: round(entry.price, 2) as number, asOf: lastT,
    r1w: round(changeOver(entry.daily.map((bar) => bar.c), entry.daily.length - 1, 5), 1), r4w: round(changeOver(closes, last, 4), 1), r13w: round(changeOver(closes, last, 13), 1), r26w: round(changeOver(closes, last, 26), 1), r52w: round(changeOver(closes, last, 52), 1),
    cagr3y: round(yearsBack(3), 1), cagr5y: round(yearsBack(5), 1),
    fromHigh: round((closes[last] / Math.max(...year) - 1) * 100, 1), dd5y: round(maxDrawdown(closes, Math.max(0, last - 261)), 1), vol: round(weeklyVol(closes), 0),
    mid: horizonView(entry, 'mid', MID), long: horizonView(entry, 'long', LONG),
  };
});
const rowOf = new Map(rows.map((row) => [row.ticker, row]));
const spyA = analyzed.find((entry) => entry.item.ticker === 'SPY')!;
const midBarT = spyA.mid.bars[spyA.mid.bars.length - 1].t, longBarT = spyA.long.bars[spyA.long.bars.length - 1].t;

const universePayload: UniversePayload = {
  meta: {
    generatedAt: new Date().toISOString(), asOf: dayToIso(asOfT), midBar: dayToIso(midBarT), longBar: dayToIso(longBarT), weekDone, monthDone,
    stocks: rows.filter((row) => row.kind === 'stock').length, etfs: rows.filter((row) => row.kind === 'etf').length,
    universeSource: universe.source, failed: failed.map((item) => item.ticker).filter((ticker) => !ticker.startsWith('^')), rulesVersion: RULES_VERSION,
  },
  rows,
};
await writeFile(resolve(outDir, 'universe.json'), JSON.stringify(universePayload));
log(`universe.json: ${rows.length} rows; mid leaders ${rows.filter((row) => row.mid?.zone === 'lead').length}, long leaders ${rows.filter((row) => row.long?.zone === 'lead').length}`);

// Chart histories.
const compact = (value: number) => Number(value.toPrecision(6));
for (const entry of analyzed) {
  const lastT = entry.daily[entry.daily.length - 1].t;
  const payload: HistoryPayload = {
    wt: entry.weekly.map((bar) => bar.t), wc: entry.weekly.map((bar) => compact(bar.c)), mt: entry.monthly.map((bar) => bar.t), mc: entry.monthly.map((bar) => compact(bar.c)),
    wDone: weekComplete(lastT, todayT), mDone: monthComplete(lastT, todayT),
  };
  await writeFile(resolve(outDir, 'h', `${entry.item.ticker}.json`), JSON.stringify(payload));
}
log(`h/*.json: ${analyzed.length} chart histories`);

// --- 3. Market backdrop ------------------------------------------------------
const spMembers = stocksA.filter((entry) => entry.item.indexes.includes('SP'));
const BREADTH_WEEKS = 260;
const lastWeek = weekIndex(midBarT);
const breadthCount = Array.from({ length: BREADTH_WEEKS }, () => ({ n: 0, in: 0, above: 0 }));
for (const entry of spMembers) {
  const { bars, series } = entry.mid;
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    const offset = lastWeek - weekIndex(bars[index].t);
    if (offset >= BREADTH_WEEKS) break;
    const state = series.state[index], slow = series.slow[index];
    if (offset < 0 || state == null || slow == null) continue;
    const cell = breadthCount[BREADTH_WEEKS - 1 - offset];
    cell.n += 1; if (state) cell.in += 1; if (series.closes[index] > slow) cell.above += 1;
  }
}
const spyWeeklyT = spyA.mid.bars.slice(-BREADTH_WEEKS).map((bar) => bar.t);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const breadthSeries = breadthCount.map((cell, index) => ({ t: spyWeeklyT[index] ?? midBarT - (BREADTH_WEEKS - 1 - index) * 7, midIn: pct(cell.in, cell.n), above: pct(cell.above, cell.n), n: cell.n })).filter((point) => point.n >= 100);
const stockRows = rows.filter((row) => row.kind === 'stock'), spRows = stockRows.filter((row) => row.indexes.includes('SP'));
const share = (list: SymbolRow[], test: (row: SymbolRow) => boolean) => pct(list.filter(test).length, list.filter((row) => row.mid != null).length);
const midInNow = share(spRows, (row) => row.mid?.in === true);
const spyRow = rowOf.get('SPY')!;
const stance = { spyMid: spyRow.mid?.in === true, spyLong: spyRow.long?.in === true, breadthOk: midInNow >= 50 };

const auxLast = (ticker: string) => { const bars = data.get(ticker)?.bars; return bars?.length ? bars[bars.length - 1].c : null; };
const vixBars = data.get('^VIX')?.bars ?? [];
const vixYear = vixBars.slice(-252).map((bar) => bar.c);
const tenYear = auxLast('^TNX'), threeMonth = auxLast('^IRX');

const SECTOR_ETF: Record<string, string> = { 資訊科技: 'XLK', 通訊服務: 'XLC', 非必需消費: 'XLY', 必需消費: 'XLP', 能源: 'XLE', 金融: 'XLF', 醫療保健: 'XLV', 工業: 'XLI', 原物料: 'XLB', 不動產: 'XLRE', 公用事業: 'XLU' };
const sectorNames = [...new Set(stockRows.map((row) => row.sector))].filter((name) => stockRows.filter((row) => row.sector === name).length >= 5);
const sectors = sectorNames.map((sector) => {
  const members = stockRows.filter((row) => row.sector === sector && row.mid != null);
  return { sector, n: members.length, midIn: pct(members.filter((row) => row.mid?.in).length, members.length), longIn: pct(members.filter((row) => row.long?.in).length, members.filter((row) => row.long != null).length), etf: SECTOR_ETF[sector] ?? null };
}).sort((a, b) => b.midIn - a.midIn);

// How deep the index was below its high, and what the next 1 and 3 years returned (weekly observations).
const DIP_BUCKETS: Array<{ label: string; hi: number; lo: number }> = [{ label: '距高點 5% 以內', hi: 0, lo: -5 }, { label: '回檔 5–10%', hi: -5, lo: -10 }, { label: '回檔 10–20%', hi: -10, lo: -20 }, { label: '回檔超過 20%', hi: -20, lo: -100 }];
const dipTable = (ticker: string) => {
  const entry = analyzed.find((candidate) => candidate.item.ticker === ticker)!;
  const closes = entry.mid.bars.map((bar) => bar.c);
  const cells = DIP_BUCKETS.map(() => ({ n1: 0, s1: 0, w1: 0, n3: 0, s3: 0, w3: 0 }));
  let peak = 0, drawdown = 0;
  closes.forEach((close, index) => {
    peak = Math.max(peak, close); drawdown = (close / peak - 1) * 100;
    const cell = cells[DIP_BUCKETS.findIndex((bucket) => drawdown <= bucket.hi && drawdown > bucket.lo)];
    if (!cell) return;
    if (index + 52 < closes.length) { const forward = (closes[index + 52] / close - 1) * 100; cell.n1 += 1; cell.s1 += forward; if (forward > 0) cell.w1 += 1; }
    if (index + 156 < closes.length) { const forward = (Math.pow(closes[index + 156] / close, 1 / 3) - 1) * 100; cell.n3 += 1; cell.s3 += forward; if (forward > 0) cell.w3 += 1; }
  });
  const buckets: DipBucket[] = DIP_BUCKETS.map((bucket, index) => {
    const cell = cells[index];
    return { label: bucket.label, n1: cell.n1, avg1: cell.n1 ? round(cell.s1 / cell.n1, 1) : null, win1: cell.n1 ? round((cell.w1 / cell.n1) * 100, 0) : null, n3: cell.n3, avg3: cell.n3 ? round(cell.s3 / cell.n3, 1) : null, win3: cell.n3 ? round((cell.w3 / cell.n3) * 100, 0) : null, current: drawdown <= bucket.hi && drawdown > bucket.lo };
  });
  return { ticker, drawdown: round(drawdown, 1) as number, buckets, from: dayToIso(entry.mid.bars[0].t) };
};

const marketPayload: MarketPayload = {
  asOf: dayToIso(asOfT),
  stance: { score: Number(stance.spyMid) + Number(stance.spyLong) + Number(stance.breadthOk), ...stance },
  indexes: ['SPY', 'QQQ', 'DIA', 'IWM', 'RSP', 'SMH', 'VEA', 'VWO', 'EWT', 'TLT', 'GLD'].map((ticker) => rowOf.get(ticker)).filter((row): row is SymbolRow => row != null),
  breadth: {
    t: breadthSeries.map((point) => point.t), midIn: breadthSeries.map((point) => point.midIn), aboveLine: breadthSeries.map((point) => point.above),
    midInNow, aboveLineNow: share(spRows, (row) => (row.mid?.vsSlow ?? -1) > 0), longInNow: pct(spRows.filter((row) => row.long?.in).length, spRows.filter((row) => row.long != null).length),
    leadMid: stockRows.filter((row) => row.mid?.zone === 'lead').length, leadLong: stockRows.filter((row) => row.long?.zone === 'lead').length,
  },
  vix: vixYear.length ? { last: round(vixYear[vixYear.length - 1], 1) as number, pct1y: Math.round(percentileAmong(vixYear[vixYear.length - 1], [...vixYear].sort((a, b) => a - b))) } : null,
  rates: tenYear != null && threeMonth != null ? { tenYear: round(tenYear, 2) as number, threeMonth: round(threeMonth, 2) as number, spread: round(tenYear - threeMonth, 2) as number } : null,
  sectors,
  dip: ['SPY', 'QQQ'].map(dipTable),
};
await writeFile(resolve(outDir, 'market.json'), JSON.stringify(marketPayload));
log(`market.json: stance ${marketPayload.stance.score}/3, S&P 500 in mid uptrend ${midInNow}%`);

// --- 4. Backtest -------------------------------------------------------------
const aggregateSims = (sims: Array<SimResult | null>): StockSimAggregate => {
  const usable = sims.filter((sim): sim is SimResult => sim != null && sim.years >= 10);
  return {
    n: usable.length, medianHold: round(median(usable.map((sim) => sim.holdCagr)), 1), medianRule: round(median(usable.map((sim) => sim.ruleCagr)), 1),
    medianHoldDd: round(median(usable.map((sim) => sim.holdMaxDd)), 1), medianRuleDd: round(median(usable.map((sim) => sim.ruleMaxDd)), 1),
    beatPct: pct(usable.filter((sim) => sim.ruleCagr > sim.holdCagr).length, usable.length), shallowerPct: pct(usable.filter((sim) => sim.ruleMaxDd > sim.holdMaxDd).length, usable.length),
    medianTimeIn: round(median(usable.map((sim) => sim.timeIn)), 0), medianTradesPerYear: round(median(usable.map((sim) => sim.trades / sim.years)), 2),
  };
};

function eventStudy(key: 'mid' | 'long', spec: RuleSpec): StudyPayload {
  const periodKey = key === 'mid' ? weekIndex : monthIndex;
  const regime = new Map(spyA[key].bars.map((bar, index) => [periodKey(bar.t), spyA[key].series.state[index]]));
  interface Row { zoneInput: { inMarket: boolean; fresh: boolean; vsSlow: number | null }; strength: number | null; forward: Array<number | null> }
  const byPeriod = new Map<number, Row[]>();
  let minT = Infinity, maxT = -Infinity;
  for (const entry of stocksA) {
    const { bars, series } = entry[key];
    const closes = series.closes;
    readAll(series, spec).forEach((reading, index) => {
      if (!reading) return;
      const k = periodKey(bars[index].t);
      minT = Math.min(minT, bars[index].t); maxT = Math.max(maxT, bars[index].t);
      const row: Row = { zoneInput: reading, strength: strengthAt(closes, index, spec), forward: spec.studyBars.map((h) => (index + h < closes.length ? (closes[index + h] / closes[index] - 1) * 100 : null)) };
      const list = byPeriod.get(k); if (list) list.push(row); else byPeriod.set(k, [row]);
    });
  }
  const aggregate: StudyAggregate = new Map();
  for (const [k, list] of byPeriod) {
    const ranks = percentileRanks(list.map((row) => row.strength));
    list.forEach((row, index) => addSample(aggregate, k, { zone: zoneOf(row.zoneInput, ranks[index], spec), freshIn: row.zoneInput.inMarket && row.zoneInput.fresh, riskOn: regime.get(k) ?? null, forward: row.forward }));
  }
  const tidy = (stat: ReturnType<typeof studyStat>) => ({ samples: stat.samples, average: round(stat.average, 1), winRate: round(stat.winRate, 0), benchmark: round(stat.benchmark, 1), excess: round(stat.excess, 1) });
  const groups: StudyPayload['groups'] = {};
  for (const group of STUDY_GROUPS) groups[group] = spec.studyBars.map((_, h) => tidy(studyStat(aggregate, group, h)));
  const yearOf = (k: number) => (key === 'mid' ? new Date((k * 7 - 3) * 86_400_000).getUTCFullYear() : Math.floor(k / 12));
  const years = [...new Set([...aggregate.keys()].map(yearOf))].sort();
  const byYear = years.map((year) => {
    const keep = (k: number) => yearOf(k) === year;
    return { year, lead: tidy(studyStat(aggregate, 'lead', 1, keep)), exit: tidy(studyStat(aggregate, 'exit', 1, keep)), all: tidy(studyStat(aggregate, 'all', 1, keep)) };
  }).filter((row) => row.all.samples > 0);
  return { bars: spec.studyBars, from: dayToIso(minT), to: dayToIso(maxT), groups, byYear };
}

const curveFor = (ticker: string) => {
  const entry = analyzed.find((candidate) => candidate.item.ticker === ticker)!;
  const mid = entry.simMid!, long = entry.simLong!;
  const every = <T,>(list: T[], step: number) => list.filter((_, index) => index % step === 0 || index === list.length - 1);
  const r3 = (value: number) => Math.round(value * 1000) / 1000;
  return { mid: { t: every(mid.t, 4), rule: every(mid.rule, 4).map(r3), hold: every(mid.hold, 4).map(r3) }, long: { t: long.t, rule: long.rule.map(r3) } };
};

const backtestPayload: BacktestPayload = {
  meta: { generatedAt: new Date().toISOString(), stocks: stocksA.length, cashNote: irx.length ? 'tbill' : 'zero' },
  etf: analyzed.filter((entry) => entry.item.kind === 'etf').map((entry) => ({ ticker: entry.item.ticker, name: entry.item.name, mid: simSummary(entry.simMid), long: simSummary(entry.simLong) })),
  curves: { SPY: curveFor('SPY'), QQQ: curveFor('QQQ') },
  stocks: { mid: aggregateSims(stocksA.map((entry) => entry.simMid)), long: aggregateSims(stocksA.map((entry) => entry.simLong)) },
  study: { mid: eventStudy('mid', MID), long: eventStudy('long', LONG) },
};
await writeFile(resolve(outDir, 'backtest.json'), JSON.stringify(backtestPayload));
log(`backtest.json: ${backtestPayload.stocks.mid.n} stocks with 10+ years; lead excess mid ${backtestPayload.study.mid.groups.lead.map((stat) => stat.excess).join('/')} long ${backtestPayload.study.long.groups.lead.map((stat) => stat.excess).join('/')}`);

// --- 5. Forward test ---------------------------------------------------------
const trackDir = resolve(process.cwd(), 'track');
await mkdir(trackDir, { recursive: true });
const snapshots: TrackSnapshot[] = [];
for (const file of (await readdir(trackDir)).filter((name) => /^\d{4}-W\d{2}\.json$/.test(name)).sort()) snapshots.push(JSON.parse(await readFile(resolve(trackDir, file), 'utf8')) as TrackSnapshot);
const week = isoWeekLabel(midBarT);
// Only CI writes the permanent record, and a week is frozen once: the first run after it completes.
if (!snapshots.some((snapshot) => snapshot.week === week) && (process.env.CI || process.env.LL_TRACK_RECORD)) {
  const fresh = buildSnapshot(rows, week, dayToIso(midBarT), marketPayload.stance.score);
  await writeFile(resolve(trackDir, `${week}.json`), `${JSON.stringify(fresh)}\n`);
  snapshots.push(fresh);
  log(`track/${week}.json: lists frozen as of ${fresh.signalDate}`);
}
const dailyOf = new Map(analyzed.map((entry) => [entry.item.ticker, entry.daily]));
const current = snapshots.filter((snapshot) => snapshot.rulesVersion === RULES_VERSION);
const stockTickers = stocksA.map((entry) => entry.item.ticker);
const trackPayload: TrackPayload = {
  startedOn: current[0]?.signalDate ?? null, weeks: current.length, rulesVersion: RULES_VERSION, latest: current[current.length - 1] ?? null,
  rows: current.map((snapshot) => {
    const row = scoreSnapshot(snapshot, isoToDay(snapshot.signalDate), asOfT, (ticker) => dailyOf.get(ticker), stockTickers);
    for (const key of Object.keys(row.lists)) row.lists[key].ret = round(row.lists[key].ret, 1);
    return { ...row, spy: round(row.spy, 1), all: round(row.all, 1) };
  }),
};
await writeFile(resolve(outDir, 'track.json'), JSON.stringify(trackPayload));
log(`track.json: ${trackPayload.weeks} weekly snapshots since ${trackPayload.startedOn ?? 'n/a'}`);

await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), asOf: dayToIso(asOfT), symbols: rows.length, failed: failed.map((item) => item.ticker), trackedWeeks: trackPayload.weeks }, null, 2));
log('done');
