'use client';
import { useEffect, useState } from 'react';
import type { UsageTrendMaterial, UsageTrendMonth } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { formatLength } from '@/lib/length';
import Paginated from '@/components/Paginated';

const fmtMonth = (ym: string, long = false) => {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-PH', long
    ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' });
};
/** A length reads as "39 yd 2 ft"; anything else as the number and its unit */
const qty = (n: number | undefined, unit: string) =>
  n == null ? '—' : unit === 'yd' ? formatLength(n) : `${(Math.round(n * 100) / 100).toLocaleString('en-PH')} ${unit}`;
/** Totals per unit, so yards and pieces aren't added together: "374 yd · 12 pcs" */
const unitTotals = (list: UsageTrendMaterial[]) => {
  const sums = new Map<string, number>();
  list.forEach(m => sums.set(m.unit, (sums.get(m.unit) || 0) + m.quantity));
  return [...sums.entries()].sort(([a], [b]) => (a === 'yd' ? -1 : b === 'yd' ? 1 : a.localeCompare(b)))
    .map(([u, n]) => qty(n, u)).join(' · ');
};
const CONFIDENCE: Record<string, string> = {
  high: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-600',
};

/**
 * Material usage by month: grey = actual, blue = what the AI projects. Hovering a bar
 * shows the month's top materials; clicking it opens the month's full breakdown (for a
 * projected month, each material's forecast with its stock outlook).
 */
