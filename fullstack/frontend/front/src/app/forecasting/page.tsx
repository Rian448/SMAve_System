'use client';
import { useState, useEffect } from 'react';
import { api, InventoryForecastData } from '@/lib/api';
import Link from 'next/link';

export default function ForecastingPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState<InventoryForecastData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchForecast();
  }, [period]);

  const fetchForecast = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.forecasting.getInventoryForecast({ period });
      if (res.data) setData(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load forecast data.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(n);

  const periodLabel = period === 'week' ? 'Next 7 Days' : period === 'month' ? 'Next 30 Days' : 'Next 90 Days';

  const getPriority = (days: number) => {
    if (days <= 7) return { label: 'Critical', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
    if (days <= 14) return { label: 'High', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' };
    if (days <= 30) return { label: 'Medium', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
    return { label: 'Low', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
  };

  const formatMonth = (ym: string) => {
    const [y, m] = ym.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Inventory Forecasting</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              AI-powered material usage trends and restock predictions
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex items-center gap-3">
            <div className="flex gap-2">
              {['week', 'month', 'quarter'].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    period === p
                      ? 'bg-amber-600 text-white'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Quarter'}
                </button>
              ))}
            </div>
            <button onClick={fetchForecast} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* No predictions uploaded yet */}
        {!loading && data && !data.hasPredictions && (
          <div className="mb-6 p-5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No AI predictions available yet</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Upload your historical XLSX data in the{' '}
                <Link href="/inventory" className="underline font-medium">Inventory → AI Predictions</Link>{' '}
                tab to enable forecasting.
                {data.predictionStatus === 'computing' && ' Predictions are currently computing...'}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">{error}</div>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />)}
            </div>
            <div className="h-72 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
          </div>
        ) : data ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

              {/* Items to restock */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <div className="flex gap-1.5">
                    {data.urgentCount > 0 && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full">{data.urgentCount} critical</span>
                    )}
                    {data.soonCount > 0 && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full">{data.soonCount} soon</span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Items to Restock</p>
                <p className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">{data.periodItemCount}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">{periodLabel} · {data.totalPredictedItems} total tracked</p>
              </div>

              {/* Top consuming material */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Highest Usage Material</p>
                {data.topConsuming ? (
                  <>
                    <p className="text-lg font-bold text-zinc-900 dark:text-white mt-1 truncate">
                      {data.topConsuming.materialType}{data.topConsuming.color ? ` (${data.topConsuming.color})` : ''}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                      ~{data.topConsuming.avgDailyUsage} units/day · {data.topConsuming.itemId}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">No data yet</p>
                )}
              </div>

              {/* Estimated restock cost */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Estimated Restock Cost</p>
                <p className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">
                  {formatCurrency(data.estimatedRestockCost)}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{periodLabel}</p>
              </div>
            </div>

            {/* Material Usage Trend Chart */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Material Usage Trend</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Historical consumption + AI-projected future usage</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-zinc-400 dark:bg-zinc-500" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Actual</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-amber-400" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">AI Projected</span>
                  </div>
                </div>
              </div>

              {data.monthlyUsageTrend.length === 0 ? (
                <div className="h-48 flex items-center justify-center">
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">No usage data yet. Trends will appear as materials are consumed.</p>
                </div>
              ) : (() => {
                const maxVal = Math.max(...data.monthlyUsageTrend.map(m => m.total), 1);
                return (
                  <div className="h-56 flex items-end gap-2">
                    {data.monthlyUsageTrend.map((m, i) => {
                      const heightPct = (m.total / maxVal) * 100;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate w-full text-center">
                            {m.total > 0 ? Math.round(m.total) : ''}
                          </span>
                          <div className="w-full flex items-end" style={{ height: '160px' }}>
                            <div
                              className={`w-full rounded-t-md transition-all duration-500 ${m.projected ? 'bg-amber-400/70 dark:bg-amber-500/50 border-t-2 border-dashed border-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                              style={{ height: `${Math.max(heightPct * 1.6, m.total > 0 ? 4 : 0)}px` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate w-full text-center">{formatMonth(m.month)}</span>
                          {m.projected && <span className="text-xs text-amber-500 leading-none">~</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Restock Schedule Table */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Restock Schedule — {periodLabel}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {data.periodItemCount} item{data.periodItemCount !== 1 ? 's' : ''} need restocking · sorted by urgency
                  </p>
                </div>
                <Link
                  href="/inventory/purchase-orders/new"
                  className="inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create PO
                </Link>
              </div>

              {data.restockItems.length === 0 ? (
                <div className="p-10 text-center">
                  <svg className="w-12 h-12 mx-auto text-green-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">All materials are well-stocked for {periodLabel.toLowerCase()}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">No restocking needed within this period based on AI predictions</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Item</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Stock Left</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Avg Usage</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Days Left</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Restock By</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Order Qty</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Est. Cost</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Priority</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {data.restockItems.map(item => {
                        const priority = getPriority(item.daysUntilStockout);
                        const isUrgent = item.daysUntilStockout <= 7;
                        return (
                          <tr key={item.itemId} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${isUrgent ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}>
                            <td className="px-5 py-3">
                              <div className="text-sm font-semibold text-zinc-900 dark:text-white">{item.itemId}</div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {item.materialType}{item.color ? ` · ${item.color}` : ''}{item.pattern ? ` · ${item.pattern}` : ''}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-sm text-zinc-700 dark:text-zinc-300">{item.currentStock}</td>
                            <td className="px-5 py-3 text-sm text-zinc-700 dark:text-zinc-300">{item.avgDailyUsage}/day</td>
                            <td className="px-5 py-3">
                              <span className={`text-sm font-semibold ${isUrgent ? 'text-red-600 dark:text-red-400' : item.daysUntilStockout <= 14 ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                {item.daysUntilStockout >= 9999 ? '—' : `${item.daysUntilStockout}d`}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                              {item.restockByDate
                                ? new Date(item.restockByDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                                : '—'}
                            </td>
                            <td className="px-5 py-3 text-sm font-medium text-zinc-900 dark:text-white">{item.suggestedRestockQty} units</td>
                            <td className="px-5 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                              {item.estimatedCost > 0 ? formatCurrency(item.estimatedCost) : '—'}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.cls}`}>{priority.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-zinc-50 dark:bg-zinc-800/50">
                      <tr>
                        <td colSpan={6} className="px-5 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Total Estimated Restock Cost</td>
                        <td colSpan={2} className="px-5 py-3 text-sm font-bold text-amber-600 dark:text-amber-400">
                          {formatCurrency(data.estimatedRestockCost)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-6 text-white">
                <div className="flex items-center mb-3">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <h3 className="text-base font-semibold">AI Insight</h3>
                </div>
                {data.hasPredictions ? (
                  <p className="text-amber-100 text-sm leading-relaxed">
                    {data.urgentCount > 0
                      ? `${data.urgentCount} material${data.urgentCount > 1 ? 's are' : ' is'} critically low and will run out within 7 days. Immediate restocking is recommended.`
                      : data.soonCount > 0
                      ? `${data.soonCount} material${data.soonCount > 1 ? 's' : ''} will need restocking within 30 days. Plan your purchase orders now to avoid stockouts.`
                      : `All tracked materials are well-stocked for ${periodLabel.toLowerCase()}. Next review recommended before the period ends.`}
                    {data.topConsuming && ` Your highest-consuming material is ${data.topConsuming.materialType} at ${data.topConsuming.avgDailyUsage} units/day.`}
                  </p>
                ) : (
                  <p className="text-amber-100 text-sm">Upload historical data in the Inventory AI Predictions tab to get personalized insights.</p>
                )}
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <div className="flex items-center mb-3">
                  <svg className="w-5 h-5 mr-2 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Recommendations</h3>
                </div>
                <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {data.urgentCount > 0 && (
                    <li className="flex items-start gap-2">
                      <svg className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Order {data.urgentCount} critical material{data.urgentCount > 1 ? 's' : ''} immediately
                    </li>
                  )}
                  {data.soonCount > 0 && (
                    <li className="flex items-start gap-2">
                      <svg className="w-4 h-4 mt-0.5 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Schedule {data.soonCount} purchase order{data.soonCount > 1 ? 's' : ''} within {periodLabel.toLowerCase()}
                    </li>
                  )}
                  {data.estimatedRestockCost > 0 && (
                    <li className="flex items-start gap-2">
                      <svg className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Budget {formatCurrency(data.estimatedRestockCost)} for {periodLabel.toLowerCase()} restocking
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {data.hasPredictions
                      ? `AI predictions based on ${data.totalPredictedItems} tracked materials`
                      : 'Upload historical data to unlock AI-based recommendations'}
                  </li>
                </ul>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
