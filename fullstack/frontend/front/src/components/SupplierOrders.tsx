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
  // A delivered order opened to look at (read only)
  const [viewing, setViewing] = useState<SupplierOrder | null>(null);

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
              <button key={o.id} type="button" onClick={() => setViewing(o)}
                className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-sm text-left hover:bg-gray-50">
                <span className="font-mono text-[#011c72]">{o.poNumber}</span>
                <span className="text-gray-500">
                  {o.items.length} item{o.items.length === 1 ? '' : 's'} · {exactPeso(o.totalAmount)}
                  <span className="ml-2 text-gray-400">›</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {viewing && <OrderDetails order={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** A delivered order, read only: what was ordered and delivered, prices, dates and terms */
function OrderDetails({ order: o, onClose }: { order: SupplierOrder; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 text-sm py-0.5">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-900 font-medium text-right">{v}</span>
    </div>
  );
  const delivered = (o.deliveries || []).filter(d => d.kind === 'delivery');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="supplier-po-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <h2 id="supplier-po-title" className="text-lg font-semibold text-gray-900 font-mono">{o.poNumber}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {o.status === 'received' ? 'Delivered' : 'Partly delivered'} · view only
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
            {row('Ordered', formatDate(o.orderedAt))}
            {row('Delivery date', o.expectedDelivery ? formatDate(o.expectedDelivery) : '—')}
            {row('Fully received', o.receivedAt ? formatDate(o.receivedAt) : '—')}
            {row('Payment terms', o.paymentTermLabel || '—')}
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full min-w-120 text-sm">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Item</th>
                  <th className="px-4 py-2 text-right font-semibold">Ordered</th>
                  <th className="px-4 py-2 text-right font-semibold">Delivered</th>
                  <th className="px-4 py-2 text-right font-semibold">Unit price</th>
                  <th className="px-4 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {o.items.map(it => (
                  <tr key={it.line}>
                    <td className="px-4 py-2 text-gray-800">{it.name}</td>
                    <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">{qty(it.quantity, it.unit)}</td>
                    <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">{qty(it.receivedQuantity, it.unit)}</td>
                    <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">{exactPeso(it.unitPrice)}</td>
                    <td className="px-4 py-2 text-right text-gray-900 whitespace-nowrap">{exactPeso(it.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold text-gray-700">Total</td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900 whitespace-nowrap">{exactPeso(o.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {(o.deliveries || []).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Deliveries{delivered.length !== (o.deliveries || []).length ? ' & returns' : ''}
              </h3>
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {(o.deliveries || []).map((d, i) => (
                  <li key={i} className="px-4 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">
                        {d.kind === 'delivery' ? 'Received' : 'Returned to you'} · {formatDate(d.date)}
                      </span>
                      {d.kind === 'delivery' && d.invoiceNumber && (
                        <span className="text-xs text-gray-500">Your invoice no. {d.invoiceNumber}</span>
                      )}
                      {d.kind === 'return' && (
                        <span className="text-xs text-amber-700">
                          {d.returnReason}{d.replacement ? ' · replacement expected' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {d.items.map(it => `${it.name} × ${qty(it.quantity, it.unit)}`).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
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
  // Marking the delivery as sent: only then can Seatmakers Avenue receive it
  const [sendNote, setSendNote] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  // How much of each item is being sent now (blank = none of it)
  const [sendQty, setSendQty] = useState<Record<number, string>>({});
  const open = o.items.filter(it => it.remainingQuantity > 0);
  const sending = open.map(it => ({ ...it, sendNow: Number(sendQty[it.line]) || 0 })).filter(it => it.sendNow > 0);
  const sendProblem = (it: SupplierOrder['items'][number]) => {
    const raw = sendQty[it.line];
    if (raw === undefined || raw === '') return '';
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 'Enter 0 or more';
    if (n > it.remainingQuantity + 1e-4) return `Only ${qty(it.remainingQuantity, it.unit)} left`;
    return '';
  };
  const addAll = () => setSendQty(Object.fromEntries(open.map(it => [it.line, String(it.remainingQuantity)])));
  /** Check the quantities, then show the review before marking it sent */
  const reviewSend = () => {
    if (pricesChanged || deliveryChanged) { onError('Save your changes first, then mark the order as sent.'); return; }
    if (open.some(it => sendProblem(it))) { onError('Fix the quantities to send (marked in red).'); return; }
    if (sending.length === 0) { onError('Enter how much of each item you are sending, or choose Add all.'); return; }
    setConfirmSend(true);
  };
  const markSent = async () => {
    setSaving(true);
    try {
      await api.supplierPortal.markSent(o.id, sending.map(it => ({ line: it.line, quantity: it.sendNow })),
        sendNote.trim() || undefined);
      onSaved(`${o.poNumber} marked as sent. Seatmakers Avenue can now receive it.`);
    } catch (err) {
      onError(err instanceof Error && err.message ? err.message : 'Could not mark it as sent.');
    } finally { setSaving(false); setConfirmSend(false); }
  };
  const sentOf = (line: number) => (o.sentItems || []).find(s => s.line === line)?.quantity;

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
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${o.sentAt ? 'bg-green-100 text-green-700'
          : o.expectedDelivery ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'}`}>
          {o.sentAt ? `Sent ${formatDate(o.sentAt)}` : o.expectedDelivery ? `Delivery ${formatDate(o.expectedDelivery)}` : 'Delivery date needed'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-120 text-sm">
          <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Item</th>
              <th className="px-4 py-2 text-right font-semibold">Ordered</th>
              <th className="px-4 py-2 text-right font-semibold">Still to deliver</th>
              {/* How much goes in this delivery (or, once sent, how much was sent) */}
              <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">
                {o.sentAt ? 'Sent' : (
                  <span className="inline-flex items-center gap-2">
                    To send
                    {open.length > 0 && (
                      <button type="button" onClick={addAll}
                        className="px-1.5 py-0.5 rounded border border-[#c7d2f5] bg-white text-[10px] font-semibold normal-case tracking-normal text-[#011c72] hover:bg-[#eef1fb]">
                        Add all
                      </button>
                    )}
                  </span>
                )}
              </th>
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
                  {o.sentAt ? (
                    <span className="text-gray-700">{sentOf(it.line) != null ? qty(sentOf(it.line)!, it.unit) : '—'}</span>
                  ) : it.remainingQuantity > 0 ? (
                    <div className="inline-flex flex-col items-end">
                      <div className="inline-flex items-center gap-1">
                        <input type="number" min="0" step="any" value={sendQty[it.line] ?? ''} placeholder="0"
                          aria-label={`How much of ${it.name} you are sending`}
                          onChange={e => setSendQty(q => ({ ...q, [it.line]: e.target.value }))}
                          className={`w-20 px-2 py-1 rounded-lg border bg-white text-sm text-right text-gray-900 ${
                            sendProblem(it) ? 'border-red-400' : 'border-gray-200'}`} />
                        <span className="text-xs text-gray-500">{it.unit || 'yd'}</span>
                      </div>
                      {sendProblem(it) && <span className="text-[10px] text-red-600">{sendProblem(it)}</span>}
                    </div>
                  ) : <span className="text-xs text-gray-400">Done</span>}
                </td>
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
              <td colSpan={5} className="px-4 py-2 text-right text-sm font-semibold text-gray-700">Total</td>
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

      {/* Sending: the shop can only receive a delivery once it is marked sent here */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 rounded-b-xl">
        {o.sentAt ? (
          <p className="text-sm text-green-700">
            Marked as sent {formatDate(o.sentAt)}{o.sentNote ? ` · ${o.sentNote}` : ''}. Waiting for Seatmakers Avenue to receive it.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {o.status === 'partially_received' ? 'Part of this order was received. ' : ''}
              Enter how much you are sending under <b>To send</b> (or choose <b>Add all</b>), then mark it as sent so it can be received.
              {unpriced > 0 && <span className="text-amber-700"> Set every price first.</span>}
            </p>
            <button type="button" onClick={reviewSend} disabled={saving || unpriced > 0}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              Mark as sent
            </button>
          </div>
        )}
      </div>

      {/* Review before marking it sent: what goes in this delivery */}
      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setConfirmSend(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby={`send-review-${o.id}`}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200">
              <h2 id={`send-review-${o.id}`} className="text-lg font-semibold text-gray-900">Send {o.poNumber}?</h2>
              <p className="text-sm text-gray-500 mt-0.5">Check what you are sending. Seatmakers Avenue can receive it once you confirm.</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Item</th>
                      <th className="px-3 py-2 text-right font-semibold">Sending now</th>
                      <th className="px-3 py-2 text-right font-semibold">Left after this</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sending.map(it => (
                      <tr key={it.line}>
                        <td className="px-3 py-2 text-gray-800">{it.name}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{qty(it.sendNow, it.unit)}</td>
                        <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                          {qty(Math.max(0, it.remainingQuantity - it.sendNow), it.unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {open.length > sending.length && (
                <p className="text-xs text-amber-700">
                  Not in this delivery: {open.filter(it => !sending.some(s => s.line === it.line)).map(it => it.name).join(', ')}.
                </p>
              )}
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Delivery receipt / note (optional)</span>
                <input type="text" value={sendNote} maxLength={255} onChange={e => setSendNote(e.target.value)}
                  placeholder="e.g. DR-1001, sent via truck"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
              </label>
            </div>
            <div className="p-5 border-t border-gray-200 flex gap-3">
              <button type="button" onClick={markSent} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Sending…' : 'Confirm sent'}
              </button>
              <button type="button" onClick={() => setConfirmSend(false)} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm hover:bg-gray-200">Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
