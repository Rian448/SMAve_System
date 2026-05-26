'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, JobOrder, CustomerOrder, ProductOrder, ProductOrderTransfer } from '@/lib/api';
import Link from 'next/link';

type SalesTab = 'all' | 'custom-jobs' | 'premade-purchase' | 'premade-sales' | 'pickup-queue';

type UnifiedOrder = (JobOrder | CustomerOrder | ProductOrder) & {
  orderType: 'job' | 'customer' | 'product';
  displayId: string;
  displayStatus: string;
};

export default function SalesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SalesTab>('all');
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Premade Sales tab (source branch transfers)
  const [transferRequests, setTransferRequests] = useState<ProductOrderTransfer[]>([]);
  // Pickup Queue tab
  const [pickupQueue, setPickupQueue] = useState<ProductOrder[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  const [transferDateFilter, setTransferDateFilter] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('all');

  const canSeePremadeFeatures = user && ['administrator', 'supervisor'].includes(user.role);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await api.sales.getAllOrders();
      const productResponse = canSeePremadeFeatures ? await api.productOrders.getAll() : null;

      if (response.status === 'success' && response.data) {
        const jobOrders: UnifiedOrder[] = response.data.jobOrders.map(jo => ({
          ...jo, orderType: 'job' as const, displayId: jo.jobOrderId, displayStatus: jo.status
        }));
        const customerOrders: UnifiedOrder[] = response.data.customerOrders.map(co => ({
          ...co, orderType: 'customer' as const, displayId: co.orderNumber, displayStatus: co.status
        }));
        const productOrders: UnifiedOrder[] = (productResponse?.data || []).map(po => ({
          ...po, orderType: 'product' as const, displayId: po.orderNumber, displayStatus: po.status
        }));
        const allOrders = [...jobOrders, ...customerOrders, ...productOrders].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setOrders(allOrders);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [canSeePremadeFeatures]);

  const fetchTabData = useCallback(async () => {
    if (!canSeePremadeFeatures) return;
    setTabLoading(true);
    try {
      const [transferRes, pickupRes] = await Promise.all([
        api.productOrderTransfers.getMyRequests(),
        api.productOrders.getPickupQueue(),
      ]);
      setTransferRequests(transferRes.data || []);
      setPickupQueue(pickupRes.data || []);
    } catch (err) {
      console.error('Failed to load tab data', err);
    } finally {
      setTabLoading(false);
    }
  }, [canSeePremadeFeatures]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { fetchTabData(); }, [fetchTabData]);

  const markTransferred = async (transferId: number) => {
    setSavingId(transferId); setActionError('');
    try {
      await api.productOrderTransfers.markTransferred(transferId);
      await fetchTabData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to mark as transferred');
    } finally { setSavingId(null); }
  };

  const confirmReceipt = async (transferId: number) => {
    setSavingId(transferId); setActionError('');
    try {
      await api.productOrderTransfers.confirmReceipt(transferId);
      await fetchTabData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to confirm receipt');
    } finally { setSavingId(null); }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  const getStatusBadge = (status: string) => {
    const statusStyles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      ready_for_installation: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      ready: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      voided: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      delivered: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      transferred: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      received: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    };
    return statusStyles[status] || 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
  };

  const getTransferStatusLabel = (status: string) => {
    if (status === 'pending') return 'Awaiting Transfer';
    if (status === 'transferred') return 'In Transit';
    if (status === 'received') return 'Received';
    return status;
  };


  const getOrderAmount = (order: UnifiedOrder) => {
    if (order.orderType === 'job') return (order as JobOrder).totalPrice || 0;
    if (order.orderType === 'product') return (order as ProductOrder).totalAmount || 0;
    return 0;
  };

  const filteredOrders = orders.filter(order => {
    if (filter !== 'all' && order.displayStatus !== filter &&
      !(filter === 'in_progress' && order.displayStatus === 'processing')) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const vi = (order as any).vehicleInfo;
      return order.customerName.toLowerCase().includes(s) ||
        order.displayId.toLowerCase().includes(s) ||
        (vi ? `${vi.year} ${vi.make} ${vi.model}`.toLowerCase().includes(s) : false);
    }
    return true;
  });

  const filteredCustomJobOrders = filteredOrders.filter(o => o.orderType === 'job' || o.orderType === 'customer');
  const filteredPremadePurchaseOrders = filteredOrders.filter(o => o.orderType === 'product');

  const filteredTransferRequests = transferRequests.filter(t => {
    if (transferDateFilter === 'all') return true;
    const now = new Date();
    const d = new Date(t.createdAt);
    if (transferDateFilter === 'day') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    }
    if (transferDateFilter === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return d >= startOfWeek;
    }
    if (transferDateFilter === 'month') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (transferDateFilter === 'year') {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Sales & Orders</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">Manage job orders, premade sales, and pickup queue</p>
          </div>
          <Link href="/sales/new"
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Job Order
          </Link>
        </div>

        {/* Tabs */}
        {canSeePremadeFeatures && (
          <div className="flex mb-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-1.5 gap-1 flex-wrap">
            <button onClick={() => setActiveTab('all')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'all' ? 'bg-amber-600 text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
              All Orders
            </button>

            {/* separator */}
            <div className="w-px bg-zinc-200 dark:bg-zinc-700 self-stretch my-1" />

            <button onClick={() => setActiveTab('custom-jobs')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'custom-jobs' ? 'bg-amber-600 text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Custom Job Orders
            </button>
            <button onClick={() => setActiveTab('premade-purchase')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'premade-purchase' ? 'bg-amber-600 text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Premade Purchase
            </button>

            {/* separator */}
            <div className="w-px bg-zinc-200 dark:bg-zinc-700 self-stretch my-1" />

            <button onClick={() => setActiveTab('premade-sales')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'premade-sales' ? 'bg-amber-600 text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4" />
              </svg>
              Premade Sales
              {transferRequests.length > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'premade-sales' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                  {transferRequests.filter(t => t.status === 'pending').length > 0
                    ? transferRequests.filter(t => t.status === 'pending').length
                    : transferRequests.length}
                </span>
              )}
            </button>
            <button onClick={() => setActiveTab('pickup-queue')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'pickup-queue' ? 'bg-amber-600 text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Pickup Queue
              {pickupQueue.length > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'pickup-queue' ? 'bg-white/30 text-white' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}>
                  {pickupQueue.length}
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

        {/* ── ALL ORDERS TAB ── */}
        {activeTab === 'all' && (
          <>
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search orders, customers, vehicles..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'pending', 'in_progress', 'completed', 'cancelled'].map(status => (
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
                  <p className="mt-4 text-zinc-500 dark:text-zinc-400">Loading orders...</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">No orders found</h3>
                  <p className="text-zinc-500 dark:text-zinc-400">Create a new job order to get started.</p>
                </div>
              ) : (
                <div>
                  <table className="w-full">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                      <tr>
                        {['Order #', 'Type', 'Customer', 'Vehicle', 'Branch', 'Amount', 'Date', 'Status', ''].map(h => (
                          <th key={h} className={`px-4 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {filteredOrders.map(order => (
                        <tr key={`${order.orderType}-${order.id}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">{order.displayId}</span>
                          </td>
                          <td className="px-4 py-3 w-px">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${order.orderType === 'job' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : order.orderType === 'customer' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'}`}>
                              {order.orderType === 'job' ? 'JOB ORDER' : order.orderType === 'customer' ? 'CUSTOMER ORDER' : 'PREMADE'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-zinc-900 dark:text-white">{order.customerName}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{order.customerPhone}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300 max-w-[130px] truncate">
                            {(() => { const vi = (order as any).vehicleInfo; return vi ? `${vi.year} ${vi.make} ${vi.model}` : 'N/A'; })()}
                          </td>

                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                            {order.orderType === 'job' ? (order as JobOrder).branchName : order.orderType === 'customer' ? (order as CustomerOrder).branchName || 'N/A' : (order as ProductOrder).branchName || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                            {getOrderAmount(order) > 0 ? `₱${getOrderAmount(order).toLocaleString()}` : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">{formatDate(order.createdAt)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(order.displayStatus)}`}>
                              {order.displayStatus.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={order.orderType === 'job' ? `/sales/${order.id}` : order.orderType === 'customer' ? `/customer-orders/${order.id}` : `/product-orders/${order.id}`}
                              className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm font-medium">
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── CUSTOM JOB ORDERS TAB ── */}
        {activeTab === 'custom-jobs' && (
          <>
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search orders, customers, vehicles..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'pending', 'in_progress', 'completed', 'cancelled'].map(status => (
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
                  <p className="mt-4 text-zinc-500 dark:text-zinc-400">Loading orders...</p>
                </div>
              ) : filteredCustomJobOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">No custom job orders found</h3>
                  <p className="text-zinc-500 dark:text-zinc-400">Create a new job order to get started.</p>
                </div>
              ) : (
                <div>
                  <table className="w-full">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                      <tr>
                        {['Order #', 'Type', 'Customer', 'Vehicle', 'Branch', 'Amount', 'Date', 'Status', ''].map(h => (
                          <th key={h} className={`px-4 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {filteredCustomJobOrders.map(order => (
                        <tr key={`${order.orderType}-${order.id}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">{order.displayId}</span>
                          </td>
                          <td className="px-4 py-3 w-px">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${order.orderType === 'job' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}>
                              {order.orderType === 'job' ? 'JOB ORDER' : 'CUSTOMER ORDER'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-zinc-900 dark:text-white">{order.customerName}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{order.customerPhone}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300 max-w-[130px] truncate">
                            {(() => { const vi = (order as any).vehicleInfo; return vi ? `${vi.year} ${vi.make} ${vi.model}` : 'N/A'; })()}
                          </td>

                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                            {order.orderType === 'job' ? (order as JobOrder).branchName : (order as CustomerOrder).branchName || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                            {getOrderAmount(order) > 0 ? `₱${getOrderAmount(order).toLocaleString()}` : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">{formatDate(order.createdAt)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(order.displayStatus)}`}>
                              {order.displayStatus.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={order.orderType === 'job' ? `/sales/${order.id}` : `/customer-orders/${order.id}`}
                              className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm font-medium">
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── PREMADE PURCHASE TAB ── */}
        {activeTab === 'premade-purchase' && (
          <>
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search orders or customers..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'pending', 'in_progress', 'completed', 'cancelled'].map(status => (
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
                  <p className="mt-4 text-zinc-500 dark:text-zinc-400">Loading orders...</p>
                </div>
              ) : filteredPremadePurchaseOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">No premade purchases found</h3>
                  <p className="text-zinc-500 dark:text-zinc-400">No customers have purchased premade products yet.</p>
                </div>
              ) : (
                <div>
                  <table className="w-full">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                      <tr>
                        {['Order #', 'Customer', 'Branch', 'Amount', 'Date', 'Status', ''].map(h => (
                          <th key={h} className={`px-4 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {filteredPremadePurchaseOrders.map(order => (
                        <tr key={`product-${order.id}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">{order.displayId}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-zinc-900 dark:text-white">{order.customerName}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{order.customerPhone}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                            {(order as ProductOrder).branchName || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                            {getOrderAmount(order) > 0 ? `₱${getOrderAmount(order).toLocaleString()}` : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">{formatDate(order.createdAt)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(order.displayStatus)}`}>
                              {order.displayStatus.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/product-orders/${order.id}`}
                              className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm font-medium">
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── PREMADE SALES TAB ── */}
        {activeTab === 'premade-sales' && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                These are premade product items that customers ordered <strong>from your branch's inventory</strong> and need to be transferred to their chosen pickup branch.
              </p>
            </div>

            {/* Date filter */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1">Filter by:</span>
              {(['all', 'day', 'week', 'month', 'year'] as const).map(f => (
                <button key={f} onClick={() => setTransferDateFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${transferDateFilter === f ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                  {f === 'all' ? 'All Time' : f === 'day' ? 'Today' : f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : 'This Year'}
                </button>
              ))}
              {transferDateFilter !== 'all' && (
                <span className="ml-auto text-xs text-zinc-400">
                  {filteredTransferRequests.length} of {transferRequests.length} records
                </span>
              )}
            </div>

            {tabLoading ? (
              <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : filteredTransferRequests.length === 0 ? (
              <div className="p-10 text-center bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <svg className="w-14 h-14 mx-auto text-zinc-300 dark:text-zinc-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {transferDateFilter === 'all' ? 'No premade sales found for this branch.' : `No premade sales found for the selected period.`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTransferRequests.map(transfer => {
                  const itemsTotal = transfer.items.reduce((s, i) => s + (i.total || i.unitPrice * i.quantity), 0);
                  return (
                    <div key={transfer.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                      {/* Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                        <div className="flex items-center gap-3">
                          <Link href={`/product-orders/${transfer.productOrderId}`}
                            className="text-base font-bold text-amber-600 dark:text-amber-400 hover:underline">
                            {transfer.orderNumber || `Order #${transfer.productOrderId}`}
                          </Link>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(transfer.status)}`}>
                            {getTransferStatusLabel(transfer.status)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-zinc-500 dark:text-zinc-400">
                            To: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{transfer.pickupBranchName}</span>
                          </span>
                          <span className="text-sm font-bold text-zinc-900 dark:text-white">₱{itemsTotal.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="px-5 py-4 space-y-3">
                        {/* Customer */}
                        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">{transfer.customerName}</span>
                          {transfer.customerPhone && <span>· {transfer.customerPhone}</span>}
                        </div>

                        {/* Items */}
                        <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-zinc-50 dark:bg-zinc-800">
                                <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Item</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500 uppercase">Qty</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500 uppercase">Price</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500 uppercase">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                              {transfer.items.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                                    <p className="font-medium">{item.name}</p>
                                    <p className="text-xs text-zinc-400">{item.sku}</p>
                                  </td>
                                  <td className="px-3 py-2 text-center text-zinc-700 dark:text-zinc-300">{item.quantity}</td>
                                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">₱{item.unitPrice.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-white">₱{(item.total || item.unitPrice * item.quantity).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Action */}
                        {transfer.status === 'pending' && (
                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => markTransferred(transfer.id)}
                              disabled={savingId === transfer.id}
                              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                              {savingId === transfer.id ? (
                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processing...</>
                              ) : (
                                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4" /></svg> Mark as Transferred</>
                              )}
                            </button>
                          </div>
                        )}
                        {transfer.status === 'transferred' && (
                          <p className="text-sm text-blue-600 dark:text-blue-400 text-right pt-1">Items in transit to {transfer.pickupBranchName} — waiting for receipt confirmation.</p>
                        )}
                        {transfer.status === 'received' && (
                          <p className="text-sm text-green-600 dark:text-green-400 text-right pt-1">Items received at {transfer.pickupBranchName}.</p>
                        )}
                      </div>

                      <div className="px-5 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30">
                        <p className="text-xs text-zinc-400">{formatDate(transfer.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PICKUP QUEUE TAB ── */}
        {activeTab === 'pickup-queue' && (
          <div className="space-y-4">
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Customer orders where <strong>your branch is the pickup location</strong>. Track which items are in transit or already received so you can complete the order.
              </p>
            </div>

            {tabLoading ? (
              <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : pickupQueue.length === 0 ? (
              <div className="p-10 text-center bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <svg className="w-14 h-14 mx-auto text-zinc-300 dark:text-zinc-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <p className="text-zinc-500 dark:text-zinc-400">No pickup orders for this branch.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {pickupQueue.map(order => {
                  const allReceived = order.transfers?.every(t => t.status === 'received');
                  const anyPending = order.transfers?.some(t => t.status === 'pending');
                  return (
                    <div key={order.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                      {/* Order header */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Link href={`/product-orders/${order.id}`}
                            className="text-base font-bold text-amber-600 dark:text-amber-400 hover:underline">
                            {order.orderNumber}
                          </Link>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(order.status)}`}>
                            {order.status.toUpperCase()}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(order.paymentStatus)}`}>
                            {order.paymentStatus.toUpperCase()}
                          </span>
                          {allReceived ? (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">All Items Received</span>
                          ) : anyPending ? (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Awaiting Transfer</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Items In Transit</span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-zinc-900 dark:text-white">₱{order.totalAmount.toLocaleString()}</p>
                          <p className="text-xs text-zinc-400">{formatDate(order.createdAt)}</p>
                        </div>
                      </div>

                      <div className="px-5 py-4 space-y-5">
                        {/* Customer info */}
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div>
                            <p className="text-xs text-zinc-400 mb-0.5">Customer</p>
                            <p className="font-semibold text-zinc-900 dark:text-white">{order.customerName}</p>
                          </div>
                          {order.customerPhone && (
                            <div>
                              <p className="text-xs text-zinc-400 mb-0.5">Phone</p>
                              <p className="font-semibold text-zinc-900 dark:text-white">{order.customerPhone}</p>
                            </div>
                          )}
                          {order.customerAddress && (
                            <div>
                              <p className="text-xs text-zinc-400 mb-0.5">Address</p>
                              <p className="font-semibold text-zinc-900 dark:text-white">{order.customerAddress}</p>
                            </div>
                          )}
                          {order.notes && (
                            <div className="w-full">
                              <p className="text-xs text-zinc-400 mb-0.5">Notes</p>
                              <p className="text-zinc-700 dark:text-zinc-300">{order.notes}</p>
                            </div>
                          )}
                        </div>

                        {/* All items this customer needs */}
                        <div>
                          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">All Items for This Customer</h4>
                          <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-zinc-50 dark:bg-zinc-800">
                                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Item</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase">From</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500 uppercase">Qty</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500 uppercase">Price</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500 uppercase">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {order.items.map((item, idx) => {
                                  // Find transfer status for this item
                                  const sourceTransfer = order.transfers?.find(t =>
                                    t.items.some(ti => ti.productId === item.productId || ti.sku === item.sku)
                                  );
                                  const isLocal = !sourceTransfer; // Item comes from pickup branch itself
                                  const transferStatus = sourceTransfer?.status;
                                  return (
                                    <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                      <td className="px-3 py-2">
                                        <p className="font-medium text-zinc-800 dark:text-zinc-200">{item.name}</p>
                                        <p className="text-xs text-zinc-400">{item.sku}</p>
                                      </td>
                                      <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                                        {isLocal ? (
                                          <span className="text-green-600 dark:text-green-400 font-medium">This Branch</span>
                                        ) : sourceTransfer?.sourceBranchName || `Branch ${item.sourceBranchId}`}
                                      </td>
                                      <td className="px-3 py-2 text-center text-zinc-700 dark:text-zinc-300">{item.quantity}</td>
                                      <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">₱{item.unitPrice.toLocaleString()}</td>
                                      <td className="px-3 py-2 text-right">
                                        {isLocal ? (
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">Available</span>
                                        ) : transferStatus === 'received' ? (
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">Received</span>
                                        ) : transferStatus === 'transferred' ? (
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">In Transit</span>
                                        ) : (
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 font-medium">Pending Transfer</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Transfer details + confirm receipt actions */}
                        {order.transfers && order.transfers.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Incoming Transfers</h4>
                            <div className="space-y-3">
                              {order.transfers.map(transfer => (
                                <div key={transfer.id} className={`rounded-lg border p-4 ${transfer.status === 'received' ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10' : transfer.status === 'transferred' ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10' : 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/10'}`}>
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                        From: {transfer.sourceBranchName}
                                      </p>
                                      <p className="text-xs text-zinc-500 mt-1">
                                        {transfer.items.map(i => `${i.name} ×${i.quantity}`).join(', ')}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(transfer.status)}`}>
                                        {getTransferStatusLabel(transfer.status)}
                                      </span>
                                      {transfer.status === 'transferred' && (
                                        <button
                                          onClick={() => confirmReceipt(transfer.id)}
                                          disabled={savingId === transfer.id}
                                          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                                          {savingId === transfer.id ? (
                                            <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Confirming...</>
                                          ) : (
                                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Confirm Receipt & Add to Inventory</>
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end pt-1">
                          <Link href={`/product-orders/${order.id}`}
                            className="text-sm text-amber-600 dark:text-amber-400 hover:underline font-medium">
                            View Full Order Details →
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
