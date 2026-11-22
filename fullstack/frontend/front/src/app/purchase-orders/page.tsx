'use client';
import { formatDate } from '@/lib/dateUtils';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, PurchaseOrder } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Paginated from '@/components/Paginated';
import { PaymentStatusBadge } from '@/components/SupplierPayments';
import ReceivePurchaseOrderDialog from '@/components/ReceivePurchaseOrderDialog';
import ReturnToSupplierDialog from '@/components/ReturnToSupplierDialog';
import { poStatusInfo, isOpenForReceiving } from '@/lib/purchaseOrderStatus';
import { exactPeso } from '@/lib/format';
import { TermStatusBadge, dueText, isDueOrOverdue } from '@/components/PaymentTerms';

type POTab = 'all' | 'pending' | 'to_receive' | 'received' | 'due';
const PO_TABS: POTab[] = ['all', 'pending', 'to_receive', 'received', 'due'];

export default function PurchaseOrdersPage() {
  const { can } = useAuth();
  const canCreate = can('purchase_orders.add');
  const canReceive = can('purchase_orders.receive');
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  // Return to Supplier, opened from the receive window
  const [returning, setReturning] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<POTab>('all');
  // ?tab=due (e.g. from the Owner Dashboard's payables) opens that tab
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab') as POTab | null;
    if (wanted && PO_TABS.includes(wanted)) setActiveTab(wanted);
  }, []);
  // Counts come from the full list, whatever tab is open
  const [allOrders, setAllOrders] = useState<PurchaseOrder[]>([]);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [activeTab]);

  const fetchPurchaseOrders = async () => {
    setLoading(true);
    try {
      const response = await api.purchaseOrders.getAll();
      setAllOrders(response.data || []);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await api.purchaseOrders.approve(id);
      await fetchPurchaseOrders();
    } catch (error) {
      console.error('Error approving purchase order:', error);
    }
  };

  const formatCurrency = (amount: number) => exactPeso(amount);

  // Filtered as it is shown, so the list always matches the open tab (a load that
  // finishes late can't leave another tab's orders on screen)
  const purchaseOrders = allOrders.filter((po) => activeTab === 'all'
    || (activeTab === 'pending' && po.status === 'pending')
    || (activeTab === 'to_receive' && isOpenForReceiving(po))
    || (activeTab === 'received' && po.status === 'received')
    || (activeTab === 'due' && isDueOrOverdue(po)))
    // Due tab: overdue first, then the soonest due
    .sort((a, b) => activeTab === 'due' ? (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0) : 0);

  const tabs = [
    { id: 'all' as const, name: 'All Orders', count: allOrders.length },
    { id: 'pending' as const, name: 'Pending Approval', count: allOrders.filter(po => po.status === 'pending').length },
    { id: 'to_receive' as const, name: 'To Receive', count: allOrders.filter(isOpenForReceiving).length },
    { id: 'received' as const, name: 'Received', count: allOrders.filter(po => po.status === 'received').length },
    { id: 'due' as const, name: 'Due Soon / Overdue', count: allOrders.filter(isDueOrOverdue).length, alert: allOrders.some(po => po.termStatus === 'overdue') },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
            <p className="text-gray-500 mt-1">
              View and manage purchase orders for raw materials
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-wrap gap-2">
          {canReceive && <Link href="/purchase-orders/receiving"
            className="inline-flex items-center px-4 py-2 border border-[#011c72] text-[#011c72] hover:bg-[#eef1fb] rounded-lg font-medium transition-colors">
            Go to Receiving
          </Link>}
          {canCreate && <Link
            href="/purchase-orders/new"
            className="inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Purchase Order
          </Link>}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-[#011c72] text-[#011c72]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.name}
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    'alert' in tab && tab.alert && tab.count > 0
                      ? 'bg-red-100 text-red-700'
                      : activeTab === tab.id
                      ? 'bg-[#dde6ff] text-[#011c72]'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading purchase orders...</p>
            </div>
          ) : purchaseOrders.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No purchase orders</h3>
              <p className="text-gray-500 mb-4">
                {activeTab === 'due' ? 'Nothing is due soon or overdue. Supplier payments are on track.'
                  : activeTab !== 'all' ? 'No purchase orders in this status.' : canCreate ? 'Create your first purchase order to get started.' : 'No purchase orders yet.'}
              </p>
              {canCreate && <Link
                href="/purchase-orders/new"
                className="inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors"
              >
                Create Purchase Order
              </Link>}
            </div>
          ) : (
            <Paginated items={purchaseOrders} resetKey={activeTab} label="purchase orders">{rows => (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] table-sticky-actions">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Delivery</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Terms / Due</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <Link
                          href={`/purchase-orders/${po.id}`}
                          className="text-sm font-medium text-[#011c72] hover:text-[#011c72]"
                        >
                          {po.poNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                        {po.supplierName}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(po.totalAmount)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(po.expectedDelivery)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ${poStatusInfo(po).className}`}>
                          {poStatusInfo(po).label}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {po.status === 'cancelled' && !po.payments?.length ? <span className="text-xs text-gray-400">—</span>
                          : <PaymentStatusBadge status={po.paymentStatus} />}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {po.paymentTerm && po.status !== 'cancelled' ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm text-gray-700">{po.paymentTermLabel}</span>
                              {(po.termStatus === 'due_soon' || po.termStatus === 'overdue' || po.termStatus === 'paid_late') && <TermStatusBadge status={po.termStatus} />}
                            </div>
                            {po.termStatus !== 'paid' && po.termStatus !== 'paid_late' && (
                              <p className={`text-xs ${po.termStatus === 'overdue' ? 'text-red-700 font-medium' : po.termStatus === 'due_soon' ? 'text-amber-800' : 'text-gray-500'}`}>
                                {po.balance > 0 && isDueOrOverdue(po) ? `${formatCurrency(po.balance)} · ` : ''}{dueText(po)}
                              </p>
                            )}
                          </div>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(po.createdAt)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/purchase-orders/${po.id}`}
                            className="text-[#011c72] hover:text-[#011c72] text-sm font-medium"
                          >
                            View Details
                          </Link>
                          {po.status === 'pending' && (
                            <button
                              onClick={() => handleApprove(po.id)}
                              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                              Approve
                            </button>
                          )}
                          {isOpenForReceiving(po) && canReceive && (
                            <button
                              onClick={() => setReceiving(po)}
                              className="text-green-600 hover:text-green-700 text-sm font-medium"
                            >
                              Receive
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}</Paginated>
          )}
        </div>
      </main>
      {receiving && (
        <ReceivePurchaseOrderDialog po={receiving} onClose={() => setReceiving(null)}
          onReturn={() => { setReturning(receiving); setReceiving(null); }}
          onSaved={() => { setReceiving(null); fetchPurchaseOrders(); }} />
      )}
      {returning && (
        <ReturnToSupplierDialog po={returning} onClose={() => setReturning(null)}
          onSaved={() => { setReturning(null); fetchPurchaseOrders(); }} />
      )}
    </div>
  );
}
