'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { RawMaterial } from '@/lib/api';

const peso = (n: number) =>
  `₱${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Name plus the details that tell same-named materials apart (color, pattern) */
export const materialLabel = (m: RawMaterial) =>
  [m.materialType, m.color, m.pattern].filter(v => v && v.trim()).join(' · ');

/** Case-insensitive match on name, color, pattern, item ID and SKU */
const matches = (m: RawMaterial, q: string) => {
  if (!q) return true;
  return [m.materialType, m.color, m.pattern, m.itemId, m.sku]
    .some(v => (v || '').toLowerCase().includes(q));
};

interface Props {
  materials: RawMaterial[];
  /** Selected material id ('' when none) */
  value: number | '';
  onSelect: (id: number) => void;
  /** Materials already used on other rows: shown but not selectable, so a material can't be added twice */
  takenIds?: Set<number>;
  /** Reloads the list from Inventory; called when the lookup window opens so stock and prices are current */
  onRefresh?: () => Promise<void>;
  invalid?: boolean;
}

/**
 * Material field for job orders: type to get matching suggestions, or open the
 * lookup window to browse every material in Inventory. Both call onSelect with
 * the material's id, so they fill the row the same way.
 */
export default function MaterialPicker({ materials, value, onSelect, takenIds, onRefresh, invalid }: Props) {
  const selected = value ? materials.find(m => m.id === value) : undefined;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [lookupOpen, setLookupOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter(m => matches(m, q)).slice(0, 50);
  }, [materials, query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const isTaken = (m: RawMaterial) => !!takenIds?.has(m.id) && m.id !== value;

  const choose = (m: RawMaterial) => {
    if (isTaken(m)) return;
    onSelect(m.id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      if (open && suggestions[highlight]) { e.preventDefault(); choose(suggestions[highlight]); }
    } else if (e.key === 'Escape') setOpen(false);
  };

  const border = invalid ? 'border-red-300' : 'border-gray-200';

  return (
    <div ref={wrapRef} className="relative flex gap-1">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={open ? query : (selected ? materialLabel(selected) : '')}
        onFocus={() => { setQuery(''); setHighlight(0); setOpen(true); }}
        onChange={e => { setQuery(e.target.value); setHighlight(0); setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={selected ? materialLabel(selected) : 'Search material…'}
        className={`min-w-0 flex-1 px-2 py-1.5 rounded-md border ${border} bg-white text-xs text-gray-900 focus:ring-1 focus:ring-[#011c72]`}
      />
      <button type="button" onClick={() => { setOpen(false); setLookupOpen(true); }}
        title="Look up materials in Inventory" aria-label="Look up materials in Inventory"
        className="shrink-0 px-2 rounded-md border border-gray-200 bg-white text-gray-500 hover:text-[#011c72] hover:border-[#011c72]">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h7m4 4l2 2 4-4M4 18h7" />
        </svg>
      </button>

      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 left-0 top-full mt-1 w-max min-w-full max-w-[min(26rem,calc(100vw-2rem))] max-h-72 overflow-y-auto overflow-x-hidden rounded-lg border border-gray-200 bg-white shadow-lg text-xs">
          {suggestions.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">
              {materials.length === 0 ? 'No materials in inventory.' : `No material matches "${query}".`}
            </li>
          ) : suggestions.map((m, i) => {
            const taken = isTaken(m);
            return (
              <li key={m.id} role="option" aria-selected={m.id === value} aria-disabled={taken}
                onMouseDown={e => { e.preventDefault(); choose(m); }}
                onMouseEnter={() => setHighlight(i)}
                className={`px-3 py-2 ${taken ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer'} ${i === highlight && !taken ? 'bg-[#eef1fb]' : ''}`}>
                {/* Name first (wraps if long); stock and price underneath */}
                <p className={`break-words ${taken ? '' : 'text-gray-900 font-medium'}`}>
                  {materialLabel(m)}
                  {taken && <span className="ml-1 font-normal">(already added)</span>}
                </p>
                <p className={`mt-0.5 text-[11px] ${taken ? '' : m.stockQuantity <= 0 ? 'text-red-500' : 'text-gray-500'}`}>
                  {m.stockQuantity} yd in stock · {peso(m.unitPrice)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {lookupOpen && (
        <MaterialLookup
          materials={materials}
          value={value}
          isTaken={isTaken}
          onRefresh={onRefresh}
          onClose={() => setLookupOpen(false)}
          onPick={m => { choose(m); setLookupOpen(false); }}
        />
      )}
    </div>
  );
}

function MaterialLookup({ materials, value, isTaken, onRefresh, onClose, onPick }: {
  materials: RawMaterial[];
  value: number | '';
  isTaken: (m: RawMaterial) => boolean;
  onRefresh?: () => Promise<void>;
  onClose: () => void;
  onPick: (m: RawMaterial) => void;
}) {
  const [search, setSearch] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(!!onRefresh);
  const [refreshError, setRefreshError] = useState('');

  // Fresh stock and prices every time the window opens
  useEffect(() => {
    if (!onRefresh) return;
    let live = true;
    onRefresh()
      .catch(() => { if (live) setRefreshError('Could not refresh from Inventory; showing the last loaded list.'); })
      .finally(() => { if (live) setRefreshing(false); });
    return () => { live = false; };
  }, [onRefresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = search.trim().toLowerCase();
  const rows = materials
    .filter(m => matches(m, q) && (!inStockOnly || m.stockQuantity > 0))
    .sort((a, b) => a.materialType.localeCompare(b.materialType) || a.id - b.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Material lookup"
        className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-xl"
        onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Material Lookup</h2>
            <p className="text-xs text-gray-500">All materials in Inventory. Click one to use it on this row.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-center">
          <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, color, pattern, item ID or SKU…"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
          <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
            <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} />
            In stock only
          </label>
          {refreshing && <span className="text-xs text-gray-400">Updating…</span>}
        </div>
        {refreshError && <p className="px-5 pt-2 text-xs text-amber-700">{refreshError}</p>}
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-gray-400">No materials match.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left font-medium">Material</th>
                  <th className="px-4 py-2 text-left font-medium hidden sm:table-cell">Item ID / SKU</th>
                  <th className="px-4 py-2 text-left font-medium hidden md:table-cell">Location</th>
                  <th className="px-4 py-2 text-right font-medium">Stock (yd)</th>
                  <th className="px-4 py-2 text-right font-medium">Unit Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(m => {
                  const taken = isTaken(m);
                  return (
                    <tr key={m.id} onClick={() => !taken && onPick(m)}
                      className={taken ? 'text-gray-300 cursor-not-allowed' : `cursor-pointer hover:bg-[#eef1fb] ${m.id === value ? 'bg-[#eef1fb]' : ''}`}>
                      <td className="px-4 py-2.5">
                        <span className={taken ? '' : 'font-medium text-gray-900'}>{m.materialType}</span>
                        {(m.color || m.pattern) && <span className={taken ? '' : 'text-gray-500'}> · {[m.color, m.pattern].filter(Boolean).join(' · ')}</span>}
                        {taken && <span className="ml-1 text-xs">(already added)</span>}
                        {m.id === value && <span className="ml-1 text-xs text-[#011c72] font-medium">(selected)</span>}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-gray-500">{[m.itemId, m.sku].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="px-4 py-2.5 hidden md:table-cell text-gray-500">{m.branchName || '—'}</td>
                      <td className={`px-4 py-2.5 text-right ${taken ? '' : m.stockQuantity <= 0 ? 'text-red-500 font-medium' : 'text-gray-700'}`}>{m.stockQuantity}</td>
                      <td className="px-4 py-2.5 text-right">{peso(m.unitPrice)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">{rows.length} of {materials.length} materials</div>
      </div>
    </div>
  );
}
