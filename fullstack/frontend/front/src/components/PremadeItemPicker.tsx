'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FinishedGood } from '@/lib/api';

const peso = (n: number) =>
  `₱${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Case-insensitive match on name, SKU and category */
const matches = (item: FinishedGood, q: string) =>
  !q || [item.name, item.sku, item.category].some((v) => (v || '').toLowerCase().includes(q));

interface Props {
  items: FinishedGood[];
  /** Selected product id ('' when none) */
  value: number | '';
  onSelect: (id: number) => void;
  /** Products already on other lines: shown but not selectable (raise that line's quantity instead) */
  takenIds?: Set<number>;
  /** Shown when the selected product is no longer listed (e.g. a draft line that sold out) */
  fallbackLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
}

/** Premade item field: type to see matching products and pick one */
export default function PremadeItemPicker({ items, value, onSelect, takenIds, fallbackLabel, disabled, invalid }: Props) {
  const selected = value ? items.find((i) => i.id === value) : undefined;
  const selectedLabel = selected ? `${selected.name}${selected.sku ? ` (${selected.sku})` : ''}` : (value ? fallbackLabel || '' : '');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => matches(i, q)).slice(0, 50);
  }, [items, query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const isTaken = (i: FinishedGood) => !!takenIds?.has(i.id) && i.id !== value;

  const choose = (i: FinishedGood) => {
    if (isTaken(i)) return;
    onSelect(i.id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      if (open && suggestions[highlight]) { e.preventDefault(); choose(suggestions[highlight]); }
    } else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        value={open ? query : selectedLabel}
        onFocus={() => { setQuery(''); setHighlight(0); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setHighlight(0); setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={selectedLabel || 'Search premade item by name or SKU…'}
        className={`w-full px-3 py-2 rounded-lg border ${invalid ? 'border-red-300' : 'border-gray-200'} bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent disabled:bg-gray-100`}
      />
      {open && (
        <ul id={listId} role="listbox"
          className="absolute z-30 left-0 top-full mt-1 w-full min-w-[16rem] max-h-72 overflow-y-auto overflow-x-hidden rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
          {suggestions.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">
              {items.length === 0 ? 'No premade items at this branch.' : `No premade item matches "${query}".`}
            </li>
          ) : suggestions.map((i, idx) => {
            const taken = isTaken(i);
            const stock = Number(i.quantity) || 0;
            return (
              <li key={i.id} role="option" aria-selected={i.id === value} aria-disabled={taken}
                onMouseDown={(e) => { e.preventDefault(); choose(i); }}
                onMouseEnter={() => setHighlight(idx)}
                className={`px-3 py-2 ${taken ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer'} ${idx === highlight && !taken ? 'bg-[#eef1fb]' : ''}`}>
                <p className={`break-words ${taken ? '' : 'font-medium text-gray-900'}`}>
                  {i.name}{i.sku && <span className={taken ? '' : 'font-normal text-gray-500'}> ({i.sku})</span>}
                  {taken && <span className="ml-1 font-normal">(already added)</span>}
                </p>
                <p className={`mt-0.5 text-xs ${taken ? '' : stock <= 0 ? 'text-red-500' : 'text-gray-500'}`}>
                  {stock > 0 ? `${stock} in stock` : 'Out of stock'} · {peso(i.price)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
