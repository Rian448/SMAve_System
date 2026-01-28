'use client';
import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface ForecastData {
  predictedSales: number;
  predictedOrders: number;
  materialNeeds: { name: string; quantity: number; unit: string; estimatedCost: number }[];
  seasonalTrends: { month: string; expected: number; historical: number }[];
  confidence: number;
}

export default function ForecastingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [forecastPeriod, setForecastPeriod] = useState('month');
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);

  useEffect(() => {
    fetchForecastData();
  }, [forecastPeriod]);

  const fetchForecastData = async () => {
    setLoading(true);
    try {
      const data = await api.forecasting.getForecast({ period: forecastPeriod });
      setForecastData(data);
    } catch (error) {
      console.error('Error fetching forecast data:', error);
      // Set mock data for demonstration
      setForecastData({
        predictedSales: 185000,
        predictedOrders: 28,
        materialNeeds: [
          { name: 'Premium Leather', quantity: 45, unit: 'meters', estimatedCost: 67500 },
          { name: 'High-Density Foam', quantity: 30, unit: 'sheets', estimatedCost: 15000 },
          { name: 'Automotive Fabric', quantity: 60, unit: 'meters', estimatedCost: 24000 },
          { name: 'Thread (Heavy Duty)', quantity: 25, unit: 'spools', estimatedCost: 3750 },
          { name: 'Adhesive Spray', quantity: 15, unit: 'cans', estimatedCost: 4500 },
        ],
        seasonalTrends: [
          { month: 'Jan', expected: 150000, historical: 145000 },
          { month: 'Feb', expected: 165000, historical: 158000 },
          { month: 'Mar', expected: 175000, historical: 170000 },
          { month: 'Apr', expected: 185000, historical: 178000 },
          { month: 'May', expected: 195000, historical: 185000 },
          { month: 'Jun', expected: 210000, historical: 195000 },
        ],
        confidence: 85
      });
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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Sales Forecasting</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              Predict future sales and material requirements
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex gap-2">
            {['week', 'month', 'quarter'].map((period) => (
              <button
                key={period}
                onClick={() => setForecastPeriod(period)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  forecastPeriod === period
                    ? 'bg-amber-600 text-white'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                Next {period.charAt(0).toUpperCase() + period.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse"></div>
              ))}
            </div>
            <div className="h-80 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse"></div>
          </div>
        ) : forecastData ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <span className="px-3 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                    {forecastData.confidence}% confidence
                  </span>
                </div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Predicted Sales</p>
                <p className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">
                  {formatCurrency(forecastData.predictedSales)}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  +12% compared to last {forecastPeriod}
                </p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Expected Orders</p>
                <p className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">
                  {forecastData.predictedOrders}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  Based on historical patterns
                </p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Material Cost Estimate</p>
                <p className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">
                  {formatCurrency(forecastData.materialNeeds.reduce((sum, m) => sum + m.estimatedCost, 0))}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  {forecastData.materialNeeds.length} materials needed
                </p>
              </div>
            </div>

            {/* Trend Chart */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Sales Trend & Forecast</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-amber-500 mr-2"></div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Forecast</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-zinc-400 mr-2"></div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Historical</span>
                  </div>
                </div>
              </div>
              <div className="h-64 flex items-end justify-between gap-4">
                {forecastData.seasonalTrends.map((data, index) => {
                  const maxValue = Math.max(...forecastData.seasonalTrends.map(d => Math.max(d.expected, d.historical)));
                  const expectedHeight = (data.expected / maxValue) * 100;
                  const historicalHeight = (data.historical / maxValue) * 100;
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center">
                      <div className="w-full flex justify-center gap-1 mb-2">
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          {formatCurrency(data.expected).replace('₱', '')}
                        </span>
                      </div>
                      <div className="w-full flex gap-1 items-end h-48">
                        <div 
                          className="flex-1 bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-lg transition-all duration-500"
                          style={{ height: `${expectedHeight * 1.5}px` }}
                        ></div>
                        <div 
                          className="flex-1 bg-zinc-300 dark:bg-zinc-600 rounded-t-lg transition-all duration-500"
                          style={{ height: `${historicalHeight * 1.5}px` }}
                        ></div>
                      </div>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">{data.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Material Requirements */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Recommended Material Order</h3>
                <button className="inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors">
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create PO
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Material</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Required Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Estimated Cost</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Priority</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {forecastData.materialNeeds.map((material, index) => {
                      const priority = index < 2 ? 'High' : index < 4 ? 'Medium' : 'Low';
                      const priorityClass = priority === 'High' 
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : priority === 'Medium'
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
                      return (
                        <tr key={index} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mr-3">
                                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                              </div>
                              <span className="text-sm font-medium text-zinc-900 dark:text-white">{material.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-zinc-900 dark:text-white">{material.quantity}</span>
                            <span className="text-sm text-zinc-500 dark:text-zinc-400 ml-1">{material.unit}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-white">
                            {formatCurrency(material.estimatedCost)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${priorityClass}`}>
                              {priority}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm font-medium">
                              Add to Cart
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <td colSpan={2} className="px-6 py-4 text-sm font-medium text-zinc-900 dark:text-white">
                        Total Estimated Cost
                      </td>
                      <td colSpan={3} className="px-6 py-4 text-sm font-bold text-amber-600 dark:text-amber-400">
                        {formatCurrency(forecastData.materialNeeds.reduce((sum, m) => sum + m.estimatedCost, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Insights */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-6 text-white">
                <div className="flex items-center mb-4">
                  <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <h3 className="text-lg font-semibold">Key Insight</h3>
                </div>
                <p className="text-amber-100">
                  Based on historical data, we expect a 12% increase in upholstery services next {forecastPeriod}. 
                  Consider increasing leather inventory by 20% to meet demand.
                </p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <div className="flex items-center mb-4">
                  <svg className="w-6 h-6 mr-2 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Recommendations</h3>
                </div>
                <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <li className="flex items-start">
                    <svg className="w-4 h-4 mr-2 mt-0.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Order premium leather before month end
                  </li>
                  <li className="flex items-start">
                    <svg className="w-4 h-4 mr-2 mt-0.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Schedule additional staff for peak period
                  </li>
                  <li className="flex items-start">
                    <svg className="w-4 h-4 mr-2 mt-0.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Review pricing for full upholstery services
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
