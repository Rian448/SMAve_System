'use client';
import { useState } from 'react';
import { api, PurchaseOrder, PAYMENT_METHOD_LABELS } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { exactPeso } from '@/lib/format';
import { formatDate } from '@/lib/dateUtils';
import { manilaDateString } from '@/lib/dateUtils';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';
import { useConfirm } from './ConfirmDialog';

// How the shop can pay a supplier (the same list as the Expense Log)
const SUPPLIER_PAYMENT_METHODS = ['cash', 'bank_transfer', 'gcash', 'maya', 'check', 'credit_card', 'debit_card', 'other'];
const PAYABLE = ['approved', 'partially_received', 'received'];

const STATUS: Record<PurchaseOrder['paymentStatus'], { label: string; cls: string }> = {
  unpaid: { label: 'Unpaid', cls: 'bg-red-50 text-red-700' },
  partial: { label: 'Partially Paid', cls: 'bg-yellow-50 text-yellow-800' },
  paid: { label: 'Paid', cls: 'bg-green-50 text-green-700' },
};

export function PaymentStatusBadge({ status }: { status: PurchaseOrder['paymentStatus'] }) {
  const s = STATUS[status] || STATUS.unpaid;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

/**
 * Paying the supplier for a purchase order: what was paid, what is left, and the
 * history. Each payment also goes into the Expense Log, which is where its mode
 * of payment is shown (it is asked for here, but not displayed on the PO).
 */
export default function SupplierPayments({ po, onChange }: { po: PurchaseOrder; onChange: (po: PurchaseOrder) => void }) {
  const { can } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const fe = useFieldErrors();
  const canPay = can('purchase_orders.pay');
  const payable = PAYABLE.includes(po.status) && po.balance > 0;

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(manilaDateString());
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const startPayment = () => {
    setAmount(po.balance.toFixed(2)); setDate(manilaDateString()); setMethod(''); setReference(''); setNotes('');
    setError(''); setSuccess(''); fe.clear(); setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const value = Math.round(Number(amount) * 100) / 100;
    if (fe.show({
      'pay-amount': !(value > 0) ? 'Enter an amount above zero.'
        : value > po.balance && `That is more than the balance of ${exactPeso(po.balance)}.`,
      'pay-date': !date ? 'Choose the payment date.' : date > manilaDateString() && 'The date cannot be in the future.',
      'pay-method': !method && 'Choose how the supplier was paid.',
    })) return;
    setBusy(true);
    try {
      const res = await api.purchaseOrders.recordPayment(po.id, {
        amount: value, paymentDate: date, paymentMethod: method,
        referenceNumber: reference.trim() || undefined, notes: notes.trim() || undefined,
      });
      if (res.data) onChange(res.data);
      setOpen(false);
      setSuccess(`Payment of ${exactPeso(value)} recorded and added to the Expense Log.`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The payment could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  const voidPayment = async (paymentId: number, paid: number) => {
    let reason = '';
    const ok = await confirm({
      title: `Void this ${exactPeso(paid)} payment?`,
      message: (
        <div className="space-y-2">
          <p>It stays in the history as voided, its Expense Log entry is removed, and the balance goes back up. Record the correct payment afterwards.</p>
          <input autoFocus onChange={e => { reason = e.target.value; }} placeholder="Reason, e.g. wrong amount entered"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-900" />
        </div>
      ),
      confirmLabel: 'Void payment',
      variant: 'danger',
    });
    if (!ok) return;
    if (!reason.trim()) { setError('Say why the payment is being voided.'); return; }
    setError(''); setSuccess('');
    try {
      const res = await api.purchaseOrders.voidPayment(po.id, paymentId, reason.trim());
      if (res.data) onChange(res.data);
      setSuccess('Payment voided. The balance and the Expense Log are updated.');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The payment could not be voided.');
    }
  };

  const input = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent';
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Supplier Payments</h2>
        <PaymentStatusBadge status={po.paymentStatus} />
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-gray-600">PO total</dt><dd className="font-medium text-gray-900 tabular-nums">{exactPeso(po.totalAmount)}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">Paid</dt><dd className="font-medium text-green-700 tabular-nums">{exactPeso(po.amountPaid)}</dd></div>
        <div className="flex justify-between border-t border-gray-200 pt-2"><dt className="font-semibold text-gray-900">Balance</dt>
          <dd className={`font-bold tabular-nums ${po.balance > 0 ? 'text-red-700' : 'text-gray-900'}`}>{exactPeso(po.balance)}</dd></div>
      </dl>

      {success && <p role="status" className="mt-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">✓ {success}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

      {canPay && payable && !open && (
        <button type="button" onClick={startPayment}
          className="mt-4 w-full px-4 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-medium transition-colors">
          Record Payment
        </button>
      )}
      {canPay && po.status === 'pending' && (
        <p className="mt-4 text-xs text-gray-500">Payments can be recorded once the purchase order is approved.</p>
      )}

      {open && (
        <form onSubmit={save} noValidate className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div {...fe.field('pay-amount')}>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
            <input type="number" min="0.01" step="0.01" max={po.balance} value={amount} onChange={e => setAmount(e.target.value)} className={input} />
            <FieldError message={fe.errors['pay-amount']} />
          </div>
          <div {...fe.field('pay-date')}>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payment date *</label>
            <input type="date" value={date} max={manilaDateString()} onChange={e => setDate(e.target.value)} className={input} />
            <FieldError message={fe.errors['pay-date']} />
          </div>
          <div {...fe.field('pay-method')}>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mode of payment *</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className={input}>
              <option value="">Choose…</option>
              {SUPPLIER_PAYMENT_METHODS.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] || m}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-gray-500">Shown in the Expense Log, not on this purchase order.</p>
            <FieldError message={fe.errors['pay-method']} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reference no. (optional)</label>
            <input value={reference} maxLength={100} onChange={e => setReference(e.target.value)} placeholder="Receipt, transfer or GCash ref." className={input} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} className={input} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy}
              className="flex-1 px-4 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-medium disabled:opacity-50">
              {busy ? 'Saving…' : 'Save Payment'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-white">
              Cancel
            </button>
          </div>
        </form>
      )}

      <h3 className="mt-6 mb-2 text-sm font-semibold text-gray-900">Payment history</h3>
      {po.payments.length === 0 ? (
        <p className="text-sm text-gray-400">No payments recorded yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {po.payments.map(p => (
            <li key={p.id} className={`py-2.5 text-sm ${p.voided ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`font-medium tabular-nums ${p.voided ? 'line-through text-gray-500' : 'text-gray-900'}`}>{exactPeso(p.amount)}</p>
                  <p className="text-xs text-gray-500">
                    {p.paymentDate ? formatDate(p.paymentDate) : '—'}
                    {p.referenceNumber ? ` · Ref. ${p.referenceNumber}` : ''}
                    {p.recordedByName ? ` · by ${p.recordedByName}` : ''}
                  </p>
                  {p.notes && <p className="text-xs text-gray-500">{p.notes}</p>}
                  {p.voided && (
                    <p className="text-xs text-red-700 mt-0.5">
                      Voided{p.voidedByName ? ` by ${p.voidedByName}` : ''}{p.voidReason ? `: ${p.voidReason}` : ''}
                    </p>
                  )}
                </div>
                {canPay && !p.voided && (
                  <button type="button" onClick={() => voidPayment(p.id, p.amount)}
                    className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700">Void</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}
