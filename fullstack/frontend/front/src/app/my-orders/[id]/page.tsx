'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, CustomerOrder } from '@/lib/api';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

export default function MyOrderDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responding, setResponding] = useState(false);
  const [responseNotes, setResponseNotes] = useState('');
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== 'customer') {
        router.push('/login');
        return;
      }
      fetchOrder();
    }
  }, [authLoading, user, router, params.id]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const response = await api.customerOrders.getMyOrder(Number(params.id));
      setOrder(response.data || null);
    } catch (err) {
      setError('Failed to load order details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptQuotation = async () => {
    if (!order) return;
    
    setResponding(true);
    try {
      await api.customerOrders.respondToQuotation(order.id, 'accept', responseNotes);
      await fetchOrder();
    } catch (err: any) {
      setError(err.message || 'Failed to accept quotation');
    } finally {
      setResponding(false);
    }
  };

  const handleRejectQuotation = async () => {
    if (!order) return;
    
    setResponding(true);
    try {
      await api.customerOrders.respondToQuotation(order.id, 'reject', responseNotes);
      setShowRejectConfirm(false);
      await fetchOrder();
    } catch (err: any) {
      setError(err.message || 'Failed to reject quotation');
    } finally {
      setResponding(false);
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
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <p className="text-red-600 dark:text-red-400">{error || 'Order not found'}</p>
            <Link
              href="/my-orders"
              className="mt-4 inline-block text-amber-600 hover:text-amber-700 font-medium"
            >
              Back to My Orders
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/my-orders" className="text-amber-600 dark:text-amber-400 text-sm font-medium mb-4 inline-block">
            ← Back to My Orders
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">{order.orderNumber}</h1>
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${getStatusColor(order.status)}`}>
              {order.status.replace(/_/g, ' ').toUpperCase()}
            </span>
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${getQuotationStatusColor(order.quotationStatus)}`}>
              {getQuotationStatusLabel(order.quotationStatus)}
            </span>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Placed on {new Date(order.createdAt).toLocaleDateString('en-PH', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Quotation Section - Show prominently if quotation is ready */}
        {order.quotationStatus === 'quoted' && order.quotationItems && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h2 className="text-xl font-bold text-amber-800 dark:text-amber-300">Quotation Ready</h2>
            </div>

            <p className="text-amber-700 dark:text-amber-400 mb-4">
              Our team has prepared a quotation for your order. Please review and accept or reject below.
            </p>

            {/* Quotation Items Table */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg overflow-hidden mb-4">
              <table className="w-full">
                <thead className="bg-zinc-50 dark:bg-zinc-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase">Item</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase">Unit Price</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  {order.quotationItems.map((item, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-zinc-700 dark:text-zinc-300">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">₱{item.unitPrice.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-zinc-900 dark:text-white">₱{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-zinc-50 dark:bg-zinc-800">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold text-zinc-900 dark:text-white">Total</td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-amber-600">₱{order.quotationTotal?.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Admin Notes */}
            {order.quotationNotes && (
              <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 mb-4">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold mb-1">Notes from our team:</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{order.quotationNotes}</p>
              </div>
            )}

            {/* Response Actions */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                  Your Response (Optional)
                </label>
                <textarea
                  value={responseNotes}
                  onChange={(e) => setResponseNotes(e.target.value)}
                  placeholder="Add any comments or questions about the quotation..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleAcceptQuotation}
                  disabled={responding}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {responding ? 'Processing...' : 'Accept Quotation'}
                </button>
                <button
                  onClick={() => setShowRejectConfirm(true)}
                  disabled={responding}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Reject Quotation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Accepted Quotation Display */}
        {order.quotationStatus === 'accepted' && order.quotationItems && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-bold text-green-800 dark:text-green-300">Quotation Accepted</h2>
            </div>

            <p className="text-green-700 dark:text-green-400 mb-4">
              You accepted this quotation on {order.respondedAt ? new Date(order.respondedAt).toLocaleDateString('en-PH') : 'N/A'}. 
              Our team will begin working on your order.
            </p>

            <div className="bg-white dark:bg-zinc-900 rounded-lg p-4">
              <p className="text-lg font-bold text-zinc-900 dark:text-white">
                Total: <span className="text-green-600">₱{order.quotationTotal?.toLocaleString()}</span>
              </p>
            </div>
          </div>
        )}

        {/* Pending Quotation Message */}
        {order.quotationStatus === 'pending_quotation' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-bold text-blue-800 dark:text-blue-300">Awaiting Quotation</h2>
            </div>
            <p className="text-blue-700 dark:text-blue-400">
              Our team is reviewing your order and preparing a quotation. We&apos;ll notify you once it&apos;s ready.
            </p>
          </div>
        )}

        {/* Order Details */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Order Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold mb-1">Customer</p>
              <p className="text-sm text-zinc-900 dark:text-white">{order.customerName}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{order.customerPhone}</p>
              {order.customerEmail && <p className="text-sm text-zinc-600 dark:text-zinc-400">{order.customerEmail}</p>}
              {order.customerAddress && <p className="text-sm text-zinc-600 dark:text-zinc-400">{order.customerAddress}</p>}
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold mb-1">Vehicle</p>
              {order.vehicleInfo ? (
                <>
                  <p className="text-sm text-zinc-900 dark:text-white">
                    {order.vehicleInfo.year} {order.vehicleInfo.make} {order.vehicleInfo.model}
                  </p>
                  {order.vehicleInfo.plateNumber && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Plate: {order.vehicleInfo.plateNumber}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">N/A</p>
              )}
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">Branch: {order.branchName || 'N/A'}</p>
            </div>
          </div>

          {/* Services */}
          <div className="mb-6">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold mb-2">Requested Services</p>
            <div className="space-y-2">
              {order.services?.map((service, index) => (
                <div key={index} className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{getServiceLabel(service.type)}</p>
                  {service.material && <p className="text-xs text-zinc-600 dark:text-zinc-400">Material: {service.material}</p>}
                  {service.design && <p className="text-xs text-zinc-600 dark:text-zinc-400">Design: {service.design}</p>}
                  {service.description && <p className="text-xs text-zinc-600 dark:text-zinc-400">{service.description}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold mb-1">Your Notes</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{order.notes}</p>
            </div>
          )}
        </div>
      </main>

      {/* Reject Confirmation Modal */}
      {showRejectConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-4">Reject Quotation?</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              Are you sure you want to reject this quotation? You can provide a reason to help us understand your needs better.
            </p>
            <textarea
              value={responseNotes}
              onChange={(e) => setResponseNotes(e.target.value)}
              placeholder="Reason for rejection (optional)"
              rows={3}
              className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectConfirm(false)}
                className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectQuotation}
                disabled={responding}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {responding ? 'Processing...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
