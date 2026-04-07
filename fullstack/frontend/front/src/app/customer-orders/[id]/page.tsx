'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, CustomerOrder, QuotationItem } from '@/lib/api';
import { useAuth, hasAccess } from '@/context/AuthContext';

export default function CustomerOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Quotation form state
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [quotationItems, setQuotationItems] = useState<Array<{
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }>>([{ name: '', description: '', quantity: 1, unitPrice: 0 }]);
  const [quotationNotes, setQuotationNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Status update state
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user || !hasAccess(user?.role, ['administrator', 'supervisor', 'sales_manager'])) {
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

  const addQuotationItem = () => {
    setQuotationItems([...quotationItems, { name: '', description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeQuotationItem = (index: number) => {
    if (quotationItems.length > 1) {
      setQuotationItems(quotationItems.filter((_, i) => i !== index));
    }
  };

  const updateQuotationItem = (index: number, field: string, value: string | number) => {
    const updated = [...quotationItems];
    updated[index] = { ...updated[index], [field]: value };
    setQuotationItems(updated);
  };

  const calculateTotal = () => {
    return quotationItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  const handleSubmitQuotation = async () => {
    if (!order) return;

    // Validate items
    const validItems = quotationItems.filter(item => item.name.trim() && item.quantity > 0 && item.unitPrice > 0);
    if (validItems.length === 0) {
      setError('Please add at least one valid quotation item');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await api.customerOrders.setQuotation(order.id, {
        items: validItems,
        notes: quotationNotes
      });
      setSuccessMessage('Quotation sent successfully!');
      setShowQuotationForm(false);
      await loadOrder();
    } catch (err: any) {
      setError(err.message || 'Failed to send quotation');
    } finally {
      setSubmitting(false);
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
        return 'Pending Quotation';
      case 'quoted':
        return 'Quotation Sent';
      case 'accepted':
        return 'Customer Accepted';
      case 'rejected':
        return 'Customer Rejected';
      default:
        return status || 'Unknown';
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
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
          </div>
        </main>
      </div>
    );
  }

  if (!order) {
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

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Order Header */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{order.orderNumber}</h1>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(order.status)}`}>
                  {order.status.replace(/_/g, ' ').toUpperCase()}
                </span>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getQuotationStatusColor(order.quotationStatus)}`}>
                  {getQuotationStatusLabel(order.quotationStatus)}
                </span>
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                {order.createdAt ? new Date(order.createdAt).toLocaleString('en-PH') : 'N/A'}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 flex-wrap">
              {order.quotationStatus === 'pending_quotation' && (
                <button
                  onClick={() => setShowQuotationForm(true)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
                >
                  Create Quotation
                </button>
              )}
              {order.quotationStatus === 'accepted' && order.status === 'pending' && (
                <button
                  onClick={() => handleStatusUpdate('processing')}
                  disabled={updatingStatus}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
                >
                  Start Processing
                </button>
              )}
            </div>
          </div>

          {/* Customer & Vehicle Info */}
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

          {/* Services */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Requested Services</h2>
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

          {/* Customer Notes */}
          <div>
            <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Customer Notes</h2>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{order.notes || 'No notes provided.'}</p>
          </div>
        </div>

        {/* Quotation Section */}
        {order.quotationItems && order.quotationItems.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Quotation</h2>
            
            <div className="overflow-x-auto">
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

            {order.quotationNotes && (
              <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold mb-1">Notes</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{order.quotationNotes}</p>
              </div>
            )}

            {order.quotedAt && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4">
                Sent on {new Date(order.quotedAt).toLocaleString('en-PH')}
              </p>
            )}

            {/* Customer Response */}
            {order.quotationStatus === 'accepted' && order.respondedAt && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Customer accepted on {new Date(order.respondedAt).toLocaleString('en-PH')}
                </p>
                {order.customerResponseNotes && (
                  <p className="text-sm text-green-700 dark:text-green-400 mt-1">{order.customerResponseNotes}</p>
                )}
              </div>
            )}

            {order.quotationStatus === 'rejected' && order.respondedAt && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  Customer rejected on {new Date(order.respondedAt).toLocaleString('en-PH')}
                </p>
                {order.customerResponseNotes && (
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">Reason: {order.customerResponseNotes}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Status Update Section */}
        {order.quotationStatus === 'accepted' && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Update Status</h2>
            <div className="flex flex-wrap gap-2">
              {['pending', 'processing', 'in_progress', 'ready_for_installation', 'completed', 'delivered'].map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusUpdate(status)}
                  disabled={updatingStatus || order.status === status}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    order.status === status
                      ? 'bg-amber-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  } disabled:opacity-50`}
                >
                  {status.replace(/_/g, ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Quotation Form Modal */}
      {showQuotationForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-3xl w-full p-6 my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Create Quotation</h2>
              <button
                onClick={() => setShowQuotationForm(false)}
                className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
              {quotationItems.map((item, index) => (
                <div key={index} className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Item {index + 1}</span>
                    {quotationItems.length > 1 && (
                      <button
                        onClick={() => removeQuotationItem(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateQuotationItem(index, 'name', e.target.value)}
                      placeholder="Item name *"
                      className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                    />
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateQuotationItem(index, 'description', e.target.value)}
                      placeholder="Description (optional)"
                      className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                    />
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateQuotationItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      placeholder="Quantity"
                      min="1"
                      className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                    />
                    <input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => updateQuotationItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      placeholder="Unit price"
                      min="0"
                      step="0.01"
                      className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                    />
                  </div>
                  <div className="mt-2 text-right text-sm text-zinc-600 dark:text-zinc-400">
                    Subtotal: ₱{(item.quantity * item.unitPrice).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addQuotationItem}
              className="mb-4 text-amber-600 hover:text-amber-700 text-sm font-medium"
            >
              + Add Another Item
            </button>

            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg mb-4">
              <p className="text-lg font-bold text-zinc-900 dark:text-white">
                Total: <span className="text-amber-600">₱{calculateTotal().toLocaleString()}</span>
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Notes for Customer (Optional)
              </label>
              <textarea
                value={quotationNotes}
                onChange={(e) => setQuotationNotes(e.target.value)}
                placeholder="Add any notes or terms for the customer..."
                rows={3}
                className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowQuotationForm(false)}
                className="flex-1 px-4 py-3 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitQuotation}
                disabled={submitting}
                className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors font-medium"
              >
                {submitting ? 'Sending...' : 'Send Quotation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
