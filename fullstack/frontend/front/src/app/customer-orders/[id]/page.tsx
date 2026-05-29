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

  const getQuotationStatusColor = (status?: string) => {
    switch (status) {
      case 'pending_quotation':
        return 'bg-gray-100 text-gray-700';
      case 'quoted':
        return 'bg-[#dde6ff] text-[#011c72]';
      case 'accepted':
        return 'bg-green-100 text-green-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
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
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getQuotationStatusColor(order.quotationStatus)}`}>
                  {getQuotationStatusLabel(order.quotationStatus)}
                </span>
              </div>
              <p className="text-gray-500 mt-1">
                {order.createdAt ? new Date(order.createdAt).toLocaleString('en-PH') : 'N/A'}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 flex-wrap">
              {order.quotationStatus === 'pending_quotation' && (
                <button
                  onClick={() => setShowQuotationForm(true)}
                  className="px-4 py-2 bg-[#011c72] text-white rounded-lg hover:bg-[#01268c] transition-colors font-medium"
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

        {/* Quotation Section */}
        {order.quotationItems && order.quotationItems.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quotation</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Price</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {order.quotationItems.map((item, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500">{item.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-700">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">₱{item.unitPrice.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">₱{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-[#011c72]">₱{order.quotationTotal?.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {order.quotationNotes && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Notes</p>
                <p className="text-sm text-gray-700">{order.quotationNotes}</p>
              </div>
            )}

            {order.quotedAt && (
              <p className="text-xs text-gray-500 mt-4">
                Sent on {new Date(order.quotedAt).toLocaleString('en-PH')}
              </p>
            )}

            {/* Customer Response */}
            {order.quotationStatus === 'accepted' && order.respondedAt && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg">
                <p className="text-sm font-medium text-green-800">
                  Customer accepted on {new Date(order.respondedAt).toLocaleString('en-PH')}
                </p>
                {order.customerResponseNotes && (
                  <p className="text-sm text-green-700 mt-1">{order.customerResponseNotes}</p>
                )}
              </div>
            )}

            {order.quotationStatus === 'rejected' && order.respondedAt && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg">
                <p className="text-sm font-medium text-red-800">
                  Customer rejected on {new Date(order.respondedAt).toLocaleString('en-PH')}
                </p>
                {order.customerResponseNotes && (
                  <p className="text-sm text-red-700 mt-1">Reason: {order.customerResponseNotes}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Status Update Section */}
        {order.quotationStatus === 'accepted' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Update Status</h2>
            <div className="flex flex-wrap gap-2">
              {['pending', 'processing', 'in_progress', 'ready_for_installation', 'completed', 'delivered'].map((status) => (
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

      {/* Quotation Form Modal */}
      {showQuotationForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create Quotation</h2>
              <button
                onClick={() => setShowQuotationForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
              {quotationItems.map((item, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-medium text-gray-600">Item {index + 1}</span>
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
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm"
                    />
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateQuotationItem(index, 'description', e.target.value)}
                      placeholder="Description (optional)"
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm"
                    />
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateQuotationItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      placeholder="Quantity"
                      min="1"
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm"
                    />
                    <input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => updateQuotationItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      placeholder="Unit price"
                      min="0"
                      step="0.01"
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm"
                    />
                  </div>
                  <div className="mt-2 text-right text-sm text-gray-600">
                    Subtotal: ₱{(item.quantity * item.unitPrice).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addQuotationItem}
              className="mb-4 text-[#011c72] hover:text-[#011c72] text-sm font-medium"
            >
              + Add Another Item
            </button>

            <div className="p-4 bg-[#eef1fb] rounded-lg mb-4">
              <p className="text-lg font-bold text-gray-900">
                Total: <span className="text-[#011c72]">₱{calculateTotal().toLocaleString()}</span>
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes for Customer (Optional)
              </label>
              <textarea
                value={quotationNotes}
                onChange={(e) => setQuotationNotes(e.target.value)}
                placeholder="Add any notes or terms for the customer..."
                rows={3}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white text-gray-900"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowQuotationForm(false)}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitQuotation}
                disabled={submitting}
                className="flex-1 px-4 py-3 bg-[#011c72] text-white rounded-lg hover:bg-[#01268c] disabled:opacity-50 transition-colors font-medium"
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
