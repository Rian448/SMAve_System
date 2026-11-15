'use client';
import { useEffect, useState } from 'react';
import { api, PaymentTerm, PaymentTermOptions, PurchaseOrder, PurchaseOrderTermStatus } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';

/**
 * Payment terms for suppliers and purchase orders: when the supplier must be paid.
 *   Cash in Advance  due when the PO is approved
 *   COD              due the day the first delivery is received
 *   Net N days       due N days after the first delivery
 * The term only sets the due date and the reminders. Payments still go into the
 * Expense Log on the day they are recorded, and receiving never waits on payment.
 */

export const DEFAULT_TERM_OPTIONS: PaymentTermOptions = { netDays: [7, 15, 30, 60], reminderDays: 3, maxDays: 365 };

let cachedOptions: PaymentTermOptions | null = null;

/** The Net day choices and reminder lead time from Settings (loaded once per page visit) */
export function usePaymentTermOptions() {
  const [options, setOptions] = useState<PaymentTermOptions>(cachedOptions || DEFAULT_TERM_OPTIONS);
  useEffect(() => {
    if (cachedOptions) return;
    api.purchaseOrders.paymentTermOptions()
      .then(r => { if (r.data) { cachedOptions = r.data; setOptions(r.data); } })
      .catch(() => {});
  }, []);
  return options;
}

/** Forget the loaded options (after Settings changes them) */
export function resetPaymentTermOptions() { cachedOptions = null; }

export type TermValue = { term: PaymentTerm | ''; days: number | null };

export function termLabel(term: PaymentTerm | '' | null | undefined, days?: number | null) {
  if (term === 'advance') return 'Cash in Advance';
  if (term === 'cod') return 'COD (Cash on Delivery)';
  if (term === 'net' && days) return `Net ${days} day${days === 1 ? '' : 's'}`;
  return 'No term';
}

/** What the due date counts from, in words */
export function termExplanation(term: PaymentTerm | '' | null | undefined, days?: number | null) {
  if (term === 'advance') return 'Due when the purchase order is approved (pay before the supplier ships).';
  if (term === 'cod') return 'Due the day the first delivery is received.';
  if (term === 'net' && days) return `Due ${days} day${days === 1 ? '' : 's'} after the first delivery is received.`;
  return 'No due date or reminders. Payments can still be recorded any time.';
}

/** Message if the chosen term can't be saved, else '' */
export function termValueError(v: TermValue, maxDays = DEFAULT_TERM_OPTIONS.maxDays) {
  if (v.term !== 'net') return '';
  const d = v.days;
  if (d === null || !Number.isInteger(d) || d < 1 || d > maxDays) return `Enter the Net days as a whole number from 1 to ${maxDays}.`;
  return '';
}

/**
 * Choose a term: No term, Cash in Advance, COD, the Net presets from Settings,
 * or a custom number of Net days.
 */
export function PaymentTermPicker({ value, onChange, id, className = '', compact = false, disabled = false }: {
  value: TermValue; onChange: (v: TermValue) => void; id?: string; className?: string; compact?: boolean; disabled?: boolean;
}) {
  const { netDays, maxDays } = usePaymentTermOptions();
  const isPreset = value.term === 'net' && value.days !== null && netDays.includes(value.days);
  // Custom stays selected while the days are being typed, even if they match a preset
  // (only counts while the term is Net; choosing another option clears it)
  const [custom, setCustom] = useState(value.term === 'net' && !isPreset);

  const selected = value.term === 'net' ? (custom || !isPreset ? 'custom' : `net:${value.days}`) : value.term;
  const field = compact
    ? 'px-2 py-1 rounded border border-gray-200 bg-white text-sm text-gray-900'
    : 'w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <select id={id} value={selected} disabled={disabled} aria-label="Payment term"
        onChange={e => {
          const v = e.target.value;
          if (v === 'custom') { setCustom(true); onChange({ term: 'net', days: value.term === 'net' ? value.days : null }); }
          else if (v.startsWith('net:')) { setCustom(false); onChange({ term: 'net', days: Number(v.slice(4)) }); }
          else { setCustom(false); onChange({ term: v as PaymentTerm | '', days: null }); }
        }}
        className={`${compact ? '' : 'flex-1 min-w-0'} ${field}`}>
        <option value="">No term</option>
        <option value="advance">Cash in Advance</option>
        <option value="cod">COD (Cash on Delivery)</option>
        {netDays.map(d => <option key={d} value={`net:${d}`}>Net {d} days</option>)}
        <option value="custom">Custom Net days…</option>
      </select>
      {selected === 'custom' && (
        <span className="inline-flex items-center gap-1.5">
          <input type="text" inputMode="numeric" aria-label="Net days" disabled={disabled}
            value={value.days ?? ''} maxLength={3} placeholder="Days"
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
              onChange({ term: 'net', days: digits ? Math.min(Number(digits), maxDays) : null });
            }}
            className={`${compact ? 'w-16' : 'w-24'} ${field.replace('w-full ', '')}`} />
          <span className="text-sm text-gray-500">days</span>
        </span>
      )}
    </div>
  );
}

