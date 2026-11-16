import { useMemo, useState } from 'react';
import { Pct, TickerCell } from '@/components/Bits';
import { ViewPlaque } from '@/components/Plaque';
import { fmtPrice, ZONE_LABEL, ZONE_ORDER } from '@/lib/format';
import type { SymbolRow, UniversePayload, ZoneName } from '@/lib/types';

type SortKey = 'ticker' | 'price' | 'r4w' | 'r26w' | 'r52w' | 'cagr5y' | 'fromHigh' | 'dd5y' | 'midStrength' | 'longStrength';
const value = (row: SymbolRow, key: SortKey): number | string | null => {
  if (key === 'ticker') return row.ticker;
  if (key === 'midStrength') return row.mid?.strengthPct ?? null;
  if (key === 'longStrength') return row.long?.strengthPct ?? null;
  return row[key];
};
const PAGE = 50;

export function Screener({ universe, watchlist, onToggleWatch, initialSector }: { universe: UniversePayload; watchlist: string[]; onToggleWatch: (ticker: string) => void; initialSector?: string }) {
  const [kind, setKind] = useState<'all' | 'stock' | 'etf' | 'watch'>('all');
  const [sector, setSector] = useState(initialSector ?? '');
  const [mid, setMid] = useState<ZoneName | ''>('');
  const [long, setLong] = useState<ZoneName | ''>('');
  const [text, setText] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'midStrength', dir: -1 });
  const [page, setPage] = useState(0);
  const sectors = useMemo(() => [...new Set(universe.rows.filter((row) => row.kind === 'stock').map((row) => row.sector))].sort((a, b) => a.localeCompare(b, 'zh-Hant')), [universe.rows]);

  const filtered = useMemo(() => {
    const q = text.trim().toUpperCase();
    const list = universe.rows.filter((row) =>
      (kind === 'all' || (kind === 'watch' ? watchlist.includes(row.ticker) : row.kind === kind))
      && (!sector || row.sector === sector) && (!mid || row.mid?.zone === mid) && (!long || row.long?.zone === long)
      && (!q || row.ticker.includes(q) || row.name.toUpperCase().includes(q)));
    return list.sort((a, b) => {
      const va = value(a, sort.key), vb = value(b, sort.key);
      if (va == null && vb == null) return a.ticker.localeCompare(b.ticker);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)) * sort.dir || a.ticker.localeCompare(b.ticker);
    });
  }, [universe.rows, kind, sector, mid, long, text, sort, watchlist]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE)), current = Math.min(page, pages - 1);
  const reset = () => setPage(0);
  const header = (key: SortKey, label: string, right = true) => (
    <th className={right ? 'r' : ''} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="sort" onClick={() => { setSort((now) => ({ key, dir: now.key === key ? (now.dir === 1 ? -1 : 1) : key === 'ticker' ? 1 : -1 })); reset(); }}>{label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
    </th>
  );

  return (
    <>
      <div className="page-head"><div><h1>全部標的</h1><p className="lede">{universe.meta.stocks} 檔個股（S&P 500 與 Nasdaq-100）與 {universe.meta.etfs} 檔 ETF。點星號加入觀察清單，清單只存在這台裝置的瀏覽器裡。</p></div></div>
      <section className="panel">
        <div className="filters">
          <label>範圍<select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); reset(); }}><option value="all">全部</option><option value="stock">個股</option><option value="etf">ETF</option><option value="watch">我的觀察清單（{watchlist.length}）</option></select></label>
          <label>產業<select value={sector} onChange={(event) => { setSector(event.target.value); reset(); }}><option value="">全部產業</option>{sectors.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label>中期狀態<select value={mid} onChange={(event) => { setMid(event.target.value as ZoneName | ''); reset(); }}><option value="">不限</option>{ZONE_ORDER.map((zone) => <option key={zone} value={zone}>{ZONE_LABEL[zone]}</option>)}</select></label>
          <label>長期狀態<select value={long} onChange={(event) => { setLong(event.target.value as ZoneName | ''); reset(); }}><option value="">不限</option>{ZONE_ORDER.map((zone) => <option key={zone} value={zone}>{ZONE_LABEL[zone]}</option>)}</select></label>
          <label>代號或名稱<input type="search" value={text} onChange={(event) => { setText(event.target.value); reset(); }} placeholder="例如 NVDA" /></label>
          <span className="count">符合 {filtered.length} 檔</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th aria-label="觀察清單" />{header('ticker', '標的', false)}<th>產業</th>{header('price', '收盤')}<th>中期</th><th>長期</th>{header('midStrength', '中期強度')}{header('longStrength', '長期強度')}{header('r4w', '近 4 週')}{header('r26w', '近 26 週')}{header('r52w', '近 52 週')}{header('cagr5y', '5 年年化')}{header('fromHigh', '距 52 週高')}{header('dd5y', '5 年最大跌幅')}</tr></thead>
            <tbody>
              {filtered.slice(current * PAGE, current * PAGE + PAGE).map((row) => (
                <tr key={row.ticker}>
                  <td><button type="button" className={`star${watchlist.includes(row.ticker) ? ' on' : ''}`} aria-pressed={watchlist.includes(row.ticker)} aria-label={`${watchlist.includes(row.ticker) ? '移出' : '加入'}觀察清單：${row.ticker}`} onClick={() => onToggleWatch(row.ticker)}>{watchlist.includes(row.ticker) ? '★' : '☆'}</button></td>
                  <td><TickerCell row={row} /></td><td>{row.sector}</td><td className="r num">{fmtPrice(row.price)}</td>
                  <td><ViewPlaque view={row.mid} small /></td><td><ViewPlaque view={row.long} small /></td>
                  <td className="r num">{row.mid?.strengthPct ?? '—'}</td><td className="r num">{row.long?.strengthPct ?? '—'}</td>
                  <td className="r"><Pct value={row.r4w} /></td><td className="r"><Pct value={row.r26w} /></td><td className="r"><Pct value={row.r52w} /></td><td className="r"><Pct value={row.cagr5y} /></td><td className="r"><Pct value={row.fromHigh} /></td><td className="r"><Pct value={row.dd5y} /></td>
                </tr>
              ))}
              {!filtered.length ? <tr><td colSpan={14} className="empty">{kind === 'watch' && !watchlist.length ? '觀察清單還是空的。在任一列點星號就能加入。' : '沒有符合條件的標的，放寬篩選條件試試。'}</td></tr> : null}
            </tbody>
          </table>
        </div>
        {pages > 1 ? <div className="pager"><button type="button" className="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>上一頁</button><span className="num">第 {current + 1} / {pages} 頁</span><button type="button" className="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>下一頁</button></div> : null}
        <p className="note">強度是該股票的漲幅在全部個股中的百分位（100 最強）：中期看近 26 週，長期看近 12 個月但不含最近 1 個月。</p>
      </section>
    </>
  );
}
