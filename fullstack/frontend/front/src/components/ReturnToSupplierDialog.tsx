'use client';
import { useEffect, useState } from 'react';
import { api, type PurchaseOrder } from '@/lib/api';
import { formatLength } from '@/lib/length';
import { exactPeso } from '@/lib/format';
import LengthInput from './LengthInput';

const REASONS = ['Bad quality', 'Damaged', 'Wrong item', 'Wrong color / pattern', 'Excess quantity', 'Other'];

const fmtQty = (n: number) => (Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 4 });
const poQty = (n: number, unit?: string) => (!unit || unit === 'yd' ? formatLength(n) : `${fmtQty(n)} ${unit}`);

interface Props {
  po: PurchaseOrder;
  onClose: () => void;
  onSaved: (po: PurchaseOrder) => void;
}

/**
 * Return to Supplier (a purchase return): received items that are sent back, e.g.
 * bad quality or damaged. They leave stock and the accounts payable goes down by
 * their value. If the supplier will replace them, the quantity is to be received
 * again; if not, the order is simply that much smaller.
 */
export default function ReturnToSupplierDialog({ po, onClose, onSaved }: Props) {
  const lines = po.items.filter((it) => it.receivedQuantity > 0);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [replacement, setReplacement] = useState<boolean | null>(null);
  const [documentNumber, setDocumentNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const entered = lines.map((it) => ({ line: it.line, quantity: qty[it.line] || 0 })).filter((e) => e.quantity > 0);
  const over = lines.filter((it) => (qty[it.line] || 0) > it.receivedQuantity + 1e-4);
  const value = entered.reduce((sum, e) => sum + e.quantity * (po.items.find((i) => i.line === e.line)?.unitPrice || 0), 0);

  const save = async () => {
    setError('');
    if (entered.length === 0) { setError('Enter how much of at least one item is going back.'); return; }
    if (over.length) { setError('You can only return what was received (see the amounts in red).'); return; }
    if (!reason) { setError('Choose why the items are being returned.'); return; }
    if (reason === 'Other' && !notes.trim()) { setError('Explain the reason.'); return; }
    if (replacement === null) { setError('Say whether the supplier will replace them.'); return; }
    setSaving(true);
    try {
      const res = await api.purchaseOrders.returnItems(po.id, {
        items: entered, reason, notes: notes.trim() || undefined, replacement,
        documentNumber: documentNumber.trim() || undefined,
      });
      if (res.data) onSaved(res.data);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Failed to record the return.');
    } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Return to supplier, ${po.poNumber}`}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Return to Supplier · {po.poNumber}</h2>
          <p className="text-sm text-gray-500">{po.supplierName}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Items sent back leave stock, and what you owe the supplier goes down by their value.
          </p>
          {lines.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing has been received on this purchase order yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
              {lines.map((it) => {
                const bad = (qty[it.line] || 0) > it.receivedQuantity + 1e-4;
                const isLength = !it.unit || it.unit === 'yd';
                return (
                  <li key={it.line} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-gray-900">{it.name}</p>
                      <p className="text-xs text-gray-500 text-right shrink-0">
                        Received {poQty(it.receivedQuantity, it.unit)}
                        {(it.returnedQuantity || 0) > 0 && <><br />Returned before {poQty(it.returnedQuantity || 0, it.unit)}</>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-gray-500 mb-0.5">Returning now</p>
                      {isLength ? (
                        <LengthInput compact value={qty[it.line] || 0} invalid={bad} ariaLabel={`${it.name} returned`}
                          onChange={(y) => setQty((q) => ({ ...q, [it.line]: y }))} />
                      ) : (
                        <input type="number" min="0" step="any" value={qty[it.line] || ''} placeholder="0"
                          onChange={(e) => setQty((q) => ({ ...q, [it.line]: Number(e.target.value) || 0 }))}
                          className={`${input} max-w-[10rem] ${bad ? 'border-red-400' : ''}`} />
                      )}
                      {bad && <p className="mt-1 text-xs text-red-600">Only {poQty(it.receivedQuantity, it.unit)} was received.</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${reason === r ? 'border-[#011c72] bg-[#eef1fb] text-[#011c72] font-medium' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Details {reason === 'Other' ? <span className="text-red-500">*</span> : <span className="font-normal text-gray-400">(optional)</span>}
            </label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300}
              placeholder="e.g. torn on one side, return slip no." className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Return slip / debit memo no. <span className="font-normal text-gray-400">(optional)</span></label>
            <input type="text" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} maxLength={100}
              placeholder="e.g. RS-0042 or DM-118" className={input} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Will the supplier replace them? <span className="text-red-500">*</span></p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                { v: true, title: 'Yes, they will send replacements', text: 'The quantity is to be received again on this PO.' },
                { v: false, title: 'No replacement', text: 'The order is that much smaller; you owe less.' },
              ].map((o) => (
                <button key={String(o.v)} type="button" onClick={() => setReplacement(o.v)}
                  className={`text-left px-3 py-2 rounded-lg border ${replacement === o.v ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <p className={`text-sm font-medium ${replacement === o.v ? 'text-[#011c72]' : 'text-gray-800'}`}>{o.title}</p>
                  <p className="text-xs text-gray-500">{o.text}</p>
                </button>
              ))}
            </div>
          </div>
          {replacement && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              The supplier sets when the replacement will arrive from their account.
            </p>
          )}
          {value > 0 && (
            <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Accounts payable goes down by <b>{exactPeso(value)}</b>.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={save} disabled={saving || lines.length === 0}
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Return to Supplier'}
          </button>
        </div>
      </div>
    </div>
  );
}
