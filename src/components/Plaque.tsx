import { ZONE_LABEL } from '@/lib/format';
import type { HorizonView, ZoneName } from '@/lib/types';

/** Road-sign style badge for a rule state. Text + shape carry the meaning, color only reinforces it. */
export function Plaque({ zone, small = false }: { zone: ZoneName | null | undefined; small?: boolean }) {
  if (!zone) return <span className={`plaque plaque-none${small ? ' plaque-sm' : ''}`}>資料不足</span>;
  return <span className={`plaque plaque-${zone}${small ? ' plaque-sm' : ''}`}>{ZONE_LABEL[zone]}</span>;
}

/** Plaque plus the small flags that qualify it: a fresh flip, or a change the unfinished period would cause. */
export function ViewPlaque({ view, small = false }: { view: HorizonView | null | undefined; small?: boolean }) {
  return (
    <span className="plaque-group">
      <Plaque zone={view?.zone} small={small} />
      {view?.fresh && view.in ? <span className="flag" title="趨勢剛翻多">新</span> : null}
      {view?.pending ? <span className="flag flag-pending" title={view.pending === 'in' ? '若本期收盤維持現價，將翻多' : '若本期收盤維持現價，將翻空'}>{view.pending === 'in' ? '待翻多' : '待翻空'}</span> : null}
    </span>
  );
}
