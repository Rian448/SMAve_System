'use client';
import { formatDate } from '@/lib/dateUtils';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, PurchaseOrder } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import ReceivePurchaseOrderDialog from '@/components/ReceivePurchaseOrderDialog';
import SupplierPayments from '@/components/SupplierPayments';
import { poStatusInfo, isOpenForReceiving, poReceivingProgress } from '@/lib/purchaseOrderStatus';
import { exactPeso } from '@/lib/format';

const fmtQty = (n: number) => (Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 4 });

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const poId = params.id as string;
  
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [receivingOpen, setReceivingOpen] = useState(false);
  const { can } = useAuth();

  useEffect(() => {
    if (poId) {
      fetchPurchaseOrder();
    }
  }, [poId]);

  const fetchPurchaseOrder = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.purchaseOrders.getById(Number(poId));
      if (response.data) {
        setPurchaseOrder(response.data);
      }
    } catch (error) {
      console.error('Error fetching purchase order:', error);
      setError('Failed to load purchase order details');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await api.purchaseOrders.approve(Number(poId));
      await fetchPurchaseOrder();
    } catch (error) {
      setError(error instanceof Error && error.message ? error.message : 'Failed to approve purchase order');
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (amount: number) => exactPeso(amount);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading purchase order...</p>
        </div>
      </div>
    );
  }

  if (error || !purchaseOrder) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.push('/purchase-orders')}
            className="flex items-center text-gray-600 hover:text-[#011c72] mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Purchase Orders
          </button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error || 'Purchase order not found'}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/purchase-orders')}
            className="flex items-center text-gray-600 hover:text-[#011c72] mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Purchase Orders
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Purchase Order {purchaseOrder.poNumber}
              </h1>
              <p className="text-gray-500 mt-1">
                Detailed information about this purchase order
              </p>
            </div>
            <div className="mt-4 sm:mt-0">
              <span className={`px-4 py-2 text-sm font-medium rounded-lg ${poStatusInfo(purchaseOrder).className}`}>
                {poStatusInfo(purchaseOrder).label}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Order Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Order Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium text-gray-500">PO Number</label>
                  <p className="mt-1 text-base font-medium text-gray-900">{purchaseOrder.poNumber}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <p className="mt-1 text-base font-medium text-gray-900">
                    {poStatusInfo(purchaseOrder).label}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Created Date</label>
                  <p className="mt-1 text-base font-medium text-gray-900">
                    {formatDate(purchaseOrder.createdAt)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Expected Delivery</label>
                  <p className="mt-1 text-base font-medium text-gray-900">
                    {formatDate(purchaseOrder.expectedDelivery)}
                  </p>
                </div>
              </div>
            </div>

            {/* Supplier Information */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Supplier Information</h2>
              <div>
                <label className="text-sm font-medium text-gray-500">Supplier Name</label>
                <p className="mt-1 text-base font-medium text-gray-900">{purchaseOrder.supplierName}</p>
              </div>
            </div>

            {/* Order Items */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ordered</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Received</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {purchaseOrder.items.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{item.name}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600 whitespace-nowrap">
                          {fmtQty(item.quantity)} {item.unit}
                        </td>
                        <td className={`px-4 py-3 text-right text-sm whitespace-nowrap ${item.receivedQuantity > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                          {fmtQty(item.receivedQuantity)}
                        </td>
                        <td className={`px-4 py-3 text-right text-sm whitespace-nowrap ${item.remainingQuantity > 0 ? (purchaseOrder.receivingStatus === 'closed_short' ? 'text-orange-700' : 'text-gray-900') : 'text-gray-400'}`}>
                          {item.remainingQuantity > 0 ? fmtQty(item.remainingQuantity) : '—'}
                          {item.remainingQuantity > 0 && purchaseOrder.receivingStatus === 'closed_short' && <span className="block text-xs">not received</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column - Summary & Actions */}
          <div className="space-y-6">
            {/* Order Total */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                  <span className="text-sm text-gray-600">Subtotal</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatCurrency(purchaseOrder.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-gray-900">Total</span>
                  <span className="text-base font-bold text-[#011c72]">
                    {formatCurrency(purchaseOrder.totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Paying the supplier (separate from receiving the goods) */}
            {purchaseOrder.status !== 'cancelled' || purchaseOrder.payments.length > 0 ? (
              <SupplierPayments po={purchaseOrder} onChange={setPurchaseOrder} />
            ) : null}

            {/* Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-3">
                {purchaseOrder.status === 'pending' && can('purchase_orders.approve') && (
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
                  >
                    {actionLoading ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Approving...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Approve Order
                      </>
                    )}
                  </button>
                )}

                {isOpenForReceiving(purchaseOrder) && (() => {
                  const progress = poReceivingProgress(purchaseOrder);
                  return (
                    <div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Received</span><span>{progress.percent}%</span></div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${progress.percent}%` }} />
                      </div>
                    </div>
                  );
                })()}

                {isOpenForReceiving(purchaseOrder) && can('purchase_orders.receive') && (
                  <button
                    onClick={() => setReceivingOpen(true)}
                    className="w-full inline-flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                  >
                    {purchaseOrder.status === 'partially_received' ? 'Receive More Items' : 'Receive Items'}
                  </button>
                )}

                {purchaseOrder.status === 'received' && (
                  <div className={`w-full inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium ${poStatusInfo(purchaseOrder).className}`}>
                    {poStatusInfo(purchaseOrder).label}
                  </div>
                )}

                {/* Receiving adds the items to raw-material stock, so point to where it landed */}
                {purchaseOrder.receipts.some((r) => r.kind === 'delivery') && can('inventory.view') && (
                  <Link
                    href="/inventory?tab=raw-materials"
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-[#011c72] text-[#011c72] rounded-lg font-medium hover:bg-[#dde6ff] transition-colors"
                  >
                    View Updated Stock
                  </Link>
                )}

                <Link
                  href="/purchase-orders"
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Back to List
                </Link>
              </div>
            </div>

            {/* Status Timeline */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-green-500 mt-1.5"></div>
                    <div className="w-0.5 h-12 bg-gray-200 my-1"></div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Order Created</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(purchaseOrder.createdAt)}
                      {purchaseOrder.createdByName && <> · {purchaseOrder.createdByName}</>}
                    </p>
                  </div>
                </div>

                {purchaseOrder.approvedAt && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 mt-1.5"></div>
                      <div className="w-0.5 h-12 bg-gray-200 my-1"></div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Order Approved</p>
                      <p className="text-xs text-gray-500">
                        {formatDate(purchaseOrder.approvedAt)}
                        {purchaseOrder.approvedByName && <> · {purchaseOrder.approvedByName}</>}
                      </p>
                    </div>
                  </div>
                )}

                {/* Each delivery (a PO may arrive in parts), and a close when the rest won't come */}
                {purchaseOrder.receipts.map((r, i) => (
                  <div key={`${r.id ?? 'all'}-${i}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full mt-1.5 ${r.kind === 'closed' ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                      {i < purchaseOrder.receipts.length - 1 && <div className="w-0.5 h-12 bg-gray-200 my-1"></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {r.kind === 'closed' ? 'Closed – rest not received' : purchaseOrder.receipts.length > 1 ? `Delivery ${i + 1} received` : 'Order Received'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.receivedAt ? formatDate(r.receivedAt) : '—'}
                        {r.receivedByName && <> · {r.receivedByName}</>}
                      </p>
                      {r.kind === 'delivery' && (
                        <p className="text-xs text-gray-600 mt-0.5 break-words">{r.items.map((it) => `${it.name} × ${fmtQty(it.quantity)}`).join(', ')}</p>
                      )}
                      {r.notes && <p className="text-xs text-gray-500 mt-0.5 italic break-words">{r.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      {receivingOpen && (
        <ReceivePurchaseOrderDialog po={purchaseOrder} onClose={() => setReceivingOpen(false)}
          onSaved={(po) => { setReceivingOpen(false); setPurchaseOrder(po); }} />
      )}
    </div>
  );
}
