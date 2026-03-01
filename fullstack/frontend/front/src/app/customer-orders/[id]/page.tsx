'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, CustomerOrder } from '@/lib/api';

export default function CustomerOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadOrder = async () => {
      if (!params.id) return;

      try {
        setLoading(true);
        const response = await api.customerOrders.getOrder(Number(params.id));
        setOrder(response.data || null);
      } catch (err) {
        console.error(err);
        setError('Failed to load customer order details');
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [params.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'processing':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'in_progress':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'ready_for_installation':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'completed':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'delivered':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'cancelled':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  const getServiceLabel = (type: string) => {
    const labels: Record<string, string> = {
      flooring: 'Flooring',
      reupholstery: 'Reupholstery',
      ceiling: 'Ceiling',
      sidings: 'Sidings',
      seat_covers: 'Seat Covers',
      other: 'Other Services'
    };

    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <p className="text-red-600 dark:text-red-400">{error || 'Customer order not found'}</p>
            <button
              onClick={() => router.push('/customer-orders')}
              className="mt-4 text-amber-600 hover:text-amber-700 font-medium"
            >
              Back to Customer Orders
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.push('/customer-orders')}
          className="flex items-center text-zinc-600 dark:text-zinc-400 hover:text-amber-600 mb-4"
        >
          <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Customer Orders
        </button>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{order.orderNumber}</h1>
              <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                {order.createdAt ? new Date(order.createdAt).toLocaleString('en-PH') : 'N/A'}
              </p>
            </div>
            <span className={`self-start sm:self-auto px-3 py-1.5 text-sm font-medium rounded-full ${getStatusColor(order.status)}`}>
              {order.status.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Customer</h2>
              <p className="text-zinc-900 dark:text-white font-medium">{order.customerName}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{order.customerPhone || 'N/A'}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{order.customerEmail || 'N/A'}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{order.customerAddress || 'N/A'}</p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Vehicle</h2>
              <p className="text-zinc-900 dark:text-white font-medium">
                {order.vehicleInfo
                  ? `${order.vehicleInfo.year} ${order.vehicleInfo.make} ${order.vehicleInfo.model}`
                  : 'N/A'}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{order.vehicleInfo?.plateNumber || 'N/A'}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Branch: {order.branchName || 'N/A'}</p>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Services</h2>
            {order.services?.length ? (
              <div className="space-y-3">
                {order.services.map((service, index) => (
                  <div key={index} className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">{getServiceLabel(service.type)}</p>
                    {service.material && <p className="text-sm text-zinc-600 dark:text-zinc-300">Material: {service.material}</p>}
                    {service.design && <p className="text-sm text-zinc-600 dark:text-zinc-300">Design: {service.design}</p>}
                    {service.pocket && <p className="text-sm text-zinc-600 dark:text-zinc-300">Pocket: {service.pocket}</p>}
                    {service.others && <p className="text-sm text-zinc-600 dark:text-zinc-300">Others: {service.others}</p>}
                    {service.description && <p className="text-sm text-zinc-600 dark:text-zinc-300">Description: {service.description}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No services listed.</p>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Notes</h2>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{order.notes || 'No notes provided.'}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
