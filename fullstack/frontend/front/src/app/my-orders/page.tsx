'use client';
import { useState, useEffect } from 'react';
import { useAuth, hasAccess } from '@/context/AuthContext';
import { api, CustomerOrder } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function MyOrdersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== 'customer') {
        router.push('/login');
        return;
      }
      fetchOrders();
    }
  }, [authLoading, user, router]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await api.customerOrders.getMyOrders();
      setOrders(response.data || []);
    } catch (err) {
      setError('Failed to load your orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'processing':
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

  const getQuotationStatusColor = (status?: string) => {
    switch (status) {
      case 'pending_quotation':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
      case 'quoted':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'accepted':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'rejected':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  const getQuotationStatusLabel = (status?: string) => {
    switch (status) {
      case 'pending_quotation':
        return 'Awaiting Quotation';
      case 'quoted':
        return 'Quotation Ready';
      case 'accepted':
        return 'Quotation Accepted';
      case 'rejected':
        return 'Quotation Rejected';
      default:
        return status || 'Unknown';
    }
  };

  const getServiceLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      flooring: 'Flooring',
      reupholstery: 'Reupholstery',
      ceiling: 'Ceiling',
      sidings: 'Sidings',
      seat_covers: 'Seat Covers',
      other: 'Other Services'
    };
    return labels[type] || type;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-amber-600 dark:text-amber-400 text-sm font-medium mb-4 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">My Orders</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Track your orders and respond to quotations
          </p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* New Order Button */}
        <div className="mb-6">
          <Link
            href="/place-order"
            className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Place New Order
          </Link>
        </div>

        {/* Orders List */}
        {orders.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">You haven&apos;t placed any orders yet</p>
            <Link
              href="/place-order"
              className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
            >
              Place Your First Order
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                        {order.orderNumber}
                      </h3>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(order.status)}`}>
                        {order.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      {order.quotationStatus && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getQuotationStatusColor(order.quotationStatus)}`}>
                          {getQuotationStatusLabel(order.quotationStatus)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      {new Date(order.createdAt).toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                      Branch: {order.branchName || 'N/A'}
                    </p>
                  </div>

                  {/* Action buttons based on quotation status */}
                  <div className="flex gap-2">
                    {order.quotationStatus === 'quoted' && (
                      <Link
                        href={`/my-orders/${order.id}`}
                        className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium text-sm"
                      >
                        View & Respond to Quotation
                      </Link>
                    )}
                    {order.quotationStatus !== 'quoted' && (
                      <Link
                        href={`/my-orders/${order.id}`}
                        className="inline-flex items-center px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors font-medium text-sm"
                      >
                        View Details
                      </Link>
                    )}
                  </div>
                </div>

                {/* Vehicle Info */}
                {order.vehicleInfo && (
                  <div className="mb-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                    <p className="text-sm text-zinc-900 dark:text-white">
                      <span className="font-medium">Vehicle:</span> {order.vehicleInfo.year} {order.vehicleInfo.make} {order.vehicleInfo.model}
                      {order.vehicleInfo.plateNumber && ` (${order.vehicleInfo.plateNumber})`}
                    </p>
                  </div>
                )}

                {/* Services */}
                <div className="flex flex-wrap gap-2">
                  {order.services?.map((service, index) => (
                    <span
                      key={index}
                      className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md"
                    >
                      {getServiceLabel(service.type)}
                    </span>
                  ))}
                </div>

                {/* Quotation Total if available */}
                {order.quotationStatus !== 'pending_quotation' && order.quotationTotal && order.quotationTotal > 0 && (
                  <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <p className="text-lg font-semibold text-zinc-900 dark:text-white">
                      Quotation Total: <span className="text-amber-600">₱{order.quotationTotal.toLocaleString()}</span>
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
