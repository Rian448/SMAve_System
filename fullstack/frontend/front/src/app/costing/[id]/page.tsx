'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, CostingData, ApiResponse } from '@/lib/api';

export default function CostingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [costing, setCosting] = useState<CostingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      api.costing.getJobOrderCosting(parseInt(params.id as string))
        .then((response: ApiResponse<CostingData>) => {
          setCosting(response.data || null);
          setLoading(false);
        })
        .catch((err: Error) => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
          </div>
        </main>
      </div>
    );
  }

  if (!costing) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <p className="text-red-600 dark:text-red-400">Costing record not found</p>
            <button
              onClick={() => router.push('/costing')}
              className="mt-4 text-amber-600 hover:text-amber-700 font-medium"
            >
              Back to Costing
            </button>
          </div>
        </main>
      </div>
    );
  }

  const totalCost = costing.materialCost + costing.laborCost + costing.overheadCost;
  const profit = costing.totalPrice - totalCost;
  const profitMargin = costing.totalPrice > 0 ? (profit / costing.totalPrice) * 100 : 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <button
              onClick={() => router.push('/costing')}
              className="flex items-center text-zinc-600 dark:text-zinc-400 hover:text-amber-600 mb-2"
            >
              <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Costing
            </button>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              Job Costing #{costing.jobOrderId}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              Detailed cost breakdown and profitability analysis
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 text-sm font-medium rounded-full ${
              profitMargin >= 30 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : profitMargin >= 15
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {profitMargin >= 30 ? 'High Margin' : profitMargin >= 15 ? 'Medium Margin' : 'Low Margin'}
            </span>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Revenue</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">
                  ₱{costing.totalPrice.toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Cost</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">
                  ₱{totalCost.toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Net Profit</p>
                <p className={`text-2xl font-bold mt-1 ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  ₱{profit.toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Profit Margin</p>
                <p className={`text-2xl font-bold mt-1 ${
                  profitMargin >= 30 ? 'text-green-600 dark:text-green-400' :
                  profitMargin >= 15 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-red-600 dark:text-red-400'
                }`}>
                  {profitMargin.toFixed(1)}%
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cost Breakdown */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6">Cost Breakdown</h2>
            
            {/* Visual Chart */}
            <div className="mb-6">
              <div className="h-8 flex rounded-lg overflow-hidden">
                <div 
                  className="bg-blue-500 flex items-center justify-center text-xs text-white font-medium"
                  style={{ width: `${(costing.materialCost / totalCost) * 100}%` }}
                >
                  {((costing.materialCost / totalCost) * 100).toFixed(0)}%
                </div>
                <div 
                  className="bg-green-500 flex items-center justify-center text-xs text-white font-medium"
                  style={{ width: `${(costing.laborCost / totalCost) * 100}%` }}
                >
                  {((costing.laborCost / totalCost) * 100).toFixed(0)}%
                </div>
                <div 
                  className="bg-amber-500 flex items-center justify-center text-xs text-white font-medium"
                  style={{ width: `${(costing.overheadCost / totalCost) * 100}%` }}
                >
                  {((costing.overheadCost / totalCost) * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Materials</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Raw materials and supplies</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">₱{costing.materialCost.toLocaleString()}</p>
                  <p className="text-xs text-zinc-500">{((costing.materialCost / totalCost) * 100).toFixed(1)}%</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Labor</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Direct labor costs</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">₱{costing.laborCost.toLocaleString()}</p>
                  <p className="text-xs text-zinc-500">{((costing.laborCost / totalCost) * 100).toFixed(1)}%</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-amber-500 rounded-full mr-3"></div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Overhead</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Indirect costs and expenses</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">₱{costing.overheadCost.toLocaleString()}</p>
                  <p className="text-xs text-zinc-500">{((costing.overheadCost / totalCost) * 100).toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Profitability Analysis */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6">Profitability Analysis</h2>
            
            {/* Profit Gauge */}
            <div className="flex justify-center mb-6">
              <div className="relative w-48 h-24">
                <svg className="w-full h-full" viewBox="0 0 200 100">
                  <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e5e7eb" strokeWidth="20" strokeLinecap="round"/>
                  <path 
                    d="M 20 100 A 80 80 0 0 1 180 100" 
                    fill="none" 
                    stroke={profitMargin >= 30 ? '#22c55e' : profitMargin >= 15 ? '#eab308' : '#ef4444'}
                    strokeWidth="20" 
                    strokeLinecap="round"
                    strokeDasharray={`${(profitMargin / 100) * 251.2} 251.2`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-end justify-center pb-2">
                  <span className="text-2xl font-bold text-zinc-900 dark:text-white">{profitMargin.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Revenue</span>
                <span className="text-sm font-medium text-zinc-900 dark:text-white">₱{costing.totalPrice.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Total Cost</span>
                <span className="text-sm font-medium text-red-600 dark:text-red-400">-₱{totalCost.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm font-medium text-zinc-900 dark:text-white">Gross Profit</span>
                <span className={`text-sm font-bold ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  ₱{profit.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Cost per Peso Revenue</span>
                <span className="text-sm font-medium text-zinc-900 dark:text-white">
                  ₱{(totalCost / costing.totalPrice).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Analysis Note */}
            <div className={`mt-6 p-4 rounded-lg ${
              profitMargin >= 30 
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : profitMargin >= 15
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-start">
                <svg className={`w-5 h-5 mr-2 mt-0.5 ${
                  profitMargin >= 30 ? 'text-green-600' : profitMargin >= 15 ? 'text-yellow-600' : 'text-red-600'
                }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className={`text-sm font-medium ${
                    profitMargin >= 30 ? 'text-green-800 dark:text-green-300' : 
                    profitMargin >= 15 ? 'text-yellow-800 dark:text-yellow-300' : 
                    'text-red-800 dark:text-red-300'
                  }`}>
                    {profitMargin >= 30 
                      ? 'Excellent Profitability' 
                      : profitMargin >= 15 
                      ? 'Acceptable Margin' 
                      : 'Low Margin Warning'}
                  </p>
                  <p className={`text-xs mt-1 ${
                    profitMargin >= 30 ? 'text-green-600 dark:text-green-400' : 
                    profitMargin >= 15 ? 'text-yellow-600 dark:text-yellow-400' : 
                    'text-red-600 dark:text-red-400'
                  }`}>
                    {profitMargin >= 30 
                      ? 'This job order has a healthy profit margin. Consider this as a benchmark for similar projects.' 
                      : profitMargin >= 15 
                      ? 'The margin is within acceptable range. Review material costs for potential savings.' 
                      : 'Review pricing strategy or cost structure. Consider negotiating material costs.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Material Details */}
        {costing.items && costing.items.length > 0 && (
          <div className="mt-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Material Details</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Material</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Quantity</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Unit Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {costing.items.map((item, index: number) => (
                    <tr key={index}>
                      <td className="px-4 py-3 text-sm text-zinc-900 dark:text-white">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-center text-zinc-600 dark:text-zinc-400">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-right text-zinc-600 dark:text-zinc-400">₱{item.unitPrice.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-zinc-900 dark:text-white">₱{(item.quantity * item.unitPrice).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button 
            onClick={() => router.push(`/sales/${costing.jobOrderId}`)}
            className="inline-flex items-center px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-amber-300 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View Job Order
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-amber-300 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-colors">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Export Report
          </button>
        </div>
      </main>
    </div>
  );
}
