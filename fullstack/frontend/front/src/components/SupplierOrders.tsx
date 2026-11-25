'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type SupplierOrder, type SupplierPortalData } from '@/lib/api';
import { formatDate, manilaDateString } from '@/lib/dateUtils';
import { formatLength } from '@/lib/length';
import { exactPeso } from '@/lib/format';

const qty = (n: number, unit?: string) =>
  !unit || unit === 'yd' ? formatLength(n) : `${(Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 4 })} ${unit}`;

/**
 * A supplier's own account: the purchase orders Seatmakers Avenue sent them (once
 * approved), and for each one the date they will deliver, which they set here.
 */
export default function SupplierOrders() {
  const [data, setData] = useState<SupplierPortalData | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(() => {
    api.supplierPortal.orders().then(res => setData(res.data || null)).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const box = 'bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8';
  if (failed) return <div className={box}><p className="text-sm text-gray-500">Could not load your purchase orders. Please refresh the page.</p></div>;
  if (!data) return <div className={`${box} h-40 animate-pulse`} />;
  if (!data.linked) {
    return (
      <div className={`${box} max-w-2xl`}>
        <h2 className="text-lg font-semibold text-gray-900">Purchase orders</h2>
        <p className="text-sm text-gray-600 mt-2">Your account isn&apos;t linked to a supplier yet. Please contact Seatmakers Avenue.</p>
      </div>
    );
  }

  const orders = data.orders || [];
  const open = orders.filter(o => o.status !== 'received');
  const needDate = open.filter(o => !o.expectedDelivery);
  const done = orders.filter(o => o.status === 'received').slice(0, 10);

  return (
    <div className={box}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="text-lg font-semibold text-gray-900">Purchase orders</h2>
        <p className="text-sm text-gray-500">{data.supplierName}</p>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Orders from Seatmakers Avenue. Set the date you will deliver each one; you can change it if plans change.
      </p>

      {message && (
        <p className={`mb-4 rounded-lg px-3 py-2 text-sm border ${message.error ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {message.text}
        </p>
      )}

      {needDate.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {needDate.length} order{needDate.length === 1 ? ' needs' : 's need'} a delivery date.
        </p>
      )}

      {open.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No open purchase orders right now.</p>
      ) : (
        <div className="space-y-4">
          {open.map(o => (
            <OrderCard key={o.id} order={o}
              onSaved={(text) => { setMessage({ text }); setTimeout(() => setMessage(null), 5000); load(); }}
              onError={(text) => setMessage({ text, error: true })} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Delivered</h3>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {done.map(o => (
              <div key={o.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-mono text-gray-800">{o.poNumber}</span>
                <span className="text-gray-500">{o.items.length} item{o.items.length === 1 ? '' : 's'} · {exactPeso(o.totalAmount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order: o, onSaved, onError }: {
  order: SupplierOrder;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const today = manilaDateString();
  const [date, setDate] = useState(o.expectedDelivery || '');
  const [note, setNote] = useState(o.supplierNote || '');
  // Unit prices, editable until the first delivery or payment (blank = not priced yet)
  const canPrice = !o.pricesLocked;
  const [prices, setPrices] = useState<Record<number, string>>(
    () => Object.fromEntries(o.items.map(it => [it.line, it.unitPrice > 0 ? String(it.unitPrice) : ''])));
  const priceOf = (line: number, fallback: number) => (canPrice ? Number(prices[line]) || 0 : fallback);
  const pricesChanged = canPrice && o.items.some(it => (Number(prices[it.line]) || 0) !== it.unitPrice);
  const deliveryChanged = date !== (o.expectedDelivery || '') || note.trim() !== (o.supplierNote || '');
  const unpriced = o.items.filter(it => !(priceOf(it.line, it.unitPrice) > 0)).length;
  const total = o.items.reduce((s, it) => s + it.quantity * priceOf(it.line, it.unitPrice), 0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (deliveryChanged && !date) { onError('Choose the date you will deliver.'); return; }
    if (canPrice && o.items.some(it => prices[it.line] !== '' && !(Number(prices[it.line]) >= 0))) {
      onError('Prices must be numbers of zero or more.'); return;
    }
    setSaving(true);
    try {
      if (pricesChanged) {
        await api.supplierPortal.setPrices(o.id, o.items.map(it => ({ line: it.line, unitPrice: Number(prices[it.line]) || 0 })));
      }
      if (deliveryChanged) {
        await api.supplierPortal.setDelivery(o.id, { expectedDelivery: date, note: note.trim() || undefined });
      }
      onSaved(`${o.poNumber}: saved${deliveryChanged ? `, delivery ${formatDate(date)}` : ''}.`);
    } catch (err) {
      onError(err instanceof Error && err.message ? err.message : 'Could not save.');
    } finally { setSaving(false); }
  };

  return (
    <div className={`rounded-xl border ${o.expectedDelivery ? 'border-gray-200' : 'border-amber-300'}`}>
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono font-semibold text-gray-900">{o.poNumber}</p>
          <p className="text-xs text-gray-500">
            Ordered {formatDate(o.orderedAt)}{o.paymentTermLabel ? ` · Terms: ${o.paymentTermLabel}` : ''}
            {o.status === 'partially_received' ? ' · Partly delivered' : ''}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${o.expectedDelivery ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'}`}>
          {o.expectedDelivery ? `Delivery ${formatDate(o.expectedDelivery)}` : 'Delivery date needed'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-120 text-sm">
          <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Item</th>
              <th className="px-4 py-2 text-right font-semibold">Ordered</th>
              <th className="px-4 py-2 text-right font-semibold">Still to deliver</th>
              <th className="px-4 py-2 text-right font-semibold">Unit price</th>
              <th className="px-4 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {o.items.map(it => (
              <tr key={it.line}>
                <td className="px-4 py-2 text-gray-800">{it.name}</td>
                <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">{qty(it.quantity, it.unit)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap font-medium text-gray-900">{qty(it.remainingQuantity, it.unit)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {canPrice ? (
                    <div className="inline-flex items-center gap-1">
                      <span className="text-gray-400">₱</span>
                      <input type="number" min="0" step="0.01" value={prices[it.line] ?? ''} aria-label={`Unit price of ${it.name}`}
                        onChange={e => setPrices(p => ({ ...p, [it.line]: e.target.value }))} placeholder="0.00"
                        className={`w-24 px-2 py-1 rounded-lg border bg-white text-sm text-right text-gray-900 ${
                          prices[it.line] ? 'border-gray-200' : 'border-amber-300'}`} />
                    </div>
                  ) : <span className="text-gray-700">{exactPeso(it.unitPrice)}</span>}
                </td>
                <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">{exactPeso(it.quantity * priceOf(it.line, it.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50">
              <td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold text-gray-700">Total</td>
              <td className="px-4 py-2 text-right font-bold text-gray-900 whitespace-nowrap">{exactPeso(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-gray-100 space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Delivery date</span>
            <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
          </label>
          <label className="block flex-1 min-w-48">
            <span className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</span>
            <input type="text" value={note} maxLength={500} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Morning delivery, 2 rolls first"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
          </label>
          <button type="button" onClick={save} disabled={saving || (!pricesChanged && !deliveryChanged)}
            className="px-4 py-2 rounded-lg bg-[#011c72] text-white text-sm font-semibold hover:bg-[#022a9e] disabled:opacity-50">
            {saving ? 'Saving…' : o.expectedDelivery ? 'Update' : 'Save'}
          </button>
        </div>
        <p className="text-[11px] text-gray-500">
          {canPrice
            ? <>Prices start from your last price for each item; change them if needed.{unpriced > 0 && <span className="text-amber-700"> {unpriced} item{unpriced === 1 ? ' has' : 's have'} no price yet.</span>} Prices can change until the first delivery or payment.</>
            : o.pricesLocked}
        </p>
        {o.deliverySetAt && (
          <p className="text-[11px] text-gray-400">Last set {formatDate(o.deliverySetAt)}</p>
        )}
      </div>
    </div>
  );
}
