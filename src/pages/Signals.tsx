import { useMemo, useState } from 'react';
import { Pct, Segmented, TickerCell } from '@/components/Bits';
import { ViewPlaque } from '@/components/Plaque';
import { exitList, leadList } from '@/lib/forward';
import { fmtDay, fmtPct, fmtPrice, HORIZON_HINT, LINE_NAME, PERIOD_NAME } from '@/lib/format';
import type { Horizon } from '@/lib/signals';
import type { BacktestPayload, MarketPayload, SymbolRow, UniversePayload } from '@/lib/types';

const PAGE = 20;

export function Signals({ universe, market, backtest }: { universe: UniversePayload; market: MarketPayload; backtest: BacktestPayload | null }) {
  const [horizon, setHorizon] = useState<Horizon>('mid');
  const [allLeads, setAllLeads] = useState(false);
  const [allExits, setAllExits] = useState(false);
  const rows = universe.rows;
  const leads = useMemo(() => leadList(rows, horizon, Infinity), [rows, horizon]);
  const exits = useMemo(() => exitList(rows, horizon, Infinity), [rows, horizon]);
  const fresh = useMemo(() => rows.filter((row) => row.kind === 'stock' && row[horizon]?.in && row[horizon]?.fresh).sort((a, b) => (b[horizon]?.sinceT ?? 0) - (a[horizon]?.sinceT ?? 0)), [rows, horizon]);
  const etfs = useMemo(() => rows.filter((row) => row.kind === 'etf'), [rows]);
  const study = backtest?.study[horizon];
  const riskOn = horizon === 'mid' ? market.stance.spyMid : market.stance.spyLong;
  const lead = study?.groups.lead, on = study?.groups.leadRiskOn, off = study?.groups.leadRiskOff;
  const period = PERIOD_NAME[horizon], line = LINE_NAME[horizon];
  const strengthName = horizon === 'mid' ? '近 26 週報酬' : '近 12 個月報酬（不含最近 1 個月）';
  const view = (row: SymbolRow) => row[horizon];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>進出場名單</h1>
          <p className="lede">依 {horizon === 'mid' ? universe.meta.midBar.replace(/-/g, '/') + ' 當週' : universe.meta.longBar.replace(/-/g, '/') + ' 月底'}收盤判定，只列個股；ETF 在本頁最下方。</p>
        </div>
        <Segmented label="訊號週期" value={horizon} onChange={(value) => { setHorizon(value); setAllLeads(false); setAllExits(false); }} options={[{ value: 'mid', label: '中期', hint: HORIZON_HINT.mid }, { value: 'long', label: '長期', hint: HORIZON_HINT.long }]} />
      </div>

      <div className={`notice ${riskOn ? 'notice-go' : 'notice-stop'}`}>
        <strong>{riskOn ? `S&P 500 ${horizon === 'mid' ? '中期' : '長期'}趨勢為多頭，進場候選可以照規則執行。` : `S&P 500 ${horizon === 'mid' ? '中期' : '長期'}趨勢為空頭，進場候選的歷史表現在這種時候落後，建議先不新進場。`}</strong>
        {lead && on && off ? <p>回測中，進場候選之後 {study.bars[1]} {period}平均報酬 {fmtPct(lead[1].average)}，比同期全體股票多 {fmtPct(lead[1].excess)}；大盤多頭時多 {fmtPct(on[1].excess)}，大盤空頭時 {fmtPct(off[1].excess)}。這是平均值，單一股票的結果差異很大。</p> : null}
      </div>

      <section className="panel">
        <h2>進場候選 <span className="count">{leads.length} 檔</span></h2>
        <p className="lede">條件：趨勢為多頭，且{strengthName}排在全部股票的前 20%。依強度排序。「距出場線」越大，訊號出場時回吐越多。</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th className="r">#</th><th>股票</th><th>產業</th><th className="r">收盤</th><th className="r">{horizon === 'mid' ? '26 週報酬' : '12 個月報酬'}</th><th className="r">強度排名</th><th className="r">距出場線（{line}）</th><th>多頭起始</th><th className="r">起始至今</th></tr></thead>
            <tbody>
              {(allLeads ? leads : leads.slice(0, PAGE)).map((row, index) => (
                <tr key={row.ticker}>
                  <td className="r num muted">{index + 1}</td><td><TickerCell row={row} />{view(row)?.fresh ? <span className="flag">新</span> : null}</td><td>{row.sector}</td><td className="r num">{fmtPrice(row.price)}</td>
                  <td className="r"><Pct value={view(row)?.strength} /></td><td className="r num">前 {Math.max(1, 100 - (view(row)?.strengthPct ?? 0))}%</td>
                  <td className="r"><Pct value={view(row)?.vsSlow} /></td><td className="num">{fmtDay(view(row)?.sinceT)}</td><td className="r"><Pct value={view(row)?.sinceRet} /></td>
                </tr>
              ))}
              {!leads.length ? <tr><td colSpan={9} className="empty">目前沒有符合條件的股票。</td></tr> : null}
            </tbody>
          </table>
        </div>
        {leads.length > PAGE ? <button type="button" className="ghost" onClick={() => setAllLeads((value) => !value)}>{allLeads ? `只看前 ${PAGE} 檔` : `顯示全部 ${leads.length} 檔`}</button> : null}
      </section>

      <section className="panel">
        <h2>出場與警示 <span className="count">{exits.length} 檔</span></h2>
        <p className="lede">「出場」是趨勢在最近 {horizon === 'mid' ? '4 週' : '3 個月'}內轉空；「跌破警示」是收盤已在{line}之下，但出場條件還沒全部成立。持有中的股票出現在這裡，才需要處理。</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>股票</th><th>狀態</th><th>產業</th><th className="r">收盤</th><th>訊號日</th><th className="r">距{line}</th><th className="r">近 4 週</th><th className="r">近 52 週</th></tr></thead>
            <tbody>
              {(allExits ? exits : exits.slice(0, PAGE)).map((row) => (
                <tr key={row.ticker}>
                  <td><TickerCell row={row} /></td><td><ViewPlaque view={view(row)} small /></td><td>{row.sector}</td><td className="r num">{fmtPrice(row.price)}</td>
                  <td className="num">{view(row)?.zone === 'exit' ? fmtDay(view(row)?.sinceT) : '尚未確認'}</td><td className="r"><Pct value={view(row)?.vsSlow} /></td><td className="r"><Pct value={row.r4w} /></td><td className="r"><Pct value={row.r52w} /></td>
                </tr>
              ))}
              {!exits.length ? <tr><td colSpan={8} className="empty">目前沒有出場或警示中的股票。</td></tr> : null}
            </tbody>
          </table>
        </div>
        {exits.length > PAGE ? <button type="button" className="ghost" onClick={() => setAllExits((value) => !value)}>{allExits ? `只看前 ${PAGE} 檔` : `顯示全部 ${exits.length} 檔`}</button> : null}
      </section>

      <section className="panel">
        <h2>剛翻多的股票 <span className="count">{fresh.length} 檔</span></h2>
        <p className="lede">趨勢在最近 {horizon === 'mid' ? '4 週' : '3 個月'}內由空轉多。強度不一定在前 20%；回測中，剛翻多本身沒有超額報酬，它的用途是告訴你趨勢條件已經成立。</p>
        <div className="chips">
          {fresh.map((row) => <a key={row.ticker} href={`#/s/${row.ticker}`} className="chip"><b>{row.ticker}</b><span>{fmtDay(view(row)?.sinceT).slice(5)}</span>{view(row)?.zone === 'lead' ? <i>候選</i> : null}</a>)}
          {!fresh.length ? <p className="empty">最近沒有新翻多的股票。</p> : null}
        </div>
      </section>

      <section className="panel">
        <h2>ETF 的{horizon === 'mid' ? '中期' : '長期'}狀態</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>ETF</th><th>類別</th><th>狀態</th><th>起始</th><th className="r">起始至今</th><th className="r">距{line}</th><th className="r">近 13 週</th><th className="r">近 52 週</th></tr></thead>
            <tbody>
              {etfs.map((row) => (
                <tr key={row.ticker}>
                  <td><TickerCell row={row} /></td><td>{row.industry}<small className="muted">　{row.sector}</small></td><td><ViewPlaque view={view(row)} small /></td>
                  <td className="num">{fmtDay(view(row)?.sinceT)}</td><td className="r"><Pct value={view(row)?.sinceRet} /></td><td className="r"><Pct value={view(row)?.vsSlow} /></td><td className="r"><Pct value={row.r13w} /></td><td className="r"><Pct value={row.r52w} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
