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

  const [deliveryDateFilter, setDeliveryDateFilter] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('all');
  const [transferDateFilter, setTransferDateFilter] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('all');

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
      scheduled: 'bg-blue-100 text-blue-700',
      in_transit: 'bg-yellow-100 text-yellow-700',
      delivered: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
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

  const applyDateFilter = <T extends { createdAt: string }>(items: T[], f: 'all' | 'day' | 'week' | 'month' | 'year'): T[] => {
    if (f === 'all') return items;
    const now = new Date();
    return items.filter(item => {
      const d = new Date(item.createdAt);
      if (f === 'day') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      if (f === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return d >= startOfWeek;
      }
      if (f === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      if (f === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    });
  };

  const dateFilteredDeliveries = applyDateFilter(filteredDeliveries, deliveryDateFilter);
  const dateFilteredOutgoing = applyDateFilter(outgoingTransfers, transferDateFilter);
  const dateFilteredPickupOrders = applyDateFilter(pickupOrders, transferDateFilter);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Item Trail</h1>
            <p className="text-gray-500 mt-1">Schedule deliveries and track product transfers</p>
          </div>
          <Link href="/delivery/new"
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Schedule Delivery
          </Link>
        </div>

        {/* Tabs */}
        {canSeeTransfers && (
          <div className="flex mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-1.5 gap-1">
            <button onClick={() => setActiveTab('deliveries')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'deliveries' ? 'bg-[#011c72] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Deliveries
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'deliveries' ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {deliveries.length}
              </span>
            </button>
            <button onClick={() => setActiveTab('product-transfers')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'product-transfers' ? 'bg-[#011c72] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Product Transfers
              {transferBadgeCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'product-transfers' ? 'bg-white/30 text-white' : 'bg-[#dde6ff] text-[#011c72]'}`}>
                  {transferBadgeCount}
                </span>
              )}
            </button>
          </div>
        )}

        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
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
                <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-lg bg-${color}-100${color}-900/30 flex items-center justify-center mr-3`}>
                      <svg className={`w-5 h-5 text-${color}-600${color}-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-xl font-bold text-gray-900">
                        {status === 'all' ? deliveries.length : deliveries.filter(d => d.status === status).length}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search deliveries..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'scheduled', 'in_transit', 'delivered'].map(status => (
                    <button key={status} onClick={() => setFilter(status)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === status ? 'bg-[#011c72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Date filter */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-6 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500 mr-1">Sort by date:</span>
              {(['all', 'day', 'week', 'month', 'year'] as const).map(f => (
                <button key={f} onClick={() => setDeliveryDateFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${deliveryDateFilter === f ? 'bg-[#011c72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {f === 'all' ? 'All Time' : f === 'day' ? 'Today' : f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : 'This Year'}
                </button>
              ))}
              {deliveryDateFilter !== 'all' && (
                <span className="ml-auto text-xs text-gray-400">
                  {dateFilteredDeliveries.length} of {filteredDeliveries.length} records
                </span>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading deliveries...</p>
                </div>
              ) : dateFilteredDeliveries.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No deliveries found</h3>
                  <p className="text-gray-500">
                    {deliveryDateFilter === 'all' ? 'Schedule a delivery to get started.' : 'No deliveries found for the selected period.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {dateFilteredDeliveries.map(delivery => (
                    <div key={delivery.id} className="p-6 hover:bg-gray-50 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-start space-x-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${delivery.status === 'delivered' ? 'bg-green-100' : delivery.status === 'in_transit' ? 'bg-yellow-100' : 'bg-blue-100'}`}>
                            <svg className={`w-6 h-6 ${delivery.status === 'delivered' ? 'text-green-600' : delivery.status === 'in_transit' ? 'text-yellow-600' : 'text-blue-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-medium text-[#011c72]">{delivery.deliveryNumber}</h3>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadge(delivery.status)}`}>
                                {delivery.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-gray-900 mt-1">
                              {delivery.type === 'customer_delivery' ? delivery.customerName : delivery.toBranchName}
                            </p>
                            <p className="text-sm text-gray-500">
                              {delivery.type === 'customer_delivery' ? delivery.customerAddress : `To: ${delivery.toBranchName}`}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {delivery.jobOrderNumber ? `Job Order: ${delivery.jobOrderNumber} · ` : ''}Scheduled: {formatDate(delivery.scheduledDate)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-16 md:ml-0">
                          {delivery.status === 'scheduled' && (
                            <button onClick={() => updateDeliveryStatus(delivery.id, 'in_transit')}
                              className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium hover:bg-yellow-200 transition-colors">
                              Start Transit
                            </button>
                          )}
                          {delivery.status === 'in_transit' && (
                            <button onClick={() => updateDeliveryStatus(delivery.id, 'delivered')}
                              className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors">
                              Mark Delivered
                            </button>
                          )}
                          <Link href={`/delivery/${delivery.id}`}
                            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
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
            {/* Date filter */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500 mr-1">Sort by date:</span>
              {(['all', 'day', 'week', 'month', 'year'] as const).map(f => (
                <button key={f} onClick={() => setTransferDateFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${transferDateFilter === f ? 'bg-[#011c72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {f === 'all' ? 'All Time' : f === 'day' ? 'Today' : f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : 'This Year'}
                </button>
              ))}
              {transferDateFilter !== 'all' && (
                <span className="ml-auto text-xs text-gray-400">
                  {dateFilteredOutgoing.length + dateFilteredPickupOrders.length} of {outgoingTransfers.length + pickupOrders.length} records
                </span>
              )}
            </div>

            {transfersLoading ? (
              <div className="p-10 text-center bg-white rounded-xl border border-gray-200">
                <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto"></div>
                <p className="mt-3 text-gray-500">Loading transfers...</p>
              </div>
            ) : (
              <>
                {/* Outgoing — items this branch needs to send */}
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

                  {dateFilteredOutgoing.length === 0 ? (
                    <div className="p-6 text-center bg-white rounded-xl border border-gray-200 text-gray-500 text-sm">
                      {transferDateFilter === 'all' ? 'No outgoing transfers for this branch.' : 'No outgoing transfers for the selected period.'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dateFilteredOutgoing.map(transfer => {
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

                {/* Incoming — items coming to this branch */}
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

                  {dateFilteredPickupOrders.length === 0 ? (
                    <div className="p-6 text-center bg-white rounded-xl border border-gray-200 text-gray-500 text-sm">
                      {transferDateFilter === 'all' ? 'No incoming transfers for this branch.' : 'No incoming transfers for the selected period.'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dateFilteredPickupOrders.map(order => (
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
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
