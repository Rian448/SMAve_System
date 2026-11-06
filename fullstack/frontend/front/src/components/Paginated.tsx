'use client';
import { ReactNode, useState } from 'react';

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Splits a long list into pages. Wrap the list (or its whole table) and render
 * the rows you get back; the page controls appear underneath once there is
 * more than one page's worth of items.
 *
 *   <Paginated items={filteredOrders} resetKey={searchTerm}>
 *     {rows => <table>…{rows.map(o => <tr key={o.id}>…</tr>)}…</table>}
 *   </Paginated>
 *
 * resetKey: pass the search/filter values; when they change the list goes back
 * to page 1. Data refreshes that keep the filters stay on the current page.
 */
export default function Paginated<T>({
  items,
  children,
  resetKey,
  pageSize: initialSize = 10,
  label = 'items',
  boxed = false,
}: {
  items: T[];
  children: (pageItems: T[]) => ReactNode;
  resetKey?: unknown;
  pageSize?: number;
  label?: string;
  /** For card lists: draw the controls as their own rounded box instead of a table footer. */
  boxed?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initialSize);
  const key = JSON.stringify(resetKey ?? null);
  const [lastKey, setLastKey] = useState(key);

  // New search or filter: start again from the first page
  if (key !== lastKey) {
    setLastKey(key);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / size));
  // Rows were removed (e.g. after a delete): stay on the last page that exists
  const current = Math.min(page, totalPages);
  const start = (current - 1) * size;
  const pageItems = items.slice(start, start + size);

  return (
    <>
      {children(pageItems)}
      {items.length > PAGE_SIZES[0] && (
        <PageControls
          page={current}
          totalPages={totalPages}
          from={start + 1}
          to={start + pageItems.length}
          total={items.length}
          size={size}
          label={label}
          boxed={boxed}
          onPage={setPage}
          onSize={s => { setSize(s); setPage(1); }}
        />
      )}
    </>
  );
}

/** Page numbers to show: always the first and last, plus the ones around the current page. */
function pageList(page: number, totalPages: number): (number | '…')[] {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

function PageControls({ page, totalPages, from, to, total, size, label, boxed, onPage, onSize }: {
  page: number; totalPages: number; from: number; to: number; total: number; size: number; label: string;
  boxed: boolean; onPage: (p: number) => void; onSize: (s: number) => void;
}) {
  const btn = 'min-w-9 h-9 px-3 rounded-lg border text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <nav aria-label="Pages" className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white ${
      boxed ? 'rounded-xl border border-gray-200 shadow-sm' : 'border-t border-gray-200'}`}>
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <span>Showing <strong className="text-gray-900">{from}–{to}</strong> of <strong className="text-gray-900">{total}</strong> {label}</span>
        <label className="flex items-center gap-1.5">
          <span className="text-gray-500">Per page</span>
          <select value={size} onChange={e => onSize(Number(e.target.value))}
            className="h-8 px-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm">
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}
          className={`${btn} border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>Previous</button>
        {pageList(page, totalPages).map((p, i) => p === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-gray-400">…</span>
        ) : (
          <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}
            className={`${btn} ${p === page
              ? 'border-[#011c72] bg-[#011c72] text-white'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {p}
          </button>
        ))}
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages}
          className={`${btn} border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>Next</button>
      </div>
    </nav>
  );
}
