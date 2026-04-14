'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ProductOrder, ProductOrderTimelineEvent } from '@/lib/api';

type SaveState = 'idle' | 'saving';

export default function ProductOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<ProductOrder | null>(null);
  const [timeline, setTimeline] = useState<ProductOrderTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const orderId = useMemo(() => Number(params.id), [params.id]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [orderRes, timelineRes] = await Promise.all([
        api.productOrders.get(orderId),
        api.productOrders.getTimeline(orderId)
      ]);

      setOrder(orderRes.data || null);
      setTimeline(timelineRes.data || []);
    } catch (err) {
      setError('Failed to load purchase details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setError('Invalid order id');
      setLoading(false);
      return;
    }
    loadData();
  }, [orderId, loadData]);

  const updateOrder = async (data: { status?: ProductOrder['status']; paymentStatus?: ProductOrder['paymentStatus']; notes?: string }) => {
    if (!order) {
      return;
    }

    try {
      setSaveState('saving');
      await api.productOrders.update(order.id, data);
      await loadData();
    } catch (err) {
      setError('Failed to update order');
      console.error(err);
    } finally {
      setSaveState('idle');
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
      default:
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    }
  };

  const getTimelineTypeClass = (type: string) => {
    switch (type) {
      case 'created':
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
      case 'status':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'payment':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'audit':
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
      default:
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
    }
  };

  const printReceipt = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
        <div className="max-w-4xl mx-auto bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <p className="text-red-700 dark:text-red-400">{error || 'Order not found'}</p>
          <button onClick={() => router.push('/product-orders')} className="mt-4 text-amber-600 hover:text-amber-700 font-medium">
            Back to Product Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <Link href="/product-orders" className="text-amber-600 dark:text-amber-400 text-sm font-medium">
              ← Back to Product Orders
            </Link>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">{order.orderNumber}</h1>
            <p className="text-zinc-600 dark:text-zinc-400">Detailed purchase tracking and timeline</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusClass(order.status)}`}>{order.status.toUpperCase()}</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPaymentClass(order.paymentStatus)}`}>{order.paymentStatus.toUpperCase()}</span>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Items Purchased</h2>
            <div className="space-y-2">
              {order.items.map((item, index) => (
                <div key={index} className="flex justify-between text-sm border-b border-zinc-100 dark:border-zinc-800 pb-2">
                  <span className="text-zinc-900 dark:text-zinc-100">{item.quantity}x {item.name} ({item.sku})</span>
                  <span className="text-zinc-600 dark:text-zinc-400">₱{item.total.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Total Amount</span>
              <span className="text-xl font-semibold text-amber-600">₱{order.totalAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Order Controls</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Status</label>
                <select
                  value={order.status}
                  onChange={(e) => updateOrder({ status: e.target.value as ProductOrder['status'] })}
                  disabled={saveState === 'saving'}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Confirmed / Processing</option>
                  <option value="ready">Ready</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Payment</label>
                <select
                  value={order.paymentStatus}
                  onChange={(e) => updateOrder({ paymentStatus: e.target.value as ProductOrder['paymentStatus'] })}
                  disabled={saveState === 'saving'}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partially Paid</option>
                  <option value="paid">Fully Paid</option>
                </select>
              </div>
              <button
                onClick={() => updateOrder({ status: 'processing' })}
                disabled={saveState === 'saving' || order.status === 'completed' || order.status === 'cancelled'}
                className="w-full px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                Confirm Order
              </button>
              <button
                onClick={printReceipt}
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Print Receipt
              </button>
            </div>

            <div className="mt-5 text-sm space-y-2">
              <p className="text-zinc-600 dark:text-zinc-400"><span className="font-medium text-zinc-800 dark:text-zinc-200">Customer:</span> {order.customerName}</p>
              <p className="text-zinc-600 dark:text-zinc-400"><span className="font-medium text-zinc-800 dark:text-zinc-200">Phone:</span> {order.customerPhone}</p>
              <p className="text-zinc-600 dark:text-zinc-400"><span className="font-medium text-zinc-800 dark:text-zinc-200">Branch:</span> {order.branchName || 'N/A'}</p>
              <p className="text-zinc-600 dark:text-zinc-400"><span className="font-medium text-zinc-800 dark:text-zinc-200">Created:</span> {new Date(order.createdAt).toLocaleString('en-PH')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Timeline</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTimelineTypeClass('created')}`}>Created</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTimelineTypeClass('status')}`}>Status</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTimelineTypeClass('payment')}`}>Payment</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTimelineTypeClass('audit')}`}>Audit</span>
            </div>
          </div>
          {timeline.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">No timeline events yet.</p>
          ) : (
            <div className="space-y-3">
              {timeline.map((event, index) => (
                <div key={`${event.timestamp}-${index}`} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wide ${getTimelineTypeClass(event.type)}`}>
                        {event.type}
                      </span>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{event.title}</p>
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{event.timestamp ? new Date(event.timestamp).toLocaleString('en-PH') : 'N/A'}</span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">{event.description}</p>
                  {event.by && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">By: {event.by}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
