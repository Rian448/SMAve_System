'use client';
import { formatDate, formatDateTime } from '@/lib/dateUtils';
import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, PaymentRecord, PaymentSummary, PaymentOverride, PaymentSort } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Paginated from '@/components/Paginated';
import Amount, { AmountDisplayProvider, AmountDisplayToggle } from '@/components/Amount';

export default function PaymentsPage() {
  // useSearchParams needs a Suspense boundary for this route to prerender.
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full"></div>
      </div>
    }>
      <PaymentsContent />
    </Suspense>
  );
}

function PaymentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const canOpenJobOrder = can('sales.view');
  // Opened from a job order ("View in Payments"): only that order's payments
  const jobOrderParam = Number(searchParams.get('jobOrderId'));
  const jobOrderId = Number.isInteger(jobOrderParam) && jobOrderParam > 0 ? jobOrderParam : undefined;
  const isAdmin = can('payments.approve_override');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  // Sorting and the date filter are applied by the server; search and method narrow that list here
  const [sort, setSort] = useState<PaymentSort>('latest');
  const [dateMode, setDateMode] = useState<'all' | 'day' | 'range'>('all');
  const [day, setDay] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');

  const rangeInvalid = dateMode === 'range' && !!rangeStart && !!rangeEnd && rangeStart > rangeEnd;
  /** The server query for the current choices; a half-filled range is open on the empty side */
  const query = useMemo((): { sort: PaymentSort; jobOrderId?: number; startDate?: string; endDate?: string } => {
    if (dateMode === 'day') return { sort, jobOrderId, startDate: day || undefined, endDate: day || undefined };
    if (dateMode === 'range' && !rangeInvalid) return { sort, jobOrderId, startDate: rangeStart || undefined, endDate: rangeEnd || undefined };
    return { sort, jobOrderId };
  }, [sort, jobOrderId, dateMode, day, rangeStart, rangeEnd, rangeInvalid]);
  const hasDateFilter = !!(query.startDate || query.endDate);

  // Pending payment overrides awaiting admin review
  const [overrides, setOverrides] = useState<PaymentOverride[]>([]);
  const [overrideBusyId, setOverrideBusyId] = useState<number | null>(null);

  const loadOverrides = async () => {
    try {
      const res = await api.paymentOverrides.list({ status: 'pending' });
      setOverrides(res.data || []);
    } catch {
      setOverrides([]);
    }
  };

  // Only the newest request may fill the list, so a slow earlier one can't overwrite it
  const requestId = useRef(0);
  const loadPayments = useCallback(async () => {
    if (rangeInvalid) return;
    const id = ++requestId.current;
    setListLoading(true);
    try {
      const res = await api.payments.getAll(query);
      if (id !== requestId.current) return;
      setPayments(res.data || []);
      setListError('');
    } catch (err) {
      if (id !== requestId.current) return;
      setListError(err instanceof Error && err.message ? err.message : 'Failed to load payments.');
    } finally {
      if (id === requestId.current) { setListLoading(false); setLoading(false); }
    }
  }, [query, rangeInvalid]);

  // Runs on first load and again whenever the sort or dates change
  useEffect(() => { loadPayments(); }, [loadPayments]);

  const reloadPayments = async () => {
    try {
      const [, summaryRes] = await Promise.all([loadPayments(), api.payments.getSummary()]);
      setSummary(summaryRes.data || null);
    } catch (err) { console.error(err); }
  };

  const reviewOverride = async (id: number, action: 'approve' | 'reject') => {
    setOverrideBusyId(id);
    try {
      if (action === 'approve') await api.paymentOverrides.approve(id);
      else await api.paymentOverrides.reject(id);
      await Promise.all([loadOverrides(), reloadPayments()]);
    } catch (err) {
      console.error(err);
    } finally { setOverrideBusyId(null); }
  };

  useEffect(() => {
    api.payments.getSummary()
      .then(res => setSummary(res.data || null))
      .catch(err => console.error(err));
    loadOverrides();
  }, []);

  const METHOD_LABELS: Record<string, string> = {
    cash: 'Cash',
    adjustment: 'Approved override',
    gcash: 'GCash',
    maya: 'Maya',
    bank_transfer: 'Bank Transfer',
    credit_card: 'Credit Card',
    debit_card: 'Debit Card',
    check: 'Cheque',
  };
  const methodLabel = (method: string) => METHOD_LABELS[method] || method.replace(/_/g, ' ');

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
          <div className="stat-cards mb-8" style={{ '--cols': 2, '--cols-sm': 3, '--cols-lg': 6 } as React.CSSProperties}>
            <div className="bg-white rounded-xl border border-gray-200 p-5 text-center min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Revenue</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 min-w-0"><Amount value={summary.totalRevenue} /></p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 p-5 text-center min-w-0">
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Collected</p>
              <p className="text-xl sm:text-2xl font-bold text-green-700 min-w-0"><Amount value={summary.totalCollected} /></p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-5 text-center min-w-0">
              <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Balance Due</p>
              <p className="text-xl sm:text-2xl font-bold text-red-700 min-w-0"><Amount value={summary.totalBalance} /></p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 p-5 text-center min-w-0">
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Paid</p>
              <p className="text-xl sm:text-2xl font-bold text-green-700 tabular-nums">{summary.paidCount.toLocaleString('en-PH')}</p>
            </div>
            <div className="bg-yellow-50 rounded-xl border border-yellow-100 p-5 text-center min-w-0">
              <p className="text-xs font-medium text-yellow-600 uppercase tracking-wide mb-1">Partial</p>
              <p className="text-xl sm:text-2xl font-bold text-yellow-700 tabular-nums">{summary.partialCount.toLocaleString('en-PH')}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-5 text-center min-w-0">
              <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Unpaid</p>
              <p className="text-xl sm:text-2xl font-bold text-red-700 tabular-nums">{summary.unpaidCount.toLocaleString('en-PH')}</p>
            </div>
          </div>
        )}

        {/* Pending payment overrides — admin approval queue */}
        {isAdmin && overrides.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-200 mb-6 overflow-hidden">
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
              </svg>
              <h2 className="text-sm font-bold text-amber-800">Payment Overrides Awaiting Your Approval ({overrides.length})</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {overrides.map(o => (
                <div key={o.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-gray-900">
                      {o.jobOrderRef || `Order #${o.jobOrderId}`}
                      <span className="text-gray-500 font-normal"> · {o.customerName || '—'}</span>
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Requested by <span className="font-medium">{o.requestedByName || '—'}</span> · {formatDateTime(o.createdAt)}
                    </p>
                    <div className="text-xs text-gray-700 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                      {o.newPaymentStatus && (
                        <span>Status: <span className="line-through text-gray-400">{o.currentPaymentStatus}</span> → <span className="font-semibold text-amber-700">{o.newPaymentStatus}</span></span>
                      )}
                      {o.newBalance != null && (
                        <span>Balance: <Amount variant="record" value={o.currentBalance || 0} className="line-through text-gray-400" /> → <Amount variant="record" value={o.newBalance} className="font-semibold text-amber-700" /></span>
                      )}
                    </div>
                    {o.reason && <p className="text-xs text-gray-500 mt-1 italic">“{o.reason}”</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => reviewOverride(o.id, 'approve')} disabled={overrideBusyId === o.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                      {overrideBusyId === o.id ? '…' : 'Approve'}
                    </button>
                    <button onClick={() => reviewOverride(o.id, 'reject')} disabled={overrideBusyId === o.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
                      Reject
                    </button>
                  </div>
                </div>
              ))}
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
            {/* Filter only: these are no longer accepted, but past payments may use them */}
            <optgroup label="Older records">
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="maya">Maya</option>
              <option value="check">Cheque</option>
              <option value="adjustment">Approved override</option>
            </optgroup>
          </select>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as PaymentSort)}
            aria-label="Sort payments"
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
          >
            <option value="latest">Latest to Oldest</option>
            <option value="oldest">Oldest to Latest</option>
            <option value="amount_desc">Highest to Lowest Amount</option>
            <option value="amount_asc">Lowest to Highest Amount</option>
          </select>
        </div>

        {jobOrderId && (
          <div className="mb-5 flex flex-wrap items-center gap-3 p-3 rounded-xl bg-[#eef1fb] border border-[#c7d2f5] text-sm">
            <span className="text-[#011c72]">
              Showing payments for job order <strong>{payments[0]?.jobOrderRef || `#${jobOrderId}`}</strong>
            </span>
            {canOpenJobOrder && (
              <Link href={`/sales/${jobOrderId}`} className="font-medium text-[#011c72] underline">Open job order</Link>
            )}
            <Link href="/payments" className="sm:ml-auto font-medium text-gray-600 hover:text-gray-900">Show all payments ×</Link>
          </div>
        )}

        {/* Date filter */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 -mt-3 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="inline-flex p-1 bg-gray-100 rounded-lg text-sm self-start" role="tablist" aria-label="Date filter">
            {([['all', 'All dates'], ['day', 'Specific date'], ['range', 'Date range']] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={dateMode === id} onClick={() => setDateMode(id)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${dateMode === id ? 'bg-white shadow-sm text-[#011c72]' : 'text-gray-600 hover:text-gray-900'}`}>
                {label}
              </button>
            ))}
          </div>
          {dateMode === 'day' && (
            <input type="date" value={day} onChange={e => setDay(e.target.value)} aria-label="Payment date"
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
          )}
          {dateMode === 'range' && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={rangeStart} max={rangeEnd || undefined} onChange={e => setRangeStart(e.target.value)} aria-label="From date"
                className={`px-3 py-2 rounded-lg border bg-white text-sm text-gray-900 ${rangeInvalid ? 'border-red-400' : 'border-gray-200'}`} />
              <span className="text-sm text-gray-500">to</span>
              <input type="date" value={rangeEnd} min={rangeStart || undefined} onChange={e => setRangeEnd(e.target.value)} aria-label="To date"
                className={`px-3 py-2 rounded-lg border bg-white text-sm text-gray-900 ${rangeInvalid ? 'border-red-400' : 'border-gray-200'}`} />
            </div>
          )}
          {rangeInvalid && <p className="text-sm text-red-600">The start date must be on or before the end date.</p>}
          {hasDateFilter && (
            <button type="button" onClick={() => { setDateMode('all'); setDay(''); setRangeStart(''); setRangeEnd(''); }}
              className="text-sm font-medium text-[#011c72] hover:underline sm:ml-auto">
              Clear dates
            </button>
          )}
        </div>

        {/* Payment Records Table */}
        <AmountDisplayProvider storageKey="payments">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">
              Payment Records
              <span className="ml-2 text-sm font-normal text-gray-400">({filteredPayments.length.toLocaleString('en-PH')})</span>
            </h2>
            <div className="flex items-center gap-3">
              {listLoading && <div className="w-4 h-4 border-2 border-[#011c72] border-t-transparent rounded-full animate-spin" aria-label="Updating" />}
              <AmountDisplayToggle />
            </div>
          </div>

          {listError ? (
            <div className="py-12 text-center">
              <p className="text-sm text-red-600 mb-2">{listError}</p>
              <button type="button" onClick={() => loadPayments()} className="text-sm font-medium text-[#011c72]">Try again</button>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">{hasDateFilter || search || methodFilter !== 'all' ? 'No payments match these filters' : 'No payment records found'}</p>
            </div>
          ) : (
            <Paginated items={filteredPayments} resetKey={[search, methodFilter, sort, jobOrderId, query.startDate, query.endDate]} label="payments">{rows => (
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
                  {rows.map(record => (
                    <tr
                      key={record.id}
                      className={`hover:bg-gray-50 transition-colors ${canOpenJobOrder ? 'cursor-pointer' : ''}`}
                      onClick={canOpenJobOrder ? () => router.push(`/sales/${record.jobOrderId}`) : undefined}
                    >
                      <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(record.createdAt)}
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
                        <Amount variant="record" value={record.amount} />
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
                      <Amount variant="record" value={filteredPayments.reduce((s, r) => s + r.amount, 0)} />
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            )}</Paginated>
          )}
        </div>
        </AmountDisplayProvider>
      </main>
    </div>
  );
}
