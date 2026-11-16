import { fmtPct, tone } from '@/lib/format';
import type { SymbolRow } from '@/lib/types';

export const Pct = ({ value, digits = 1 }: { value: number | null | undefined; digits?: number }) => <span className={`num ${tone(value)}`}>{fmtPct(value, digits)}</span>;

export const TickerCell = ({ row }: { row: SymbolRow }) => (
  <a className="ticker-cell" href={`#/s/${row.ticker}`}>
    <b>{row.ticker}</b>
    <span>{row.name}</span>
  </a>
);

export const Segmented = <T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string; hint?: string }>; onChange: (value: T) => void; label: string }) => (
  <div className="segmented" role="group" aria-label={label}>
    {options.map((option) => (
      <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
        {option.label}{option.hint ? <small>{option.hint}</small> : null}
      </button>
    ))}
  </div>
);

/** Thin horizontal bar for a 0-100 share, with the value written beside it. */
export const ShareBar = ({ value }: { value: number }) => (
  <span className="sharebar"><span className="sharebar-track"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span><span className="num">{value.toFixed(0)}%</span></span>
);
