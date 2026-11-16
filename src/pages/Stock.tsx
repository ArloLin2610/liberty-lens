import { useMemo, useState } from 'react';
import { Pct, Segmented } from '@/components/Bits';
import { LineChart } from '@/components/LineChart';
import { ViewPlaque } from '@/components/Plaque';
import { buildChartModel } from '@/lib/chartModel';
import { dataUrl, useJson } from '@/lib/data';
import { fmtDay, fmtPrice, HORIZON_HINT, HORIZON_LABEL, LINE_NAME, PERIOD_NAME, zoneSentence } from '@/lib/format';
import type { Horizon } from '@/lib/signals';
import type { HistoryPayload, HorizonView, UniversePayload } from '@/lib/types';

function ReadingCard({ horizon, view }: { horizon: Horizon; view: HorizonView | null }) {
  const line = LINE_NAME[horizon];
  return (
    <section className="panel reading">
      <header><h2>{HORIZON_LABEL[horizon]}<small>{HORIZON_HINT[horizon]}</small></h2><ViewPlaque view={view} /></header>
      {view ? (
        <>
          <p className="reading-text">{zoneSentence(view, horizon)}</p>
          {view.pending ? <p className="reading-pending">本{horizon === 'mid' ? '週' : '月'}還沒走完：如果收盤維持在現價，趨勢會{view.pending === 'in' ? '翻多' : '翻空'}。</p> : null}
          <dl className="facts">
            <div><dt>{view.in ? '多頭起始' : '空頭起始'}</dt><dd>{fmtDay(view.sinceT)}</dd></div>
            <div><dt>起始至今</dt><dd><Pct value={view.sinceRet} /></dd></div>
            <div><dt>{view.in ? `出場線（${line}）` : `趨勢線（${line}）`}</dt><dd>{fmtPrice(view.line)}</dd></div>
            <div><dt>收盤距趨勢線</dt><dd><Pct value={view.vsSlow} /></dd></div>
            <div><dt>強度排名</dt><dd>{view.strengthPct == null ? '—' : `贏過 ${view.strengthPct}% 的股票`}</dd></div>
            <div><dt>{horizon === 'mid' ? '近 26 週報酬' : '近 12 個月報酬'}</dt><dd><Pct value={view.strength} /></dd></div>
          </dl>
        </>
      ) : <p className="reading-text">上市時間太短，這條規則需要至少 {horizon === 'mid' ? '40 週' : '13 個月'}的價格才能判定。</p>}
    </section>
  );
}

