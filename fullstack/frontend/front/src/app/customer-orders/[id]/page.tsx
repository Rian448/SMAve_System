'use client';
import { formatDateTime } from '@/lib/dateUtils';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, CustomerOrder } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function CustomerOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading, can } = useAuth();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Status update state
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user || !can('custom_requests.view')) {
        router.push('/');
        return;
      }
      loadOrder();
    }
  }, [authLoading, user, router, params.id]);

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

  const handleStatusUpdate = async (newStatus: string) => {
    if (!order) return;

    setUpdatingStatus(true);
    try {
      await api.customerOrders.updateStatus(order.id, newStatus);
      setSuccessMessage('Status updated successfully!');
      await loadOrder();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'processing':
      case 'in_progress':
        return 'bg-blue-100 text-blue-700';
      case 'ready_for_installation':
        return 'bg-orange-100 text-orange-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'delivered':
        return 'bg-purple-100 text-purple-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
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

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full"></div>
          </div>
        </main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600">{error || 'Customer order not found'}</p>
            <button
              onClick={() => router.push('/customer-orders')}
              className="mt-4 text-[#011c72] hover:text-[#011c72] font-medium"
            >
              Back to Customer Orders
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.push('/customer-orders')}
          className="flex items-center text-gray-600 hover:text-[#011c72] mb-4"
        >
          <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Customer Orders
        </button>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {/* Order Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(order.status)}`}>
                  {order.status.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              <p className="text-gray-500 mt-1">
                {order.createdAt ? formatDateTime(order.createdAt) : 'N/A'}
              </p>
            </div>
          </div>

          <p className="mb-6 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
            This request was sent through the website before online ordering was retired, and is kept as a record.
            To take on the work, record it as a job order under Sales &rsaquo; New Job Order.
          </p>

          {/* Customer & Vehicle Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer</h2>
              <p className="text-gray-900 font-medium">{order.customerName}</p>
              <p className="text-sm text-gray-600">{order.customerPhone || 'N/A'}</p>
              <p className="text-sm text-gray-600">{order.customerEmail || 'N/A'}</p>
              <p className="text-sm text-gray-600">{order.customerAddress || 'N/A'}</p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Vehicle</h2>
              <p className="text-gray-900 font-medium">
                {order.vehicleInfo
                  ? `${order.vehicleInfo.year} ${order.vehicleInfo.make} ${order.vehicleInfo.model}`
                  : 'N/A'}
              </p>
              <p className="text-sm text-gray-600">{order.vehicleInfo?.plateNumber || 'N/A'}</p>
              <p className="text-sm text-gray-600">Branch: {order.branchName || 'N/A'}</p>
            </div>
          </div>

          {/* Services */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Requested Services</h2>
            {order.services?.length ? (
              <div className="space-y-3">
                {order.services.map((service, index) => (
                  <div key={index} className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                    <p className="text-sm font-semibold text-gray-900 mb-1">{getServiceLabel(service.type)}</p>
                    {service.material && <p className="text-sm text-gray-600">Material: {service.material}</p>}
                    {service.design && <p className="text-sm text-gray-600">Design: {service.design}</p>}
                    {service.pocket && <p className="text-sm text-gray-600">Pocket: {service.pocket}</p>}
                    {service.others && <p className="text-sm text-gray-600">Others: {service.others}</p>}
                    {service.description && <p className="text-sm text-gray-600">Description: {service.description}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No services listed.</p>
            )}
          </div>

          {/* Customer Notes */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer Notes</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes || 'No notes provided.'}</p>
          </div>
        </div>

        {/* Status Update Section: close out or follow up older requests */}
        {can('custom_requests.edit') && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Update Status</h2>
            <div className="flex flex-wrap gap-2">
              {['pending', 'processing', 'in_progress', 'ready_for_installation', 'completed', 'delivered', 'cancelled'].map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusUpdate(status)}
                  disabled={updatingStatus || order.status === status}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    order.status === status
                      ? 'bg-[#011c72] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  {status.replace(/_/g, ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
