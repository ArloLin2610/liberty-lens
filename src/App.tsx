import { useEffect, useMemo, useState } from 'react';
import { useJson } from './lib/data';
import { fmtDate } from './lib/format';
import { loadTheme, loadWatchlist, saveTheme, saveWatchlist, type Theme } from './lib/storage';
import type { BacktestPayload, MarketPayload, TrackPayload, UniversePayload } from './lib/types';
import { Backtest } from './pages/Backtest';
import { Overview } from './pages/Overview';
import { Screener } from './pages/Screener';
import { Signals } from './pages/Signals';
import { Stock } from './pages/Stock';

const NAV = [
  { hash: '#/', label: '大盤環境' },
  { hash: '#/signals', label: '進出場名單' },
  { hash: '#/all', label: '全部標的' },
  { hash: '#/backtest', label: '回測與實測' },
];

const useHash = (): string => {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const onChange = () => { setHash(window.location.hash || '#/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
};

export function App() {
  const hash = useHash();
  const universe = useJson<UniversePayload>('/data/universe.json');
  const market = useJson<MarketPayload>('/data/market.json');
  const backtest = useJson<BacktestPayload>('/data/backtest.json');
  const track = useJson<TrackPayload>('/data/track.json');
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);
  const toggleWatch = (ticker: string) => setWatchlist((list) => { const next = list.includes(ticker) ? list.filter((item) => item !== ticker) : [...list, ticker]; saveWatchlist(next); return next; });

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q || !universe.data) return [];
    const rows = universe.data.rows;
    return [...rows.filter((row) => row.ticker.startsWith(q)), ...rows.filter((row) => !row.ticker.startsWith(q) && row.name.toUpperCase().includes(q))].slice(0, 8);
  }, [query, universe.data]);
  const go = (ticker: string) => { setQuery(''); window.location.hash = `#/s/${ticker}`; };

  const error = universe.error ?? market.error;
  const [path, search = ''] = hash.split('?');
  const params = new URLSearchParams(search);
  const stockTicker = path.startsWith('#/s/') ? decodeURIComponent(path.slice(4)) : null;
  const active = stockTicker ? '#/all' : NAV.find((item) => item.hash === path)?.hash ?? '#/';
  const darkNow = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  let page: React.ReactNode;
  if (error) page = <div className="notice notice-error"><strong>資料載入失敗</strong><p>讀不到今天的資料檔（{error}）。請重新整理；若持續發生，代表每日資料更新沒有成功。</p></div>;
  else if (!universe.data || !market.data) page = <div className="notice">載入資料中…</div>;
  else if (stockTicker) page = <Stock ticker={stockTicker} universe={universe.data} watchlist={watchlist} onToggleWatch={toggleWatch} />;
  else if (path === '#/signals') page = <Signals universe={universe.data} market={market.data} backtest={backtest.data} />;
  else if (path === '#/all') page = <Screener key={search} universe={universe.data} watchlist={watchlist} onToggleWatch={toggleWatch} initialSector={params.get('sector') ?? undefined} />;
  else if (path === '#/backtest') page = <Backtest backtest={backtest.data} track={track.data} error={backtest.error} />;
  else page = <Overview universe={universe.data} market={market.data} backtest={backtest.data} />;

  return (
    <div className="app">
      <header className="masthead">
        <a className="brand" href="#/">
          <span className="brand-sign">Liberty Lens</span>
          <span className="brand-sub">美股中長期透鏡</span>
        </a>
        <nav className="nav" aria-label="主要頁面">
          {NAV.map((item) => <a key={item.hash} href={item.hash} aria-current={active === item.hash ? 'page' : undefined}>{item.label}</a>)}
        </nav>
        <div className="tools">
          <div className="search">
            <input type="search" value={query} placeholder="找代號或公司，例如 AAPL" aria-label="搜尋股票或 ETF" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && matches[0]) go(matches[0].ticker); if (event.key === 'Escape') setQuery(''); }} />
            {matches.length ? <ul className="search-list">{matches.map((row) => <li key={row.ticker}><button type="button" onClick={() => go(row.ticker)}><b>{row.ticker}</b><span>{row.name}</span></button></li>)}</ul> : null}
          </div>
          <button type="button" className="ghost" onClick={() => setTheme(darkNow ? 'light' : 'dark')}>{darkNow ? '淺色' : '深色'}</button>
        </div>
      </header>
      {universe.data ? (
        <p className="asof">
          資料為 {fmtDate(universe.data.meta.asOf)} 美股收盤。中期訊號依 {fmtDate(universe.data.meta.midBar)} 當週收盤、長期訊號依 {fmtDate(universe.data.meta.longBar)} 月底收盤判定；未走完的週與月只列為「待確認」。
        </p>
      ) : null}
      <main>{page}</main>
      <footer className="footer">
        <p>本站是依固定規則計算的趨勢訊號，不是投資建議，也不預測漲跌。報酬為含息還原的總報酬，未計交易成本與稅。回測使用今日的指數成分股，已下市或被剔除的公司不在其中，個股的歷史數字因此偏樂觀。</p>
        <p>價格資料來源 Yahoo Finance，成分股名單來源 Wikipedia 與 Nasdaq。{universe.data ? `規則版本 v${universe.data.meta.rulesVersion}，資料產生於 ${universe.data.meta.generatedAt.slice(0, 16).replace('T', ' ')} UTC。` : ''}</p>
      </footer>
    </div>
  );
}
