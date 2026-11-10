import type { PurchaseOrder } from '@/lib/api';

/** How a purchase order's status reads on screen, from approval through receiving */
export function poStatusInfo(po: Pick<PurchaseOrder, 'status' | 'receivingStatus'>): { label: string; className: string } {
  switch (po.status) {
    case 'pending':
      return { label: 'Pending approval', className: 'bg-yellow-100 text-yellow-800' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-red-100 text-red-700' };
    case 'approved':
      return { label: 'Not yet received', className: 'bg-blue-100 text-blue-700' };
    case 'partially_received':
      return { label: 'Partially received', className: 'bg-amber-100 text-amber-800' };
    case 'received':
      return po.receivingStatus === 'closed_short'
        ? { label: 'Closed – not all received', className: 'bg-orange-100 text-orange-800' }
        : { label: 'Fully received', className: 'bg-green-100 text-green-700' };
    default:
      return { label: String(po.status).replace(/_/g, ' '), className: 'bg-gray-100 text-gray-700' };
  }
}

/** Still waiting for (more of) its items */
export const isOpenForReceiving = (po: Pick<PurchaseOrder, 'status'>) =>
  po.status === 'approved' || po.status === 'partially_received';

/** Received and ordered units over all lines, for a progress bar */
export function poReceivingProgress(po: Pick<PurchaseOrder, 'items'>) {
  const ordered = po.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const received = po.items.reduce((s, it) => s + (Number(it.receivedQuantity) || 0), 0);
  return { ordered, received, percent: ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0 };
}
