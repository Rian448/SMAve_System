'use client';
import { useState, useEffect } from 'react';
import { api, JobOrderCost } from '@/lib/api';
import Link from 'next/link';
import Paginated from '@/components/Paginated';
import Amount, { AmountDisplayProvider, AmountDisplayToggle } from '@/components/Amount';
import { exactPeso } from '@/lib/format';

export default function CostingPage() {
  const [costings, setCostings] = useState<JobOrderCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchCostings();
  }, []);

  const fetchCostings = async () => {
    try {
      const data = await api.costing.getAll();
      setCostings(data.data || []);
    } catch (error) {
      console.error('Error fetching costings:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = exactPeso;

  const costOf = (c: JobOrderCost) => c.materialsCost + c.laborCost + c.overheadCost;
  // Margin %; an unpriced order counts as 0% instead of NaN (which fell into no bucket)
  const marginOf = (c: JobOrderCost) => (c.totalAmount > 0 ? ((c.totalAmount - costOf(c)) / c.totalAmount) * 100 : 0);

  const calculateProfitMargin = (total: number, cost: number) => {
    if (total === 0) return 0;
    return ((total - cost) / total * 100).toFixed(1);
  };

  const filteredCostings = costings.filter(costing =>
    costing.jobOrderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (costing.customerName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate summary stats
  const totalRevenue = costings.reduce((sum, c) => sum + c.totalAmount, 0);
  const totalCosts = costings.reduce((sum, c) => sum + c.materialsCost + c.laborCost + c.overheadCost, 0);
  const totalProfit = totalRevenue - totalCosts;
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0;

  return (
    <AmountDisplayProvider storageKey="costing">
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Job Order Costing</h1>
            <p className="text-gray-500 mt-1">
              Track costs and profitability for each job order
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Report
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                <p className="text-xl xl:text-2xl font-bold break-words text-gray-900 mt-1">
                  <Amount value={totalRevenue} />
                </p>
              </div>
              <div className="w-10 h-10 shrink-0 rounded-lg bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-500">Total Costs</p>
                <p className="text-xl xl:text-2xl font-bold break-words text-red-600 mt-1">
                  <Amount value={totalCosts} />
                </p>
              </div>
              <div className="w-10 h-10 shrink-0 rounded-lg bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-500">Net Profit</p>
                <p className={`text-xl xl:text-2xl font-bold break-words mt-1 ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <Amount value={totalProfit} />
                </p>
              </div>
              <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${totalProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <svg className={`w-5 h-5 ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-500">Avg. Margin</p>
                <p className="text-xl xl:text-2xl font-bold break-words text-[#011c72] mt-1">
                  {avgMargin.toFixed(1)}%
                </p>
              </div>
              <div className="w-10 h-10 shrink-0 rounded-lg bg-[#dde6ff] flex items-center justify-center">
                <svg className="w-5 h-5 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by job order number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
            />
          </div>
          <span className="flex items-center gap-2 text-xs text-gray-500 print:hidden">Amounts <AmountDisplayToggle /></span>
        </div>

        {/* Costing Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading cost data...</p>
            </div>
          ) : filteredCostings.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No costing data found</h3>
              <p className="text-gray-500">Cost data will appear here as job orders are processed.</p>
            </div>
          ) : (
            <Paginated items={filteredCostings} resetKey={searchTerm} label="costings">{rows => {
              // Same figures for the cards and the table
              const figures = rows.map(costing => {
                const totalCost = costing.materialsCost + costing.laborCost + costing.overheadCost;
                return { costing, totalCost, profit: costing.totalAmount - totalCost, margin: calculateProfitMargin(costing.totalAmount, totalCost) };
              });
              const marginBadge = (margin: string | number) => `px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                Number(margin) >= 30 ? 'bg-green-100 text-green-700' : Number(margin) >= 15 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`;
              const extra = (c: typeof rows[number]) => (c.extraMaterialsCost || 0) > 0 && (
                <span className="block text-xs text-red-600">incl. {formatCurrency(c.extraMaterialsCost || 0)} extra</span>
              );
              const variance = (c: typeof rows[number]) => typeof c.variance === 'number' && Math.abs(c.variance) >= 0.005 && (
                <span className={`block text-xs font-normal ${c.variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {c.variance > 0 ? '+' : '−'}{formatCurrency(Math.abs(c.variance))} vs estimate
                </span>
              );
              const th = 'px-4 xl:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
              const td = 'px-4 xl:px-6 py-4 whitespace-nowrap';
              return (<>
            {/* Phones and small tablets: one card per job order, every figure kept */}
            <ul className="md:hidden divide-y divide-gray-200">
              {figures.map(({ costing, totalCost, profit, margin }) => (
                <li key={costing.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/costing/${costing.id}`} className="font-semibold text-[#011c72] break-all">{costing.jobOrderNumber}</Link>
                    <span className={marginBadge(margin)}>{margin}%</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="min-w-0"><dt className="text-xs text-gray-500">Materials</dt><dd className="text-gray-700"><Amount variant="record" value={costing.materialsCost} />{extra(costing)}</dd></div>
                    <div className="min-w-0"><dt className="text-xs text-gray-500">Labor</dt><dd className="text-gray-700"><Amount variant="record" value={costing.laborCost} /></dd></div>
                    <div className="min-w-0"><dt className="text-xs text-gray-500">Other Expenses</dt><dd className="text-gray-700"><Amount variant="record" value={costing.overheadCost} /></dd></div>
                    <div className="min-w-0"><dt className="text-xs text-gray-500">Total Cost</dt><dd className="font-medium text-red-600"><Amount variant="record" value={totalCost} />{variance(costing)}</dd></div>
                    <div className="min-w-0"><dt className="text-xs text-gray-500">Revenue (excl. VAT)</dt><dd className="font-medium text-gray-900"><Amount variant="record" value={costing.totalAmount} /></dd></div>
                    <div className="min-w-0"><dt className="text-xs text-gray-500">Profit</dt><dd className={`font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}><Amount variant="record" value={profit} /></dd></div>
                  </dl>
                  <Link href={`/costing/${costing.id}`}
                    className="mt-3 flex w-full items-center justify-center rounded-lg border border-[#011c72] px-3 py-2 text-sm font-medium text-[#011c72] hover:bg-[#eef1fb]">
                    View Details
                  </Link>
                </li>
              ))}
            </ul>

            {/* Wider screens: the table. It scrolls sideways if it has to, with the
                Actions column pinned to the right so View Details never goes off screen. */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className={th}>Job Order</th>
                    <th className={th}>Materials</th>
                    <th className={th}>Labor</th>
                    <th className={th}>Other Expenses</th>
                    <th className={th}>Total Cost</th>
                    <th className={th}>Revenue <span className="normal-case font-normal">(excl. VAT)</span></th>
                    <th className={th}>Profit</th>
                    <th className={th}>Margin</th>
                    <th className="sticky right-0 z-10 bg-gray-50 px-4 xl:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.15)]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {figures.map(({ costing, totalCost, profit, margin }) => (
                      <tr key={costing.id} className="group hover:bg-gray-50 transition-colors">
                        <td className={td}>
                          <Link href={`/costing/${costing.id}`} className="text-sm font-medium text-[#011c72] hover:underline">{costing.jobOrderNumber}</Link>
                        </td>
                        <td className={`${td} text-sm text-gray-600`}>
                          <Amount variant="record" value={costing.materialsCost} />
                          {extra(costing)}
                        </td>
                        <td className={`${td} text-sm text-gray-600`}>
                          <Amount variant="record" value={costing.laborCost} />
                        </td>
                        <td className={`${td} text-sm text-gray-600`}>
                          <Amount variant="record" value={costing.overheadCost} />
                        </td>
                        <td className={`${td} text-sm font-medium text-red-600`}>
                          <Amount variant="record" value={totalCost} />
                          {variance(costing)}
                        </td>
                        <td className={`${td} text-sm font-medium text-gray-900`}>
                          <Amount variant="record" value={costing.totalAmount} />
                        </td>
                        <td className={td}>
                          <span className={`text-sm font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <Amount variant="record" value={profit} />
                          </span>
                        </td>
                        <td className={td}>
                          <span className={marginBadge(margin)}>{margin}%</span>
                        </td>
                        <td className={`${td} sticky right-0 z-10 bg-white group-hover:bg-gray-50 text-right shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.15)]`}>
                          <Link
                            href={`/costing/${costing.id}`}
                            className="text-[#011c72] hover:underline text-sm font-medium"
                          >
                            View Details
                          </Link>
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>);
            }}</Paginated>
          )}
        </div>

        {/* Cost Breakdown Chart */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Cost Distribution</h3>
            <div className="space-y-4">
              {[
                { label: 'Materials', value: costings.reduce((sum, c) => sum + c.materialsCost, 0), color: 'bg-blue-500', percent: 0 },
                { label: 'Labor', value: costings.reduce((sum, c) => sum + c.laborCost, 0), color: 'bg-[#011c72]', percent: 0 },
                { label: 'Other Expenses', value: costings.reduce((sum, c) => sum + c.overheadCost, 0), color: 'bg-purple-500', percent: 0 },
              ].map((item, index) => {
                const total = costings.reduce((sum, c) => sum + c.materialsCost + c.laborCost + c.overheadCost, 0);
                item.percent = total > 0 ? (item.value / total * 100) : 0;
                return (
                  <div key={index}>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{item.label}</span>
                      <span className="text-sm text-gray-500">
                        {formatCurrency(item.value)} ({item.percent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${item.color} rounded-full transition-all duration-500`}
                        style={{ width: `${item.percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Profitability Insights</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 p-4 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-green-100 flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-800">High Margin Jobs</p>
                    <p className="text-xs text-green-600">Above 30% margin</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-green-800">
                  {costings.filter(c => {
                    return marginOf(c) >= 30;
                  }).length}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 p-4 bg-yellow-50 rounded-lg">
                <div className="flex items-center">
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-yellow-100 flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Medium Margin Jobs</p>
                    <p className="text-xs text-yellow-600">15-30% margin</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-yellow-800">
                  {costings.filter(c => {
                    const margin = marginOf(c);
                    return margin >= 15 && margin < 30;
                  }).length}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 p-4 bg-red-50 rounded-lg">
                <div className="flex items-center">
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-red-100 flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-800">Low Margin Jobs</p>
                    <p className="text-xs text-red-600">Below 15% margin</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-red-800">
                  {costings.filter(c => {
                    return marginOf(c) < 15;
                  }).length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
    </AmountDisplayProvider>
  );
}


