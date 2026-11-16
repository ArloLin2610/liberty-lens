import { useMemo } from 'react';
import { Pct, ShareBar, TickerCell } from '@/components/Bits';
import { LineChart } from '@/components/LineChart';
import { ViewPlaque } from '@/components/Plaque';
import { buildChartModel } from '@/lib/chartModel';
import { dataUrl, useJson } from '@/lib/data';
import { fmtDay, fmtPct, fmtPrice } from '@/lib/format';
import type { BacktestPayload, HistoryPayload, MarketPayload, UniversePayload } from '@/lib/types';

const STANCE = [
  { title: '大盤逆風', body: '三項條件都不成立。歷史上這種時候的進場候選落後全體股票，規則上以減碼與觀望為主。' },
  { title: '大盤逆風', body: '三項條件只有一項成立。歷史上這種時候的進場候選落後全體股票，規則上以減碼與觀望為主。' },
  { title: '大盤中性', body: '三項條件有兩項成立。趨勢還在，但已有一項轉弱，新進場的部位放小一點。' },
  { title: '大盤順風', body: '三項條件都成立。進場候選可以照規則執行，出場線照常遵守。' },
];

export function Overview({ universe, market, backtest }: { universe: UniversePayload; market: MarketPayload; backtest: BacktestPayload | null }) {
  const spyHistory = useJson<HistoryPayload>(dataUrl('h/SPY.json'));
  const spy = universe.rows.find((row) => row.ticker === 'SPY');
  const model = useMemo(() => (spyHistory.data ? buildChartModel(spyHistory.data, 'mid', 5) : null), [spyHistory.data]);
  const stance = STANCE[market.stance.score];
  const on = backtest?.study.mid.groups.leadRiskOn?.[1], off = backtest?.study.mid.groups.leadRiskOff?.[1];
  const checks = [
    { ok: market.stance.spyMid, text: `S&P 500 中期趨勢（週線）${market.stance.spyMid ? '多頭' : '空頭'}${spy?.mid?.sinceT ? `，自 ${fmtDay(spy.mid.sinceT)} 起` : ''}` },
    { ok: market.stance.spyLong, text: `S&P 500 長期趨勢（月線）${market.stance.spyLong ? '多頭' : '空頭'}${spy?.long?.sinceT ? `，自 ${fmtDay(spy.long.sinceT)} 起` : ''}` },
    { ok: market.stance.breadthOk, text: `S&P 500 成分股有 ${market.breadth.midInNow.toFixed(0)}% 處於中期多頭（門檻 50%）` },
  ];
  const breadthSeries = [
    { name: '處於中期多頭的比例', color: 'var(--c-1)', t: market.breadth.t, v: market.breadth.midIn },
    { name: '收盤在 40 週線之上的比例', color: 'var(--c-2)', t: market.breadth.t, v: market.breadth.aboveLine, width: 1.5 },
  ];

  return (
    <>
      <section className={`hero hero-${market.stance.score >= 3 ? 'go' : market.stance.score === 2 ? 'mid' : 'stop'}`}>
        <div className="hero-text">
          <h1>{stance.title}</h1>
          <p className="hero-body">{stance.body}</p>
          <ul className="checks">
            {checks.map((check) => <li key={check.text} className={check.ok ? 'ok' : 'no'}><span aria-hidden="true">{check.ok ? '成立' : '不成立'}</span>{check.text}</li>)}
          </ul>
          {on && off ? <p className="hero-evidence">回測依據：S&P 500 中期多頭時，進場候選之後 26 週平均比全體股票{on.excess != null && on.excess >= 0 ? '多' : '少'} {fmtPct(Math.abs(on.excess ?? 0), 1, false)}；空頭時{off.excess != null && off.excess >= 0 ? '多' : '少'} {fmtPct(Math.abs(off.excess ?? 0), 1, false)}。<a href="#/backtest">看完整回測</a></p> : null}
        </div>
        <div className="hero-chart">
          <h2>S&P 500（SPY）近五年與中期趨勢線</h2>
          {model ? <LineChart series={model.series} bands={model.bands} bandLabel="規則持有期間" markers={model.markers} height={280} format={(v) => `$${v.toFixed(0)}`} ariaLabel="SPY 近五年週線、10 週線與 40 週線" /> : <div className="chart-empty">{spyHistory.error ? '走勢資料讀取失敗' : '載入走勢…'}</div>}
        </div>
      </section>

      <section className="panel">
        <h2>主要指數與資產</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>標的</th><th className="r">收盤</th><th className="r">近 1 週</th><th className="r">近 13 週</th><th className="r">近 52 週</th><th className="r">距 52 週高點</th><th>中期</th><th>長期</th></tr></thead>
            <tbody>
              {market.indexes.map((row) => (
                <tr key={row.ticker}>
                  <td><TickerCell row={row} /></td><td className="r num">{fmtPrice(row.price)}</td>
                  <td className="r"><Pct value={row.r1w} /></td><td className="r"><Pct value={row.r13w} /></td><td className="r"><Pct value={row.r52w} /></td><td className="r"><Pct value={row.fromHigh} /></td>
                  <td><ViewPlaque view={row.mid} small /></td><td><ViewPlaque view={row.long} small /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="split">
        <section className="panel">
          <h2>市場廣度：多少成分股還在多頭</h2>
          <p className="lede">指數可以靠少數大型股撐住；這條線掉到 50% 以下，代表多數股票已經轉弱。</p>
          <LineChart series={breadthSeries} domain={[0, 100]} reference={{ value: 50, label: '50% 門檻' }} height={240} format={(v) => `${v.toFixed(0)}%`} ariaLabel="S&P 500 成分股處於中期多頭的比例，近五年" />
          <dl className="facts facts-wide">
            <div><dt>目前中期多頭</dt><dd>{market.breadth.midInNow.toFixed(0)}%</dd></div>
            <div><dt>目前長期多頭</dt><dd>{market.breadth.longInNow.toFixed(0)}%</dd></div>
            <div><dt>中期進場候選</dt><dd>{market.breadth.leadMid} 檔</dd></div>
            <div><dt>長期進場候選</dt><dd>{market.breadth.leadLong} 檔</dd></div>
          </dl>
        </section>
        <section className="panel">
          <h2>波動與利率</h2>
          <dl className="facts facts-wide">
            {market.vix ? <div><dt>VIX 波動率指數</dt><dd>{market.vix.last.toFixed(1)}</dd><p>高於過去一年 {market.vix.pct1y}% 的交易日</p></div> : null}
            {market.rates ? <>
              <div><dt>10 年期公債殖利率</dt><dd>{market.rates.tenYear.toFixed(2)}%</dd></div>
              <div><dt>3 個月國庫券殖利率</dt><dd>{market.rates.threeMonth.toFixed(2)}%</dd><p>回測中，出場期間的現金以此計息</p></div>
              <div><dt>長短利差（10 年 − 3 個月）</dt><dd>{market.rates.spread > 0 ? '+' : ''}{market.rates.spread.toFixed(2)} 個百分點</dd><p>{market.rates.spread < 0 ? '殖利率曲線倒掛' : '殖利率曲線為正斜率'}</p></div>
            </> : null}
          </dl>
          <p className="note">波動與利率只供參考，不在進出場規則內。</p>
        </section>
      </div>

      <section className="panel">
        <h2>各產業的多頭比例</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>產業</th><th className="r">檔數</th><th>中期多頭比例</th><th>長期多頭比例</th><th>產業 ETF</th><th>ETF 中期</th><th>ETF 長期</th></tr></thead>
            <tbody>
              {market.sectors.map((sector) => {
                const etf = universe.rows.find((row) => row.ticker === sector.etf);
                return (
                  <tr key={sector.sector}>
                    <td><a href={`#/all?sector=${encodeURIComponent(sector.sector)}`}>{sector.sector}</a></td><td className="r num">{sector.n}</td>
                    <td><ShareBar value={sector.midIn} /></td><td><ShareBar value={sector.longIn} /></td>
                    <td>{etf ? <a className="mono" href={`#/s/${etf.ticker}`}>{etf.ticker}</a> : '—'}</td>
                    <td><ViewPlaque view={etf?.mid} small /></td><td><ViewPlaque view={etf?.long} small /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>長期分批買進：回檔多深時買，之後的報酬</h2>
        <p className="lede">趨勢規則在空頭時會叫你出場；但對持續投入的長期資金，歷史上指數跌得越深，之後幾年的報酬越高。兩種做法目的不同：前者保護已有的部位，後者決定新資金何時加碼。</p>
        <div className="split">
          {market.dip.map((dip) => (
            <div key={dip.ticker}>
              <h3>{dip.ticker}：目前距歷史高點 {fmtPct(dip.drawdown, 1, false)}</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>當時位置</th><th className="r">之後 1 年平均</th><th className="r">上漲機率</th><th className="r">之後 3 年年化</th><th className="r">上漲機率</th><th className="r">週數</th></tr></thead>
                  <tbody>
                    {dip.buckets.map((bucket) => (
                      <tr key={bucket.label} className={bucket.current ? 'row-current' : ''}>
                        <td>{bucket.label}{bucket.current ? <span className="flag">現在</span> : null}</td>
                        <td className="r"><Pct value={bucket.avg1} /></td><td className="r num">{bucket.win1 == null ? '—' : `${bucket.win1}%`}</td>
                        <td className="r"><Pct value={bucket.avg3} /></td><td className="r num">{bucket.win3 == null ? '—' : `${bucket.win3}%`}</td><td className="r num">{bucket.n1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note">每週觀察一次，{dip.from.slice(0, 4)} 年起。深度回檔只發生過幾次（2002、2008–09、2020、2022），樣本彼此重疊，數字只能當參考。</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
