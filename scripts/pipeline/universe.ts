// Universe: S&P 500 + Nasdaq-100 constituents (Wikipedia tables) and a fixed
// list of major ETFs. If a table cannot be parsed the last good list committed
// in data/universe-fallback.json is used, so one bad page never breaks a run.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { UniverseItem } from '../../src/lib/types';

const UA = 'LibertyLens/1.0 (personal research site; github.com)';
const decode = (value: string) => value
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;|&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\[[^\]]*\]/g, '')
  .replace(/\s+/g, ' ').trim();

/** Rows of the wikitable with the given id, as arrays of cell text. */
export function parseWikiTable(html: string, id: string): string[][] {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) return [];
  const end = html.indexOf('</table>', start);
  const table = html.slice(start, end < 0 ? undefined : end);
  const rows: string[][] = [];
  for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => decode(cell[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

const column = (header: string[], ...names: string[]) => header.findIndex((cell) => names.some((name) => cell.toLowerCase().includes(name)));

export function parseSp500(html: string): UniverseItem[] {
  const rows = parseWikiTable(html, 'constituents');
  if (rows.length < 2) return [];
  const header = rows[0];
  const iTicker = column(header, 'symbol', 'ticker'), iName = column(header, 'security', 'company'), iSector = column(header, 'sector'), iIndustry = column(header, 'sub-industry', 'industry');
  if (iTicker < 0 || iName < 0) return [];
  return rows.slice(1).filter((row) => /^[A-Z][A-Z.]{0,5}$/.test(row[iTicker] ?? '')).map((row) => ({
    ticker: row[iTicker], name: row[iName], kind: 'stock' as const, sector: row[iSector] ?? '', industry: row[iIndustry] ?? '', indexes: ['SP' as const],
  }));
}

/** Nasdaq's own list of Nasdaq-100 members (api.nasdaq.com/api/quote/list-type/nasdaq100). */
export function parseNasdaq100(payload: unknown): Array<{ ticker: string; name: string }> {
  const rows = (payload as { data?: { data?: { rows?: Array<{ symbol?: string; companyName?: string }> } } })?.data?.data?.rows ?? [];
  return rows.filter((row) => /^[A-Z][A-Z.]{0,5}$/.test(row.symbol ?? '')).map((row) => ({
    ticker: row.symbol as string,
    name: (row.companyName ?? '').replace(/\s+(Class [A-Z] )?(Common Stock|Common Shares|Ordinary Shares|American Depositary Shares?|Capital Stock|Registry Shares).*$/i, '').replace(/,? (Inc\.?|Corporation|Corp\.?|plc|N\.V\.|Ltd\.?|Holdings?)$/i, (match) => match).trim(),
  }));
}

const etf = (ticker: string, name: string, sector: string, industry: string): UniverseItem => ({ ticker, name, kind: 'etf', sector, industry, indexes: [] });
export const ETFS: UniverseItem[] = [
  etf('SPY', 'SPDR S&P 500 ETF', '大盤', 'S&P 500'),
  etf('QQQ', 'Invesco QQQ (Nasdaq-100)', '大盤', 'Nasdaq-100'),
  etf('DIA', 'SPDR Dow Jones Industrial Average', '大盤', '道瓊工業'),
  etf('IWM', 'iShares Russell 2000', '大盤', '小型股'),
  etf('VTI', 'Vanguard Total Stock Market', '大盤', '美國全市場'),
  etf('RSP', 'Invesco S&P 500 Equal Weight', '大盤', 'S&P 500 等權重'),
  etf('VUG', 'Vanguard Growth', '風格', '成長'),
  etf('VTV', 'Vanguard Value', '風格', '價值'),
  etf('SCHD', 'Schwab US Dividend Equity', '風格', '高股息'),
  etf('XLK', 'Technology Select Sector SPDR', '產業', '資訊科技'),
  etf('SMH', 'VanEck Semiconductor', '產業', '半導體'),
  etf('XLC', 'Communication Services Select Sector SPDR', '產業', '通訊服務'),
  etf('XLY', 'Consumer Discretionary Select Sector SPDR', '產業', '非必需消費'),
  etf('XLP', 'Consumer Staples Select Sector SPDR', '產業', '必需消費'),
  etf('XLE', 'Energy Select Sector SPDR', '產業', '能源'),
  etf('XLF', 'Financial Select Sector SPDR', '產業', '金融'),
  etf('XLV', 'Health Care Select Sector SPDR', '產業', '醫療保健'),
  etf('XLI', 'Industrial Select Sector SPDR', '產業', '工業'),
  etf('XLB', 'Materials Select Sector SPDR', '產業', '原物料'),
  etf('XLRE', 'Real Estate Select Sector SPDR', '產業', '不動產'),
  etf('XLU', 'Utilities Select Sector SPDR', '產業', '公用事業'),
  etf('VEA', 'Vanguard FTSE Developed Markets', '海外', '已開發市場（美國以外）'),
  etf('VWO', 'Vanguard FTSE Emerging Markets', '海外', '新興市場'),
  etf('EWT', 'iShares MSCI Taiwan', '海外', '台灣'),
  etf('BND', 'Vanguard Total Bond Market', '債券與另類', '美國綜合債'),
  etf('TLT', 'iShares 20+ Year Treasury Bond', '債券與另類', '長天期公債'),
  etf('IEF', 'iShares 7-10 Year Treasury Bond', '債券與另類', '中天期公債'),
  etf('LQD', 'iShares iBoxx Investment Grade Corporate Bond', '債券與另類', '投資等級公司債'),
  etf('GLD', 'SPDR Gold Shares', '債券與另類', '黃金'),
  etf('VNQ', 'Vanguard Real Estate', '債券與另類', 'REITs'),
];

export const SECTOR_ZH: Record<string, string> = {
  'Information Technology': '資訊科技', 'Health Care': '醫療保健', Financials: '金融', 'Consumer Discretionary': '非必需消費',
  'Communication Services': '通訊服務', Industrials: '工業', 'Consumer Staples': '必需消費', Energy: '能源', Utilities: '公用事業',
  'Real Estate': '不動產', Materials: '原物料',
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.text();
}

async function fetchNasdaqJson(path: string): Promise<unknown> {
  const response = await fetch(`https://api.nasdaq.com/api/${path}`, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`nasdaq ${path} -> HTTP ${response.status}`);
  return response.json();
}

/** Sector / industry for a Nasdaq-100 member that is not in the S&P 500 (best effort). */
async function nasdaqSector(ticker: string): Promise<{ sector: string; industry: string }> {
  try {
    const payload = await fetchNasdaqJson(`quote/${ticker}/summary?assetclass=stocks`) as { data?: { summaryData?: Record<string, { value?: string }> } };
    const summary = payload?.data?.summaryData ?? {};
    return { sector: summary.Sector?.value ?? '', industry: summary.Industry?.value ?? '' };
  } catch { return { sector: '', industry: '' }; }
}

// Nasdaq's sector names for the handful of Nasdaq-100 members outside the S&P 500.
const NASDAQ_SECTOR_ZH: Record<string, string> = {
  Technology: '資訊科技', 'Consumer Discretionary': '非必需消費', 'Health Care': '醫療保健', Industrials: '工業', Telecommunications: '通訊服務',
  'Consumer Staples': '必需消費', Finance: '金融', Energy: '能源', Utilities: '公用事業', 'Real Estate': '不動產', 'Basic Materials': '原物料',
};

const fallbackPath = resolve(process.cwd(), 'data/universe-fallback.json');

export interface UniverseResult { items: UniverseItem[]; source: 'live' | 'fallback'; note: string }

export async function loadUniverse(): Promise<UniverseResult> {
  try {
    const [spHtml, ndxPayload] = await Promise.all([
      fetchText('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'),
      fetchNasdaqJson('quote/list-type/nasdaq100'),
    ]);
    const sp = parseSp500(spHtml), ndx = parseNasdaq100(ndxPayload);
    if (sp.length < 480 || sp.length > 520) throw new Error(`S&P 500 table parsed to ${sp.length} rows`);
    if (ndx.length < 95 || ndx.length > 110) throw new Error(`Nasdaq-100 table parsed to ${ndx.length} rows`);
    const byTicker = new Map<string, UniverseItem>(sp.map((item) => [item.ticker, { ...item, sector: SECTOR_ZH[item.sector] ?? item.sector }]));
    for (const row of ndx) {
      const existing = byTicker.get(row.ticker);
      if (existing) existing.indexes.push('NDX');
      else {
        const extra = await nasdaqSector(row.ticker);
        byTicker.set(row.ticker, { ticker: row.ticker, name: row.name, kind: 'stock', sector: NASDAQ_SECTOR_ZH[extra.sector] ?? (extra.sector || '其他'), industry: extra.industry, indexes: ['NDX'] });
      }
    }
    const items = [...ETFS, ...[...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker))];
    await mkdir(resolve(process.cwd(), 'data'), { recursive: true });
    await writeFile(fallbackPath, `${JSON.stringify(items)}\n`);
    return { items, source: 'live', note: `S&P 500 ${sp.length} + Nasdaq-100 ${ndx.length} + ETF ${ETFS.length}` };
  } catch (error) {
    const items = JSON.parse(await readFile(fallbackPath, 'utf8')) as UniverseItem[];
    return { items, source: 'fallback', note: `constituent tables unavailable (${error instanceof Error ? error.message : error}); using the last good list` };
  }
}
