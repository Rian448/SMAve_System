'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth, hasAccess } from '@/context/AuthContext';
import { api, ProductOrder } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type StatusFilter = 'all' | 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';

export default function ProductOrdersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return fallback;
  };

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.productOrders.getAll(statusFilter === 'all' ? undefined : statusFilter);
      setOrders(response.data || []);
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

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'processing':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'ready':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'completed':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'cancelled':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  const getPaymentClass = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'partial':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'unpaid':
      default:
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    }
  };

  const totals = useMemo(() => {
    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      processing: orders.filter((o) => o.status === 'processing').length,
      completed: orders.filter((o) => o.status === 'completed').length
    };
  }, [orders]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Premade Product Orders</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Confirm customer purchases, update order progress, and track payment status per branch.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Total</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">{totals.total}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{totals.pending}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Processing</p>
            <p className="text-2xl font-bold text-blue-600">{totals.processing}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Completed</p>
            <p className="text-2xl font-bold text-green-600">{totals.completed}</p>
          </div>
        </div>

        <div className="mb-6 flex gap-2 flex-wrap">
          {(['all', 'pending', 'processing', 'ready', 'completed', 'cancelled'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-amber-600 text-white'
                  : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
              }`}
            >
              {status.toUpperCase()}
            </button>
          ))}
        </div>

        {orders.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-12 text-center text-zinc-500 dark:text-zinc-400">
            No premade product orders found for this filter.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{order.orderNumber}</h2>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusClass(order.status)}`}>
                        {order.status.toUpperCase()}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPaymentClass(order.paymentStatus)}`}>
                        {order.paymentStatus.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      Customer: {order.customerName} | {order.customerPhone}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                      Branch: {order.branchName || 'N/A'}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {new Date(order.createdAt).toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Total</p>
                    <p className="text-xl font-semibold text-amber-600">₱{order.totalAmount.toLocaleString()}</p>
                  </div>
                </div>

                <div className="mb-4 border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-2">
                  {order.items.map((item, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {item.quantity}x {item.name} ({item.sku})
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-400">₱{item.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <select
                    value={order.status}
                    onChange={(e) => updateOrder(order.id, { status: e.target.value as ProductOrder['status'] })}
                    disabled={savingId === order.id}
                    className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
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
                    className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partially Paid</option>
                    <option value="paid">Fully Paid</option>
                  </select>

                  <button
                    onClick={() => updateOrder(order.id, { status: 'processing' })}
                    disabled={savingId === order.id || order.status === 'completed' || order.status === 'cancelled'}
                    className="px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
                  >
                    Confirm Order
                  </button>

                  <Link
                    href={`/product-orders/${order.id}`}
                    className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-center font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
