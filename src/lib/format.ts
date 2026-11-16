import { dayToIso } from './series';
import type { Horizon } from './signals';
import type { HorizonView, ZoneName } from './types';

export const fmtPct = (value: number | null | undefined, digits = 1, sign = true): string =>
  value == null || !Number.isFinite(value) ? '—' : `${sign && value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
export const fmtPrice = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? '—' : `$${value.toLocaleString('en-US', { minimumFractionDigits: value < 1000 ? 2 : 0, maximumFractionDigits: value < 1000 ? 2 : 0 })}`;
export const fmtNum = (value: number | null | undefined, digits = 0): string => (value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
/** 2026-11-13 -> 2026/11/13 */
export const fmtDate = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10).replace(/-/g, '/') : '—');
export const fmtDay = (t: number | null | undefined): string => (t == null ? '—' : fmtDate(dayToIso(t)));
export const fmtMonth = (t: number | null | undefined): string => (t == null ? '—' : dayToIso(t).slice(0, 7).replace('-', '/'));
export const tone = (value: number | null | undefined): string => (value == null || value === 0 ? '' : value > 0 ? 'up' : 'down');

export const ZONE_LABEL: Record<ZoneName, string> = { lead: '進場候選', hold: '多頭續抱', warn: '跌破警示', exit: '出場', watch: '轉強觀察', avoid: '觀望' };
export const ZONE_ORDER: ZoneName[] = ['lead', 'hold', 'warn', 'exit', 'watch', 'avoid'];
export const HORIZON_LABEL: Record<Horizon, string> = { mid: '中期', long: '長期' };
export const HORIZON_HINT: Record<Horizon, string> = { mid: '週線，抱數月到一年', long: '月線，抱一年以上' };
export const LINE_NAME: Record<Horizon, string> = { mid: '40 週線', long: '10 月線' };
export const PERIOD_NAME: Record<Horizon, string> = { mid: '週', long: '個月' };

/** One plain sentence saying what the rule is telling you to do. */
export function zoneSentence(view: HorizonView, horizon: Horizon): string {
  const line = LINE_NAME[horizon];
  switch (view.zone) {
    case 'lead': return `多頭趨勢中，而且漲勢排在全部股票的前 ${Math.max(1, 100 - Math.round(view.strengthPct ?? 80))}%。規則上可以進場；出場線是${line}。`;
    case 'hold': return `多頭趨勢中。已經持有就續抱；強度不在前 20%，不是新進場的首選。`;
    case 'warn': return `趨勢狀態還是多頭，但收盤已經跌到${line}之下 ${fmtPct(view.vsSlow, 1, false).replace('-', '')}。出場條件尚未全部成立，先不加碼。`;
    case 'exit': return `趨勢剛轉空，規則出場。${view.sinceT ? `訊號出現在 ${fmtDay(view.sinceT)}。` : ''}`;
    case 'watch': return `趨勢狀態仍是空頭，但收盤已經站回${line}之上，等進場條件全部成立。`;
    default: return `空頭趨勢中，規則上不持有。`;
  }
}
