'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, JobOrder } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function JobOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [jobOrder, setJobOrder] = useState<JobOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (params.id) {
      api.sales.getJobOrder(parseInt(params.id as string))
        .then(response => {
          setJobOrder(response.data || null);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [params.id]);

  const updateStatus = async (newStatus: string) => {
    if (!jobOrder) return;
    setUpdating(true);
    try {
      await api.sales.updateJobOrder(jobOrder.id, { status: newStatus as any });
      setJobOrder({ ...jobOrder, status: newStatus as any });
    } catch (err) {
      console.error(err);
    }
    setUpdating(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'ready_for_installation': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'completed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'delivered': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'cancelled': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
          </div>
        </main>
      </div>
    );
  }

  if (!jobOrder) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <p className="text-red-600 dark:text-red-400">Job order not found</p>
            <button
              onClick={() => router.push('/sales')}
              className="mt-4 text-amber-600 hover:text-amber-700 font-medium"
            >
              Back to Sales
            </button>
          </div>
        </main>
      </div>
    );
  }

  const itemBreakdown = (jobOrder.items || []).map((item) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const materialCostPerUnit = Number(item.materialCost) || 0;
    const laborCostPerUnit = Number(item.laborCost) || 0;

    return {
      ...item,
      quantity,
      unitPrice,
      materialCostPerUnit,
      laborCostPerUnit,
      linePrice: quantity * unitPrice,
      lineMaterialCost: quantity * materialCostPerUnit,
      lineLaborCost: quantity * laborCostPerUnit,
    };
  });

  const itemSubtotal = itemBreakdown.reduce((total, item) => total + item.linePrice, 0);
  const materialSubtotal = itemBreakdown.reduce((total, item) => total + item.lineMaterialCost, 0);
  const laborSubtotal = itemBreakdown.reduce((total, item) => total + item.lineLaborCost, 0);
  const computedCostSubtotal = materialSubtotal + laborSubtotal;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <button
              onClick={() => router.push('/sales')}
              className="flex items-center text-zinc-600 dark:text-zinc-400 hover:text-amber-600 mb-2"
            >
              <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Sales
            </button>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              Job Order #{jobOrder.jobOrderId}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              Created on {new Date(jobOrder.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 text-sm font-medium rounded-full ${getStatusColor(jobOrder.status)}`}>
              {jobOrder.status.replace('_', ' ').toUpperCase()}
            </span>
            {jobOrder.status === 'pending' && (
              <button
                onClick={() => updateStatus('in_progress')}
                disabled={updating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Start Work
              </button>
            )}
            {jobOrder.status === 'in_progress' && (
              <button
                onClick={() => updateStatus('completed')}
                disabled={updating}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Mark Complete
              </button>
            )}
            {jobOrder.status === 'completed' && (
              <button
                onClick={() => router.push(`/delivery/new?jobOrderId=${jobOrder.id}`)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
              >
                Schedule Delivery
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customer Info */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Customer Information
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Name</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{jobOrder.customerName}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Phone</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{jobOrder.customerPhone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Email</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{jobOrder.customerEmail || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Address</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{(jobOrder as any).customer_address || (jobOrder as any).customerAddress || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Vehicle Info */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
              Vehicle Information
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Make & Model</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">
                  {jobOrder.vehicleInfo ? `${jobOrder.vehicleInfo.make} ${jobOrder.vehicleInfo.model}` : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Year</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{jobOrder.vehicleInfo?.year || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Color</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{jobOrder.vehicleInfo?.color || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Plate Number</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{jobOrder.vehicleInfo?.plateNumber || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Service Info */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Service Details
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Description</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{jobOrder.description || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Estimated Completion</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">
                  {jobOrder.estimatedCompletion ? new Date(jobOrder.estimatedCompletion).toLocaleDateString() : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Items</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{jobOrder.items.length} item(s)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Assigned Workers/Tasks Section */}
        {(jobOrder as any).tasks && (jobOrder as any).tasks.length > 0 && (
          <div className="mt-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Assigned Workers
            </h2>
            <div className="space-y-3">
              {(jobOrder as any).tasks.map((task: any) => (
                <div key={task.id} className="flex items-center justify-between py-3 px-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{task.title}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Task #{task.taskNumber}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {task.worker ? (
                      <div className="text-right">
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">{task.worker.name}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{task.worker.specialization}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">Unassigned</p>
                    )}
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      task.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      task.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Costing Breakdown */}
        <div className="mt-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Cost Breakdown
          </h2>

          {itemBreakdown.length > 0 ? (
            <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
              <table className="w-full min-w-215">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Material / Item</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Unit Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Material Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Labor Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Line Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {itemBreakdown.map((item, index) => (
                    <tr key={`${item.name}-${index}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-white">{item.name || `Item ${index + 1}`}</td>
                      <td className="px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300">{formatCurrency(item.lineMaterialCost)}</td>
                      <td className="px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300">{formatCurrency(item.lineLaborCost)}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-zinc-900 dark:text-white">{formatCurrency(item.linePrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No material or item details recorded for this order.</p>
          )}

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 px-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Item Price Subtotal</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{formatCurrency(itemSubtotal)}</p>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Material Cost Subtotal</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{formatCurrency(materialSubtotal)}</p>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Labor Cost Subtotal</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{formatCurrency(laborSubtotal)}</p>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-300">Computed Total Cost</p>
                <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(computedCostSubtotal)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 px-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-300">Estimated Cost</p>
                <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(jobOrder.estimatedCost || 0)}</p>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm font-medium text-green-900 dark:text-green-300">Actual Cost</p>
                <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(jobOrder.actualCost || 0)}</p>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border-2 border-amber-200 dark:border-amber-800">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-300">Total Price</p>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatCurrency(jobOrder.totalPrice || 0)}</p>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-600 dark:text-blue-400">Estimated Cost</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(jobOrder.estimatedCost || 0)}
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center border border-green-200 dark:border-green-800">
                <p className="text-xs text-green-600 dark:text-green-400">Actual Cost</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(jobOrder.actualCost || 0)}
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-center border-2 border-amber-300 dark:border-amber-700">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-bold">TOTAL PRICE</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(jobOrder.totalPrice || 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Information */}
        <div className="mt-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Payment Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Payment Status</p>
              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full mt-1 ${
                jobOrder.paymentStatus === 'paid' 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : jobOrder.paymentStatus === 'partial'
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {(jobOrder.paymentStatus || 'unpaid').toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Down Payment</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                ₱{(jobOrder.downPayment || 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Balance Due</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                ₱{(jobOrder.balance || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="inline-flex items-center px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-amber-300 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-colors">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Invoice
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-amber-300 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-colors">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Order
          </button>
          {jobOrder.status !== 'cancelled' && jobOrder.status !== 'delivered' && (
            <button
              onClick={() => updateStatus('cancelled')}
              disabled={updating}
              className="inline-flex items-center px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel Order
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
