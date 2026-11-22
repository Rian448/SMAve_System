'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Delivery } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/dateUtils';

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  in_transit: 'bg-yellow-50 text-yellow-800',
  delivered: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

/** Item Trail: job order deliveries still on their way (and the latest finished ones), plus Schedule. */
export function JobOrderDeliveriesPanel() {
  const { can } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => {
    api.deliveries.getAll().then(r => setDeliveries(r.data || [])).catch(() => setDeliveries([]));
  }, []);
  const active = (deliveries || []).filter(d => d.status === 'scheduled' || d.status === 'in_transit');
  const done = (deliveries || []).filter(d => d.status === 'delivered' || d.status === 'cancelled').slice(0, 10);
  const rows = showDone ? [...active, ...done] : active;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Job Order Deliveries</h2>
          <p className="text-xs text-gray-500">Finished job orders going out to customers. Open one to start transit or mark it delivered.</p>
        </div>
        <div className="flex items-center gap-2">
          {done.length > 0 && (
            <button type="button" onClick={() => setShowDone(v => !v)} className="text-xs font-medium text-[#011c72] hover:underline">
              {showDone ? 'Hide finished' : 'Show recent finished'}
            </button>
          )}
          {can('item_trail.add') && (
            <Link href="/delivery/new" className="px-3 py-1.5 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-medium">
              Schedule Delivery
            </Link>
          )}
        </div>
      </div>
      {deliveries === null ? <p className="text-sm text-gray-400 py-3">Loading…</p>
        : rows.length === 0 ? <p className="text-sm text-gray-400 py-3">No deliveries on their way.</p> : (
        <ul className="divide-y divide-gray-100">
          {rows.map(d => (
            <li key={d.id}>
              <Link href={`/delivery/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-gray-50 px-1 rounded">
                <span className="text-sm text-gray-900">
                  <b>{d.deliveryNumber}</b>{d.jobOrderNumber ? ` · ${d.jobOrderNumber}` : ''}{d.customerName ? ` · ${d.customerName}` : ''}
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  {formatDate(d.scheduledDate)}
                  <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[d.status] || ''}`}>{d.status.replace('_', ' ')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A finished job order's delivery: schedule one, or open it to move it along. */
export default function JobOrderDelivery({ jobOrderId, jobOrderStatus }: { jobOrderId: number; jobOrderStatus: string }) {
  const { can } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const canView = can('item_trail.view');

  useEffect(() => {
    if (!canView) return;
    api.deliveries.getAll({ jobOrderId }).then(r => setDeliveries(r.data || [])).catch(() => setDeliveries([]));
  }, [canView, jobOrderId]);

  if (!canView || !['completed', 'delivered'].includes(jobOrderStatus) || deliveries === null) return null;
  // The one that counts: still on its way or done (a cancelled one can be replaced)
  const current = deliveries.find(d => d.status !== 'cancelled');
  const canSchedule = can('item_trail.add') && jobOrderStatus === 'completed' && !current;

  return (
    <div className="mb-5 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Delivery</h2>
          {current ? (
            <p className="text-sm text-gray-600 mt-0.5">
              {current.deliveryNumber} · scheduled {formatDate(current.scheduledDate)}{' '}
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[current.status] || ''}`}>
                {current.status.replace('_', ' ')}
              </span>
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5">
              {jobOrderStatus === 'completed' ? 'Not scheduled yet.' : 'Handed over without a scheduled delivery.'}
              {deliveries.length > 0 && ` ${deliveries.length} cancelled earlier.`}
            </p>
          )}
        </div>
        {current ? (
          <Link href={`/delivery/${current.id}`}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-[#011c72] hover:bg-gray-50">
            {can('item_trail.update_status') && current.status !== 'delivered' ? 'Open to update status' : 'View delivery'}
          </Link>
        ) : canSchedule && (
          <Link href={`/delivery/new?jobOrderId=${jobOrderId}`}
            className="px-4 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-medium">
            Schedule Delivery
          </Link>
        )}
      </div>
    </div>
  );
}
