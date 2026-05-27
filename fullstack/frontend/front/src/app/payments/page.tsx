'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, PaymentRecord, PaymentSummary } from '@/lib/api';

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      api.payments.getAll(),
      api.payments.getSummary(),
    ]).then(([paymentsRes, summaryRes]) => {
      setPayments(paymentsRes.data || []);
      setSummary(summaryRes.data || null);
    }).catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(amount || 0);

  const methodLabel = (method: string) => method.replace(/_/g, ' ');

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const q = search.toLowerCase();
      const matchesSearch = !q
        || (p.jobOrderRef || '').toLowerCase().includes(q)
        || (p.customerName || '').toLowerCase().includes(q)
        || (p.referenceNumber || '').toLowerCase().includes(q)
        || (p.recordedByName || '').toLowerCase().includes(q);
      const matchesMethod = methodFilter === 'all' || p.paymentMethod === methodFilter;
      return matchesSearch && matchesMethod;
    });
  }, [payments, search, methodFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-500 mt-1">Track all payment records across job orders</p>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            <div className="col-span-2 lg:col-span-1 xl:col-span-2 bg-white rounded-xl border border-gray-200 p-5 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.totalRevenue)}</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 p-5 text-center">
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Collected</p>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(summary.totalCollected)}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-5 text-center">
              <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Balance Due</p>
              <p className="text-2xl font-bold text-red-700">{formatCurrency(summary.totalBalance)}</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 p-4 text-center">
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Paid</p>
              <p className="text-2xl font-bold text-green-700">{summary.paidCount}</p>
            </div>
            <div className="bg-yellow-50 rounded-xl border border-yellow-100 p-4 text-center">
              <p className="text-xs font-medium text-yellow-600 uppercase tracking-wide mb-1">Partial</p>
              <p className="text-2xl font-bold text-yellow-700">{summary.partialCount}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-4 text-center">
              <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Unpaid</p>
              <p className="text-2xl font-bold text-red-700">{summary.unpaidCount}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by order ref, customer, reference no..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
            />
          </div>
          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
          >
            <option value="all">All Methods</option>
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="check">Check</option>
            <option value="credit_card">Credit Card</option>
          </select>
        </div>

        {/* Payment Records Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              Payment Records
              <span className="ml-2 text-sm font-normal text-gray-400">({filteredPayments.length})</span>
            </h2>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">No payment records found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Order</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPayments.map(record => (
                    <tr
                      key={record.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/sales/${record.jobOrderId}`)}
                    >
                      <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                        {new Date(record.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-medium text-[#011c72]">
                          {record.jobOrderRef ? `#${record.jobOrderRef}` : `ID ${record.jobOrderId}`}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-700">
                        {record.customerName || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-green-700 text-right whitespace-nowrap">
                        {formatCurrency(record.amount)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                          {methodLabel(record.paymentMethod)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">
                        {record.referenceNumber || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">
                        {record.recordedByName || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-5 py-3 text-right text-sm font-semibold text-gray-600">
                      Total Collected ({filteredPayments.length} record{filteredPayments.length !== 1 ? 's' : ''})
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-green-700 whitespace-nowrap">
                      {formatCurrency(filteredPayments.reduce((s, r) => s + r.amount, 0))}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
