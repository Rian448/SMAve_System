'use client';
import { useEffect, useState } from 'react';
import { api, PaymentTerm, PaymentTermOptions, PurchaseOrder, PurchaseOrderTermStatus } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { exactPeso } from '@/lib/format';

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
  if (term === 'net' && days) return `n/${days}`;
  return 'No term';
}

/** What the due date counts from, in words */
export function termExplanation(term: PaymentTerm | '' | null | undefined, days?: number | null) {
  if (term === 'advance') return 'Due when the purchase order is approved (pay before the supplier ships).';
  if (term === 'cod') return 'Due the day the first delivery is received.';
  if (term === 'net' && days) return `n/${days} (Net ${days}): the full amount received is due ${days} day${days === 1 ? '' : 's'} after the first delivery.`;
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
        {netDays.map(d => <option key={d} value={`net:${d}`}>n/{d} (Net {d} days)</option>)}
        <option value="custom">Custom n/… days</option>
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

  const tone = po.termStatus === 'overdue' ? 'border-red-200' : po.termStatus === 'due_soon' ? 'border-amber-200' : 'border-gray-200';
  const badge = apBadge(po);
  const field = (label: string, value: React.ReactNode, cls = '') => (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-semibold text-gray-900 mt-0.5 ${cls}`}>{value}</p>
    </div>
  );
  return (
    <div className={`rounded-xl shadow-sm border bg-white ${tone}`}>
      <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-3 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Accounts Payable · Purchase Order</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{po.poNumber}</p>
        </div>
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${badge.cls}`}>{badge.label}</span>
      </div>
      {!editing ? (
        <>
          <div className="px-6 py-4 grid grid-cols-2 gap-x-4 gap-y-3 border-b border-gray-100">
            {field('Supplier', po.supplierName)}
            {field('Payment terms', po.paymentTermLabel || 'No term')}
            {field('Invoice date', po.invoiceDate ? formatDate(po.invoiceDate) : <span className="text-gray-400 font-normal">On first delivery</span>)}
            {field('Due date', po.dueDate ? formatDate(po.dueDate)
              : <span className="text-gray-400 font-normal">{po.paymentTerm ? (po.paymentTerm === 'advance' ? 'Once approved' : 'Set on first delivery') : '—'}</span>,
              po.termStatus === 'overdue' ? 'text-red-700' : po.termStatus === 'due_soon' ? 'text-amber-800' : '')}
            {po.invoiceNumbers.length > 0 && (
              <div className="col-span-2">{field(`Supplier invoice no${po.invoiceNumbers.length > 1 ? 's' : ''}.`, po.invoiceNumbers.join(', '))}</div>
            )}
          </div>
          <dl className="px-6 py-4 space-y-1.5 text-sm border-b border-gray-100">
            <div className="flex justify-between"><dt className="text-gray-600">Ordered</dt><dd className="tabular-nums text-gray-500">{exactPeso(po.totalAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">Received (accounts payable)</dt><dd className="tabular-nums font-medium text-gray-900">{exactPeso(po.payableAmount)}</dd></div>
            {po.returnedAmount > 0 && (
              <div className="flex justify-between"><dt className="text-gray-600">Returned to supplier</dt><dd className="tabular-nums text-orange-700">−{exactPeso(po.returnedAmount)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-gray-600">Total payments</dt><dd className="tabular-nums text-green-700">−{exactPeso(po.amountPaid)}</dd></div>
            <div className="flex justify-between pt-2 mt-1 border-t border-gray-100">
              <dt className="font-semibold text-gray-900">Remaining A/P</dt>
              <dd className={`tabular-nums font-bold ${po.payableBalance > 0 ? 'text-gray-900' : 'text-green-700'}`}>{exactPeso(po.payableBalance)}</dd>
            </div>
            {po.prepaid > 0 && (
              <p className="text-xs text-gray-500">{exactPeso(po.prepaid)} paid ahead for items not received yet.</p>
            )}
            {po.supplierCredit > 0 && (
              <p className="text-xs font-medium text-orange-700">Supplier credit: {exactPeso(po.supplierCredit)} paid more than the order now comes to (to be refunded or used on a later order).</p>
            )}
          </dl>
          <div className="px-6 py-4">
            <p className="text-xs text-gray-500">Amount due</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{exactPeso(po.amountDue)}</p>
            <p className={`mt-1 text-xs ${po.termStatus === 'overdue' ? 'text-red-700 font-medium' : po.termStatus === 'due_soon' ? 'text-amber-800 font-medium' : 'text-gray-500'}`}>
              {po.paymentTerm
                ? (po.dueDate && po.amountDue > 0
                    ? `Payment must be completed by ${formatDate(po.dueDate)}, under these agreed terms. ${dueText(po).startsWith('Overdue') ? dueText(po) + '.' : ''}`
                    : termExplanation(po.paymentTerm, po.paymentTermDays))
                : 'No term: no due date or reminders. Payments can be recorded any time.'}
            </p>
            {canChange && po.status !== 'cancelled' && (
              <button type="button" onClick={start} className="mt-3 text-sm font-medium text-[#011c72] hover:underline">
                Change term
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="px-6 py-4">
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
        </div>
      )}
    </div>
  );
}

/** Where the payable stands: Unpaid / Partially Paid / Paid / Overdue / Awaiting delivery */
function apBadge(po: PurchaseOrder): { label: string; cls: string } {
  if (po.status === 'cancelled') return { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' };
  if (po.supplierCredit > 0) return { label: 'Supplier credit', cls: 'bg-orange-100 text-orange-800' };
  if (po.termStatus === 'overdue') return { label: 'Overdue', cls: 'bg-red-100 text-red-700' };
  if (po.payableAmount <= 0) return po.amountPaid > 0
    ? { label: 'Paid ahead', cls: 'bg-blue-50 text-blue-700' }
    : { label: 'Awaiting delivery', cls: 'bg-gray-100 text-gray-600' };
  if (po.payableBalance <= 0) return { label: 'Paid', cls: 'bg-green-100 text-green-700' };
  if (po.termStatus === 'due_soon') return { label: 'Due soon', cls: 'bg-amber-100 text-amber-800' };
  return po.amountPaid > 0 ? { label: 'Partially paid', cls: 'bg-amber-50 text-amber-800' }
    : { label: 'Unpaid', cls: 'bg-red-50 text-red-700' };
}
