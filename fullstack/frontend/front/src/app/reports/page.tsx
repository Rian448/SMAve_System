'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface ReportSummary {
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
  topServices: { name: string; count: number; revenue: number }[];
  revenueByMonth: { month: string; revenue: number }[];
  inventoryValue: number;
  pendingPayments: number;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('sales');
  const [dateRange, setDateRange] = useState('month');
  const [reportData, setReportData] = useState<ReportSummary | null>(null);

  useEffect(() => {
    fetchReportData();
  }, [reportType, dateRange]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const data = await api.reports.getSummary({ type: reportType, range: dateRange });
      setReportData(data);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const reportTypes = [
    { id: 'sales', name: 'Sales Report', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
    { id: 'inventory', name: 'Inventory Report', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )},
    { id: 'costing', name: 'Job Costing Report', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    )},
    { id: 'delivery', name: 'Delivery Report', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    )},
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Reports & Analytics</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              View business performance and generate reports
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Report
          </button>
        </div>

        {/* Report Type Selection */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {reportTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setReportType(type.id)}
              className={`p-4 rounded-xl border transition-all ${
                reportType === type.id
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500 ring-2 ring-amber-500'
                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                reportType === type.id
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}>
                {type.icon}
              </div>
              <p className={`text-sm font-medium ${
                reportType === type.id
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-zinc-900 dark:text-white'
              }`}>
                {type.name}
              </p>
            </button>
          ))}
        </div>

        {/* Date Range Filter */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex gap-2">
              {['week', 'month', 'quarter', 'year'].map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    dateRange === range
                      ? 'bg-amber-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  This {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
              />
              <span className="text-zinc-400 self-center">to</span>
              <input
                type="date"
                className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
              />
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse"></div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Sales</p>
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {formatCurrency(reportData?.totalSales || 125000)}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">+12% from last period</p>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Orders</p>
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {reportData?.totalOrders || 24}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">8 completed this week</p>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Avg. Order Value</p>
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {formatCurrency(reportData?.averageOrderValue || 5208)}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">+5% from last period</p>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Pending Payments</p>
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {formatCurrency(reportData?.pendingPayments || 32500)}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">5 customers with balance</p>
            </div>
          </div>
        )}

        {/* Charts & Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Services */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Top Services</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {[
                  { name: 'Full Upholstery', count: 12, revenue: 45000, percent: 100 },
                  { name: 'Seat Cover Installation', count: 8, revenue: 28000, percent: 62 },
                  { name: 'Headliner Replacement', count: 6, revenue: 18000, percent: 40 },
                  { name: 'Custom Work', count: 4, revenue: 22000, percent: 49 },
                  { name: 'Carpet Installation', count: 3, revenue: 12000, percent: 27 },
                ].map((service, index) => (
                  <div key={index}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-zinc-900 dark:text-white">{service.name}</span>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">{service.count} orders</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 rounded-full transition-all duration-500"
                          style={{ width: `${service.percent}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-zinc-900 dark:text-white w-20 text-right">
                        {formatCurrency(service.revenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Revenue Trend */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Revenue Trend</h2>
            </div>
            <div className="p-6">
              <div className="h-64 flex items-end justify-between gap-2">
                {[
                  { month: 'Jan', value: 85000 },
                  { month: 'Feb', value: 92000 },
                  { month: 'Mar', value: 78000 },
                  { month: 'Apr', value: 105000 },
                  { month: 'May', value: 115000 },
                  { month: 'Jun', value: 125000 },
                ].map((data, index) => {
                  const maxValue = 125000;
                  const heightPercent = (data.value / maxValue) * 100;
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center">
                      <div className="w-full flex flex-col items-center">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                          {formatCurrency(data.value).replace('₱', '')}
                        </span>
                        <div 
                          className="w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-lg transition-all duration-500"
                          style={{ height: `${heightPercent * 1.5}px` }}
                        ></div>
                      </div>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">{data.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions Table */}
        <div className="mt-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Recent Transactions</h2>
            <button className="text-sm text-amber-600 dark:text-amber-400 hover:underline">
              Export to CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Order #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {[
                  { id: 'JO-2024-001', customer: 'Juan dela Cruz', service: 'Full Upholstery', amount: 15000, date: '2024-01-15', status: 'completed' },
                  { id: 'JO-2024-002', customer: 'Maria Santos', service: 'Seat Cover', amount: 5500, date: '2024-01-14', status: 'in_progress' },
                  { id: 'JO-2024-003', customer: 'Pedro Reyes', service: 'Headliner', amount: 3500, date: '2024-01-13', status: 'completed' },
                  { id: 'JO-2024-004', customer: 'Ana Garcia', service: 'Custom Work', amount: 8000, date: '2024-01-12', status: 'pending' },
                  { id: 'JO-2024-005', customer: 'Jose Rizal', service: 'Carpet Installation', amount: 4500, date: '2024-01-11', status: 'completed' },
                ].map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-amber-600 dark:text-amber-400">{transaction.id}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 dark:text-white">
                      {transaction.customer}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                      {transaction.service}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-white">
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                      {transaction.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        transaction.status === 'completed'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : transaction.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        {transaction.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}


