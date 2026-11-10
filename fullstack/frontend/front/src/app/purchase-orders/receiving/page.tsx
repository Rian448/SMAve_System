'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type PurchaseOrder } from '@/lib/api';
import { formatDate, formatDateTime, manilaDateString } from '@/lib/dateUtils';
import { poStatusInfo, poReceivingProgress } from '@/lib/purchaseOrderStatus';
import ReceivePurchaseOrderDialog from '@/components/ReceivePurchaseOrderDialog';
import Paginated from '@/components/Paginated';

const fmtQty = (n: number) => (Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 4 });

/**
 * The receiving area: purchase orders waiting for deliveries, and the deliveries
 * recorded lately. Separate from Purchase Orders, which is about ordering.
 */
export default function ReceivingPage() {
  const [waiting, setWaiting] = useState<PurchaseOrder[]>([]);
  const [recent, setRecent] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'not_received' | 'partial'>('all');
  const [search, setSearch] = useState('');
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [open, done] = await Promise.all([
        api.purchaseOrders.getAll('approved,partially_received'),
        api.purchaseOrders.getAll('partially_received,received'),
      ]);
      setWaiting(open.data || []);
      setRecent(done.data || []);
      setError('');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Failed to load purchase orders.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = manilaDateString();
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return waiting
      .filter((po) => filter === 'all' || po.receivingStatus === filter)
      .filter((po) => !q || po.poNumber.toLowerCase().includes(q) || po.supplierName.toLowerCase().includes(q)
        || po.items.some((it) => it.name.toLowerCase().includes(q)))
      .sort((a, b) => (a.expectedDelivery || '9').localeCompare(b.expectedDelivery || '9'));
  }, [waiting, filter, search]);

  // Every delivery recorded, newest first
  const deliveries = useMemo(() => recent
    .flatMap((po) => po.receipts.map((r, i) => ({ po, r, key: `${po.id}-${r.id ?? 'all'}-${i}` })))
    .sort((a, b) => (b.r.receivedAt || '').localeCompare(a.r.receivedAt || '')), [recent]);

  const counts = {
    not_received: waiting.filter((p) => p.receivingStatus === 'not_received').length,
    partial: waiting.filter((p) => p.receivingStatus === 'partial').length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Receiving</h1>
            <p className="text-gray-500 mt-1 text-sm">Record what arrives from suppliers. Stock goes up by what was actually received.</p>
          </div>
          <Link href="/purchase-orders" className="text-sm font-medium text-[#011c72] hover:underline">All purchase orders →</Link>
        </div>

        {notice && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">{notice}</div>}
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        {/* Waiting for delivery */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center gap-3">
            <h2 className="font-semibold text-gray-900 md:mr-auto">Waiting for delivery ({waiting.length})</h2>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO, supplier, item…"
              className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900" />
            <div className="inline-flex p-1 bg-gray-100 rounded-lg text-sm self-start" role="tablist" aria-label="Receiving status">
              {([['all', `All (${waiting.length})`], ['not_received', `Not yet received (${counts.not_received})`], ['partial', `Partially received (${counts.partial})`]] as const)
                .map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap ${filter === id ? 'bg-white shadow-sm text-[#011c72]' : 'text-gray-600'}`}>{label}</button>
                ))}
            </div>
          </div>
          {loading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full" /></div>
          ) : shown.length === 0 ? (
            <p className="p-10 text-center text-sm text-gray-400">{waiting.length ? 'No purchase orders match.' : 'Nothing is waiting for delivery.'}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shown.map((po) => {
                const status = poStatusInfo(po);
                const progress = poReceivingProgress(po);
                const late = po.expectedDelivery && po.expectedDelivery < today;
                return (
                  <li key={po.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/purchase-orders/${po.id}`} className="font-semibold text-[#011c72] hover:underline">{po.poNumber}</Link>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.className}`}>{status.label}</span>
                        {late && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Late</span>}
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{po.supplierName} · expected {po.expectedDelivery ? formatDate(po.expectedDelivery) : '—'}</p>
                      <p className="text-xs text-gray-500 mt-1 break-words">
                        {po.items.map((it) => `${it.name} ${fmtQty(it.receivedQuantity)}/${fmtQty(it.quantity)}`).join(' · ')}
                      </p>
                    </div>
                    <div className="w-full lg:w-56">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Received</span><span>{progress.percent}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full ${progress.percent > 0 ? 'bg-amber-500' : 'bg-gray-200'}`} style={{ width: `${progress.percent}%` }} />
                      </div>
                    </div>
                    <button type="button" onClick={() => { setNotice(''); setReceiving(po); }}
                      className="shrink-0 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium">
                      Receive
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Deliveries recorded */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200"><h2 className="font-semibold text-gray-900">Deliveries recorded</h2></div>
          {deliveries.length === 0 ? (
            <p className="p-10 text-center text-sm text-gray-400">No deliveries recorded yet.</p>
          ) : (
            <Paginated items={deliveries} label="deliveries">{(rows) => (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">When</th>
                      <th className="px-4 py-3 text-left font-medium">PO</th>
                      <th className="px-4 py-3 text-left font-medium">What arrived</th>
                      <th className="px-4 py-3 text-left font-medium">Received by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(({ po, r, key }) => (
                      <tr key={key} className="align-top">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">{r.receivedAt ? formatDateTime(r.receivedAt) : '—'}</td>
                        <td className="px-4 py-3">
                          <Link href={`/purchase-orders/${po.id}`} className="font-medium text-[#011c72] hover:underline">{po.poNumber}</Link>
                          <p className="text-xs text-gray-500">{po.supplierName}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.kind === 'closed'
                            ? <span className="text-orange-700 font-medium">Closed – rest not received</span>
                            : r.items.map((it) => `${it.name} × ${fmtQty(it.quantity)}`).join(', ')}
                          {r.notes && <p className="text-xs text-gray-500 mt-0.5">{r.notes}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.receivedByName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}</Paginated>
          )}
        </div>
      </main>

      {receiving && (
        <ReceivePurchaseOrderDialog po={receiving} onClose={() => setReceiving(null)}
          onSaved={(po) => {
            setReceiving(null);
            setNotice(`${po.poNumber}: ${poStatusInfo(po).label}.`);
            load();
          }} />
      )}
    </div>
  );
}
