'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, JobOrder, CustomerOrder, ProductOrder, PremadeDraft } from '@/lib/api';
import { formatDate as _fmtDate } from '@/lib/dateUtils';
import Link from 'next/link';
import { useConfirm } from '@/components/ConfirmDialog';
import Paginated from '@/components/Paginated';

type SalesTab = 'all' | 'custom-jobs' | 'premade-purchase';

/** The vehicle on an order, if it has one (premade sales don't) */
const vehicleOf = (order: JobOrder | CustomerOrder | ProductOrder) =>
  ('vehicleInfo' in order ? order.vehicleInfo : null) || null;

type UnifiedOrder = (JobOrder | CustomerOrder | ProductOrder) & {
  orderType: 'job' | 'customer' | 'product';
  displayId: string;
  displayStatus: string;
};

export default function SalesPage() {
  const { confirm, confirmDialog } = useConfirm();
  const { user, can } = useAuth();
  const [activeTab, setActiveTab] = useState<SalesTab>('all');
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // The Premade Sales and Pickup Queue tabs were removed: premade sales are listed under
  // Premade Purchase, and cross-branch pickup transfers are no longer made (old ones
  // stay on the Delivery page and on each product order)
  const [actionError, setActionError] = useState('');

  // Draft job orders (saved but not confirmed; excluded from the lists/counts above)
  const [drafts, setDrafts] = useState<JobOrder[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [draftBusyId, setDraftBusyId] = useState<number | null>(null);
  // Premade job orders being prepared: no stock is taken until they are confirmed
  const [premadeDrafts, setPremadeDrafts] = useState<PremadeDraft[]>([]);
  const [draftKind, setDraftKind] = useState<'custom' | 'premade'>('custom');

  const canSeePremadeFeatures = !!user && can('product_orders.view');

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

  const fetchDrafts = useCallback(async () => {
    try {
      const res = await api.sales.getDrafts();
      setDrafts(res.data || []);
    } catch {
      setDrafts([]);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  // Stock is re-checked by the server on every load, so the flags are current
  const fetchPremadeDrafts = useCallback(async () => {
    try {
      const res = await api.premadeDrafts.list();
      setPremadeDrafts(res.data || []);
    } catch {
      setPremadeDrafts([]);
    }
  }, []);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);
  useEffect(() => { fetchPremadeDrafts(); }, [fetchPremadeDrafts]);

  const deletePremadeDraft = async (d: PremadeDraft) => {
    const ok = await confirm({
      title: `Delete draft ${d.draftNumber}?`,
      message: 'The saved premade draft will be removed. No stock was taken, so none is returned.',
      warning: 'This cannot be undone.',
      confirmLabel: 'Delete draft',
      variant: 'danger',
    });
    if (!ok) return;
    setDraftBusyId(-d.id); setActionError('');
    try {
      await api.premadeDrafts.remove(d.id);
      await fetchPremadeDrafts();
    } catch (err) {
      setActionError((err as Error)?.message || 'Failed to delete draft');
    } finally { setDraftBusyId(null); }
  };

  const deleteDraft = async (id: number) => {
    const ok = await confirm({
      title: 'Delete this draft?',
      message: 'The saved draft job order will be removed.',
      warning: 'This cannot be undone.',
      confirmLabel: 'Delete draft',
      variant: 'danger',
    });
    if (!ok) return;
    setDraftBusyId(id); setActionError('');
    try {
      await api.sales.deleteJobOrder(id);
      await fetchDrafts();
    } catch (err) {
      setActionError((err as Error)?.message || 'Failed to delete draft');
    } finally { setDraftBusyId(null); }
  };

  const formatDate = (dateString: string) => _fmtDate(dateString);

  const getStatusBadge = (status: string) => {
    const statusStyles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      processing: 'bg-blue-100 text-blue-700',
      in_progress: 'bg-blue-100 text-blue-700',
      ready_for_installation: 'bg-orange-100 text-orange-700',
      ready: 'bg-orange-100 text-orange-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
      voided: 'bg-red-100 text-red-700',
      delivered: 'bg-purple-100 text-purple-700',
      transferred: 'bg-blue-100 text-blue-700',
      received: 'bg-green-100 text-green-700',
    };
    return statusStyles[status] || 'bg-gray-100 text-gray-700';
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
      const vi = vehicleOf(order);
      return order.customerName.toLowerCase().includes(s) ||
        order.displayId.toLowerCase().includes(s) ||
        (vi ? `${vi.year} ${vi.make} ${vi.model}`.toLowerCase().includes(s) : false);
    }
    return true;
  });

  const filteredCustomJobOrders = filteredOrders.filter(o => o.orderType === 'job' || o.orderType === 'customer');
  const filteredPremadePurchaseOrders = filteredOrders.filter(o => o.orderType === 'product');


  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales & Orders</h1>
            <p className="text-gray-500 mt-1">Manage custom job orders and premade purchases</p>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-col items-start sm:items-end gap-1">
            <Link href="/sales/new"
              className="inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors">
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Job Order
            </Link>
            {(drafts.length > 0 || premadeDrafts.length > 0) && (
              <button
                onClick={() => {
                  // Open on whichever kind actually has drafts
                  setDraftKind(drafts.length > 0 ? 'custom' : 'premade');
                  fetchPremadeDrafts();
                  setShowDrafts(true);
                }}
                className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl border-2 border-[#011c72] bg-white text-[#011c72] font-semibold hover:bg-[#eef1fb] transition-colors shadow-sm">
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">
                  View Drafts
                </span>
                <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-[#011c72] text-white text-xs font-bold">
                  {drafts.length + premadeDrafts.length}
                </span>
                {premadeDrafts.some(d => !d.isAvailable) && (
                  <span title="A premade draft has items that are out of stock or short"
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold">
                    !
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        {canSeePremadeFeatures && (
          <div className="flex mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-1.5 gap-1 flex-wrap">
            <button onClick={() => setActiveTab('all')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'all' ? 'bg-[#011c72] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              All Orders
            </button>

            {/* separator */}
            <div className="w-px bg-gray-200 self-stretch my-1" />

            <button onClick={() => setActiveTab('custom-jobs')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'custom-jobs' ? 'bg-[#011c72] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Custom Job Orders
            </button>
            <button onClick={() => setActiveTab('premade-purchase')}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'premade-purchase' ? 'bg-[#011c72] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Premade Purchase
            </button>

          </div>
        )}

        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {actionError}
          </div>
        )}

        {/* ── ALL ORDERS TAB ── */}
        {activeTab === 'all' && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search orders, customers, vehicles..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'pending', 'in_progress', 'completed', 'cancelled'].map(status => (
                    <button key={status} onClick={() => setFilter(status)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === status ? 'bg-[#011c72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading orders...</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No orders found</h3>
                  <p className="text-gray-500">Create a new job order to get started.</p>
                </div>
              ) : (
                <Paginated items={filteredOrders} resetKey={[searchTerm, filter]} label="orders">{rows => (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Order #', 'Type', 'Customer', 'Vehicle', 'Branch', 'Amount', 'Date', 'Status', ''].map(h => (
                          <th key={h} className={`px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {rows.map(order => (
                        <tr key={`${order.orderType}-${order.id}`} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-[#011c72]">{order.displayId}</span>
                          </td>
                          <td className="px-4 py-3 w-px">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${order.orderType === 'job' ? 'bg-blue-100 text-blue-700' : order.orderType === 'customer' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'}`}>
                              {order.orderType === 'job' ? 'JOB ORDER' : order.orderType === 'customer' ? 'CUSTOMER ORDER' : 'PREMADE'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                            <p className="text-xs text-gray-500">{order.customerPhone}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-[130px] truncate">
                            {(() => { const vi = vehicleOf(order); return vi ? `${vi.year} ${vi.make} ${vi.model}` : 'N/A'; })()}
                          </td>

                          <td className="px-4 py-3 text-sm text-gray-600">
                            {order.orderType === 'job' ? (order as JobOrder).branchName : order.orderType === 'customer' ? (order as CustomerOrder).branchName || 'N/A' : (order as ProductOrder).branchName || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {getOrderAmount(order) > 0 ? `₱${getOrderAmount(order).toLocaleString()}` : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDate(order.createdAt)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(order.displayStatus)}`}>
                              {order.displayStatus.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={order.orderType === 'job' ? `/sales/${order.id}` : order.orderType === 'customer' ? `/customer-orders/${order.id}` : `/product-orders/${order.id}`}
                              className="text-[#011c72] hover:text-[#011c72] text-sm font-medium">
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}</Paginated>
              )}
            </div>
          </>
        )}

        {/* ── CUSTOM JOB ORDERS TAB ── */}
        {activeTab === 'custom-jobs' && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search orders, customers, vehicles..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'pending', 'in_progress', 'completed', 'cancelled'].map(status => (
                    <button key={status} onClick={() => setFilter(status)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === status ? 'bg-[#011c72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading orders...</p>
                </div>
              ) : filteredCustomJobOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No custom job orders found</h3>
                  <p className="text-gray-500">Create a new job order to get started.</p>
                </div>
              ) : (
                <Paginated items={filteredCustomJobOrders} resetKey={[searchTerm, filter]} label="orders">{rows => (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Order #', 'Type', 'Customer', 'Vehicle', 'Branch', 'Amount', 'Date', 'Status', ''].map(h => (
                          <th key={h} className={`px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {rows.map(order => (
                        <tr key={`${order.orderType}-${order.id}`} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-[#011c72]">{order.displayId}</span>
                          </td>
                          <td className="px-4 py-3 w-px">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${order.orderType === 'job' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                              {order.orderType === 'job' ? 'JOB ORDER' : 'CUSTOMER ORDER'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                            <p className="text-xs text-gray-500">{order.customerPhone}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-[130px] truncate">
                            {(() => { const vi = vehicleOf(order); return vi ? `${vi.year} ${vi.make} ${vi.model}` : 'N/A'; })()}
                          </td>

                          <td className="px-4 py-3 text-sm text-gray-600">
                            {order.orderType === 'job' ? (order as JobOrder).branchName : (order as CustomerOrder).branchName || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {getOrderAmount(order) > 0 ? `₱${getOrderAmount(order).toLocaleString()}` : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDate(order.createdAt)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(order.displayStatus)}`}>
                              {order.displayStatus.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={order.orderType === 'job' ? `/sales/${order.id}` : `/customer-orders/${order.id}`}
                              className="text-[#011c72] hover:text-[#011c72] text-sm font-medium">
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}</Paginated>
              )}
            </div>
          </>
        )}

        {/* ── PREMADE PURCHASE TAB ── */}
        {activeTab === 'premade-purchase' && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search orders or customers..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'pending', 'in_progress', 'completed', 'cancelled'].map(status => (
                    <button key={status} onClick={() => setFilter(status)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === status ? 'bg-[#011c72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading orders...</p>
                </div>
              ) : filteredPremadePurchaseOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No premade purchases found</h3>
                  <p className="text-gray-500">No customers have purchased premade products yet.</p>
                </div>
              ) : (
                <Paginated items={filteredPremadePurchaseOrders} resetKey={[searchTerm, filter]} label="orders">{rows => (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Order #', 'Customer', 'Branch', 'Amount', 'Date', 'Status', ''].map(h => (
                          <th key={h} className={`px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {rows.map(order => (
                        <tr key={`product-${order.id}`} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-[#011c72]">{order.displayId}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                            <p className="text-xs text-gray-500">{order.customerPhone}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {(order as ProductOrder).branchName || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {getOrderAmount(order) > 0 ? `₱${getOrderAmount(order).toLocaleString()}` : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDate(order.createdAt)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(order.displayStatus)}`}>
                              {order.displayStatus.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/product-orders/${order.id}`}
                              className="text-[#011c72] hover:text-[#011c72] text-sm font-medium">
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}</Paginated>
              )}
            </div>
          </>
        )}

        {/* ── DRAFTS MODAL ── */}
        {showDrafts && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowDrafts(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Saved Drafts</h2>
                  <p className="text-xs text-gray-500">Not counted in sales or pending until confirmed</p>
                </div>
                <button onClick={() => setShowDrafts(false)}
                  className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
              </div>

              <div className="px-6 pt-4">
                <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                  <button onClick={() => setDraftKind('custom')}
                    className={`flex-1 py-2 px-3 text-sm font-semibold rounded-lg transition-colors ${draftKind === 'custom' ? 'bg-white text-[#011c72] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                    Custom Made ({drafts.length})
                  </button>
                  <button onClick={() => setDraftKind('premade')}
                    className={`flex-1 py-2 px-3 text-sm font-semibold rounded-lg transition-colors ${draftKind === 'premade' ? 'bg-white text-[#011c72] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                    Premade ({premadeDrafts.length})
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {draftKind === 'custom'
                    ? 'Job orders your team saved to finish later. Edit or confirm them here.'
                    : 'Premade job orders saved to finish later. No stock is taken until one is confirmed; stock shown is as of now.'}
                </p>
              </div>

              {draftKind === 'premade' ? (
              <div className="overflow-y-auto divide-y divide-gray-100 mt-3">
                {premadeDrafts.length === 0 ? (
                  <p className="p-8 text-center text-gray-400 text-sm">No premade drafts saved.</p>
                ) : premadeDrafts.map(d => (
                  <div key={d.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {d.draftNumber}
                          <span className="ml-2 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800">Draft</span>
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {d.customerName}{d.customerPhone ? ` · ${d.customerPhone}` : ''}{d.branchName ? ` · ${d.branchName}` : ''}
                        </p>
                        <p className="text-xs text-gray-500">
                          {d.itemCount} item{d.itemCount !== 1 ? 's' : ''} · ₱{d.totalAmount.toLocaleString()} · saved {formatDate(d.updatedAt)}
                        </p>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${d.isAvailable ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {d.items.length === 0 ? 'No items' : d.isAvailable ? 'In stock' : 'Needs attention'}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {d.items.map(it => (
                        <li key={it.productId} className="text-xs flex flex-wrap gap-x-2">
                          <span className="text-gray-700">{it.quantity}× {it.name}</span>
                          {it.issue && (
                            <span className="font-semibold text-red-700">
                              {it.issue === 'out_of_stock' ? 'Out of stock'
                                : it.issue === 'insufficient' ? `Insufficient stock (${it.available} available)`
                                : 'No longer sold here'}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-center gap-2">
                      <Link href={`/sales/new?premadeDraftId=${d.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#011c72] text-white hover:bg-[#01268c]">
                        Open &amp; Confirm
                      </Link>
                      {can('sales.delete') && (
                        <button onClick={() => deletePremadeDraft(d)} disabled={draftBusyId === -d.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              ) : (
              <div className="overflow-y-auto divide-y divide-gray-100 mt-3">
                {drafts.length === 0 ? (
                  <p className="p-8 text-center text-gray-400 text-sm">No drafts saved.</p>
                ) : drafts.map(d => (
                  <div key={d.id} className="px-6 py-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {d.customerName || 'Unnamed customer'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{d.description || '—'} · {formatDate(d.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/sales/new?draftId=${d.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#eef1fb] text-[#011c72] hover:bg-[#dde3f7]">
                        Edit
                      </Link>
                      <Link href={`/sales/${d.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                        Open
                      </Link>
                      {/* Opens the draft at its first unfinished step: every required field must be filled to confirm it */}
                      <Link href={`/sales/new?draftId=${d.id}&confirm=1`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#011c72] text-white hover:bg-[#01268c]">
                        Confirm
                      </Link>
                      <button onClick={() => deleteDraft(d.id)} disabled={draftBusyId === d.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          </div>
        )}
      </main>
      {confirmDialog}
    </div>
  );
}
