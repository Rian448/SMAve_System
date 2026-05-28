'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, ProductOrderTransfer, ProductOrder } from '@/lib/api';
import Link from 'next/link';

export default function DeliveryPage() {
  const { user } = useAuth();

  const [outgoingTransfers, setOutgoingTransfers] = useState<ProductOrderTransfer[]>([]);
  const [pickupOrders, setPickupOrders] = useState<ProductOrder[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('all');

  const canSeeTransfers = user && ['administrator', 'supervisor'].includes(user.role);

  const fetchTransfers = useCallback(async () => {
    if (!canSeeTransfers) return;
    setTransfersLoading(true);
    try {
      const [outRes, pickupRes] = await Promise.all([
        api.productOrderTransfers.getMyRequests(),
        api.productOrders.getPickupQueue(),
      ]);
      setOutgoingTransfers(outRes.data || []);
      setPickupOrders(pickupRes.data || []);
    } catch (err) {
      console.error('Failed to load transfers', err);
    } finally {
      setTransfersLoading(false);
    }
  }, [canSeeTransfers]);

  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);

  const markTransferred = async (transferId: number) => {
    setSavingId(transferId); setActionError('');
    try {
      await api.productOrderTransfers.markTransferred(transferId);
      await fetchTransfers();
    } catch (err: any) {
      setActionError(err.message || 'Failed to mark as transferred');
    } finally { setSavingId(null); }
  };

  const confirmReceipt = async (transferId: number) => {
    setSavingId(transferId); setActionError('');
    try {
      await api.productOrderTransfers.confirmReceipt(transferId);
      await fetchTransfers();
    } catch (err: any) {
      setActionError(err.message || 'Failed to confirm receipt');
    } finally { setSavingId(null); }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  const getStatusBadge = (status: string) => {
    const s: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-700',
      transferred: 'bg-blue-100 text-blue-700',
      received: 'bg-green-100 text-green-700',
    };
    return s[status] || 'bg-gray-100 text-gray-700';
  };

  const getTransferLabel = (status: string) => {
    if (status === 'pending') return 'Awaiting Transfer';
    if (status === 'transferred') return 'In Transit';
    if (status === 'received') return 'Received';
    return status;
  };

  const applyDateFilter = <T extends { createdAt: string }>(items: T[]): T[] => {
    if (dateFilter === 'all') return items;
    const now = new Date();
    return items.filter(item => {
      const d = new Date(item.createdAt);
      if (dateFilter === 'day') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      if (dateFilter === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return d >= startOfWeek;
      }
      if (dateFilter === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      if (dateFilter === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    });
  };

  const filteredOutgoing = applyDateFilter(outgoingTransfers);
  const filteredPickupOrders = applyDateFilter(pickupOrders);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Item Trail</h1>
          <p className="text-gray-500 mt-1">Track product transfers between branches</p>
        </div>

        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {actionError}
          </div>
        )}

        {/* Date filter */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-6 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 mr-1">Sort by date:</span>
          {(['all', 'day', 'week', 'month', 'year'] as const).map(f => (
            <button key={f} onClick={() => setDateFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${dateFilter === f ? 'bg-[#011c72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f === 'all' ? 'All Time' : f === 'day' ? 'Today' : f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : 'This Year'}
            </button>
          ))}
        </div>

        {transfersLoading ? (
          <div className="p-10 text-center bg-white rounded-xl border border-gray-200">
            <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-3 text-gray-500">Loading transfers...</p>
          </div>
        ) : !canSeeTransfers ? (
          <div className="p-10 text-center bg-white rounded-xl border border-gray-200 text-gray-500">
            You do not have permission to view transfers.
          </div>
        ) : (
          <div className="space-y-8">
            {/* Outgoing */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4" />
                </svg>
                <h2 className="text-base font-bold text-gray-900">Outgoing Transfers</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                  Items leaving this branch
                </span>
              </div>

              {filteredOutgoing.length === 0 ? (
                <div className="p-6 text-center bg-white rounded-xl border border-gray-200 text-gray-500 text-sm">
                  {dateFilter === 'all' ? 'No outgoing transfers for this branch.' : 'No outgoing transfers for the selected period.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOutgoing.map(transfer => {
                    const total = transfer.items.reduce((s, i) => s + (i.total || i.unitPrice * i.quantity), 0);
                    return (
                      <div key={transfer.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
                          <div className="flex items-center gap-3">
                            <Link href={`/product-orders/${transfer.productOrderId}`}
                              className="text-sm font-bold text-[#011c72] hover:underline">
                              {transfer.orderNumber || `Order #${transfer.productOrderId}`}
                            </Link>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(transfer.status)}`}>
                              {getTransferLabel(transfer.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-gray-500">
                              To: <span className="font-semibold text-gray-700">{transfer.pickupBranchName}</span>
                            </span>
                            <span className="font-bold text-gray-900">₱{total.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="px-5 py-3 space-y-3">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="font-medium text-gray-800">{transfer.customerName}</span>
                            {transfer.customerPhone && <span>· {transfer.customerPhone}</span>}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {transfer.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between items-center px-3 py-2 rounded-lg bg-gray-50 text-sm">
                                <div>
                                  <p className="font-medium text-gray-800">{item.name}</p>
                                  <p className="text-xs text-gray-400">{item.sku} · ×{item.quantity}</p>
                                </div>
                                <span className="font-semibold text-gray-900">₱{(item.total || item.unitPrice * item.quantity).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <p className="text-xs text-gray-400">{formatDate(transfer.createdAt)}</p>
                            {transfer.status === 'pending' && (
                              <button onClick={() => markTransferred(transfer.id)} disabled={savingId === transfer.id}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                                {savingId === transfer.id
                                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processing...</>
                                  : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4" /></svg> Mark as Transferred &amp; Deduct Inventory</>}
                              </button>
                            )}
                            {transfer.status === 'transferred' && (
                              <span className="text-sm text-blue-600">In transit to {transfer.pickupBranchName}</span>
                            )}
                            {transfer.status === 'received' && (
                              <span className="text-sm text-green-600">Received at {transfer.pickupBranchName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Incoming */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" />
                </svg>
                <h2 className="text-base font-bold text-gray-900">Incoming Transfers</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                  Items arriving at this branch
                </span>
              </div>

              {filteredPickupOrders.length === 0 ? (
                <div className="p-6 text-center bg-white rounded-xl border border-gray-200 text-gray-500 text-sm">
                  {dateFilter === 'all' ? 'No incoming transfers for this branch.' : 'No incoming transfers for the selected period.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPickupOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <Link href={`/product-orders/${order.id}`}
                            className="text-sm font-bold text-[#011c72] hover:underline">
                            {order.orderNumber}
                          </Link>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(order.status)}`}>
                            {order.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">{order.customerName}</span>
                          {order.customerPhone && <span className="text-gray-500"> · {order.customerPhone}</span>}
                        </div>
                      </div>

                      <div className="divide-y divide-gray-100">
                        {(order.transfers || []).map(transfer => (
                          <div key={transfer.id} className="px-5 py-4">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-800">
                                    From: {transfer.sourceBranchName}
                                  </p>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(transfer.status)}`}>
                                    {getTransferLabel(transfer.status)}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {transfer.items.map((item, idx) => (
                                    <span key={idx} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700">
                                      {item.name} ×{item.quantity}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {transfer.status === 'transferred' && (
                                <button onClick={() => confirmReceipt(transfer.id)} disabled={savingId === transfer.id}
                                  className="shrink-0 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                                  {savingId === transfer.id
                                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Confirming...</>
                                    : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Confirm Receipt &amp; Add to Inventory</>}
                                </button>
                              )}
                              {transfer.status === 'pending' && (
                                <span className="text-sm text-yellow-600 shrink-0">Waiting for {transfer.sourceBranchName} to send</span>
                              )}
                              {transfer.status === 'received' && (
                                <span className="text-sm text-green-600 shrink-0">Added to inventory</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
