// Daily price history from Yahoo Finance's public chart endpoint (no key).
// Adjusted closes include dividends and splits, so returns are total returns.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DailyBar } from '../../src/lib/types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
export const yahooSymbol = (ticker: string) => ticker.replace('.', '-');

export interface History { bars: DailyBar[]; name: string | null; marketTime: number | null }

const DAY = 86_400;

/** `nowSec` lets a bar that is still forming (regular session not finished) be dropped. */
export function parseChart(payload: unknown, nowSec = Date.now() / 1000): History {
  const result = (payload as { chart?: { result?: Array<Record<string, any>> } })?.chart?.result?.[0];
  if (!result?.timestamp) throw new Error('empty chart');
  const stamps: number[] = result.timestamp;
  const closes: Array<number | null> = result.indicators?.quote?.[0]?.close ?? [];
  const adjusted: Array<number | null> = result.indicators?.adjclose?.[0]?.adjclose ?? closes;
  const offset: number = result.meta?.gmtoffset ?? -18_000;
  const bars: DailyBar[] = [];
  for (let index = 0; index < stamps.length; index += 1) {
    const c = closes[index], a = adjusted[index];
    if (c == null || a == null || !(c > 0) || !(a > 0)) continue;
    const t = Math.floor((stamps[index] + offset) / DAY); // exchange-local calendar day
    if (bars.length && bars[bars.length - 1].t === t) bars[bars.length - 1] = { t, a, c }; else bars.push({ t, a, c });
  }
  // Drop today's bar while the regular session is still open: its "close" is just the latest trade.
  const session = result.meta?.currentTradingPeriod?.regular as { start?: number; end?: number } | undefined;
  const lastStamp = stamps[stamps.length - 1];
  if (bars.length && session?.start && session?.end && lastStamp >= session.start && nowSec < session.end + 600 && bars[bars.length - 1].t === Math.floor((lastStamp + offset) / DAY)) bars.pop();
  return { bars, name: result.meta?.longName ?? result.meta?.shortName ?? null, marketTime: result.meta?.regularMarketTime ?? null };
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export async function fetchHistory(ticker: string, range = '25y'): Promise<History> {
  const cacheDir = process.env.LL_CACHE_DIR;
  const cacheFile = cacheDir ? resolve(cacheDir, `${ticker}.json`) : null;
  if (cacheFile) {
    try { return parseChart(JSON.parse(await readFile(cacheFile, 'utf8'))); } catch { /* not cached yet */ }
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const host = attempt % 2 ? 'query2' : 'query1';
    try {
      const response = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(ticker))}?range=${range}&interval=1d&events=div%2Csplit`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const history = parseChart(payload);
      if (cacheFile) { await mkdir(cacheDir as string, { recursive: true }); await writeFile(cacheFile, JSON.stringify(payload)); }
      return history;
    } catch (error) {
      lastError = error;
      await sleep(800 * (attempt + 1) ** 2);
    }
  }
  throw new Error(`${ticker}: ${lastError instanceof Error ? lastError.message : lastError}`);
}

/** Fetch many tickers with bounded concurrency; failures are returned, not thrown. */
export async function fetchAll(tickers: string[], concurrency = 6, onProgress?: (done: number) => void): Promise<{ data: Map<string, History>; failed: Array<{ ticker: string; error: string }> }> {
  const data = new Map<string, History>();
  const failed: Array<{ ticker: string; error: string }> = [];
  let cursor = 0, done = 0;
  const worker = async () => {
    while (cursor < tickers.length) {
      const ticker = tickers[cursor++];
      try { data.set(ticker, await fetchHistory(ticker)); } catch (error) { failed.push({ ticker, error: error instanceof Error ? error.message : String(error) }); }
      done += 1; onProgress?.(done);
      if (!process.env.LL_CACHE_DIR) await sleep(60);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { data, failed };
}
