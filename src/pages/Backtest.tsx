import { useState } from 'react';
import { Pct, Segmented } from '@/components/Bits';
import { LineChart } from '@/components/LineChart';
import { fmtDate, fmtNum, fmtPct, HORIZON_LABEL, PERIOD_NAME } from '@/lib/format';
import type { Horizon } from '@/lib/signals';
import type { BacktestPayload, TrackPayload } from '@/lib/types';

const GROUPS: Array<{ key: string; label: string; note?: string }> = [
  { key: 'all', label: '全體股票', note: '比較基準' },
  { key: 'lead', label: '進場候選' },
  { key: 'leadRiskOn', label: '進場候選，大盤多頭時' },
  { key: 'leadRiskOff', label: '進場候選，大盤空頭時' },
  { key: 'hold', label: '多頭續抱' },
  { key: 'freshIn', label: '剛翻多' },
  { key: 'warn', label: '跌破警示' },
  { key: 'exit', label: '出場後' },
  { key: 'watch', label: '轉強觀察' },
  { key: 'avoid', label: '觀望' },
];
const LISTS: Array<{ key: string; label: string }> = [{ key: 'midLead', label: '中期進場' }, { key: 'midExit', label: '中期出場' }, { key: 'longLead', label: '長期進場' }, { key: 'longExit', label: '長期出場' }];

