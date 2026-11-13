'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  api, OwnerSummary, ProfitAndLoss, OwnerJobCosting, JobCostingRow, OwnerReceivables, ReceivableInvoice,
  OwnerInventory, MonthlyFinancials, MethodAmount, PAYMENT_METHOD_LABELS,
} from '@/lib/api';
import { formatDate, formatDateTime, manilaDateString } from '@/lib/dateUtils';
import ExpenseTracker from '@/components/ExpenseTracker';
import Paginated from '@/components/Paginated';
import Amount, { AmountDisplayProvider, AmountDisplayToggle } from '@/components/Amount';
import { compactPeso, exactNumber } from '@/lib/format';

// Chart colors: categorical slots 1 and 2 of the validated palette
// (blue = sales / money in, orange = expenses / money out). Light mode only, like the app.
const SALES_COLOR = '#2a78d6';
const EXPENSE_COLOR = '#eb6834';

const peso = (n: number) => `₱${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Chart axis ticks only: one decimal is enough for evenly spaced marks */
const pesoTick = (n: number) => `₱${new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An amount in a table row */
const Money = ({ v }: { v: number }) => <Amount variant="record" value={v} />;

type Tab = 'overview' | 'costing' | 'pnl' | 'receivables' | 'expenses' | 'inventory';
const TABS: { id: Tab; name: string }[] = [
  { id: 'overview', name: 'Overview' },
  { id: 'costing', name: 'Job Costing' },
  { id: 'pnl', name: 'Profit & Loss' },
  { id: 'receivables', name: 'Receivables' },
  { id: 'expenses', name: 'Expenses' },
  { id: 'inventory', name: 'Inventory & COGS' },
];

/** The date range and branch every tab shows (Philippine dates; '' = all branches) */
type Filters = { start: string; end: string; branchId: number | '' };
type BranchOption = { id: number; name: string };
// "All time" starts here, like the main Dashboard
const ALL_TIME_START = '2000-01-01';
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function OwnerPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}>
      <OwnerDashboard />
    </Suspense>
  );
}

function OwnerDashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'overview') as Tab;
  const today = manilaDateString();
  // Filters live in the address, so switching tabs and refreshing the page keep them
  const from = params.get('from');
  const to = params.get('to');
  const filters: Filters = {
    start: isDate(from) ? from : `${today.slice(0, 4)}-01-01`,
    end: isDate(to) ? to : today,
    branchId: Number(params.get('branch')) || '',
  };
  const go = (t: Tab, f: Filters) => {
    const q = new URLSearchParams();
    if (t !== 'overview') q.set('tab', t);
    q.set('from', f.start);
    q.set('to', f.end);
    if (f.branchId) q.set('branch', String(f.branchId));
    router.replace(`/owner?${q.toString()}`);
  };
  const [branches, setBranches] = useState<BranchOption[]>([]);
  useEffect(() => { api.settings.getBranches().then(r => setBranches(r.data || [])).catch(() => {}); }, []);

  return (
    <AmountDisplayProvider storageKey="owner">
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Owner Dashboard</h1>
          <p className="text-gray-500 mt-1">How the business is doing, at a glance. Sales and profit exclude VAT, which is collected for the government.</p>
        </div>
        <div className="mb-6 border-b border-gray-200 overflow-x-auto">
          <nav className="flex gap-1 -mb-px min-w-max">
            {TABS.map(t => (
              <button key={t.id} type="button" onClick={() => go(t.id, filters)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id ? 'border-[#011c72] text-[#011c72]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t.name}
              </button>
            ))}
          </nav>
        </div>
        {/* Expenses has its own filters; receivables are what is owed today, so only the branch applies */}
        {tab !== 'expenses' && (
          <FilterBar filters={filters} branches={branches} onChange={f => go(tab, f)} dates={tab !== 'receivables'} />
        )}
        {tab === 'overview' && <Overview filters={filters} onOpen={t => go(t, filters)} />}
        {tab === 'costing' && <JobCosting filters={filters} />}
        {tab === 'pnl' && <ProfitLoss filters={filters} />}
        {tab === 'receivables' && <Receivables filters={filters} />}
        {/* Opens on the Overview's dates, so its total matches the "paid out" figure there */}
        {tab === 'expenses' && <ExpenseTracker showPaymentBreakdown initialStart={filters.start} initialEnd={filters.end} />}
        {tab === 'inventory' && <InventoryOversight filters={filters} />}
      </main>
    </div>
    </AmountDisplayProvider>
  );
}

