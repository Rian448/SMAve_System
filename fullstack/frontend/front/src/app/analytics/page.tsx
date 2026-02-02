'use client';
import { useEffect, useState } from 'react';
import { api, AnalyticsData } from '@/lib/api';

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  useEffect(() => {
    api.getAnalytics()
      .then(response => {
        setAnalytics(response.data || null);
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to load analytics data');
        setLoading(false);
        console.error(err);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        </main>
      </div>
    );
  }

  const maxTrendValue = Math.max(
    ...analytics!.monthlyTrends.map(t => Math.max(t.purchases, t.sales))
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Analytics Dashboard</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              Comprehensive insights and trends for your business
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(['week', 'month', 'quarter', 'year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-amber-600 text-white'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:border-amber-300'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[
            { 
              label: 'Total Items', 
              value: analytics?.categoryDistribution.reduce((sum, c) => sum + c.count, 0) || 0,
              change: '+12%',
              color: 'amber'
            },
            { 
              label: 'Inventory Value', 
              value: `₱${(analytics?.categoryDistribution.reduce((sum, c) => sum + c.value, 0) || 0).toLocaleString()}`,
              change: '+8%',
              color: 'green'
            },
            { 
              label: 'Active Categories', 
              value: analytics?.categoryDistribution.length || 0,
              change: '0%',
              color: 'blue'
            },
            { 
              label: 'Top Material Value', 
              value: `₱${(analytics?.topMaterials[0]?.value || 0).toLocaleString()}`,
              change: '+15%',
              color: 'purple'
            },
          ].map((stat, index) => (
            <div key={index} className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{stat.label}</p>
              <div className="flex items-baseline justify-between mt-2">
                <p className="text-2xl font-bold text-zinc-900 dark:text-white">{stat.value}</p>
                <span className={`text-xs font-medium ${
                  stat.change.startsWith('+') ? 'text-green-600' : stat.change === '0%' ? 'text-zinc-500' : 'text-red-600'
                }`}>
                  {stat.change}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category Distribution */}
          <div className="bg-white dark:bg-zinc-900 shadow-sm rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
              Category Distribution
            </h2>
            <div className="space-y-4">
              {analytics?.categoryDistribution.map((category) => (
                <div key={category.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-zinc-600 dark:text-zinc-400">{category.name}</span>
                    <span className="text-zinc-900 dark:text-white font-medium">
                      {category.count} items (₱{category.value.toLocaleString()})
                    </span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2.5">
                    <div
                      className="bg-amber-600 h-2.5 rounded-full"
                      style={{
                        width: `${(category.count / (analytics?.categoryDistribution.reduce((sum, c) => sum + c.count, 0) || 1)) * 100}%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Materials by Value */}
          <div className="bg-white dark:bg-zinc-900 shadow-sm rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
              Top Materials by Value
            </h2>
            <div className="space-y-3">
              {analytics?.topMaterials.map((material, index) => (
                <div key={material.name} className="flex items-center">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    index === 0 ? 'bg-amber-100 dark:bg-amber-900/30' :
                    index === 1 ? 'bg-zinc-200 dark:bg-zinc-700' :
                    index === 2 ? 'bg-orange-100 dark:bg-orange-900/30' :
                    'bg-zinc-100 dark:bg-zinc-800'
                  }`}>
                    <span className={`font-semibold text-sm ${
                      index === 0 ? 'text-amber-600 dark:text-amber-400' :
                      index === 1 ? 'text-zinc-600 dark:text-zinc-400' :
                      index === 2 ? 'text-orange-600 dark:text-orange-400' :
                      'text-zinc-600 dark:text-zinc-400'
                    }`}>
                      {index + 1}
                    </span>
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                      {material.name}
                    </p>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                      ₱{material.value.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Trends Chart */}
          <div className="bg-white dark:bg-zinc-900 shadow-sm rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
              Monthly Trends
            </h2>
            <div className="mt-6">
              <div className="flex items-end justify-between h-64 space-x-4">
                {analytics?.monthlyTrends.map((trend) => (
                  <div key={trend.month} className="flex-1 flex flex-col items-center">
                    <div className="w-full flex justify-center items-end space-x-1 h-48">
                      {/* Purchases Bar */}
                      <div className="flex flex-col items-center flex-1">
                        <div
                          className="w-full bg-blue-500 rounded-t-md transition-all hover:bg-blue-600"
                          style={{
                            height: `${(trend.purchases / maxTrendValue) * 100}%`,
                            minHeight: '4px'
                          }}
                        />
                      </div>
                      {/* Sales Bar */}
                      <div className="flex flex-col items-center flex-1">
                        <div
                          className="w-full bg-amber-500 rounded-t-md transition-all hover:bg-amber-600"
                          style={{
                            height: `${(trend.sales / maxTrendValue) * 100}%`,
                            minHeight: '4px'
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {trend.month}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Legend */}
              <div className="flex justify-center mt-6 space-x-6">
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-blue-500 rounded mr-2" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Purchases</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-amber-500 rounded mr-2" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Sales</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Insights */}
          <div className="bg-white dark:bg-zinc-900 shadow-sm rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
              Quick Insights
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <h3 className="text-sm font-medium text-green-800 dark:text-green-300">Sales Trend</h3>
                </div>
                <p className="text-xs text-green-600 dark:text-green-400">
                  Sales have increased by 15% compared to last month. Full Upholstery remains the top service.
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">Inventory Alert</h3>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  3 materials are running low on stock. Consider placing purchase orders for leather and foam materials.
                </p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Performance</h3>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Average job completion time improved to 3.5 days. Customer satisfaction remains at 95%.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