export function Backtest({ backtest, track, error }: { backtest: BacktestPayload | null; track: TrackPayload | null; error: string | null }) {
  const [horizon, setHorizon] = useState<Horizon>('mid');
  const [curve, setCurve] = useState<'SPY' | 'QQQ'>('SPY');
  if (error) return <div className="notice notice-error"><strong>回測資料載入失敗</strong><p>{error}</p></div>;
  if (!backtest) return <div className="notice">載入回測資料…</div>;
  const study = backtest.study[horizon], stocks = backtest.stocks[horizon], period = PERIOD_NAME[horizon];
  const spy = backtest.etf.find((item) => item.ticker === 'SPY');
  const curves = backtest.curves[curve];
  const lead = study.groups.lead, exit = study.groups.exit;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>規則的作用是少跌，不是多賺</h1>
          <p className="lede">把同一套規則套回過去 24 年的結果。看完再決定要不要照它做。</p>
        </div>
      </div>

      <section className="panel findings">
        <ol>
          {spy?.long && spy.mid ? <li><strong>在大盤 ETF 上，規則用少一點的報酬換來小很多的跌幅。</strong>SPY 一直抱著年化 {fmtPct(spy.long.holdCagr, 1, false)}、最深跌 {fmtPct(spy.long.holdDd, 0, false)}；照長期規則年化 {fmtPct(spy.long.ruleCagr, 1, false)}、最深跌 {fmtPct(spy.long.ruleDd, 0, false)}，{spy.long.years.toFixed(0)} 年只進出 {spy.long.trades} 次。</li> : null}
          <li><strong>在個股上，照規則進出的報酬通常輸給一直抱著。</strong>{stocks.n} 檔有 10 年以上資料的股票中，只有 {stocks.beatPct.toFixed(0)}% 的報酬贏過一直抱著，但 {stocks.shallowerPct.toFixed(0)}% 的最大跌幅比較小（中位數 {fmtPct(stocks.medianRuleDd, 0, false)} 對 {fmtPct(stocks.medianHoldDd, 0, false)}）。這些都是存活到今天的公司，一直抱著的數字被高估了。</li>
          <li><strong>「進場候選」有小幅優勢，而且只在大盤多頭時。</strong>之後 {study.bars[1]} {period}平均比全體股票多 {fmtPct(lead[1].excess)}；大盤多頭時 {fmtPct(study.groups.leadRiskOn[1].excess)}，空頭時 {fmtPct(study.groups.leadRiskOff[1].excess)}。</li>
          <li><strong>出場訊號之後，股票平均並沒有比較差。</strong>出場後 {study.bars[1]} {period}的平均報酬與全體股票差 {fmtPct(exit[1].excess)}。出場的價值在於躲開少數跌很深的個案與整段空頭，不是因為訊號之後一定會跌。</li>
        </ol>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>1 元變成多少：一直抱著與兩條規則</h2>
          <Segmented label="標的" value={curve} onChange={setCurve} options={[{ value: 'SPY', label: 'SPY' }, { value: 'QQQ', label: 'QQQ' }]} />
        </div>
        <LineChart log height={340} format={(v) => `${v.toFixed(v < 10 ? 1 : 0)} 倍`} ariaLabel={`${curve} 一直抱著與兩條規則的資產變化`}
          series={[
            { name: '一直抱著', color: 'var(--c-ink)', t: curves.mid.t, v: curves.mid.hold },
            { name: '中期規則', color: 'var(--c-1)', t: curves.mid.t, v: curves.mid.rule },
            { name: '長期規則', color: 'var(--c-2)', t: curves.long.t, v: curves.long.rule },
          ]} />
        <p className="note">縱軸為對數刻度。出場期間的現金以 3 個月國庫券殖利率計息；未計交易成本與稅。</p>
      </section>

      <section className="panel">
        <h2>各 ETF 照規則進出的結果</h2>
        <div className="table-wrap">
          <table className="grouped">
            <thead>
              <tr><th rowSpan={2}>ETF</th><th rowSpan={2} className="r">年數</th><th colSpan={2} className="c">一直抱著</th><th colSpan={3} className="c">中期規則</th><th colSpan={3} className="c">長期規則</th></tr>
              <tr><th className="r">年化</th><th className="r">最大跌幅</th><th className="r">年化</th><th className="r">最大跌幅</th><th className="r">進場次數</th><th className="r">年化</th><th className="r">最大跌幅</th><th className="r">進場次數</th></tr>
            </thead>
            <tbody>
              {backtest.etf.filter((item) => item.mid && item.long).map((item) => (
                <tr key={item.ticker}>
                  <td><a className="ticker-cell" href={`#/s/${item.ticker}`}><b>{item.ticker}</b><span>{item.name}</span></a></td><td className="r num">{item.mid!.years.toFixed(0)}</td>
                  <td className="r"><Pct value={item.mid!.holdCagr} /></td><td className="r"><Pct value={item.mid!.holdDd} digits={0} /></td>
                  <td className="r"><Pct value={item.mid!.ruleCagr} /></td><td className="r"><Pct value={item.mid!.ruleDd} digits={0} /></td><td className="r num">{item.mid!.trades}</td>
                  <td className="r"><Pct value={item.long!.ruleCagr} /></td><td className="r"><Pct value={item.long!.ruleDd} digits={0} /></td><td className="r num">{item.long!.trades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">ETF 不受「只看存活公司」的偏誤影響，這張表是整頁最可信的部分。</p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>各種狀態之後的報酬（個股）</h2>
          <Segmented label="規則" value={horizon} onChange={setHorizon} options={[{ value: 'mid', label: '中期' }, { value: 'long', label: '長期' }]} />
        </div>
        <p className="lede">{fmtDate(study.from)} 到 {fmtDate(study.to)}，每{horizon === 'mid' ? '週' : '月'}檢查每一檔股票當時的狀態，記下之後的報酬。「超額」是比同一時間全體股票的平均多多少。</p>
        <div className="table-wrap">
          <table className="grouped">
            <thead>
              <tr><th rowSpan={2}>當時的狀態</th>{study.bars.map((bars) => <th key={bars} colSpan={3} className="c">之後 {bars} {period}</th>)}<th rowSpan={2} className="r">樣本數</th></tr>
              <tr>{study.bars.map((bars) => [<th key={`${bars}a`} className="r">平均</th>, <th key={`${bars}e`} className="r">超額</th>, <th key={`${bars}w`} className="r">上漲機率</th>])}</tr>
            </thead>
            <tbody>
              {GROUPS.map((group) => {
                const stats = study.groups[group.key];
                if (!stats) return null;
                return (
                  <tr key={group.key} className={group.key === 'lead' ? 'row-current' : ''}>
                    <td>{group.label}{group.note ? <small className="muted">　{group.note}</small> : null}</td>
                    {stats.map((stat, index) => [<td key={`${index}a`} className="r"><Pct value={stat.average} /></td>, <td key={`${index}e`} className="r">{group.key === 'all' ? <span className="muted">—</span> : <Pct value={stat.excess} />}</td>, <td key={`${index}w`} className="r num">{stat.winRate == null ? '—' : `${stat.winRate}%`}</td>])}
                    <td className="r num">{fmtNum(stats[0].samples)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">「觀望」的股票之後報酬偏高，主要是存活者偏誤：十年前在空頭、今天還在指數裡的公司，一定是後來漲回來的那些；當年沒撐過去的不在資料裡。「進場候選」的定義（強度前 20%）是看過第一輪回測後才定的，所以它的數字是樣本內結果，要靠下面的實測來驗證。</p>
        <h3>逐年：進場候選之後 {study.bars[1]} {period}的超額報酬</h3>
        <div className="years">
          {study.byYear.filter((row) => row.lead.samples >= 200).map((row, _, list) => {
            const largest = Math.max(1, ...list.map((item) => Math.abs(item.lead.excess ?? 0)));
            const value = row.lead.excess ?? 0, size = (Math.abs(value) / largest) * 100;
            return <div key={row.year} className="year"><span className="num">{row.year}</span><span className="year-bar"><i className={value >= 0 ? 'pos' : 'neg'} style={{ width: `${size / 2}%`, [value >= 0 ? 'left' : 'right']: '50%' }} /></span><Pct value={row.lead.excess} /></div>;
          })}
        </div>
        <p className="note">依訊號發生的年份分組。{horizon === 'long' ? '最近三年的訊號還沒滿 36 個月，所以不在表內。' : '優勢不是每年都有，連續兩三年落後是正常的。'}</p>
      </section>

      <section className="panel">
        <h2>實測追蹤：之後才知道的部分</h2>
        <p className="lede">回測只能說明規則在過去的表現。每週收盤後，系統會把當週的四份名單（各前 20 檔）存檔，之後不能修改，再拿之後的實際價格來對答案。</p>
        {track && track.rows.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>名單凍結日</th><th className="r">已過週數</th>{LISTS.map((list) => <th key={list.key} className="r">{list.label}</th>)}<th className="r">全體股票</th><th className="r">SPY</th></tr></thead>
              <tbody>
                {[...track.rows].reverse().map((row) => (
                  <tr key={row.week}><td className="num">{fmtDate(row.signalDate)}</td><td className="r num">{row.weeksElapsed}</td>{LISTS.map((list) => <td key={list.key} className="r"><Pct value={row.lists[list.key]?.ret} /></td>)}<td className="r"><Pct value={row.all} /></td><td className="r"><Pct value={row.spy} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">還沒有紀錄。第一份名單會在自動排程啟用後、當週收盤時存檔，之後每週一筆。</p>}
        <p className="note">判讀方式：進場名單應該贏過全體股票，出場名單應該輸。回測中的優勢每半年只有 2 到 3 個百分點，至少要累積一年以上才分得出實力與運氣。觀察期間若修改規則，紀錄會從新版本重新起算（目前為 v{track?.rulesVersion ?? 1}）。</p>
      </section>

      <section className="panel prose">
        <h2>規則怎麼算</h2>
        <h3>中期規則（週線）</h3>
        <p>每週收盤後判定一次。收盤高於 40 週均線，而且 10 週均線高於 40 週均線，就是多頭；兩個條件都反過來才轉為空頭，中間維持原狀態。這等同常見的 50 日線與 200 日線，用週線算是為了減少雜訊。</p>
        <h3>長期規則（月線）</h3>
        <p>每月最後一個交易日判定一次。收盤高於 10 個月均線，而且過去 12 個月報酬為正，就是多頭；兩個條件都反過來才轉為空頭。</p>
        <h3>進場候選與強度</h3>
        <p>多頭中的股票，再依漲幅排名：中期看近 26 週報酬，長期看近 12 個月但不含最近 1 個月的報酬。排在全部個股前 20% 的列為進場候選，其餘為多頭續抱。</p>
        <h3>這份回測不能告訴你的事</h3>
        <ul>
          <li>成分股名單是今天的。過去 24 年中下市、被併購或被剔除的公司不在資料裡，個股的報酬數字因此偏高。</li>
          <li>假設在訊號當{horizon === 'mid' ? '週' : '月'}的收盤價成交，沒有滑價、手續費與資本利得稅。頻繁進出在美國會產生短期資本利得稅。</li>
          <li>均線參數是教科書上的標準值，事前就定好；強度門檻則是看過回測才定的。</li>
          <li>規則只看價格，不看財報、估值或新聞。</li>
        </ul>
      </section>
      <p className="note">回測涵蓋 {backtest.meta.stocks} 檔個股，資料產生於 {backtest.meta.generatedAt.slice(0, 10).replace(/-/g, '/')}。{HORIZON_LABEL[horizon]}規則的個股中位數：持有時間 {stocks.medianTimeIn}%，每年進場 {stocks.medianTradesPerYear} 次。</p>
    </>
  );
}
