'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, PAYMENT_METHOD_LABELS, type ExcessPayment, type CustomerOrderSummary } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';

const REFUND_METHODS = ['gcash', 'maya', 'bank_transfer', 'cash', 'check', 'other'];

const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(n || 0);

const STATUS_STYLE: Record<ExcessPayment['status'], { label: string; cls: string }> = {
  open: { label: 'To return', cls: 'bg-amber-100 text-amber-800' },
  refunded: { label: 'Refunded', cls: 'bg-green-100 text-green-700' },
  applied: { label: 'Applied', cls: 'bg-blue-100 text-blue-700' },
};

/**
 * Excess payments with what happened to them. Open ones can be refunded, or
 * applied to one of `unpaidOrders` (the same customer's orders with a balance).
 */
export default function ExcessPayments({ items, unpaidOrders = [], canManage, onChanged, showSource = true }: {
  items: ExcessPayment[];
  unpaidOrders?: CustomerOrderSummary[];
  canManage: boolean;
  onChanged: () => void;
  /** Show which order each excess came from (off when listing a single order's own) */
  showSource?: boolean;
}) {
  const [open, setOpen] = useState<{ id: number; action: 'refund' | 'apply' } | null>(null);
  const [form, setForm] = useState({ refundMethod: '', referenceNumber: '', notes: '', jobOrderId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fe = useFieldErrors();

  const start = (id: number, action: 'refund' | 'apply') => {
    setOpen({ id, action });
    setForm({ refundMethod: '', referenceNumber: '', notes: '', jobOrderId: '' });
    setError('');
    fe.clear();
  };

  const submit = async (e: ExcessPayment) => {
    if (!open) return;
    setError('');
    if (open.action === 'refund'
      ? fe.show({ 'excess-refundMethod': !form.refundMethod && 'Choose how the money was returned.' })
      : fe.show({ 'excess-target': !form.jobOrderId && 'Choose the order to apply it to.' })) return;
    setSaving(true);
    try {
      if (open.action === 'refund') {
        await api.excessPayments.refund(e.id, {
          refundMethod: form.refundMethod,
          referenceNumber: form.referenceNumber.trim() || undefined,
          notes: form.notes.trim() || undefined,
        });
      } else {
        await api.excessPayments.apply(e.id, Number(form.jobOrderId));
      }
      setOpen(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (items.length === 0) return null;
  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  return (
    <div className="space-y-2">
      {items.map((e) => {
        const style = STATUS_STYLE[e.status];
        const choices = unpaidOrders.filter((o) => o.id !== e.jobOrderId);
        const isOpen = open?.id === e.id;
        return (
          <div key={e.id} className={`rounded-lg border p-3 ${e.status === 'open' ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200 bg-white'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {peso(e.amount)}
                  <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${style.cls}`}>{style.label}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Received {formatDate(e.createdAt)} via {PAYMENT_METHOD_LABELS[e.paymentMethod] || e.paymentMethod}
                  {e.referenceNumber ? ` · ref ${e.referenceNumber}` : ''}
                  {showSource && e.jobOrderRef && (
                    <> · on <Link href={`/sales/${e.jobOrderId}`} className="text-[#011c72] hover:underline">{e.jobOrderRef}</Link></>
                  )}
                </p>
                {e.status === 'refunded' && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Refunded {e.resolvedAt ? formatDate(e.resolvedAt) : ''} via {PAYMENT_METHOD_LABELS[e.refundMethod || ''] || e.refundMethod}
                    {e.refundReference ? ` · ref ${e.refundReference}` : ''}
                    {e.resolvedByName ? ` · by ${e.resolvedByName}` : ''}
                    {e.resolutionNotes ? ` · ${e.resolutionNotes}` : ''}
                  </p>
                )}
                {e.status === 'applied' && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Applied {e.resolvedAt ? formatDate(e.resolvedAt) : ''} as payment on{' '}
                    {e.appliedJobOrderId
                      ? <Link href={`/sales/${e.appliedJobOrderId}`} className="text-[#011c72] hover:underline">{e.appliedJobOrderRef}</Link>
                      : 'another order'}
                    {e.resolvedByName ? ` · by ${e.resolvedByName}` : ''}
                  </p>
                )}
              </div>
              {canManage && e.status === 'open' && !isOpen && (
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => start(e.id, 'refund')}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50">
                    Refund
                  </button>
                  {choices.length > 0 && (
                    <button type="button" onClick={() => start(e.id, 'apply')}
                      className="px-3 py-1.5 rounded-lg bg-[#011c72] text-white text-xs font-medium hover:bg-[#01268c]">
                      Apply to another order
                    </button>
                  )}
                </div>
              )}
            </div>

            {isOpen && (
              <div className="mt-3 border-t border-amber-200 pt-3">
                {open.action === 'refund' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div {...fe.field('excess-refundMethod')}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Returned via *</label>
                      <select value={form.refundMethod} onChange={(ev) => setForm({ ...form, refundMethod: ev.target.value })} className={inputCls}>
                        <option value="">Choose…</option>
                        {REFUND_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
                      </select>
                      <FieldError message={fe.errors['excess-refundMethod']} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Reference number</label>
                      <input value={form.referenceNumber} onChange={(ev) => setForm({ ...form, referenceNumber: ev.target.value })}
                        placeholder="GCash ref, etc." className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                      <input value={form.notes} onChange={(ev) => setForm({ ...form, notes: ev.target.value })}
                        placeholder="Optional" className={inputCls} />
                    </div>
                  </div>
                ) : (
                  <div {...fe.field('excess-target')}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Apply to *</label>
                    <select value={form.jobOrderId} onChange={(ev) => setForm({ ...form, jobOrderId: ev.target.value })} className={inputCls}>
                      <option value="">Choose an unpaid order…</option>
                      {choices.map((o) => (
                        <option key={o.id} value={o.id}>{o.jobOrderId} · balance {peso(o.balance)}</option>
                      ))}
                    </select>
                    <FieldError message={fe.errors['excess-target']} />
                    <p className="text-xs text-gray-500 mt-1">
                      It is recorded as a payment on that order. If it is more than that order&apos;s balance, the rest stays here to return.
                    </p>
                  </div>
                )}
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(null)} disabled={saving}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="button" onClick={() => submit(e)} disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-[#011c72] text-white text-xs font-semibold hover:bg-[#01268c] disabled:opacity-50">
                    {saving ? 'Saving…' : open.action === 'refund' ? 'Mark as refunded' : 'Apply'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