export default function UsageTrendChart({ months }: { months: UsageTrendMonth[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [open, setOpen] = useState<UsageTrendMonth | null>(null);
  const maxVal = Math.max(...months.map(m => m.total), 1);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Columns may shrink below their labels' width, so all months fit on a phone */}
      <div className="h-56 flex items-end gap-1 sm:gap-2">
        {months.map((m, i) => {
          const heightPct = (m.total / maxVal) * 100;
          const top = (m.materials || []).slice(0, 3);
          // Tooltips near the right edge open to the left so they stay on screen
          const align = i >= months.length - 2 ? 'right-0' : i <= 1 ? 'left-0' : 'left-1/2 -translate-x-1/2';
          return (
            <div key={m.month} className="relative flex-1 min-w-0 flex flex-col items-center gap-1">
              <span className="text-[10px] sm:text-xs text-gray-400 truncate w-full text-center">
                {m.total > 0 ? Math.round(m.total) : ''}
              </span>
              <button type="button"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(h => (h === i ? null : h))}
                onFocus={() => setHover(i)} onBlur={() => setHover(h => (h === i ? null : h))}
                onClick={() => { setHover(null); setOpen(m); }}
                aria-label={`${fmtMonth(m.month, true)}: ${m.projected ? 'projected' : 'actual'} usage, details`}
                className="w-full flex items-end cursor-pointer focus:outline-none" style={{ height: '160px' }}>
                <div
                  className={`w-full rounded-t-md transition-all duration-300 ${m.projected
                    ? 'bg-[#4a6aff]/70 border-t-2 border-dashed border-[#011c72] hover:bg-[#4a6aff]'
                    : 'bg-zinc-300 hover:bg-zinc-400'} ${hover === i ? 'ring-2 ring-[#011c72]/40' : ''}`}
                  style={{ height: `${Math.max(heightPct * 1.6, m.total > 0 ? 4 : 0)}px` }}
                />
              </button>
              <span className="text-[10px] sm:text-xs text-gray-500 truncate w-full text-center">{fmtMonth(m.month)}</span>

              {hover === i && (
                <div role="tooltip"
                  className={`absolute bottom-full mb-1 ${align} z-20 w-60 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg pointer-events-none`}>
                  <p className="text-xs font-semibold text-gray-900">
                    {fmtMonth(m.month, true)}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${m.projected ? 'bg-[#eef1fb] text-[#011c72]' : 'bg-gray-100 text-gray-600'}`}>
                      {m.projected ? 'AI projected' : 'Actual'}
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{unitTotals(m.materials || []) || 'No usage'}</p>
                  {top.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {top.map(t => (
                        <li key={`${t.itemId}-${t.name}`} className="flex justify-between gap-2 text-[11px]">
                          <span className="truncate text-gray-700">{t.name}</span>
                          <span className="shrink-0 font-medium text-gray-900">{qty(t.quantity, t.unit)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.projected && (m.materials || []).some(x => x.runsOutThisMonth) && (
                    <p className="mt-1.5 text-[11px] text-red-600">
                      {(m.materials || []).filter(x => x.runsOutThisMonth).length} forecast to run out this month
                    </p>
                  )}
                  <p className="mt-2 text-[10px] text-gray-400">Click for the full details</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {open && <MonthDetails month={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** "SHBLK-PLAIN - Black - Leatherette, plain" → code "SHBLK-PLAIN", rest "Black · Leatherette, plain" */
const splitName = (name: string) => {
  const [code, ...rest] = name.split(' - ');
  return { code, rest: rest.join(' · ') };
};
/** Per-unit totals as separate chips, rounded so they read cleanly */
const unitChips = (list: UsageTrendMaterial[]) => {
  const sums = new Map<string, number>();
  list.forEach(x => sums.set(x.unit, (sums.get(x.unit) || 0) + x.quantity));
  return [...sums.entries()].sort(([a], [b]) => (a === 'yd' ? -1 : b === 'yd' ? 1 : a.localeCompare(b)));
};

function MonthDetails({ month: m, onClose }: { month: UsageTrendMonth; onClose: () => void }) {
  const list = m.materials || [];
  const runningOut = list.filter(x => x.runsOutThisMonth);
  const th = 'px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap';
  const td = 'px-3 py-2.5 whitespace-nowrap';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="usage-month-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="usage-month-title" className="text-lg font-semibold text-gray-900">
              {fmtMonth(m.month, true)} · {m.projected ? 'AI projected usage' : 'Material usage'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {list.length} material{list.length === 1 ? '' : 's'}
              {m.projected && ' · each material’s forecast average daily usage × 30 days'}
            </p>
            {list.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unitChips(list).map(([unit, n]) => (
                  <span key={unit} className="px-2 py-0.5 rounded-full bg-gray-100 text-xs font-medium text-gray-700 whitespace-nowrap">
                    {qty(unit === 'yd' ? n : Math.round(n * 10) / 10, unit)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {m.projected && runningOut.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <p className="text-sm font-medium text-red-700">
                {runningOut.length} material{runningOut.length === 1 ? '' : 's'} forecast to run out in {fmtMonth(m.month, true)}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {runningOut.map(x => (
                  <span key={`${x.itemId}-${x.name}`} className="px-2 py-0.5 rounded-full bg-white border border-red-200 text-xs text-red-700"
                    title={x.name}>
                    {splitName(x.name).code}{x.stockoutDate ? ` · ${formatDate(x.stockoutDate)}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {list.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No material usage recorded for this month.</p>
          ) : (
            <Paginated items={list} label="materials">{rows => (
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full min-w-200 text-sm">
                <thead className="bg-gray-50">
                  {m.projected ? (
                    <tr>
                      <th className={`${th} text-left`}>Material</th>
                      <th className={`${th} text-right`}>Projected use</th>
                      <th className={`${th} text-right`}>In stock</th>
                      <th className={`${th} text-left`}>Runs out</th>
                      <th className={`${th} text-left`}>Restock by</th>
                      <th className={`${th} text-right`}>Suggested order</th>
                      <th className={`${th} text-left`}>Confidence</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className={`${th} text-left`}>Material</th>
                      <th className={`${th} text-right`}>Used</th>
                      <th className={`${th} text-right`}>Job orders</th>
                      <th className={`${th} text-right`}>Avg per job order</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(x => {
                    const { code, rest } = splitName(x.name);
                    // Code on top, the rest of the name smaller and cut short (full name on hover)
                    const nameCell = (
                      <td className="px-3 py-2.5 max-w-64" title={x.name}>
                        <p className="font-medium text-gray-900 truncate">{code}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {rest}{rest && x.itemId ? ' · ' : ''}{x.itemId}
                        </p>
                      </td>
                    );
                    return m.projected ? (
                      <tr key={`${x.itemId}-${x.name}`} className={x.runsOutThisMonth ? 'bg-red-50/60' : 'hover:bg-gray-50'}>
                        {nameCell}
                        <td className={`${td} text-right font-medium text-gray-900`}>{qty(x.quantity, x.unit)}</td>
                        <td className={`${td} text-right text-gray-700`}>{qty(x.currentStock, x.unit)}</td>
                        <td className={`${td} ${x.runsOutThisMonth ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                          {x.stockoutDate ? formatDate(x.stockoutDate) : '—'}
                        </td>
                        <td className={`${td} text-gray-600`}>{x.restockByDate ? formatDate(x.restockByDate) : '—'}</td>
                        <td className={`${td} text-right text-gray-700`}>
                          {x.suggestedRestockQty ? qty(x.suggestedRestockQty, x.unit) : '—'}
                        </td>
                        <td className={td}>
                          {x.confidence && (
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${CONFIDENCE[x.confidence] || CONFIDENCE.low}`}>
                              {x.confidence}
                            </span>
                          )}
                        </td>
                      </tr>
                    ) : (
                      <tr key={`${x.itemId}-${x.name}`} className="hover:bg-gray-50">
                        {nameCell}
                        <td className={`${td} text-right font-medium text-gray-900`}>{qty(x.quantity, x.unit)}</td>
                        <td className={`${td} text-right text-gray-700`}>{x.jobOrders ?? '—'}</td>
                        {/* How much of it one job order used on average that month */}
                        <td className={`${td} text-right text-gray-700`}>
                          {x.jobOrders ? qty(x.unit === 'yd' ? x.quantity / x.jobOrders : Math.round((x.quantity / x.jobOrders) * 100) / 100, x.unit) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}</Paginated>
          )}
        </div>
      </div>
    </div>
  );
}
