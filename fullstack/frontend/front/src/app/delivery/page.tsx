'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, Delivery, ProductOrderTransfer, ProductOrder } from '@/lib/api';
import Link from 'next/link';

type DeliveryTab = 'deliveries' | 'product-transfers';

export default function DeliveryPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<DeliveryTab>('deliveries');

  // Deliveries tab
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Product Transfers tab
  const [outgoingTransfers, setOutgoingTransfers] = useState<ProductOrderTransfer[]>([]);
  const [pickupOrders, setPickupOrders] = useState<ProductOrder[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  const canSeeTransfers = user && ['administrator', 'supervisor'].includes(user.role);

  useEffect(() => { fetchDeliveries(); }, [filter]);

  const fetchDeliveries = async () => {
    try {
      const response = await api.deliveries.getAll(filter !== 'all' ? { status: filter } : undefined);
      setDeliveries(response.data || []);
    } catch (error) {
      console.error('Error fetching deliveries:', error);
    } finally {
      setLoading(false);
    }
  };

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
      scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      in_transit: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      pending: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
      transferred: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      received: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    };
    return s[status] || 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
  };

  const getTransferLabel = (status: string) => {
    if (status === 'pending') return 'Awaiting Transfer';
    if (status === 'transferred') return 'In Transit';
    if (status === 'received') return 'Received';
    return status;
  };

  const filteredDeliveries = deliveries.filter(d =>
    d.deliveryNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.toBranchName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.customerAddress?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const updateDeliveryStatus = async (id: number, newStatus: string) => {
    try {
      await api.deliveries.updateStatus(id, newStatus);
      fetchDeliveries();
    } catch (error) {
      console.error('Error updating delivery status:', error);
    }
  };

  // All incoming transfers extracted from pickup orders
  const incomingTransfers = pickupOrders.flatMap(order =>
    (order.transfers || []).map(t => ({ ...t, order }))
  );

  const pendingOutgoing = outgoingTransfers.filter(t => t.status === 'pending').length;
  const inTransitIncoming = incomingTransfers.filter(t => t.status === 'transferred').length;
  const transferBadgeCount = pendingOutgoing + inTransitIncoming;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Delivery Management</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">Schedule deliveries and track product transfers</p>
          </div>
          <Link href="/delivery/new"
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Schedule Delivery
          </Link>
        </div>

        {/* Tabs */}
        {canSeeTransfers && (
          <div className="flex mb-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-1.5 gap-1">
            <button onClick={() => setActiveTab('deliveries')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'deliveries' ? 'bg-amber-600 text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Deliveries
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'deliveries' ? 'bg-white/30 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                {deliveries.length}
              </span>
            </button>
            <button onClick={() => setActiveTab('product-transfers')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'product-transfers' ? 'bg-amber-600 text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Product Transfers
              {transferBadgeCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'product-transfers' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                  {transferBadgeCount}
                </span>
              )}
            </button>
          </div>
        )}

        {actionError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {actionError}
          </div>
        )}

        {/* ── DELIVERIES TAB ── */}
        {activeTab === 'deliveries' && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Scheduled', status: 'scheduled', color: 'blue', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                { label: 'In Transit', status: 'in_transit', color: 'yellow', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
                { label: 'Delivered', status: 'delivered', color: 'green', icon: 'M5 13l4 4L19 7' },
                { label: 'Total', status: 'all', color: 'zinc', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
              ].map(({ label, status, color, icon }) => (
                <div key={label} className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center mr-3`}>
                      <svg className={`w-5 h-5 text-${color}-600 dark:text-${color}-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                      <p className="text-xl font-bold text-zinc-900 dark:text-white">
                        {status === 'all' ? deliveries.length : deliveries.filter(d => d.status === status).length}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search deliveries..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'scheduled', 'in_transit', 'delivered'].map(status => (
                    <button key={status} onClick={() => setFilter(status)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === status ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                      {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full mx-auto"></div>
                  <p className="mt-4 text-zinc-500 dark:text-zinc-400">Loading deliveries...</p>
                </div>
              ) : filteredDeliveries.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">No deliveries found</h3>
                  <p className="text-zinc-500 dark:text-zinc-400">Schedule a delivery to get started.</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredDeliveries.map(delivery => (
                    <div key={delivery.id} className="p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-start space-x-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${delivery.status === 'delivered' ? 'bg-green-100 dark:bg-green-900/30' : delivery.status === 'in_transit' ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                            <svg className={`w-6 h-6 ${delivery.status === 'delivered' ? 'text-green-600 dark:text-green-400' : delivery.status === 'in_transit' ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-medium text-amber-600 dark:text-amber-400">{delivery.deliveryNumber}</h3>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadge(delivery.status)}`}>
                                {delivery.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-white mt-1">
                              {delivery.type === 'customer_delivery' ? delivery.customerName : delivery.toBranchName}
                            </p>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              {delivery.type === 'customer_delivery' ? delivery.customerAddress : `To: ${delivery.toBranchName}`}
                            </p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                              {delivery.jobOrderNumber ? `Job Order: ${delivery.jobOrderNumber} · ` : ''}Scheduled: {formatDate(delivery.scheduledDate)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-16 md:ml-0">
                          {delivery.status === 'scheduled' && (
                            <button onClick={() => updateDeliveryStatus(delivery.id, 'in_transit')}
                              className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg text-sm font-medium hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors">
                              Start Transit
                            </button>
                          )}
                          {delivery.status === 'in_transit' && (
                            <button onClick={() => updateDeliveryStatus(delivery.id, 'delivered')}
                              className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-sm font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors">
                              Mark Delivered
                            </button>
                          )}
                          <Link href={`/delivery/${delivery.id}`}
                            className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                            View Details
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── PRODUCT TRANSFERS TAB ── */}
        {activeTab === 'product-transfers' && (
          <div className="space-y-8">
            {transfersLoading ? (
              <div className="p-10 text-center bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full mx-auto"></div>
                <p className="mt-3 text-zinc-500 dark:text-zinc-400">Loading transfers...</p>
              </div>
            ) : (
              <>
                {/* Outgoing — items this branch needs to send */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4" />
                    </svg>
                    <h2 className="text-base font-bold text-zinc-900 dark:text-white">Outgoing Transfers</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">
                      Items leaving this branch
                    </span>
                  </div>

                  {outgoingTransfers.length === 0 ? (
                    <div className="p-6 text-center bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 text-sm">
                      No outgoing transfers for this branch.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {outgoingTransfers.map(transfer => {
                        const total = transfer.items.reduce((s, i) => s + (i.total || i.unitPrice * i.quantity), 0);
                        return (
                          <div key={transfer.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                              <div className="flex items-center gap-3">
                                <Link href={`/product-orders/${transfer.productOrderId}`}
                                  className="text-sm font-bold text-amber-600 dark:text-amber-400 hover:underline">
                                  {transfer.orderNumber || `Order #${transfer.productOrderId}`}
                                </Link>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(transfer.status)}`}>
                                  {getTransferLabel(transfer.status)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-zinc-500 dark:text-zinc-400">
                                  To: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{transfer.pickupBranchName}</span>
                                </span>
                                <span className="font-bold text-zinc-900 dark:text-white">₱{total.toLocaleString()}</span>
                              </div>
                            </div>

                            <div className="px-5 py-3 space-y-3">
                              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span className="font-medium text-zinc-800 dark:text-zinc-200">{transfer.customerName}</span>
                                {transfer.customerPhone && <span>· {transfer.customerPhone}</span>}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {transfer.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-sm">
                                    <div>
                                      <p className="font-medium text-zinc-800 dark:text-zinc-200">{item.name}</p>
                                      <p className="text-xs text-zinc-400">{item.sku} · ×{item.quantity}</p>
                                    </div>
                                    <span className="font-semibold text-zinc-900 dark:text-white">₱{(item.total || item.unitPrice * item.quantity).toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <p className="text-xs text-zinc-400">{formatDate(transfer.createdAt)}</p>
                                {transfer.status === 'pending' && (
                                  <button onClick={() => markTransferred(transfer.id)} disabled={savingId === transfer.id}
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                                    {savingId === transfer.id
                                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processing...</>
                                      : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4" /></svg> Mark as Transferred &amp; Deduct Inventory</>}
                                  </button>
                                )}
                                {transfer.status === 'transferred' && (
                                  <span className="text-sm text-blue-600 dark:text-blue-400">In transit to {transfer.pickupBranchName}</span>
                                )}
                                {transfer.status === 'received' && (
                                  <span className="text-sm text-green-600 dark:text-green-400">Received at {transfer.pickupBranchName}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Incoming — items coming to this branch */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" />
                    </svg>
                    <h2 className="text-base font-bold text-zinc-900 dark:text-white">Incoming Transfers</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 font-medium">
                      Items arriving at this branch
                    </span>
                  </div>

                  {pickupOrders.length === 0 ? (
                    <div className="p-6 text-center bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 text-sm">
                      No incoming transfers for this branch.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pickupOrders.map(order => (
                        <div key={order.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                            <div className="flex items-center gap-3">
                              <Link href={`/product-orders/${order.id}`}
                                className="text-sm font-bold text-amber-600 dark:text-amber-400 hover:underline">
                                {order.orderNumber}
                              </Link>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(order.status)}`}>
                                {order.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="text-sm text-zinc-700 dark:text-zinc-300">
                              <span className="font-medium">{order.customerName}</span>
                              {order.customerPhone && <span className="text-zinc-500"> · {order.customerPhone}</span>}
                            </div>
                          </div>

                          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {(order.transfers || []).map(transfer => (
                              <div key={transfer.id} className="px-5 py-4">
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                        From: {transfer.sourceBranchName}
                                      </p>
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(transfer.status)}`}>
                                        {getTransferLabel(transfer.status)}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {transfer.items.map((item, idx) => (
                                        <span key={idx} className="text-xs px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
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
                                    <span className="text-sm text-yellow-600 dark:text-yellow-400 shrink-0">Waiting for {transfer.sourceBranchName} to send</span>
                                  )}
                                  {transfer.status === 'received' && (
                                    <span className="text-sm text-green-600 dark:text-green-400 shrink-0">Added to inventory</span>
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
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
