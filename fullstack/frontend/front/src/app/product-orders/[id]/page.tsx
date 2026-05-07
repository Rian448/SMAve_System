'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ProductOrder, ProductOrderTransfer, ProductOrderTimelineEvent } from '@/lib/api';
import { useAuth, hasAccess } from '@/context/AuthContext';

type SaveState = 'idle' | 'saving';

export default function ProductOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user ? hasAccess(user.role, ['administrator']) : false;
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
    if (!order) return;
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

  const [transferSavingId, setTransferSavingId] = useState<number | null>(null);

  const markTransferred = async (transferId: number) => {
    try {
      setTransferSavingId(transferId);
      await api.productOrderTransfers.markTransferred(transferId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to mark as transferred');
    } finally {
      setTransferSavingId(null);
    }
  };

  const confirmTransferReceipt = async (transferId: number) => {
    try {
      setTransferSavingId(transferId);
      await api.productOrderTransfers.confirmReceipt(transferId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to confirm receipt');
    } finally {
      setTransferSavingId(null);
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
    if (!order) return;

    const dateTime = new Date(order.createdAt).toLocaleString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

    const itemRows = order.items.map((item) => `
      <tr>
        <td class="item-name">${item.name}</td>
        <td class="center">${item.quantity}</td>
        <td class="right">&#8369;${item.unitPrice.toLocaleString()}</td>
        <td class="right">&#8369;${item.total.toLocaleString()}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt – ${order.orderNumber}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;font-size:12px;width:300px;margin:0 auto;padding:20px}
    h1{text-align:center;font-size:16px;letter-spacing:1px;margin-bottom:2px}
    .sub{text-align:center;font-size:10px;color:#555;margin-bottom:14px}
    .dash{border:none;border-top:1px dashed #000;margin:10px 0}
    .row{display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px}
    table{width:100%;border-collapse:collapse;margin:8px 0}
    th{border-bottom:1px solid #000;padding:4px 3px;font-size:10px;text-align:left}
    td{padding:4px 3px;font-size:11px;vertical-align:top}
    .item-name{max-width:120px;word-break:break-word}
    .center{text-align:center}
    .right{text-align:right}
    .total td{border-top:1px solid #000;font-weight:bold;padding-top:6px}
    .thanks{text-align:center;margin-top:14px;font-size:10px;color:#555}
    @media print{@page{margin:8mm}body{width:auto}}
  </style>
</head>
<body>
  <h1>SEATMAKERS AVENUE</h1>
  <p class="sub">Official Receipt</p>
  <hr class="dash"/>
  <div class="row"><span>Order No:</span><span>${order.orderNumber}</span></div>
  <div class="row"><span>Customer:</span><span>${order.customerName}</span></div>
  <div class="row"><span>Date &amp; Time:</span><span>${dateTime}</span></div>
  <hr class="dash"/>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="center">Qty</th>
        <th class="right">Unit</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr class="total">
        <td colspan="3" class="right">TOTAL</td>
        <td class="right">&#8369;${order.totalAmount.toLocaleString()}</td>
      </tr>
    </tfoot>
  </table>
  <hr class="dash"/>
  <p class="thanks">Thank you for your purchase!</p>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank', 'width=380,height=600');
    if (!w) { URL.revokeObjectURL(url); return; }
    w.focus();
    setTimeout(() => { w.print(); w.close(); URL.revokeObjectURL(url); }, 300);
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusClass(order.status)}`}>{order.status.toUpperCase()}</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPaymentClass(order.paymentStatus)}`}>{order.paymentStatus.toUpperCase()}</span>
            {order.groupId && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                Group Order
              </span>
            )}
          </div>
        </div>

        {order.transfers && order.transfers.length > 0 && (
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <div>
              <p className="font-semibold text-purple-700 dark:text-purple-300 text-sm">Multi-Branch Order</p>
              <p className="text-sm text-purple-600 dark:text-purple-400 mt-0.5">
                This order includes items from {order.transfers.length} other branch{order.transfers.length !== 1 ? 'es' : ''}.
                Those branches will transfer their items to <strong>{order.branchName}</strong> for customer pickup.
              </p>
            </div>
          </div>
        )}

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
                  <span className="text-zinc-900 dark:text-zinc-100">
                    {item.quantity}x {item.name} ({item.sku})
                    {item.sourceBranchName && item.sourceBranchName !== order.branchName && (
                      <span className="ml-2 text-xs text-orange-500 dark:text-orange-400">from {item.sourceBranchName}</span>
                    )}
                  </span>
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
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Order Workflow</h2>
            
            {/* Step-by-step workflow */}
            <div className="space-y-3">
              {/* Step 1: Invoice */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                      order.status !== 'pending'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {order.status !== 'pending' ? '✓' : '1'}
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white text-sm">Step 1: Generate Invoice</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Create and prepare invoice for the customer</p>
                    </div>
                  </div>
                </div>
                {order.status === 'pending' && (
                  <button
                    onClick={() => updateOrder({ status: 'processing' })}
                    disabled={saveState === 'saving'}
                    className="w-full px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 text-sm"
                  >
                    {saveState === 'saving' ? 'Processing...' : 'Generate Invoice'}
                  </button>
                )}
                {order.status !== 'pending' && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">Completed</p>
                )}
              </div>

              {/* Step 2: Payment Confirmation */}
              <div className={`border rounded-lg p-4 ${
                order.status === 'pending'
                  ? 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/30 opacity-50'
                  : 'border-zinc-200 dark:border-zinc-700'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                      order.paymentStatus === 'paid'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : order.status === 'pending'
                        ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}>
                      {order.paymentStatus === 'paid' ? '✓' : '2'}
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white text-sm">Step 2: Confirm Payment</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Verify and confirm payment received</p>
                    </div>
                  </div>
                </div>
                {order.status !== 'pending' && order.paymentStatus !== 'paid' && (
                  <div className="space-y-2">
                    <button
                      onClick={() => updateOrder({ paymentStatus: 'partial' })}
                      disabled={saveState === 'saving'}
                      className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 text-sm"
                    >
                      {saveState === 'saving' ? 'Processing...' : 'Partial Payment'}
                    </button>
                    <button
                      onClick={() => updateOrder({ paymentStatus: 'paid' })}
                      disabled={saveState === 'saving'}
                      className="w-full px-3 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 text-sm"
                    >
                      {saveState === 'saving' ? 'Processing...' : 'Fully Paid'}
                    </button>
                  </div>
                )}
                {order.paymentStatus === 'paid' && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">Completed - {order.paymentStatus.toUpperCase()}</p>
                )}
                {order.status === 'pending' && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Complete Step 1 first</p>
                )}
              </div>

              {/* Step 3: Complete Transaction */}
              <div className={`border rounded-lg p-4 ${
                order.paymentStatus !== 'paid'
                  ? 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/30 opacity-50'
                  : order.status === 'completed'
                  ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                  : 'border-zinc-200 dark:border-zinc-700'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                      order.status === 'completed'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : order.paymentStatus !== 'paid'
                        ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                    }`}>
                      {order.status === 'completed' ? '✓' : '3'}
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white text-sm">Step 3: Complete Transaction</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Finalize order and mark as completed</p>
                    </div>
                  </div>
                </div>
                {order.paymentStatus === 'paid' && order.status !== 'completed' && (
                  <button
                    onClick={() => updateOrder({ status: 'completed' })}
                    disabled={saveState === 'saving'}
                    className="w-full px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 text-sm"
                  >
                    {saveState === 'saving' ? 'Processing...' : 'Complete Transaction'}
                  </button>
                )}
                {order.status === 'completed' && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Transaction Complete</p>
                )}
                {order.paymentStatus !== 'paid' && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Complete Step 2 first</p>
                )}
              </div>
            </div>

            {/* Cancel button - always available */}
            {order.status !== 'completed' && order.status !== 'cancelled' && (
              <button
                onClick={() => updateOrder({ status: 'cancelled' })}
                disabled={saveState === 'saving'}
                className="w-full mt-4 px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 text-sm"
              >
                Cancel Order
              </button>
            )}

            {/* Print Receipt button */}
            <button
              onClick={printReceipt}
              className="w-full mt-3 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm"
            >
              Print Receipt
            </button>

            {/* Transfer requests for multi-branch orders */}
            {order.transfers && order.transfers.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">Branch Transfers</p>
                {(order.transfers as ProductOrderTransfer[]).map((transfer) => (
                  <div key={transfer.id} className="p-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        {transfer.sourceBranchName} → {order.branchName}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        transfer.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : transfer.status === 'transferred'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                        {transfer.status === 'pending' ? 'Awaiting Transfer'
                          : transfer.status === 'transferred' ? 'In Transit'
                          : '✓ Received'}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {transfer.items.map((item, idx) => (
                        <p key={idx} className="text-xs text-zinc-600 dark:text-zinc-400">
                          {item.quantity}x {item.name}
                        </p>
                      ))}
                    </div>
                    {transfer.status === 'pending' && (user?.role === 'administrator' || user?.branchId === transfer.sourceBranchId) && (
                      <button
                        onClick={() => markTransferred(transfer.id)}
                        disabled={transferSavingId === transfer.id}
                        className="w-full px-3 py-1.5 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50 text-xs"
                      >
                        {transferSavingId === transfer.id ? 'Saving…' : 'Mark as Transferred'}
                      </button>
                    )}
                    {transfer.status === 'transferred' && (user?.role === 'administrator' || user?.branchId === transfer.pickupBranchId) && (
                      <button
                        onClick={() => confirmTransferReceipt(transfer.id)}
                        disabled={transferSavingId === transfer.id}
                        className="w-full px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 text-xs"
                      >
                        {transferSavingId === transfer.id ? 'Processing…' : 'Confirm Receipt & Add to Inventory'}
                      </button>
                    )}
                    {transfer.status === 'received' && (
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Added to {order.branchName} inventory</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 text-sm space-y-2">
              <p className="text-zinc-600 dark:text-zinc-400"><span className="font-medium text-zinc-800 dark:text-zinc-200">Customer:</span> {order.customerName}</p>
              <p className="text-zinc-600 dark:text-zinc-400"><span className="font-medium text-zinc-800 dark:text-zinc-200">Phone:</span> {order.customerPhone}</p>
              <p className="text-zinc-600 dark:text-zinc-400"><span className="font-medium text-zinc-800 dark:text-zinc-200">Pickup Branch:</span> {order.branchName || 'N/A'}</p>
              <p className="text-zinc-600 dark:text-zinc-400"><span className="font-medium text-zinc-800 dark:text-zinc-200">Created:</span> {new Date(order.createdAt).toLocaleString('en-PH')}</p>
              {isAdmin && order.groupId && (
                <p className="text-zinc-600 dark:text-zinc-400"><span className="font-medium text-zinc-800 dark:text-zinc-200">Group ID:</span> <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">{order.groupId}</code></p>
              )}
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
