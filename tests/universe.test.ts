import { describe, expect, it } from 'vitest';
import { parseNasdaq100, parseSp500, parseWikiTable } from '../scripts/pipeline/universe';
import { parseChart, yahooSymbol } from '../scripts/pipeline/yahoo';

const table = `<table class="wikitable" id="constituents"><tbody><tr id="a">
<th>Symbol</th><th>Security</th><th><a href="#">GICS</a> Sector</th><th>GICS Sub-Industry</th><th>Date added</th></tr>
<tr id="b"><td><a href="#">MMM</a></td><td><a>3M</a></td><td>Industrials</td><td>Industrial Conglomerates</td><td>1957-03-04</td></tr>
<tr><td>BRK.B</td><td>Berkshire Hathaway<sup>[1]</sup></td><td>Financials</td><td>Multi-Sector Holdings</td><td>2010</td></tr>
<tr><td>not a ticker!</td><td>x</td><td>y</td><td>z</td><td></td></tr>
</tbody></table><table id="other"><tr><td>ZZZ</td></tr></table>`;

describe('universe parsing', () => {
  it('reads the S&P 500 table by header name and skips junk rows', () => {
    expect(parseWikiTable(table, 'constituents')).toHaveLength(4);
    expect(parseSp500(table)).toEqual([
      { ticker: 'MMM', name: '3M', kind: 'stock', sector: 'Industrials', industry: 'Industrial Conglomerates', indexes: ['SP'] },
      { ticker: 'BRK.B', name: 'Berkshire Hathaway', kind: 'stock', sector: 'Financials', industry: 'Multi-Sector Holdings', indexes: ['SP'] },
    ]);
    expect(parseSp500('<html>no table</html>')).toEqual([]);
  });
  it('reads Nasdaq list rows and trims share-class boilerplate', () => {
    const payload = { data: { data: { rows: [{ symbol: 'AAPL', companyName: 'Apple Inc. Common Stock' }, { symbol: 'ARM', companyName: 'Arm Holdings plc American Depositary Shares' }, { symbol: '', companyName: 'x' }] } } };
    expect(parseNasdaq100(payload)).toEqual([{ ticker: 'AAPL', name: 'Apple Inc.' }, { ticker: 'ARM', name: 'Arm Holdings plc' }]);
    expect(parseNasdaq100({})).toEqual([]);
  });
});

describe('Yahoo chart parsing', () => {
  const stamp = (iso: string, hour = 14.5) => Date.parse(`${iso}T00:00:00Z`) / 1000 + hour * 3600;
  const payload = (now: { start: number; end: number }) => ({ chart: { result: [{
    meta: { gmtoffset: -18000, longName: 'Test Co', currentTradingPeriod: { regular: now } },
    timestamp: [stamp('2026-11-12'), stamp('2026-11-13'), stamp('2026-11-16', 19)],
    indicators: { quote: [{ close: [10, null, 12] }], adjclose: [{ adjclose: [9.5, 10.5, 12] }] },
  }] } });
  const session = { start: stamp('2026-11-16', 14.5), end: stamp('2026-11-16', 21) };
  it('maps symbols and drops null bars', () => {
    expect(yahooSymbol('BRK.B')).toBe('BRK-B');
    const history = parseChart(payload(session), session.end + 3600);
    expect(history.name).toBe('Test Co');
    expect(history.bars.map((bar) => [new Date(bar.t * 86_400_000).toISOString().slice(0, 10), bar.a, bar.c])).toEqual([['2026-11-12', 9.5, 10], ['2026-11-16', 12, 12]]);
  });
  it('drops the bar of a session that is still open', () => {
    expect(parseChart(payload(session), session.end - 3600).bars).toHaveLength(1);
    expect(() => parseChart({ chart: { result: [] } })).toThrow();
  });
});
