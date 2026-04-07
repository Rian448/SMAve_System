'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, PurchaseOrder } from '@/lib/api';

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const poId = params.id as string;
  
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

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
      console.error('Error approving purchase order:', error);
      setError('Failed to approve purchase order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceive = async () => {
    setActionLoading(true);
    try {
      await api.purchaseOrders.receive(Number(poId));
      await fetchPurchaseOrder();
    } catch (error) {
      console.error('Error receiving purchase order:', error);
      setError('Failed to confirm purchase order');
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'approved':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'received':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'cancelled':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-zinc-500 dark:text-zinc-400">Loading purchase order...</p>
        </div>
      </div>
    );
  }

  if (error || !purchaseOrder) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.push('/inventory/purchase-orders')}
            className="flex items-center text-zinc-600 dark:text-zinc-400 hover:text-amber-600 mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Purchase Orders
          </button>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-700 dark:text-red-300">{error || 'Purchase order not found'}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/inventory/purchase-orders')}
            className="flex items-center text-zinc-600 dark:text-zinc-400 hover:text-amber-600 mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Purchase Orders
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                Purchase Order {purchaseOrder.poNumber}
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                Detailed information about this purchase order
              </p>
            </div>
            <div className="mt-4 sm:mt-0">
              <span className={`px-4 py-2 text-sm font-medium rounded-lg ${getStatusColor(purchaseOrder.status)}`}>
                {purchaseOrder.status.charAt(0).toUpperCase() + purchaseOrder.status.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Order Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Order Summary */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Order Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">PO Number</label>
                  <p className="mt-1 text-base font-medium text-zinc-900 dark:text-white">{purchaseOrder.poNumber}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Status</label>
                  <p className="mt-1 text-base font-medium text-zinc-900 dark:text-white">
                    {purchaseOrder.status.charAt(0).toUpperCase() + purchaseOrder.status.slice(1)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Created Date</label>
                  <p className="mt-1 text-base font-medium text-zinc-900 dark:text-white">
                    {new Date(purchaseOrder.createdAt).toLocaleDateString('en-PH', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Expected Delivery</label>
                  <p className="mt-1 text-base font-medium text-zinc-900 dark:text-white">
                    {new Date(purchaseOrder.expectedDelivery).toLocaleDateString('en-PH', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Supplier Information */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Supplier Information</h2>
              <div>
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Supplier Name</label>
                <p className="mt-1 text-base font-medium text-zinc-900 dark:text-white">{purchaseOrder.supplierName}</p>
              </div>
            </div>

            {/* Order Items */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Order Items</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Material</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Quantity</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Unit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {purchaseOrder.items.map((item, index) => (
                      <tr key={index} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3 text-sm text-zinc-900 dark:text-white">{item.name}</td>
                        <td className="px-4 py-3 text-right text-sm text-zinc-600 dark:text-zinc-300">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-zinc-600 dark:text-zinc-300">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-zinc-900 dark:text-white">
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
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Order Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Subtotal</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">
                    {formatCurrency(purchaseOrder.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-zinc-900 dark:text-white">Total</span>
                  <span className="text-base font-bold text-amber-600 dark:text-amber-400">
                    {formatCurrency(purchaseOrder.totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Quick Actions</h2>
              <div className="space-y-3">
                {purchaseOrder.status === 'pending' && (
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

                {purchaseOrder.status === 'approved' && (
                  <button
                    onClick={handleReceive}
                    disabled={actionLoading}
                    className="w-full inline-flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
                  >
                    {actionLoading ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Confirming...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Confirm Order
                      </>
                    )}
                  </button>
                )}

                {purchaseOrder.status === 'received' && (
                  <div className="w-full inline-flex items-center justify-center px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg font-medium">
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Order Completed
                  </div>
                )}

                <Link
                  href="/inventory/purchase-orders"
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Back to List
                </Link>
              </div>
            </div>

            {/* Status Timeline */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Timeline</h2>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-green-500 mt-1.5"></div>
                    <div className="w-0.5 h-12 bg-zinc-200 dark:bg-zinc-800 my-1"></div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Order Created</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(purchaseOrder.createdAt).toLocaleDateString('en-PH')}
                    </p>
                  </div>
                </div>

                {purchaseOrder.approvedAt && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 mt-1.5"></div>
                      <div className="w-0.5 h-12 bg-zinc-200 dark:bg-zinc-800 my-1"></div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">Order Approved</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(purchaseOrder.approvedAt).toLocaleDateString('en-PH')}
                      </p>
                    </div>
                  </div>
                )}

                {purchaseOrder.status === 'received' && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 mt-1.5"></div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">Order Received</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(purchaseOrder.createdAt).toLocaleDateString('en-PH')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