const STATUS: Record<PurchaseOrderTermStatus, { label: string; cls: string }> = {
  awaiting: { label: 'Not yet due', cls: 'bg-gray-100 text-gray-600' },
  not_due: { label: 'Not yet due', cls: 'bg-gray-100 text-gray-700' },
  due_soon: { label: 'Due soon', cls: 'bg-amber-100 text-amber-800' },
  overdue: { label: 'Overdue', cls: 'bg-red-100 text-red-700' },
  paid: { label: 'Paid on time', cls: 'bg-green-50 text-green-700' },
  paid_late: { label: 'Paid late', cls: 'bg-orange-50 text-orange-700' },
};

export function TermStatusBadge({ status }: { status: PurchaseOrderTermStatus | null }) {
  if (!status) return null;
  const s = STATUS[status];
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

/** "Due Nov 18, 2026 · in 3 days", "Due today", "Overdue by 2 days", or what the due date is waiting for */
export function dueText(po: Pick<PurchaseOrder, 'paymentTerm' | 'paymentTermDays' | 'dueDate' | 'termStatus' | 'daysUntilDue' | 'status'>) {
  if (!po.paymentTerm || po.status === 'cancelled') return '';
  if (!po.dueDate) {
    return po.paymentTerm === 'advance' ? 'Due once approved' : 'Due date set when the first delivery arrives';
  }
  const date = formatDate(po.dueDate);
  const d = po.daysUntilDue;
  if (po.termStatus === 'paid' || po.termStatus === 'paid_late' || d === null) return `Due ${date}`;
  if (d < 0) return `Overdue by ${-d} day${d === -1 ? '' : 's'} (due ${date})`;
  if (d === 0) return `Due today (${date})`;
  if (d === 1) return `Due tomorrow (${date})`;
  return `Due ${date} · in ${d} days`;
}

/** Needs attention: due soon or overdue, with money still owed */
export const isDueOrOverdue = (po: Pick<PurchaseOrder, 'termStatus'>) =>
  po.termStatus === 'due_soon' || po.termStatus === 'overdue';

/**
 * The PO's term, due date and standing, on the purchase order page. Whoever raises
 * POs can change the term while it awaits approval; approvers can change it later
 * too (the change is in the audit trail and resets the reminders).
 */
export function PurchaseOrderTermCard({ po, onChange, canChange }: {
  po: PurchaseOrder; onChange: (po: PurchaseOrder) => void; canChange: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<TermValue>({ term: po.paymentTerm || '', days: po.paymentTermDays });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = () => { setValue({ term: po.paymentTerm || '', days: po.paymentTermDays }); setError(''); setEditing(true); };
  const save = async () => {
    const problem = termValueError(value);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const res = await api.purchaseOrders.setPaymentTerm(po.id, value.term, value.term === 'net' ? value.days : null);
      if (res.data) onChange(res.data);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The payment term could not be saved.');
    } finally { setBusy(false); }
  };

  const tone = po.termStatus === 'overdue' ? 'border-red-200 bg-red-50'
    : po.termStatus === 'due_soon' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white';
  return (
    <div className={`rounded-xl shadow-sm border p-6 ${tone}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Payment Terms</h2>
        <TermStatusBadge status={po.termStatus} />
      </div>
      {!editing ? (
        <>
          <p className="text-base font-medium text-gray-900">{po.paymentTermLabel || 'No term'}</p>
          {po.paymentTerm ? (
            <p className={`mt-1 text-sm ${po.termStatus === 'overdue' ? 'text-red-700 font-medium' : po.termStatus === 'due_soon' ? 'text-amber-800 font-medium' : 'text-gray-600'}`}>
              {dueText(po)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-500">No due date or reminders for this order.</p>
          )}
          <p className="mt-2 text-xs text-gray-500">{termExplanation(po.paymentTerm, po.paymentTermDays)}</p>
          {canChange && po.status !== 'cancelled' && (
            <button type="button" onClick={start} className="mt-3 text-sm font-medium text-[#011c72] hover:underline">
              Change term
            </button>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <PaymentTermPicker value={value} onChange={setValue} />
          <p className="text-xs text-gray-500">{termExplanation(value.term, value.days)} Reminders start again for the new due date.</p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy}
              className="px-4 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-medium disabled:opacity-50">
              {busy ? 'Saving…' : 'Save term'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
