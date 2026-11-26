'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type NeededMaterial } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/components/ConfirmDialog';
import { formatLength } from '@/lib/length';

/**
 * Materials open job orders need more of than is in stock (typed in on the order,
 * or an Inventory material with too little). Saving a job order is never blocked:
 * this is where the shortfall shows, so it can be ordered before the workers cut.
 */
export default function NeededMaterialsPanel({ branchId, onChanged }: {
  branchId?: number;
  /** Called after a merge, so the page can reload its list */
  onChanged?: () => void;
}) {
  const { can } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const [items, setItems] = useState<NeededMaterial[]>([]);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.inventory.getNeededMaterials(branchId ? { branchId } : undefined)
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]));
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  if (!items.length) return null;

  const qty = (m: NeededMaterial, v: number) => (m.unit === 'yd' ? formatLength(v) : `${v.toLocaleString()} ${m.unit}`);
  // The purchase order form takes ?restock=CODE:qty,... (the same as the AI restock list)
  const poLink = (list: NeededMaterial[]) =>
    `/purchase-orders/new?restock=${list.map((m) => `${encodeURIComponent(m.itemId)}:${Math.ceil(m.short * 100) / 100}`).join(',')}&from=jobs`;

  const merge = async (m: NeededMaterial, target: NeededMaterial['similar'][number]) => {
    const ok = await confirm({
      title: `Use ${target.name} instead?`,
      message: (
        <>
          <b>{m.name}</b> was typed in on {m.orders.map((o) => o.jobOrderId).join(', ')}. Those job orders will use{' '}
          <b>{target.name}</b> from Inventory instead, and the typed-in <b>{m.name}</b> is archived.
        </>
      ),
      warning: 'Only do this if they are the same material (a typo). The job orders’ material lines change.',
      confirmLabel: 'Use existing material',
      variant: 'warning',
    });
    if (!ok) return;
    setBusy(m.id);
    setError('');
    try {
      await api.inventory.mergeMaterial(m.id, target.id);
      load();
      onChanged?.();
    } catch (err) {
      setError((err as Error)?.message || 'Could not merge the material');
    } finally {
      setBusy(null);
    }
  };

  const canOrder = can('purchase_orders.add');
  const canMerge = can('inventory.edit');

  return (
    <div className="m-4 rounded-xl border border-amber-200 bg-amber-50">
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-left">
          <svg className={`w-4 h-4 text-amber-700 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-semibold text-amber-900">
            Needed for job orders: {items.length} material{items.length === 1 ? '' : 's'} short
          </span>
        </button>
        {canOrder && items.length > 1 && (
          <Link href={poLink(items)}
            className="px-3 py-1.5 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-xs font-medium">
            Create PO for all
          </Link>
        )}
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-xs text-amber-800">
            Open job orders need more of these than is in stock. Order them before the workers cut: receiving the
            purchase order adds the stock, and the material leaves this list once there is enough.
          </p>
          {error && <p className="text-xs text-red-700">{error}</p>}
          {items.map((m) => (
            <div key={m.id} className="rounded-lg border border-amber-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {m.name}
                    {m.typedIn && (
                      <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
                        Typed in on a job order
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {m.branchName && `${m.branchName} · `}Needed {qty(m, m.needed)} · In stock {qty(m, m.stock)} ·{' '}
                    <span className="font-semibold text-red-700">Short {qty(m, m.short)}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    For{' '}
                    {m.orders.map((o, i) => (
                      <span key={o.id}>
                        {i > 0 && ', '}
                        <Link href={`/sales/${o.id}`} className="text-[#011c72] hover:underline">{o.jobOrderId}</Link>
                        {` (${qty(m, o.quantity)})`}
                      </span>
                    ))}
                  </p>
                </div>
                {canOrder && (
                  <Link href={poLink([m])}
                    className="shrink-0 px-3 py-1.5 rounded-lg border border-[#011c72] text-[#011c72] hover:bg-[#eef1fb] text-xs font-medium">
                    Create PO
                  </Link>
                )}
              </div>
              {/* A typed-in name close to an existing material: likely a typo */}
              {m.typedIn && m.similar.length > 0 && (
                <div className="mt-2 rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-700">
                  <span className="font-medium">Is this a typo?</span> Similar materials already in Inventory:
                  <div className="mt-1 flex flex-wrap gap-2">
                    {m.similar.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-2.5 py-1">
                        <span>
                          {s.name}
                          <span className="text-gray-400"> · {s.unit === 'yd' ? formatLength(s.stock) : `${s.stock} ${s.unit}`} in stock{s.branchName ? ` · ${s.branchName}` : ''}</span>
                        </span>
                        {canMerge && (
                          <button type="button" disabled={busy === m.id} onClick={() => merge(m, s)}
                            className="font-medium text-[#011c72] hover:underline disabled:opacity-50">
                            Same as this
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
