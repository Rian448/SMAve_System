'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Expense, PAYMENT_METHOD_LABELS } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate, manilaDateString } from '@/lib/dateUtils';
import { useConfirm } from './ConfirmDialog';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';
import Paginated from '@/components/Paginated';
import Amount from '@/components/Amount';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Money out, as on the Owner Overview's charts
const EXPENSE_COLOR = '#eb6834';

/**
 * Business cash outflows (payables): rent, power, supplies and so on, logged by
 * staff for their branch (the owner reviews every branch), plus supplier
 * payments made from purchase orders. Those buy stock, so profit and loss counts
 * their cost as cost of goods sold when the material is used.
 *
 * showPaymentBreakdown: also show the Expense Log (totals by payment method) as
 * its own section, for the same dates and category as the list.
 */
export default function ExpenseTracker({ startOfYear = false, showPaymentBreakdown = false, initialStart, initialEnd }: {
  startOfYear?: boolean; showPaymentBreakdown?: boolean;
  /** Open on these dates (e.g. the Owner Overview's), instead of this month / this year */
  initialStart?: string; initialEnd?: string;
}) {
  const { user, can } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const today = manilaDateString();
  const [startDate, setStartDate] = useState(initialStart || (startOfYear ? `${today.slice(0, 4)}-01-01` : `${today.slice(0, 7)}-01`));
  const [endDate, setEndDate] = useState(initialEnd || today);
  const [category, setCategory] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  // The filter also offers Supplier Payments (made from purchase orders, not logged here)
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [supplierTotal, setSupplierTotal] = useState(0);
  const [methods, setMethods] = useState<string[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canAdd = can('expenses.add');
  const canDelete = can('expenses.delete');
  const managesAllBranches = can('branches.all');
  const blankForm = { date: today, category: '', particulars: '', amount: '', paymentMethod: 'cash', notes: '', branchId: '' };
  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState('');
  const fe = useFieldErrors();
  const [saving, setSaving] = useState(false);
  // With the payment breakdown on: which section is open (tabs)
  const [view, setView] = useState<'entries' | 'log'>('entries');
  const showEntries = !showPaymentBreakdown || view === 'entries';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api.expenses.list({ startDate, endDate, category: category || undefined });
      if (res.data) {
        setExpenses(res.data.expenses); setTotal(res.data.total);
        setCategories(res.data.categories); setMethods(res.data.paymentMethods);
        setFilterCategories(res.data.filterCategories || res.data.categories);
        setSupplierTotal(res.data.supplierPaymentsTotal || 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load expenses');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, category]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!canAdd || !managesAllBranches) return;
    api.settings.getBranches().then(r => setBranches((r.data || []).filter(b => b.isActive))).catch(() => {});
  }, [canAdd, managesAllBranches]);

  // The Expense Log: the same entries, totalled by how they were paid
  const byMethod = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const e of expenses) totals[e.paymentMethod] = (totals[e.paymentMethod] || 0) + e.amount;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const byCategory = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const e of expenses) totals[e.category] = (totals[e.category] || 0) + e.amount;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    setFormError('');
    if (fe.show({
      'expense-date': !form.date && 'Choose the date.',
      'expense-category': !form.category && 'Choose a category.',
      'expense-particulars': !form.particulars.trim() && 'Say what it was for.',
      'expense-amount': !(amount > 0) ? 'Enter an amount above zero.'
        : amount > 99_999_999.99 && 'The amount must be less than ₱100,000,000 (up to 8 digits).',
    })) return;
    setSaving(true);
    try {
      await api.expenses.create({
        date: form.date, category: form.category, particulars: form.particulars.trim(), amount,
        paymentMethod: form.paymentMethod, notes: form.notes.trim() || undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
      });
      setForm({ ...blankForm, date: form.date, paymentMethod: form.paymentMethod, branchId: form.branchId });
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the expense');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (exp: Expense) => {
    const ok = await confirm({
      title: 'Delete this expense?',
      message: `${exp.particulars} — ${peso(exp.amount)} on ${formatDate(exp.date)}. This cannot be undone.`,
      confirmLabel: 'Delete', variant: 'danger',
    });
    if (!ok) return;
    try { await api.expenses.remove(exp.id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete the expense'); }
  };

  const input = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  return (
    <div className="space-y-5">
      {canAdd && (
        <form onSubmit={submit} noValidate className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-1">Log an expense</h3>
          <p className="text-xs text-gray-500 mb-4">
            Money spent on running the business. Materials bought through purchase orders don&apos;t go here.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-sm text-gray-700" {...fe.field('expense-date')}>Date
              <input type="date" max={today} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={`${input} mt-1`} />
              <FieldError message={fe.errors['expense-date']} />
            </label>
            <label className="text-sm text-gray-700" {...fe.field('expense-category')}>Category
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={`${input} mt-1`}>
                <option value="">Choose…</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <FieldError message={fe.errors['expense-category']} />
            </label>
            <label className="text-sm text-gray-700 lg:col-span-2" {...fe.field('expense-particulars')}>Particulars
              <input value={form.particulars} maxLength={255} placeholder="e.g. October electricity bill"
                onChange={e => setForm({ ...form, particulars: e.target.value })} className={`${input} mt-1`} />
              <FieldError message={fe.errors['expense-particulars']} />
            </label>
            <label className="text-sm text-gray-700" {...fe.field('expense-amount')}>Amount (₱)
              <input type="number" min="0" max="99999999.99" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={`${input} mt-1`} />
              <FieldError message={fe.errors['expense-amount']} />
            </label>
            <label className="text-sm text-gray-700">Paid by
              <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className={`${input} mt-1`}>
                {methods.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] || m}</option>)}
              </select>
            </label>
            {managesAllBranches && (
              <label className="text-sm text-gray-700">Branch
                <select value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })} className={`${input} mt-1`}>
                  <option value="">{user?.branchName || 'My branch'}</option>
                  {branches.filter(b => b.id !== user?.branchId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
            <label className={`text-sm text-gray-700 ${managesAllBranches ? '' : 'lg:col-span-2'}`}>Notes
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`${input} mt-1`} />
            </label>
          </div>
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving…' : 'Add expense'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-end gap-3 p-4 border-b border-gray-100">
          <label className="text-xs text-gray-500">From
            <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="text-xs text-gray-500">To
            <input type="date" value={endDate} min={startDate} max={today} onChange={e => setEndDate(e.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="text-xs text-gray-500">Category
            <select value={category} onChange={e => setCategory(e.target.value)} className={`${input} mt-1`}>
              <option value="">All categories</option>
              {filterCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-500">Total spent</p>
            <p className="text-xl font-bold text-gray-900 min-w-0"><Amount value={total} /></p>
          </div>
        </div>

        {supplierTotal > 0 && (
          <p className="px-4 py-2.5 border-b border-gray-100 bg-amber-50 text-xs text-amber-900">
            Includes {peso(supplierTotal)} in <b>Supplier Payments</b> for purchase orders. Those buy stock, so profit and loss
            counts their cost as materials are used (cost of goods sold), not as operating expenses.
          </p>
        )}

        {byCategory.length > 1 && (
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap gap-2">
            {byCategory.map(([c, amt]) => (
              <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                {c}: <span className="font-semibold text-gray-900">{peso(amt)}</span>
              </span>
            ))}
          </div>
        )}

        {showPaymentBreakdown && (
          <nav aria-label="Expense views" className="px-4 border-b border-gray-200 flex gap-1 overflow-x-auto">
            {([['entries', 'Expense Entries', expenses.length], ['log', 'Expense Log', byMethod.length]] as const).map(([id, label, count]) => (
              <button key={id} type="button" onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}
                className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  view === id ? 'border-[#011c72] text-[#011c72]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {label}
                {!loading && <span className="ml-1.5 text-xs text-gray-400">{count}</span>}
              </button>
            ))}
          </nav>
        )}

        {showPaymentBreakdown && view === 'log' && (
          <section aria-labelledby="expense-log-heading" className="px-4 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <div>
                <h3 id="expense-log-heading" className="text-base font-semibold text-gray-900">Expense Log</h3>
                <p className="text-xs text-gray-500">By payment method · same dates and category as Expense Entries</p>
              </div>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{peso(total)}</span>
            </div>
            {loading ? <p className="text-sm text-gray-400 py-3">Loading…</p>
              : byMethod.length === 0 ? <p className="text-sm text-gray-400 py-3 text-center">No expenses logged in this period.</p> : (
              <ul className="space-y-3">
                {byMethod.map(([method, amt]) => (
                  <li key={method} title={`${PAYMENT_METHOD_LABELS[method] || method}: ${peso(amt)}`}>
                    <div className="flex justify-between gap-3 text-xs mb-1">
                      <span className="text-gray-700">{PAYMENT_METHOD_LABELS[method] || method}</span>
                      <span className="font-medium text-gray-900 tabular-nums">
                        {peso(amt)} <span className="text-gray-400 font-normal">· {total ? Math.round(amt / total * 100) : 0}%</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div className="h-full rounded-full" style={{ width: `${(amt / (byMethod[0][1] || 1)) * 100}%`, background: EXPENSE_COLOR }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {error && <p className="m-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
        {showEntries && (loading ? (
          <p className="p-8 text-center text-sm text-gray-400">Loading expenses…</p>
        ) : expenses.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">No expenses in this period.</p>
        ) : (
          <Paginated items={expenses} resetKey={[startDate, endDate, category]} label="expenses">{rows => (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Particulars</th>
                  <th className="px-4 py-2.5">Branch</th>
                  <th className="px-4 py-2.5">Paid by</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Logged by</th>
                  {canDelete && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(e => (
                  <tr key={e.id} className="align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{formatDate(e.date)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{e.category}</td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {e.purchaseOrderId
                        ? <Link href={`/purchase-orders/${e.purchaseOrderId}`} className="text-[#011c72] hover:underline">{e.particulars}</Link>
                        : e.particulars}
                      {e.referenceNumber && <p className="text-xs text-gray-500 mt-0.5">Ref. {e.referenceNumber}</p>}
                      {e.notes && <p className="text-xs text-gray-500 mt-0.5">{e.notes}</p>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{e.branchName || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{PAYMENT_METHOD_LABELS[e.paymentMethod] || e.paymentMethod}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-right font-medium text-gray-900">{peso(e.amount)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{e.createdBy || '—'}</td>
                    {canDelete && (
                      <td className="px-4 py-2.5 text-right">
                        {/* A supplier payment is voided from its purchase order, so its balance stays right */}
                        {e.purchaseOrderPaymentId ? (
                          <span className="text-xs text-gray-400" title="Void it from its purchase order">From PO</span>
                        ) : (
                          <button type="button" onClick={() => remove(e)} className="text-xs font-medium text-red-600 hover:text-red-700">Delete</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}</Paginated>
        ))}
      </div>
      {confirmDialog}
    </div>
  );
}