// ─────────────────────────── shared bits ───────────────────────────

function useLoad<T>(fn: () => Promise<{ data?: T }>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    fn().then(r => { if (live) setData(r.data ?? null); })
      .catch(err => { if (live) { setData(null); setError(err instanceof Error ? err.message : 'Could not load'); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading };
}

/** The API query for the current filters */
const query = (f: Filters) => ({ startDate: f.start, endDate: f.end, branchId: f.branchId });

function State({ loading, error }: { loading: boolean; error: string }) {
  if (error) return <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (loading) return <p className="py-16 text-center text-sm text-gray-400">Loading…</p>;
  return null;
}

function Tile({ label, value, sub, tone, large, onOpen, openLabel }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad';
  /** The headline figures at the top of the Overview: a little taller, bigger numbers */
  large?: boolean;
  /** Clicking the card opens the details (the eye button beside the amount still just toggles it) */
  onOpen?: () => void;
  openLabel?: string;
}) {
  return (
    <div onClick={onOpen}
      className={`bg-white rounded-xl border border-gray-200 min-w-0 ${large ? 'p-6' : 'p-5'} ${
        onOpen ? 'cursor-pointer hover:border-[#011c72] hover:shadow-sm transition' : ''}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`font-bold text-gray-900 min-w-0 tabular-nums ${large ? 'mt-2.5 text-2xl sm:text-[1.75rem] leading-tight' : 'mt-2 text-xl sm:text-2xl'}`}>{value}</p>
      {tone && (
        <p className={`mt-1 text-xs font-medium ${tone === 'good' ? 'text-green-700' : 'text-red-700'}`}>
          {tone === 'good' ? '▲ Making money' : '▼ Losing money'}
        </p>
      )}
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
      {onOpen && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="mt-2 text-xs font-medium text-[#011c72] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#011c72] rounded">
          {openLabel || 'View details'} →
        </button>
      )}
    </div>
  );
}

/** YYYY-MM-DD shifted by a number of days */
function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The same quick ranges as the main Dashboard, plus last year */
function presetRanges(today: string): [string, string, string][] {
  const year = Number(today.slice(0, 4));
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return [
    ['Today', today, today],
    ['This week', addDays(today, -weekday), today],
    ['This month', `${today.slice(0, 7)}-01`, today],
    ['This year', `${year}-01-01`, today],
    ['Last year', `${year - 1}-01-01`, `${year - 1}-12-31`],
    ['All time', ALL_TIME_START, today],
  ];
}

function FilterBar({ filters, branches, onChange, dates }: {
  filters: Filters; branches: BranchOption[]; onChange: (f: Filters) => void; dates: boolean;
}) {
  const today = manilaDateString();
  const { start, end, branchId } = filters;
  const input = 'px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent';
  const branchName = branches.find(b => b.id === branchId)?.name;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <div className="flex flex-wrap items-end gap-3">
        {dates && (
          <>
            <label className="text-xs text-gray-500">From
              <input type="date" value={start} max={end}
                onChange={e => { if (isDate(e.target.value)) onChange({ ...filters, start: e.target.value }); }}
                className={`${input} mt-1 block`} />
            </label>
            <label className="text-xs text-gray-500">To
              <input type="date" value={end} min={start} max={today}
                onChange={e => { if (isDate(e.target.value)) onChange({ ...filters, end: e.target.value }); }}
                className={`${input} mt-1 block`} />
            </label>
          </>
        )}
        <label className="text-xs text-gray-500">Branch
          <select value={branchId} onChange={e => onChange({ ...filters, branchId: e.target.value ? Number(e.target.value) : '' })}
            className={`${input} mt-1 block`}>
            <option value="">All branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </div>
      {dates && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {presetRanges(today).map(([label, s, e]) => (
            <button key={label} type="button" onClick={() => onChange({ ...filters, start: s, end: e })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${start === s && end === e
                ? 'border-[#011c72] bg-[#eef1fb] text-[#011c72]' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">
        Showing {dates ? (start === ALL_TIME_START ? `everything up to ${formatDate(end)}` : `${formatDate(start)} – ${formatDate(end)}`) : 'what is owed today'}
        {' · '}{branchId ? (branchName || 'one branch') : 'all branches'}
      </p>
      <p className="mt-2 flex items-center gap-2 text-xs text-gray-500">Amounts in tables <AmountDisplayToggle /></p>
    </div>
  );
}

/** Customer payments split into the VAT owed to the government and the sales the business keeps */
function VatBreakdown({ grossReceipts, vat, sales, compact }: {
  grossReceipts: number; vat: number; sales: number;
  /** Smaller version for the bottom of the Overview (the P&L keeps the full one) */
  compact?: boolean;
}) {
  const amount = compact ? 'text-base' : 'text-xl';
  const cell = compact ? 'px-3 py-2' : 'p-3';
  return (
    <div className={`rounded-xl border border-amber-300 bg-amber-50 ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={`font-semibold text-amber-900 ${compact ? 'text-sm' : 'text-base'}`}>VAT is not income</h2>
        <p className={`text-amber-800 ${compact ? 'text-[11px]' : 'text-xs'}`}>Customer prices include VAT. It is collected for the government (BIR), so it is left out of sales and profit.</p>
      </div>
      <div className={`grid grid-cols-1 sm:grid-cols-3 ${compact ? 'mt-3 gap-2' : 'mt-4 gap-3'}`}>
        <div className={`rounded-lg bg-white/70 ${cell}`}>
          <p className="text-xs text-gray-600">Customers paid (incl. VAT)</p>
          <p className={`mt-0.5 font-semibold text-gray-900 ${amount}`}><Amount value={grossReceipts} /></p>
        </div>
        <div className={`rounded-lg bg-white ring-2 ring-amber-400 ${cell}`}>
          <p className="text-xs font-medium text-amber-900">− VAT collected (owed to the government)</p>
          <p className={`mt-0.5 font-bold text-amber-900 ${amount}`}><Amount value={vat} /></p>
        </div>
        <div className={`rounded-lg bg-white/70 ${cell}`}>
          <p className="text-xs text-gray-600">= Sales (excl. VAT)</p>
          <p className={`mt-0.5 font-semibold text-gray-900 ${amount}`}><Amount value={sales} /></p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 1. Overview ───────────────────────────

function Overview({ filters, onOpen }: { filters: Filters; onOpen: (t: Tab) => void }) {
  const { data, error, loading } = useLoad<OwnerSummary>(
    () => api.owner.summary(query(filters)), [filters.start, filters.end, filters.branchId]);
  if (!data || loading) return <State loading={loading} error={error} />;
  const { totals } = data;
  const counts = `${totals.orderCounts.jobOrders} job orders · ${totals.orderCounts.premadeOrders} premade sales`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile large label="Sales (excl. VAT)" value={<Amount value={totals.sales} />} sub={counts} />
        {/* Cost (what Net income uses); "paid out" is every expense entry, supplier payments included */}
        <Tile large label="Expenses" value={<Amount value={totals.totalExpenses} />}
          sub={<>Cost of goods sold + operating expenses<br />All expenses paid out: {peso(data.cashflowByMethod.totalOut)}</>}
          onOpen={() => onOpen('expenses')} openLabel="View expenses" />
        <Tile large label="Net income" value={<Amount value={totals.netIncome} />} tone={totals.netIncome >= 0 ? 'good' : 'bad'} />
        <Tile large label="Profit margin" value={`${totals.profitMargin.toFixed(1)}%`} sub="Net income ÷ sales" />
      </div>

      {/* A box with its own button: the amount's eye button can't sit inside another button */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Accounts Receivable</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-gray-900 tabular-nums"><Amount value={data.receivables} /></p>
          <p className="mt-0.5 text-xs text-gray-500">Still owed by customers as of today · {filters.branchId ? 'this branch' : 'all branches'}</p>
        </div>
        <button type="button" onClick={() => onOpen('receivables')}
          className="text-sm font-medium text-[#011c72] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#011c72] rounded">
          View receivables →
        </button>
      </div>

      <CashflowChart monthly={data.monthly} start={data.period.startDate} end={data.period.endDate} />

      {/* Money paid out by payment method (the Expense Log) is on the Expenses tab */}
      <MethodBars title="Money received by mode of payment" rows={data.cashflowByMethod.in}
        total={data.cashflowByMethod.totalIn} color={SALES_COLOR} empty="No payments received in this period." />

      <VatBreakdown compact grossReceipts={totals.grossReceipts} vat={totals.vatCollected} sales={totals.sales} />
    </div>
  );
}

/** Every YYYY-MM from the start date's month to the end date's month */
function monthKeys(start: string, end: string) {
  const keys: string[] = [];
  let y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7));
  const ey = Number(end.slice(0, 4)), em = Number(end.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return keys;
}

/** Sales vs. expenses per month of the period: grouped bars, one y-axis, hover tooltip, table view. */
function CashflowChart({ monthly, start, end }: { monthly: MonthlyFinancials[]; start: string; end: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const months = useMemo(() => {
    const byKey = new Map(monthly.map(m => [m.month, m]));
    let keys = monthKeys(start, end);
    // A long range ("All time") starts at the first month with any figures
    if (keys.length > 12) {
      const first = keys.findIndex(k => byKey.has(k));
      keys = first === -1 ? keys.slice(-12) : keys.slice(Math.min(first, keys.length - 12));
    }
    const multiYear = keys.length > 0 && keys[0].slice(0, 4) !== keys[keys.length - 1].slice(0, 4);
    return keys.map(key => {
      const m = byKey.get(key);
      const name = MONTHS[Number(key.slice(5)) - 1];
      return {
        key, label: multiYear ? `${name} '${key.slice(2, 4)}` : name, full: `${name} ${key.slice(0, 4)}`,
        sales: m?.sales ?? 0, expenses: m?.expenses ?? 0, netIncome: m?.netIncome ?? 0,
      };
    });
  }, [monthly, start, end]);
  const max = Math.max(1, ...months.flatMap(m => [m.sales, m.expenses]));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map(f => f * max);
  // Too many months to name every one under the bars
  const labelEvery = Math.ceil(months.length / 12);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Cashflow overview</h2>
          <p className="text-xs text-gray-500">Sales vs. expenses each month (expenses = cost of goods sold + operating expenses)</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: SALES_COLOR }} />Sales</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: EXPENSE_COLOR }} />Expenses</span>
          <button type="button" onClick={() => setAsTable(v => !v)} className="text-[#011c72] font-medium hover:underline">
            {asTable ? 'Show chart' : 'Show table'}
          </button>
        </div>
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-4">Month</th><th className="py-2 pr-4 text-right">Sales</th>
              <th className="py-2 pr-4 text-right">Expenses</th><th className="py-2 text-right">Net income</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {months.map(m => (
                <tr key={m.key}>
                  <td className="py-2 pr-4 text-gray-700">{m.full}</td>
                  <td className="py-2 pr-4 text-right text-gray-900"><Money v={m.sales} /></td>
                  <td className="py-2 pr-4 text-right text-gray-900"><Money v={m.expenses} /></td>
                  <td className={`py-2 text-right font-medium ${m.netIncome < 0 ? 'text-red-700' : 'text-gray-900'}`}><Money v={m.netIncome} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2">
          {/* y-axis */}
          <div className="relative w-12 h-56 shrink-0 text-[10px] text-gray-400">
            {ticks.map((t, i) => (
              <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>{pesoTick(t)}</span>
            ))}
          </div>
          <div className="relative flex-1 h-56">
            {ticks.map((_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end">
              {months.map((m, i) => (
                <div key={m.key} className="relative flex-1 h-full flex items-end justify-center gap-[2px] cursor-default"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <div className="w-[34%] max-w-6 rounded-t" style={{ height: `${(m.sales / max) * 100}%`, minHeight: m.sales > 0 ? 2 : 0, background: SALES_COLOR }} />
                  <div className="w-[34%] max-w-6 rounded-t" style={{ height: `${(m.expenses / max) * 100}%`, minHeight: m.expenses > 0 ? 2 : 0, background: EXPENSE_COLOR }} />
                  {hover === i && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 w-44 rounded-lg bg-gray-900 text-white text-xs p-2.5 shadow-lg pointer-events-none">
                      <p className="font-semibold mb-1">{m.full}</p>
                      <p className="flex justify-between"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: SALES_COLOR }} />Sales</span><Money v={m.sales} /></p>
                      <p className="flex justify-between"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: EXPENSE_COLOR }} />Expenses</span><Money v={m.expenses} /></p>
                      <p className="flex justify-between border-t border-white/20 mt-1 pt-1"><span>Net</span><Money v={m.netIncome} /></p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {!asTable && (
        <div className="flex gap-2 mt-1.5">
          <div className="w-12 shrink-0" />
          <div className="flex-1 flex text-[11px] text-gray-500">
            {months.map((m, i) => <span key={m.key} className="flex-1 text-center">{i % labelEvery === 0 ? m.label : ''}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Amount per mode of payment: one measure, so one hue; values labeled directly. */
function MethodBars({ title, subtitle, rows, total, color, empty }: {
  title: string; subtitle?: string; rows: MethodAmount[]; total: number; color: string; empty: string;
}) {
  const max = Math.max(1, ...rows.map(r => r.amount));
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-sm font-semibold text-gray-900 shrink-0">{peso(total)}</span>
      </div>
      {rows.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">{empty}</p> : (
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.method} title={`${PAYMENT_METHOD_LABELS[r.method] || r.method}: ${peso(r.amount)}`}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-700">{PAYMENT_METHOD_LABELS[r.method] || r.method}</span>
                <span className="font-medium text-gray-900">{peso(r.amount)} <span className="text-gray-400 font-normal">· {total ? Math.round(r.amount / total * 100) : 0}%</span></span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div className="h-full rounded-full" style={{ width: `${(r.amount / max) * 100}%`, background: color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────── 2. Job costing ───────────────────────────

function JobCosting({ filters }: { filters: Filters }) {
  const { data, error, loading } = useLoad<OwnerJobCosting>(
    () => api.owner.jobCosting(query(filters)), [filters.start, filters.end, filters.branchId]);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Every job order finished in this period: <b>Selling price (excl. VAT) − Materials − Direct labor − Other job costs = Gross margin</b>.
        The least profitable jobs are listed first. Click a job for its breakdown.
      </p>
      {!data || loading ? <State loading={loading} error={error} /> : (
        <>
          <div className="stat-cards mb-5" style={{ '--cols': 2, '--cols-sm': 3, '--cols-lg': 5 } as React.CSSProperties}>
            <Tile label="Selling price (excl. VAT)" value={<Amount value={data.totals.sellingPrice} />}
              sub={data.totals.vat ? `VAT of ${peso(data.totals.vat)} left out` : undefined} />
            <Tile label="Materials" value={<Amount value={data.totals.materials} />} />
            <Tile label="Direct labor" value={<Amount value={data.totals.labor} />} />
            <Tile label="Other job costs" value={<Amount value={data.totals.otherCosts} />} />
            <Tile label="Gross margin" value={<Amount value={data.totals.grossMargin} />} sub={`${data.totals.marginPercent.toFixed(1)}% of selling price`} />
          </div>
          {data.jobs.length === 0 ? (
            <p className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">No finished job orders in this period.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Paginated items={data.jobs} resetKey={[filters.start, filters.end, filters.branchId]} label="job orders">{rows => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2.5">Job order</th><th className="px-4 py-2.5">Finished</th>
                  <th className="px-4 py-2.5 text-right">Selling price</th><th className="px-4 py-2.5 text-right">Materials</th>
                  <th className="px-4 py-2.5 text-right">Labor</th><th className="px-4 py-2.5 text-right">Other</th>
                  <th className="px-4 py-2.5 text-right">Gross margin</th><th className="px-4 py-2.5 text-right">Margin</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(j => (
                    <JobRow key={j.id} job={j} open={open === j.id} onToggle={() => setOpen(open === j.id ? null : j.id)} />
                  ))}
                </tbody>
              </table>
            </div>
            )}</Paginated>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function JobRow({ job, open, onToggle }: { job: JobCostingRow; open: boolean; onToggle: () => void }) {
  const losing = job.grossMargin < 0;
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-gray-50">
        <td className="px-4 py-2.5">
          <p className="font-medium text-gray-900">{job.jobOrderId}</p>
          <p className="text-xs text-gray-500">{job.customerName}{job.branchName ? ` · ${job.branchName}` : ''}</p>
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{formatDate(job.finishedOn)}</td>
        <td className="px-4 py-2.5 text-right text-gray-900"><Money v={job.sellingPrice} /></td>
        <td className="px-4 py-2.5 text-right text-gray-700"><Money v={job.materials} /></td>
        <td className="px-4 py-2.5 text-right text-gray-700"><Money v={job.labor} /></td>
        <td className="px-4 py-2.5 text-right text-gray-700"><Money v={job.otherCosts} /></td>
        <td className={`px-4 py-2.5 text-right font-semibold ${losing ? 'text-red-700' : 'text-gray-900'}`}><Money v={job.grossMargin} /></td>
        <td className="px-4 py-2.5 text-right whitespace-nowrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${losing ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {losing ? '▼ ' : '▲ '}{job.marginPercent.toFixed(1)}%
          </span>
        </td>
      </tr>
      {open && (
        <tr className="bg-gray-50">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="text-sm space-y-1 max-w-sm">
                <p className="font-semibold text-gray-900 mb-1">{job.description || 'Job'}</p>
                <Line label="Customer paid (incl. VAT)" value={peso(job.customerPrice)} muted />
                <Line label="Less VAT (for the government)" value={`− ${peso(job.vat)}`} muted />
                <Line label="Selling price" value={peso(job.sellingPrice)} strong />
                <Line label="Materials (COGS)" value={`− ${peso(job.materials)}`} />
                <Line label="Direct labor" value={`− ${peso(job.labor)}`} />
                <Line label="Other job costs" value={`− ${peso(job.otherCosts)}`} />
                <Line label="Gross margin" value={`${peso(job.grossMargin)} (${job.marginPercent.toFixed(1)}%)`} strong />
              </div>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-1.5 pr-3">Line</th><th className="py-1.5 pr-3">Type</th>
                  <th className="py-1.5 pr-3 text-right">Qty</th><th className="py-1.5 text-right">Cost</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {job.lines.length === 0 ? (
                    <tr><td colSpan={4} className="py-3 text-gray-400">No cost lines recorded on this order.</td></tr>
                  ) : job.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3 text-gray-800">{l.name || '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-500 capitalize">{l.category === 'expense' ? 'other' : l.category}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-700">{l.quantity}</td>
                      <td className="py-1.5 text-right text-gray-900">{peso(l.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <p className={`flex justify-between gap-6 ${strong ? 'font-semibold text-gray-900 border-t border-gray-200 pt-1' : muted ? 'text-gray-500' : 'text-gray-700'}`}>
      <span>{label}</span><span>{value}</span>
    </p>
  );
}

// ─────────────────────────── 3. Profit & loss ───────────────────────────

function ProfitLoss({ filters }: { filters: Filters }) {
  const { data, error, loading } = useLoad<ProfitAndLoss>(
    () => api.owner.pnl(query(filters)), [filters.start, filters.end, filters.branchId]);

  return (
    <div>
      {!data || loading ? <State loading={loading} error={error} /> : (
        <div className="space-y-5">
        <VatBreakdown grossReceipts={data.grossReceipts} vat={data.vatCollected} sales={data.sales} />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5 text-sm space-y-1.5">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Profit and loss statement</h2>
            <Line label="Customers paid (incl. VAT)" value={peso(data.grossReceipts)} muted />
            <p className="flex justify-between gap-6 rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-900">
              <span>Less: VAT collected (owed to the government)</span><span>− {peso(data.vatCollected)}</span>
            </p>
            <Line label="Job order sales (excl. VAT)" value={peso(data.jobSales)} />
            <Line label="Premade product sales (excl. VAT)" value={peso(data.premadeSales)} />
            <Line label="Total sales" value={peso(data.sales)} strong />
            <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Cost of goods sold</p>
            <Line label="Materials" value={peso(data.cogs.materials)} />
            <Line label="Direct labor" value={peso(data.cogs.labor)} />
            <Line label="Other job costs" value={peso(data.cogs.otherJobCosts)} />
            <Line label="Premade products sold (production cost)" value={peso(data.cogs.premadeProducts)} />
            <Line label="Total cost of goods sold" value={peso(data.cogs.total)} strong />
            <Line label="Gross profit" value={peso(data.grossProfit)} strong />
            <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Operating expenses</p>
            {data.operatingExpenses.byCategory.length === 0
              ? <p className="text-gray-400">No expenses logged in this period.</p>
              : data.operatingExpenses.byCategory.map(c => <Line key={c.category} label={c.category} value={peso(c.amount)} />)}
            <Line label="Total operating expenses" value={peso(data.operatingExpenses.total)} strong />
            <p className={`flex justify-between gap-6 text-base font-bold border-t-2 border-gray-300 pt-2 mt-2 ${data.netIncome < 0 ? 'text-red-700' : 'text-gray-900'}`}>
              <span>Net income</span><span>{peso(data.netIncome)} ({data.profitMargin.toFixed(1)}%)</span>
            </p>
            <p className="pt-2 text-xs text-gray-500">
              {data.orderCounts.jobOrders} job orders and {data.orderCounts.premadeOrders} premade orders finished in this period.
            </p>
          </div>
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">By month</h2>
            {data.monthly.length === 0 ? <p className="text-sm text-gray-400">Nothing in this period.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3">Month</th><th className="py-2 pr-3 text-right">Sales</th>
                  <th className="py-2 pr-3 text-right">Expenses</th><th className="py-2 text-right">Net</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {data.monthly.map(m => (
                    <tr key={m.month}>
                      <td className="py-2 pr-3 text-gray-700">{MONTHS[Number(m.month.slice(5)) - 1]} {m.month.slice(0, 4)}</td>
                      <td className="py-2 pr-3 text-right"><Money v={m.sales} /></td>
                      <td className="py-2 pr-3 text-right"><Money v={m.expenses} /></td>
                      <td className={`py-2 text-right font-medium ${m.netIncome < 0 ? 'text-red-700' : 'text-gray-900'}`}><Money v={m.netIncome} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── 4. Receivables ───────────────────────────

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-green-50 text-green-700', partial: 'bg-yellow-50 text-yellow-800', unpaid: 'bg-red-50 text-red-700',
};
const STATUS_LABEL: Record<string, string> = { paid: '✓ Fully paid', partial: '◐ Partial', unpaid: '○ Unpaid' };

function Receivables({ filters }: { filters: Filters }) {
  const [status, setStatus] = useState('');
  const { data, error, loading } = useLoad<OwnerReceivables>(
    () => api.owner.receivables(status || undefined, filters.branchId), [status, filters.branchId]);
  const [open, setOpen] = useState<string | null>(null);
  const key = useCallback((i: ReceivableInvoice) => `${i.type}-${i.id}`, []);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {[['', 'All'], ['unpaid', 'Unpaid'], ['partial', 'Partial'], ['paid', 'Fully paid']].map(([v, label]) => (
          <button key={v} type="button" onClick={() => setStatus(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${status === v
              ? 'border-[#011c72] bg-[#eef1fb] text-[#011c72]' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>
      {!data || loading ? <State loading={loading} error={error} /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <Tile label="Invoiced" value={<Amount value={data.totals.subtotal} />} />
            <Tile label="Collected" value={<Amount value={data.totals.totalPaid} />} />
            <Tile label="Still owed" value={<Amount value={data.totals.balance} />} />
          </div>
          {data.invoices.length === 0 ? (
            <p className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">No invoices here.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Paginated items={data.invoices} resetKey={[status, filters.branchId]} label="invoices">{rows => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2.5">Invoice</th><th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5 text-right">Subtotal</th><th className="px-4 py-2.5 text-right">Paid</th>
                  <th className="px-4 py-2.5 text-right">Balance</th><th className="px-4 py-2.5">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(inv => (
                    <InvoiceRow key={key(inv)} inv={inv} open={open === key(inv)} onToggle={() => setOpen(open === key(inv) ? null : key(inv))} />
                  ))}
                </tbody>
              </table>
            </div>
            )}</Paginated>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InvoiceRow({ inv, open, onToggle }: { inv: ReceivableInvoice; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-gray-50">
        <td className="px-4 py-2.5">
          <p className="font-medium text-gray-900">{inv.reference}</p>
          <p className="text-xs text-gray-500">{inv.customerName} · {inv.type === 'job_order' ? 'Job order' : 'Premade order'}{inv.branchName ? ` · ${inv.branchName}` : ''}</p>
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{inv.date ? formatDate(inv.date) : '—'}</td>
        <td className="px-4 py-2.5 text-right text-gray-900"><Money v={inv.subtotal} /></td>
        <td className="px-4 py-2.5 text-right text-gray-700"><Money v={inv.totalPaid} /></td>
        <td className={`px-4 py-2.5 text-right font-semibold ${inv.balance > 0 ? 'text-gray-900' : 'text-gray-400'}`}><Money v={inv.balance} /></td>
        <td className="px-4 py-2.5 whitespace-nowrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[inv.paymentStatus]}`}>{STATUS_LABEL[inv.paymentStatus]}</span>
        </td>
      </tr>
      {open && (
        <tr className="bg-gray-50">
          <td colSpan={6} className="px-4 py-4">
            <p className="text-xs text-gray-500 mb-2">Includes {peso(inv.vat)} VAT · order status: {inv.orderStatus.replace(/_/g, ' ')}</p>
            {inv.payments.length === 0 ? <p className="text-sm text-gray-400">No payments recorded yet.</p> : (
              <table className="w-full max-w-2xl text-xs">
                <thead><tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-1.5 pr-3">Date</th><th className="py-1.5 pr-3">Mode of payment</th>
                  <th className="py-1.5 pr-3">Reference</th><th className="py-1.5 pr-3">Recorded by</th><th className="py-1.5 text-right">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {inv.payments.map((p, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3 text-gray-700">{p.date ? formatDateTime(p.date) : '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-700">{p.method === 'not_recorded' ? 'Not recorded' : PAYMENT_METHOD_LABELS[p.method] || p.method}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{p.reference || '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{p.recordedBy || '—'}</td>
                      <td className="py-1.5 text-right font-medium text-gray-900">{peso(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─────────────────────────── 6. Inventory & COGS ───────────────────────────

function InventoryOversight({ filters }: { filters: Filters }) {
  const { data, error, loading } = useLoad<OwnerInventory>(
    () => api.owner.inventory(query(filters)), [filters.start, filters.end, filters.branchId]);
  if (!data || loading) return <State loading={loading} error={error} />;
  return (
    <div className="space-y-5">
      {data.invalidValues.length > 0 && (
        <p className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
          Some items have a stock or cost that isn&apos;t a valid number, so they are counted as ₱0 here:{' '}
          <b>{data.invalidValues.join(', ')}</b>. Correct them in Inventory.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Raw materials on hand" value={<Amount value={data.materialsValue} />} sub="Today, at purchase cost" />
        <Tile label="Premade products on hand" value={<Amount value={data.premadeValue} />} sub="Today, at production cost" />
        <Tile label="Capital tied up in stock" value={<Amount value={data.totalValue} />} sub="Today" />
        <Tile label="Cost of goods sold" value={<Amount value={data.cogs.total} />}
          sub={`In the selected period · Materials ${compactPeso(data.cogs.materials)} · Labor ${compactPeso(data.cogs.labor)} · Premade ${compactPeso(data.cogs.premadeProducts)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900">Restock status</h2>
          <p className="text-xs text-gray-500 mb-3">{data.outOfStock} out of stock · {data.lowStock} running low</p>
          {data.restock.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">✓ Everything is above its restock level.</p> : (
            <Paginated items={data.restock} resetKey={filters.branchId} label="items">{rows => (
            <ul className="divide-y divide-gray-100 text-sm">
              {rows.map(r => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-gray-900">{r.name}{r.color ? ` — ${r.color}` : ''}</p>
                    <p className="text-xs text-gray-500">{r.branchName || '—'} · {exactNumber(r.stock)} left{r.threshold ? ` (restock at ${exactNumber(r.threshold)})` : ''}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${r.status === 'out' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-800'}`}>
                    {r.status === 'out' ? '✕ Out of stock' : '! Low'}
                  </span>
                </li>
              ))}
            </ul>
            )}</Paginated>
          )}
        </div>
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5 min-w-0">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Stock in / out</h2>
          {data.movements.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">No stock movements yet.</p> : (
            <Paginated items={data.movements} resetKey={filters.branchId} label="movements">{rows => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3 text-right">Qty</th><th className="py-2">Why</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((m, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600">{m.date ? formatDate(m.date) : '—'}</td>
                      <td className="py-2 pr-3 text-gray-900">{m.item}</td>
                      <td className={`py-2 pr-3 text-right whitespace-nowrap font-medium ${m.direction === 'in' ? 'text-green-700' : 'text-gray-900'}`}>
                        {m.direction === 'in' ? '+' : '−'}{exactNumber(m.quantity)}
                      </td>
                      <td className="py-2 text-xs text-gray-500">{m.reason}{m.branchName ? ` · ${m.branchName}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}</Paginated>
          )}
        </div>
      </div>
    </div>
  );
}
