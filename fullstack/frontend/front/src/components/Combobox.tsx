'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  /** When true (default) the user may type a value not in the list. */
  allowCustom?: boolean;
  className?: string;
  /** Message shown when there are no matches and custom values are allowed. */
  emptyLabel?: string;
}

/**
 * A searchable dropdown: shows a list of options but lets the user type to
 * filter, and (by default) type a value that isn't in the list. Built with no
 * external dependency so it stays lightweight.
 */
export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  loading = false,
  allowCustom = true,
  className = '',
  emptyLabel = 'No matches — press Enter to use what you typed',
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // While the menu is open the input reflects the live search query; when
  // closed it reflects the committed value.
  const display = open ? query : value;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function openMenu() {
    if (disabled) return;
    setQuery('');
    setHighlight(0);
    setOpen(true);
  }

  function commit(val: string) {
    onChange(val);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      openMenu();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) {
        commit(filtered[highlight]);
      } else if (allowCustom && query.trim()) {
        commit(query.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const baseCls =
    className ||
    'w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={display}
          disabled={disabled}
          placeholder={disabled ? '' : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            if (!open) setOpen(true);
            if (allowCustom) onChange(e.target.value); // keep typed value in sync
          }}
          onFocus={openMenu}
          onKeyDown={onKeyDown}
          autoComplete="off"
          className={`${baseCls} ${disabled ? 'bg-gray-100 cursor-not-allowed text-gray-400' : ''} pr-9`}
        />
        {/* Chevron / spinner */}
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
          {loading ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </span>
      </div>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-xl border border-[#c7d2f5] bg-white shadow-lg">
          {loading ? (
            <div className="px-4 py-3 text-sm text-gray-500">Loading…</div>
          ) : filtered.length > 0 ? (
            filtered.map((opt, i) => (
              <button
                type="button"
                key={opt}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus, avoid input blur before click
                  commit(opt);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`block w-full text-left px-4 py-2.5 text-sm ${
                  i === highlight ? 'bg-[#eef1fb] text-[#011c72]' : 'text-gray-700 hover:bg-gray-50'
                } ${opt === value ? 'font-semibold' : ''}`}
              >
                {opt}
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500">
              {allowCustom ? emptyLabel : 'No matches'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
