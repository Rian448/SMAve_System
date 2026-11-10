'use client';
import { useEffect, useState } from 'react';
import { api, type PurchaseOrder } from '@/lib/api';

const fmtQty = (n: number) => (Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 4 });

interface Props {
  po: PurchaseOrder;
  onClose: () => void;
  /** Called with the updated PO after a delivery (or closing) is saved */
  onSaved: (po: PurchaseOrder) => void;
}

/**
 * Record a delivery against a purchase order: how much of each line arrived now.
 * Only what is entered goes into stock; the PO stays "Partially received" until
 * every line is in. A partly received PO can also be closed when the rest won't come.
 */
export default function ReceivePurchaseOrderDialog({ po, onClose, onSaved }: Props) {
  const open = po.items.filter((it) => it.remainingQuantity > 0);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const lineProblem = (line: number, remaining: number) => {
    const raw = qty[line];
    if (raw === undefined || raw === '') return '';
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 'Enter 0 or more.';
    if (n > remaining + 1e-9) return `Only ${fmtQty(remaining)} left to receive.`;
    return '';
  };
  const entered = open
    .map((it) => ({ line: it.line, quantity: Number(qty[it.line] || 0) }))
    .filter((e) => e.quantity > 0);
  const hasProblem = open.some((it) => lineProblem(it.line, it.remainingQuantity));

  const receive = async () => {
    setError('');
    if (hasProblem) { setError('Fix the quantities marked in red.'); return; }
    if (entered.length === 0) { setError('Enter how much of at least one item arrived.'); return; }
    setSaving(true);
    try {
      const res = await api.purchaseOrders.receive(po.id, { items: entered, notes: notes.trim() || undefined });
      if (res.data) onSaved(res.data);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Failed to record the delivery.');
    } finally { setSaving(false); }
  };

  const closeRest = async () => {
    setError('');
    if (!reason.trim()) { setError('Say why the rest will not be received.'); return; }
    setSaving(true);
    try {
      const res = await api.purchaseOrders.closeReceiving(po.id, reason.trim());
      if (res.data) onSaved(res.data);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Failed to close the purchase order.');
    } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 rounded-lg border bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Receive ${po.poNumber}`}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{closing ? 'Close receiving' : 'Receive delivery'} · {po.poNumber}</h2>
          <p className="text-sm text-gray-500">{po.supplierName}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!closing ? (<>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-600">Enter how much of each item arrived now. Only these amounts are added to stock.</p>
              <button type="button" onClick={() => setQty(Object.fromEntries(open.map((it) => [it.line, String(it.remainingQuantity)])))}
                className="shrink-0 text-xs font-medium text-[#011c72] hover:underline">Fill all remaining</button>
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Ordered</th>
                    <th className="px-3 py-2 text-right font-medium">Received</th>
                    <th className="px-3 py-2 text-right font-medium">Remaining</th>
                    <th className="px-3 py-2 text-left font-medium w-36">Arrived now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {po.items.map((it) => {
                    const done = it.remainingQuantity <= 0;
                    const problem = done ? '' : lineProblem(it.line, it.remainingQuantity);
                    return (
                      <tr key={it.line} className={done ? 'text-gray-400' : ''}>
                        <td className="px-3 py-2">
                          <p className={done ? '' : 'font-medium text-gray-900'}>{it.name}</p>
                          {!it.materialId && !done && <p className="text-xs text-amber-700">Not linked to an inventory item: stock won&apos;t change</p>}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmtQty(it.quantity)} {it.unit}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmtQty(it.receivedQuantity)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{done ? 'Done' : fmtQty(it.remainingQuantity)}</td>
                        <td className="px-3 py-2">
                          {done ? <span className="text-xs">All received</span> : (<>
                            <input type="number" min="0" step="any" max={it.remainingQuantity} value={qty[it.line] ?? ''}
                              onChange={(e) => setQty((q) => ({ ...q, [it.line]: e.target.value }))}
                              placeholder="0" aria-label={`Quantity of ${it.name} arrived now`}
                              className={`${input} ${problem ? 'border-red-400' : 'border-gray-200'}`} />
                            {problem && <p className="mt-1 text-xs text-red-600">{problem}</p>}
                          </>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. delivery receipt no., damaged items"
                className={`${input} border-gray-200`} />
            </div>
          </>) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Stop waiting for the rest of this order. Nothing more is added to stock, and the PO shows as
                <span className="font-semibold"> Closed – not all received</span>.
              </p>
              <ul className="text-sm text-gray-700 list-disc pl-5">
                {open.map((it) => <li key={it.line}>{it.name}: {fmtQty(it.remainingQuantity)} {it.unit} will not be received</li>)}
              </ul>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. supplier out of stock"
                  className={`${input} border-gray-200`} />
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
          {po.status === 'partially_received' ? (
            <button type="button" onClick={() => { setError(''); setClosing((v) => !v); }} disabled={saving}
              className="text-sm font-medium text-orange-700 hover:underline disabled:opacity-50">
              {closing ? '← Back to receiving' : 'The rest won’t come…'}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            {closing ? (
              <button type="button" onClick={closeRest} disabled={saving}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium disabled:opacity-50">
                {saving ? 'Closing…' : 'Close receiving'}
              </button>
            ) : (
              <button type="button" onClick={receive} disabled={saving}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving…' : 'Record delivery'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
