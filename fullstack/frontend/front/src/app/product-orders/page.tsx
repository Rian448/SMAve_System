'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth, hasAccess } from '@/context/AuthContext';
import { api, ProductOrder, ProductOrderTransfer } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type StatusFilter = 'all' | 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';

export default function ProductOrdersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [transferRequests, setTransferRequests] = useState<ProductOrderTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  };

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const [mainRes, transferRes] = await Promise.all([
        api.productOrders.getAll(statusFilter === 'all' ? undefined : statusFilter),
        api.productOrderTransfers.getMyRequests(),
      ]);
      setOrders(mainRes.data || []);
      setTransferRequests(transferRes.data || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load product orders'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!authLoading) {
      if (!user || !hasAccess(user.role, ['administrator', 'supervisor'])) {
        router.push('/');
        return;
      }
      fetchOrders();
    }
  }, [authLoading, user, router, fetchOrders]);

  const updateOrder = async (orderId: number, data: { status?: ProductOrder['status']; paymentStatus?: ProductOrder['paymentStatus']; notes?: string }) => {
    try {
      setSavingId(orderId);
      setError('');
      await api.productOrders.update(orderId, data);
      await fetchOrders();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update order'));
    } finally {
      setSavingId(null);
    }
  };

  const markTransferred = async (transferId: number) => {
    try {
      setSavingId(transferId);
      setError('');
      await api.productOrderTransfers.markTransferred(transferId);
      await fetchOrders();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to mark as transferred'));
    } finally {
      setSavingId(null);
    }
  };

  const confirmTransferReceipt = async (transferId: number) => {
    try {
      setSavingId(transferId);
      setError('');
      await api.productOrderTransfers.confirmReceipt(transferId);
      await fetchOrders();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to confirm receipt'));
    } finally {
      setSavingId(null);
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'processing': return 'bg-blue-100 text-blue-700';
      case 'ready': return 'bg-orange-100 text-orange-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getPaymentClass = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-700';
      case 'partial': return 'bg-[#dde6ff] text-[#011c72]';
      default: return 'bg-red-100 text-red-700';
    }
  };

  const getTransferStatusClass = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'transferred': return 'bg-blue-100 text-blue-700';
      case 'received': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const totals = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    processing: orders.filter((o) => o.status === 'processing').length,
    completed: orders.filter((o) => o.status === 'completed').length,
  }), [orders]);

  // For pickup branch: filter transfers where this branch is the pickup branch
  const incomingTransfers = useMemo(() => {
    return transferRequests.filter(
      (t) => t.status === 'transferred' && t.pickupBranchId === user?.branchId
    );
  }, [transferRequests, user]);

  // For source branch: pending transfers that need to be sent
  const outgoingTransfers = useMemo(() => {
    return transferRequests.filter(
      (t) => t.status === 'pending' && t.sourceBranchId === user?.branchId
    );
  }, [transferRequests, user]);

  // Admin sees all
  const allPendingTransfers = useMemo(() => {
    if (user?.role !== 'administrator') return [];
    return transferRequests.filter((t) => t.status !== 'received');
  }, [transferRequests, user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Premade Product Orders</h1>
          <p className="text-gray-600 mt-2">
            Confirm customer purchases, update order progress, and track payment status per branch.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-2xl font-bold text-gray-900">{totals.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{totals.pending}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Processing</p>
            <p className="text-2xl font-bold text-blue-600">{totals.processing}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Completed</p>
            <p className="text-2xl font-bold text-green-600">{totals.completed}</p>
          </div>
        </div>

        {/* Status filter */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {(['all', 'pending', 'processing', 'ready', 'completed', 'cancelled'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-[#011c72] text-white'
                  : 'bg-white text-gray-700 border border-gray-200'
              }`}
            >
              {status.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Orders list */}
        {orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
            No premade product orders found for this filter.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold text-gray-900">{order.orderNumber}</h2>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusClass(order.status)}`}>
                        {order.status.toUpperCase()}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPaymentClass(order.paymentStatus)}`}>
                        {order.paymentStatus.toUpperCase()}
                      </span>
                      {order.transfers && order.transfers.length > 0 && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-100 text-purple-700">
                          Multi-branch
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Customer: {order.customerName} | {order.customerPhone}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Branch: {order.branchName || 'N/A'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString('en-PH', {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-gray-500">Total</p>
                    <p className="text-xl font-semibold text-[#011c72]">₱{order.totalAmount.toLocaleString()}</p>
                  </div>
                </div>

                <div className="mb-4 border-t border-gray-200 pt-4 space-y-1">
                  {order.items.map((item, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-gray-800">
                        {item.quantity}x {item.name} ({item.sku})
                        {item.sourceBranchName && item.sourceBranchName !== order.branchName && (
                          <span className="ml-2 text-xs text-orange-500">
                            from {item.sourceBranchName}
                          </span>
                        )}
                      </span>
                      <span className="text-gray-600">₱{item.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {/* Transfer status summary for multi-branch orders */}
                {order.transfers && order.transfers.length > 0 && (
                  <div className="mb-4 p-3 rounded-lg bg-purple-50 border border-purple-200">
                    <p className="text-xs font-semibold text-purple-700 mb-2">Pending Transfers</p>
                    <div className="space-y-1">
                      {order.transfers.map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700">
                            {t.sourceBranchName} → {order.branchName}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${getTransferStatusClass(t.status)}`}>
                            {t.status === 'pending' ? 'Awaiting Transfer'
                              : t.status === 'transferred' ? 'In Transit'
                              : 'Received'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <select
                    value={order.status}
                    onChange={(e) => updateOrder(order.id, { status: e.target.value as ProductOrder['status'] })}
                    disabled={savingId === order.id}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
                  >
                    <option value="pending">Pending</option>
                    <option value="processing">Confirmed / Processing</option>
                    <option value="ready">Ready</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>

                  <select
                    value={order.paymentStatus}
                    onChange={(e) => updateOrder(order.id, { paymentStatus: e.target.value as ProductOrder['paymentStatus'] })}
                    disabled={savingId === order.id}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partially Paid</option>
                    <option value="paid">Fully Paid</option>
                  </select>

                  <button
                    onClick={() => updateOrder(order.id, { status: 'processing' })}
                    disabled={savingId === order.id || order.status === 'completed' || order.status === 'cancelled'}
                    className="px-4 py-2 rounded-lg bg-[#011c72] text-white font-medium hover:bg-[#01268c] disabled:opacity-50"
                  >
                    Confirm Order
                  </button>

                  <Link
                    href={`/product-orders/${order.id}`}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-center font-medium hover:bg-gray-50"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TRANSFER REQUESTS (source branch needs to send items) ── */}
        {(outgoingTransfers.length > 0 || allPendingTransfers.length > 0) && (
          <div className="mt-10">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                Transfer Requests — Items to Send
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Items ordered by customers that need to be transferred from your branch to the pickup branch.
              </p>
            </div>

            <div className="space-y-4">
              {(user?.role === 'administrator' ? allPendingTransfers : outgoingTransfers).map((transfer) => (
                <div key={transfer.id} className="bg-white rounded-xl border-2 border-orange-200 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {transfer.orderNumber}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTransferStatusClass(transfer.status)}`}>
                          {transfer.status === 'pending' ? 'Needs Transfer' : transfer.status === 'transferred' ? 'In Transit' : 'Received'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {transfer.customerName} · {transfer.customerPhone}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        From: <span className="font-medium text-orange-600">{transfer.sourceBranchName}</span>
                        {' → '}
                        Pickup at: <span className="font-medium text-blue-600">{transfer.pickupBranchName}</span>
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 shrink-0">
                      {new Date(transfer.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>

                  <div className="space-y-1 mb-4 border-t border-gray-200 pt-3">
                    {transfer.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-800">{item.quantity}x {item.name} <span className="text-gray-400">({item.sku})</span></span>
                        <span className="text-gray-600">₱{item.total.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  {transfer.status === 'pending' && (
                    <button
                      onClick={() => markTransferred(transfer.id)}
                      disabled={savingId === transfer.id}
                      className="w-full px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50 text-sm"
                    >
                      {savingId === transfer.id ? 'Saving…' : 'Mark as Transferred (Sent to Pickup Branch)'}
                    </button>
                  )}
                  {transfer.status === 'transferred' && (
                    <p className="text-sm text-blue-600 font-medium text-center">In transit to {transfer.pickupBranchName}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── INCOMING TRANSFERS (pickup branch confirms receipt) ── */}
        {incomingTransfers.length > 0 && (
          <div className="mt-10">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Incoming Transfers — Items to Receive
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Items sent from other branches arriving at your branch. Confirm receipt to add to your inventory.
              </p>
            </div>

            <div className="space-y-4">
              {incomingTransfers.map((transfer) => (
                <div key={transfer.id} className="bg-white rounded-xl border-2 border-green-200 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{transfer.orderNumber}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                          In Transit
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {transfer.customerName} · {transfer.customerPhone}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        From: <span className="font-medium text-orange-600">{transfer.sourceBranchName}</span>
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 shrink-0">
                      {new Date(transfer.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>

                  <div className="space-y-1 mb-4 border-t border-gray-200 pt-3">
                    {transfer.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-800">{item.quantity}x {item.name} <span className="text-gray-400">({item.sku})</span></span>
                        <span className="text-gray-600">₱{item.total.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => confirmTransferReceipt(transfer.id)}
                    disabled={savingId === transfer.id}
                    className="w-full px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 text-sm"
                  >
                    {savingId === transfer.id ? 'Processing…' : 'Confirm Receipt & Add to Inventory'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
