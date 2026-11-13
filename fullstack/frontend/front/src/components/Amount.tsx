'use client';
import { createContext, ReactNode, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { compactNumber, compactPeso, exactNumber, exactPeso } from '@/lib/format';

export { compactPeso, exactPeso } from '@/lib/format';

type Mode = 'exact' | 'short';

// ── One Exact / Short switch for a whole table of amounts ──────────────────────

const DisplayContext = createContext<{ mode: Mode; setMode: (m: Mode) => void } | null>(null);

/**
 * Wrap a table (or a page section) whose amounts should switch together. Records
 * show exact amounts by default; the choice is remembered in this browser.
 */
export function AmountDisplayProvider({ storageKey, defaultMode = 'exact', children }: {
  storageKey: string; defaultMode?: Mode; children: ReactNode;
}) {
  // The server (and the first render) use the default; the browser's saved choice
  // takes over once mounted, without a mismatch
  const mode = useSyncExternalStore(
    subscribe,
    () => readMode(storageKey) ?? defaultMode,
    () => defaultMode,
  );
  const setMode = (m: Mode) => writeMode(storageKey, m);
  return <DisplayContext.Provider value={{ mode, setMode }}>{children}</DisplayContext.Provider>;
}

// The choice lives in this browser's storage; if that is blocked (private
// window, previews) it is kept in memory for the visit instead
const memory = new Map<string, Mode>();
const listeners = new Set<() => void>();
const storageName = (key: string) => `amount-display:${key}`;

function readMode(key: string): Mode | null {
  try {
    const saved = localStorage.getItem(storageName(key));
    if (saved === 'exact' || saved === 'short') return saved;
  } catch { /* storage unavailable */ }
  return memory.get(key) ?? null;
}

function writeMode(key: string, mode: Mode) {
  memory.set(key, mode);
  try { localStorage.setItem(storageName(key), mode); } catch { /* not remembered after this visit */ }
  listeners.forEach(l => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changed it
  window.addEventListener('storage', onChange);
  return () => { listeners.delete(onChange); window.removeEventListener('storage', onChange); };
}

/** The switch itself: put it once in the table's header bar */
export function AmountDisplayToggle({ className = '' }: { className?: string }) {
  const ctx = useContext(DisplayContext);
  if (!ctx) return null;
  const option = (m: Mode, label: string) => (
    <button type="button" onClick={() => ctx.setMode(m)} aria-pressed={ctx.mode === m}
      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#011c72] ${
        ctx.mode === m ? 'bg-white text-[#011c72] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
      {label}
    </button>
  );
  // A span, so the switch can sit inside a line of text (a <p>) as well as a bar
  return (
    <span role="group" aria-label="How amounts are shown" title="Show every digit, or short amounts like ₱1.5K"
      className={`inline-flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 ${className}`}>
      {option('exact', 'Exact')}
      {option('short', 'Short')}
    </span>
  );
}

// ── A single amount ────────────────────────────────────────────────────────────

interface Props {
  value: number;
  /**
   * 'summary' (default): cards and totals. Short by default (₱203.4K) with an eye
   *   button that shows every digit.
   * 'record': rows of a table or history. Exact by default; follows the table's
   *   Exact / Short switch when there is one, and has no button of its own.
   */
  variant?: 'summary' | 'record';
  /** Amounts below this are always shown in full (default 1,000) */
  compactFrom?: number;
  /** false for plain quantities (no ₱, no forced centavos) */
  currency?: boolean;
  className?: string;
}

const EYE = 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z';
const EYE_OFF = 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21';

/**
 * A peso amount (or a quantity) that can be read short (₱1.25M) or in full
 * (₱1,250,000.00). Only the text changes: the value is never rounded, and the
 * full amount always comes from the number itself (it is also the tooltip).
 */
export default function Amount({ value, variant = 'summary', compactFrom = 1000, currency = true, className = '' }: Props) {
  const table = useContext(DisplayContext);
  const [exact, setExact] = useState(false);
  const full = currency ? exactPeso(value) : exactNumber(value);
  const short = currency ? compactPeso(value) : compactNumber(value);
  const canShorten = Math.abs(Number(value) || 0) >= compactFrom;
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  // Keep the amount on one line: if it is wider than its box (e.g. the exact
  // ₱234,571.31 in a narrow card), shrink its text just enough to fit instead
  // of breaking it onto a second line. Rechecked when the box is resized.
  useLayoutEffect(() => {
    const wrap = wrapRef.current, text = textRef.current, box = wrapRef.current?.parentElement;
    if (!wrap || !text || !box) return;
    const fit = () => {
      text.style.fontSize = '';
      const button = wrap.lastElementChild as HTMLElement | null;
      const gap = parseFloat(getComputedStyle(wrap).columnGap) || 0;
      const available = box.clientWidth - (button && button !== text ? button.offsetWidth + gap : 0);
      const needed = text.scrollWidth;
      if (available > 0 && needed > available) {
        text.style.fontSize = `${Math.max(0.5, Math.floor((available / needed) * 100) / 100)}em`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [exact, full, short]);

  if (variant === 'record') {
    const showShort = canShorten && table?.mode === 'short';
    return <span className={`tabular-nums whitespace-nowrap ${className}`} title={full}>{showShort ? short : full}</span>;
  }
  if (!canShorten) {
    // Small amounts fit as they are; whole pesos drop the ".00" on cards
    return <span className={`tabular-nums ${className}`} title={full}>{currency ? full.replace(/\.00$/, '') : full}</span>;
  }
  return (
    <span ref={wrapRef} className={`inline-flex items-center gap-1.5 max-w-full align-middle ${className}`}>
      <span ref={textRef} className="tabular-nums whitespace-nowrap" title={full}>{exact ? full : short}</span>
      {/* Same size and spacing everywhere, whatever the size of the number beside it */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExact((v) => !v); }}
        aria-pressed={exact}
        aria-label={exact ? `Show short amount (${short})` : `Show exact amount (${full})`}
        title={exact ? 'Show short amount' : 'Show exact amount'}
        className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-current opacity-50 hover:opacity-100 hover:bg-black/5 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#011c72] transition"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          {!exact && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />}
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={exact ? EYE_OFF : EYE} />
        </svg>
      </button>
    </span>
  );
}