export function Stock({ ticker, universe, watchlist, onToggleWatch }: { ticker: string; universe: UniversePayload; watchlist: string[]; onToggleWatch: (ticker: string) => void }) {
  const row = universe.rows.find((item) => item.ticker === ticker.toUpperCase());
  const history = useJson<HistoryPayload>(row ? dataUrl(`h/${row.ticker}.json`) : null);
  const [horizon, setHorizon] = useState<Horizon>('mid');
  const [years, setYears] = useState<number | null>(5);
  const model = useMemo(() => (history.data ? buildChartModel(history.data, horizon, years) : null), [history.data, horizon, years]);

  if (!row) return <div className="notice notice-error"><strong>找不到 {ticker}</strong><p>本站只涵蓋 S&P 500、Nasdaq-100 成分股與 30 檔主要 ETF。<a href="#/all">回到全部標的</a></p></div>;
  const watched = watchlist.includes(row.ticker);
  const view = row[horizon];
  const sim = view?.sim ?? null;
  const trades = model ? [...model.analysis.trades].reverse() : [];
  const barsPerYear = horizon === 'mid' ? 52 : 12;
  const closed = trades.filter((trade) => !trade.open);
  const wins = closed.filter((trade) => trade.returnPct > 0).length;

  return (
    <>
      <div className="page-head stock-head">
        <div>
          <h1><span className="ticker-big">{row.ticker}</span>{row.name}</h1>
          <p className="lede">{row.kind === 'etf' ? `${row.industry} ETF（${row.sector}）` : `${row.sector}，${row.industry}${row.indexes.length ? `。${row.indexes.map((index) => (index === 'SP' ? 'S&P 500' : 'Nasdaq-100')).join('與 ')} 成分股` : ''}`}</p>
        </div>
        <div className="stock-price">
          <strong className="num">{fmtPrice(row.price)}</strong>
          <span>{fmtDay(row.asOf)} 收盤，近 1 週 <Pct value={row.r1w} /></span>
          <button type="button" className={`ghost${watched ? ' on' : ''}`} aria-pressed={watched} onClick={() => onToggleWatch(row.ticker)}>{watched ? '★ 已在觀察清單' : '☆ 加入觀察清單'}</button>
        </div>
      </div>

      <div className="split">
        <ReadingCard horizon="mid" view={row.mid} />
        <ReadingCard horizon="long" view={row.long} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>走勢與規則的進出點</h2>
          <div className="controls">
            <Segmented label="規則" value={horizon} onChange={setHorizon} options={[{ value: 'mid', label: '中期（週線）' }, { value: 'long', label: '長期（月線）' }]} />
            <Segmented label="期間" value={String(years ?? 'all')} onChange={(value) => setYears(value === 'all' ? null : Number(value))} options={[{ value: '3', label: '3 年' }, { value: '5', label: '5 年' }, { value: '10', label: '10 年' }, { value: 'all', label: '全部' }]} />
          </div>
        </div>
        {model ? <LineChart series={model.series} bands={model.bands} bandLabel="規則持有期間" markers={model.markers} log={years == null || years >= 10} height={380} format={(v) => (v === 0 ? '$0' : `$${v < 10 ? v.toFixed(2) : v.toFixed(0)}`)} ariaLabel={`${row.ticker} ${HORIZON_LABEL[horizon]}走勢與趨勢線`} /> : <div className="chart-empty">{history.error ? '走勢資料讀取失敗，請重新整理。' : '載入走勢…'}</div>}
        <p className="note">價格為含息還原價（把歷年股息與分割算回去），所以早年的數字會低於當時的實際報價。{years == null || years >= 10 ? '縱軸為對數刻度，相同的垂直距離代表相同的漲跌幅。' : ''}</p>
      </section>

      <div className="split">
        <section className="panel">
          <h2>照{HORIZON_LABEL[horizon]}規則操作的歷史結果</h2>
          {sim ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>過去 {sim.years.toFixed(0)} 年</th><th className="r">年化報酬</th><th className="r">最大跌幅</th><th className="r">持有時間</th></tr></thead>
                  <tbody>
                    <tr><td>照規則進出</td><td className="r"><Pct value={sim.ruleCagr} /></td><td className="r"><Pct value={sim.ruleDd} /></td><td className="r num">{sim.timeIn}%</td></tr>
                    <tr><td>一直抱著</td><td className="r"><Pct value={sim.holdCagr} /></td><td className="r"><Pct value={sim.holdDd} /></td><td className="r num">100%</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="note">共 {sim.trades} 次進場{closed.length ? `，已結束的 ${closed.length} 次中 ${wins} 次獲利` : ''}。出場期間的現金以 3 個月國庫券殖利率計息，未計交易成本與稅。{sim.ruleCagr < sim.holdCagr ? '在這檔標的上，規則換到的是較小的跌幅，代價是較低的報酬。' : '在這檔標的上，規則的報酬高於一直抱著；這不常見，不代表未來也會如此。'}</p>
            </>
          ) : <p className="empty">歷史不足兩年，無法模擬。</p>}
        </section>
        <section className="panel">
          <h2>報酬與風險</h2>
          <dl className="facts">
            <div><dt>近 4 週</dt><dd><Pct value={row.r4w} /></dd></div>
            <div><dt>近 13 週</dt><dd><Pct value={row.r13w} /></dd></div>
            <div><dt>近 26 週</dt><dd><Pct value={row.r26w} /></dd></div>
            <div><dt>近 52 週</dt><dd><Pct value={row.r52w} /></dd></div>
            <div><dt>3 年年化</dt><dd><Pct value={row.cagr3y} /></dd></div>
            <div><dt>5 年年化</dt><dd><Pct value={row.cagr5y} /></dd></div>
            <div><dt>距 52 週高點</dt><dd><Pct value={row.fromHigh} /></dd></div>
            <div><dt>5 年最大跌幅</dt><dd><Pct value={row.dd5y} /></dd></div>
            <div><dt>年化波動率</dt><dd>{row.vol == null ? '—' : `${row.vol}%`}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel">
        <h2>{HORIZON_LABEL[horizon]}規則的每一次進出</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>進場日</th><th className="r">進場價</th><th>出場日</th><th className="r">出場價</th><th className="r">報酬</th><th className="r">持有</th></tr></thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.entryT}>
                  <td className="num">{fmtDay(trade.entryT)}</td><td className="r num">{fmtPrice(trade.entryClose)}</td>
                  <td className="num">{trade.open ? '持有中' : fmtDay(trade.exitT)}</td><td className="r num">{trade.open ? '—' : fmtPrice(trade.exitClose)}</td>
                  <td className="r"><Pct value={trade.returnPct} /></td><td className="r num">{trade.bars >= barsPerYear ? `${(trade.bars / barsPerYear).toFixed(1)} 年` : `${trade.bars} ${PERIOD_NAME[horizon]}`}</td>
                </tr>
              ))}
              {!trades.length ? <tr><td colSpan={6} className="empty">{model ? '資料期間內，這條規則沒有發生過由空翻多的進場。' : '載入中…'}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="note">進出價為訊號當{horizon === 'mid' ? '週' : '月'}的收盤價（含息還原）。資料起點之前就已經在多頭的那一段不列入，因為不知道實際進場點。</p>
      </section>
    </>
  );
}
