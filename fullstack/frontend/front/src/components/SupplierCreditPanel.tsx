'use client';
import { useEffect, useState } from 'react';
import { api, type PurchaseOrder, PAYMENT_METHOD_LABELS } from '@/lib/api';
import { exactPeso } from '@/lib/format';
import { formatDate, manilaDateString } from '@/lib/dateUtils';
import { useConfirm } from './ConfirmDialog';

const REFUND_METHODS = ['cash', 'bank_transfer', 'gcash', 'maya', 'check', 'other'];

/**
 * Supplier credit on a PO (paid more than it now comes to, e.g. after a return
 * without replacement): record the supplier refunding it, or apply it as payment
 * to another purchase order of the same supplier. Also lists what was done with it.
 */
export default function SupplierCreditPanel({ po, onChange, canPay }: {
  po: PurchaseOrder; onChange: (po: PurchaseOrder) => void; canPay: boolean;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const [mode, setMode] = useState<'refund' | 'apply' | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(manilaDateString());
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [targetId, setTargetId] = useState('');
  const [targets, setTargets] = useState<PurchaseOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Other open POs of the same supplier that still have something to pay
  useEffect(() => {
    if (mode !== 'apply') return;
    api.purchaseOrders.getAll()
      .then((res) => setTargets((res.data || []).filter((x) => x.id !== po.id && x.supplierId === po.supplierId
        && ['approved', 'partially_received', 'received'].includes(x.status) && x.balance > 0)))
      .catch(() => setTargets([]));
  }, [mode, po.id, po.supplierId]);

  if (po.supplierCredit <= 0 && po.credits.length === 0) return null;

  const start = (m: 'refund' | 'apply') => {
    setMode(m); setAmount(po.supplierCredit.toFixed(2)); setDate(manilaDateString());
    setMethod(''); setReference(''); setNotes(''); setTargetId(''); setError('');
  };

  const save = async () => {
    const value = Math.round(Number(amount) * 100) / 100;
    const target = targets.find((t) => String(t.id) === targetId);
    const problem = !(value > 0) ? 'Enter an amount above zero.'
      : value > po.supplierCredit + 0.004 ? `The credit is only ${exactPeso(po.supplierCredit)}.`
      : mode === 'refund' && !method ? 'Choose how the supplier refunded it.'
      : mode === 'apply' && !target ? 'Choose the purchase order to apply it to.'
      : mode === 'apply' && target && value > target.balance + 0.004 ? `${target.poNumber} only has ${exactPeso(target.balance)} left to pay.`
      : '';
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const res = await api.purchaseOrders.useSupplierCredit(po.id, {
        kind: mode!, amount: value, date, notes: notes.trim() || undefined, referenceNumber: reference.trim() || undefined,
        ...(mode === 'refund' ? { paymentMethod: method } : { targetPurchaseOrderId: Number(targetId) }),
      });
      if (res.data) onChange(res.data);
      setMode(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not save.');
    } finally { setBusy(false); }
  };

  const undo = async (id: number, amt: number) => {
    let reason = '';
    const ok = await confirm({
      title: `Undo this ${exactPeso(amt)}?`,
      message: (
        <div className="space-y-2">
          <p>The credit goes back on this purchase order. A refund&apos;s Expense Log entry is removed; a credit applied to another PO is taken off that PO&apos;s payments.</p>
          <input autoFocus onChange={(e) => { reason = e.target.value; }} placeholder="Reason, e.g. wrong amount"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-900" />
        </div>
      ),
      confirmLabel: 'Undo', variant: 'danger',
    });
    if (!ok) return;
    if (!reason.trim()) { setError('Say why it is being undone.'); return; }
    try {
      const res = await api.purchaseOrders.voidSupplierCredit(po.id, id, reason.trim());
      if (res.data) onChange(res.data);
    } catch (err) { setError(err instanceof Error && err.message ? err.message : 'Could not undo it.'); }
  };

  const input = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm';
  return (
    <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-6">
      {confirmDialog}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Supplier Credit</h2>
        <span className={`text-lg font-bold tabular-nums ${po.supplierCredit > 0 ? 'text-orange-700' : 'text-gray-400'}`}>{exactPeso(po.supplierCredit)}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {po.supplierCredit > 0
          ? `Paid ${exactPeso(po.supplierCredit)} more than this order now comes to (e.g. after a return). Record the supplier's refund, or use it to pay another of their purchase orders.`
          : 'All of this credit has been refunded or used.'}
      </p>

      {canPay && po.supplierCredit > 0 && !mode && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => start('refund')}
            className="px-3 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-medium">Record refund</button>
          <button type="button" onClick={() => start('apply')}
            className="px-3 py-2 rounded-lg border border-[#c7d2f5] text-[#011c72] hover:bg-[#eef1fb] text-sm font-medium">Apply to another PO</button>
        </div>
      )}

      {mode && (
        <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-800">{mode === 'refund' ? 'Supplier refunded the credit' : 'Use the credit to pay another purchase order'}</p>
          {mode === 'apply' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Purchase order of {po.supplierName} *</label>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={input}>
                <option value="">{targets.length ? 'Choose…' : 'No other open purchase order of this supplier'}</option>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.poNumber} — {exactPeso(t.balance)} left to pay</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
              <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input type="date" value={date} max={manilaDateString()} onChange={(e) => setDate(e.target.value)} className={input} />
            </div>
          </div>
          {mode === 'refund' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">How it was refunded *</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
                <option value="">Choose…</option>
                {REFUND_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] || m}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-gray-500">Recorded in the Expense Log as money back, so supplier payments net out.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)}
              placeholder={mode === 'refund' ? 'Ref. / credit memo no.' : 'Credit memo no.'} className={input} />
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className={input} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy}
              className="flex-1 px-4 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-medium disabled:opacity-50">
              {busy ? 'Saving…' : mode === 'refund' ? 'Save refund' : 'Apply credit'}
            </button>
            <button type="button" onClick={() => setMode(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-white">Cancel</button>
          </div>
        </div>
      )}
      {!mode && error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {po.credits.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
          {po.credits.map((c) => (
            <li key={c.id} className={`py-2.5 text-sm flex items-start justify-between gap-3 ${c.voided ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <p className={`font-medium tabular-nums ${c.voided ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                  {exactPeso(c.amount)} {c.kind === 'refund' ? 'refunded by the supplier' : `applied to ${c.targetPoNumber || 'another PO'}`}
                </p>
                <p className="text-xs text-gray-500">
                  {c.date ? formatDate(c.date) : '—'}{c.referenceNumber ? ` · Ref. ${c.referenceNumber}` : ''}{c.recordedByName ? ` · by ${c.recordedByName}` : ''}
                </p>
                {c.notes && <p className="text-xs text-gray-500">{c.notes}</p>}
                {c.voided && <p className="text-xs text-red-700">Undone{c.voidReason ? `: ${c.voidReason}` : ''}</p>}
              </div>
              {canPay && !c.voided && (
                <button type="button" onClick={() => undo(c.id, c.amount)} className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700">Undo</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
