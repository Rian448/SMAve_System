'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, SalesReport, InventoryReport, AuditLog } from '@/lib/api';

function getDateRange(range: string): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const start = new Date(now);
  switch (range) {
    case 'week':    start.setDate(start.getDate() - 7); break;
    case 'quarter': start.setDate(start.getDate() - 90); break;
    case 'year':    start.setFullYear(start.getFullYear() - 1); break;
    default:        start.setDate(start.getDate() - 30);
  }
  return { startDate: start.toISOString().split('T')[0], endDate: end };
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(amount);

const formatDate = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

const STATUS_COLORS: Record<string, string> = {
  completed:   'bg-green-500',
  in_progress: 'bg-blue-500',
  pending:     'bg-yellow-500',
  cancelled:   'bg-red-500',
  for_pickup:  'bg-purple-500',
  delivered:   'bg-teal-500',
};

const STATUS_LABEL_COLORS: Record<string, string> = {
  completed:   'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  pending:     'bg-yellow-100 text-yellow-700',
  cancelled:   'bg-red-100 text-red-700',
  for_pickup:  'bg-purple-100 text-purple-700',
  delivered:   'bg-teal-100 text-teal-700',
};

function SkeletonCard() {
  return <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />;
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className={`text-xs mt-1 ${color}`}>{sub}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [reportType, setReportType]     = useState('sales');
  const [dateRange, setDateRange]       = useState('month');
  const [customStart, setCustomStart]   = useState('');
  const [customEnd, setCustomEnd]       = useState('');
  const [salesData, setSalesData]       = useState<SalesReport | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryReport | null>(null);
  const [auditData, setAuditData]       = useState<AuditLog[] | null>(null);
  const [auditModule, setAuditModule]   = useState('');

  const isAdmin        = user?.role === 'administrator';
  const canViewInventory = isAdmin || user?.role === 'supervisor';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dates = (customStart && customEnd)
        ? { startDate: customStart, endDate: customEnd }
        : getDateRange(dateRange);

      if (reportType === 'sales') {
        const res = await api.reports.getSalesReport(dates);
        setSalesData(res.data || null);
      } else if (reportType === 'inventory' && canViewInventory) {
        const res = await api.reports.getInventoryReport();
        setInventoryData(res.data || null);
      } else if (reportType === 'audit' && isAdmin) {
        const res = await api.reports.getAuditTrail({ ...dates, ...(auditModule ? { module: auditModule } : {}) });
        setAuditData(res.data || null);
      }
    } catch {
      setError('Failed to load report data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [reportType, dateRange, customStart, customEnd, auditModule, canViewInventory, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportCsv = () => {
    let csv = '';
    let filename = 'report.csv';

    if (reportType === 'sales' && salesData) {
      filename = 'sales-report.csv';
      csv = 'Date,Orders,Revenue\n' +
        salesData.dailySales.map(d => `${d.date},${d.orders},${d.revenue}`).join('\n');
    } else if (reportType === 'inventory' && inventoryData) {
      filename = 'inventory-report.csv';
      csv = 'Category,Items,Value\n' +
        inventoryData.categoryBreakdown.map(c => `${c.category},${c.count},${c.value}`).join('\n');
    } else if (reportType === 'audit' && auditData) {
      filename = 'audit-trail.csv';
      csv = 'Timestamp,User,Module,Action,Details\n' +
        auditData.map(l => `"${l.timestamp}","${l.userName}","${l.module}","${l.action}","${l.details}"`).join('\n');
    }

    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const reportTypes = [
    {
      id: 'sales', name: 'Sales Report',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    ...(canViewInventory ? [{
      id: 'inventory', name: 'Inventory Report',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    }] : []),
    ...(isAdmin ? [{
      id: 'audit', name: 'Audit Trail',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    }] : []),
  ];

  const showDateFilter = reportType !== 'inventory';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-500 mt-1">View business performance and generate reports</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportCsv}
              className="inline-flex items-center px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg font-medium text-sm transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium text-sm transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          </div>
        </div>

        {/* Report Type Tabs */}
        <div className={`grid gap-4 mb-6 ${reportTypes.length === 1 ? 'grid-cols-1' : reportTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {reportTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setReportType(type.id)}
              className={`p-4 rounded-xl border text-left transition-all ${
                reportType === type.id
                  ? 'bg-[#eef1fb] border-[#011c72] ring-2 ring-[#011c72]'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                reportType === type.id
                  ? 'bg-[#dde6ff] text-[#011c72]'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {type.icon}
              </div>
              <p className={`text-sm font-semibold ${
                reportType === type.id ? 'text-[#011c72]' : 'text-gray-900'
              }`}>
                {type.name}
              </p>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {showDateFilter && (
              <>
                <div className="flex flex-wrap gap-2">
                  {['week', 'month', 'quarter', 'year'].map((r) => (
                    <button
                      key={r}
                      onClick={() => { setDateRange(r); setCustomStart(''); setCustomEnd(''); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        dateRange === r && !customStart
                          ? 'bg-[#011c72] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : r === 'quarter' ? 'This Quarter' : 'This Year'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-sm"
                  />
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-sm"
                  />
                </div>
              </>
            )}
            {reportType === 'audit' && (
              <select
                value={auditModule}
                onChange={(e) => setAuditModule(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-sm"
              >
                <option value="">All Modules</option>
                <option value="auth">Auth</option>
                <option value="sales">Sales</option>
                <option value="inventory">Inventory</option>
                <option value="delivery">Delivery</option>
                <option value="settings">Settings</option>
              </select>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="ml-auto px-4 py-1.5 bg-[#011c72] hover:bg-[#01268c] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ── SALES REPORT ── */}
        {reportType === 'sales' && (
          <>
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : salesData ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <SummaryCard
                    label="Total Revenue"
                    value={formatCurrency(salesData.summary.totalRevenue)}
                    sub={`Period: ${formatDate(salesData.period.startDate)} – ${formatDate(salesData.period.endDate)}`}
                    color="text-green-600"
                  />
                  <SummaryCard
                    label="Total Orders"
                    value={salesData.summary.totalOrders.toString()}
                    sub={`${salesData.summary.completedOrders} completed`}
                    color="text-blue-600"
                  />
                  <SummaryCard
                    label="Avg. Order Value"
                    value={formatCurrency(salesData.summary.averageOrderValue)}
                    color="text-[#011c72]"
                  />
                  <SummaryCard
                    label="Pending Revenue"
                    value={formatCurrency(salesData.summary.pendingRevenue)}
                    sub="Unpaid balances"
                    color="text-red-600"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Daily Sales Trend */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h2 className="text-base font-semibold text-gray-900">Daily Sales Trend</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Revenue per day</p>
                    </div>
                    <div className="p-6">
                      {salesData.dailySales.length === 0 ? (
                        <p className="text-center text-gray-400 py-12 text-sm">No sales data for this period</p>
                      ) : (
                        <DailyBarChart data={salesData.dailySales} />
                      )}
                    </div>
                  </div>

                  {/* Order Status Breakdown */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h2 className="text-base font-semibold text-gray-900">Order Status Breakdown</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Distribution by current status</p>
                    </div>
                    <div className="p-6">
                      {salesData.statusBreakdown.length === 0 ? (
                        <p className="text-center text-gray-400 py-12 text-sm">No orders in this period</p>
                      ) : (
                        <StatusBreakdown breakdown={salesData.statusBreakdown} total={salesData.summary.totalOrders} />
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState message="No sales data available." />
            )}
          </>
        )}

        {/* ── INVENTORY REPORT ── */}
        {reportType === 'inventory' && canViewInventory && (
          <>
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : inventoryData ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <SummaryCard
                    label="Raw Materials"
                    value={inventoryData.summary.totalRawMaterials.toString()}
                    sub={`Value: ${formatCurrency(inventoryData.summary.rawMaterialsValue)}`}
                    color="text-blue-600"
                  />
                  <SummaryCard
                    label="Finished Goods"
                    value={inventoryData.summary.totalFinishedGoods.toString()}
                    sub={`Value: ${formatCurrency(inventoryData.summary.finishedGoodsValue)}`}
                    color="text-purple-600"
                  />
                  <SummaryCard
                    label="Potential Profit"
                    value={formatCurrency(inventoryData.summary.potentialProfit)}
                    sub="From finished goods"
                    color="text-green-600"
                  />
                  <SummaryCard
                    label="Low Stock Items"
                    value={inventoryData.summary.lowStockItemsCount.toString()}
                    sub={inventoryData.summary.lowStockItemsCount > 0 ? 'Needs restocking' : 'All stocked'}
                    color={inventoryData.summary.lowStockItemsCount > 0 ? 'text-red-600' : 'text-green-600'}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Category Breakdown */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h2 className="text-base font-semibold text-gray-900">Raw Materials by Category</h2>
                    </div>
                    <div className="p-6">
                      {inventoryData.categoryBreakdown.length === 0 ? (
                        <p className="text-center text-gray-400 py-12 text-sm">No categories found</p>
                      ) : (
                        <CategoryBreakdown data={inventoryData.categoryBreakdown} />
                      )}
                    </div>
                  </div>

                  {/* Low Stock Items */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h2 className="text-base font-semibold text-gray-900">Low Stock Alert</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Items at or below reorder point</p>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                      {inventoryData.lowStockItems.length === 0 ? (
                        <p className="text-center text-gray-400 py-12 text-sm">All items are sufficiently stocked</p>
                      ) : inventoryData.lowStockItems.map((item) => (
                        <div key={item.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-500">Reorder at: {item.reorderPoint} {item.unit}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-red-600">{item.currentStock} {item.unit}</p>
                            <p className="text-xs text-gray-500">current stock</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState message="No inventory data available." />
            )}
          </>
        )}

        {/* ── AUDIT TRAIL ── */}
        {reportType === 'audit' && isAdmin && (
          <>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : auditData ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-900">Audit Log</h2>
                  <span className="text-sm text-gray-500">{auditData.length} entries</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3 text-left">Timestamp</th>
                        <th className="px-5 py-3 text-left">User</th>
                        <th className="px-5 py-3 text-left">Module</th>
                        <th className="px-5 py-3 text-left">Action</th>
                        <th className="px-5 py-3 text-left">Details</th>
                        <th className="px-5 py-3 text-left">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {auditData.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-12 text-center text-gray-400">No audit entries for this period</td>
                        </tr>
                      ) : auditData.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 whitespace-nowrap text-gray-500">
                            {new Date(log.timestamp).toLocaleString('en-PH')}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap font-medium text-gray-900">{log.userName}</td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 capitalize">
                              {log.module}
                            </span>
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-gray-700">{log.action}</td>
                          <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{log.details}</td>
                          <td className="px-5 py-3 whitespace-nowrap text-gray-400 font-mono text-xs">{log.ipAddress}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptyState message="No audit data available." />
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ── Sub-components ── */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  );
}

function DailyBarChart({ data }: { data: Array<{ date: string; orders: number; revenue: number }> }) {
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  // Show at most 14 points to keep it readable
  const slice = data.length > 14 ? data.slice(data.length - 14) : data;

  return (
    <div className="h-48 flex items-end gap-1">
      {slice.map((d, i) => {
        const h = Math.max((d.revenue / maxRevenue) * 100, d.revenue > 0 ? 4 : 0);
        return (
          <div key={i} className="flex-1 flex flex-col items-center group relative">
            <div
              className="w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-t hover:from-amber-400 hover:to-amber-300 transition-colors cursor-pointer"
              style={{ height: `${h}%`, minHeight: d.revenue > 0 ? '4px' : '0' }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-100 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <p>{formatDate(d.date)}</p>
              <p>₱{d.revenue.toLocaleString()}</p>
              <p>{d.orders} orders</p>
            </div>
            <span className="text-[9px] text-gray-400 mt-1 hidden sm:block">
              {new Date(d.date + 'T00:00:00').getDate()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatusBreakdown({ breakdown, total }: {
  breakdown: Array<{ status: string; count: number; value: number }>;
  total: number;
}) {
  const sorted = [...breakdown].sort((a, b) => b.count - a.count);
  return (
    <div className="space-y-3">
      {sorted.map((item) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        const color = STATUS_COLORS[item.status] || 'bg-zinc-400';
        return (
          <div key={item.status}>
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-gray-900 capitalize">
                {item.status.replace(/_/g, ' ')}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{item.count} orders</span>
                <span className="text-xs font-medium text-gray-900">
                  ₱{item.value.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryBreakdown({ data }: { data: Array<{ category: string; count: number; value: number }> }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <div className="space-y-3">
      {sorted.map((cat, i) => {
        const pct = Math.round((cat.value / maxVal) * 100);
        const colors = ['bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-indigo-500', 'bg-cyan-500'];
        return (
          <div key={cat.category}>
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-gray-900 capitalize">{cat.category}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{cat.count} items</span>
                <span className="text-xs font-medium text-gray-900">{formatCurrency(cat.value)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${colors[i % colors.length]} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
