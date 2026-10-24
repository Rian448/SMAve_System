'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Expense, PAYMENT_METHOD_LABELS } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate, manilaDateString } from '@/lib/dateUtils';
import { useConfirm } from './ConfirmDialog';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Business cash outflows (payables): rent, power, supplies and so on. Staff log
 * what they spend for their branch; the owner reviews every branch. Stock bought
 * through purchase orders isn't logged here -- it reaches the books as cost of
 * goods sold when it is used.
 */
export default function ExpenseTracker({ startOfYear = false }: { startOfYear?: boolean }) {
  const { user, can } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const today = manilaDateString();
  const [startDate, setStartDate] = useState(startOfYear ? `${today.slice(0, 4)}-01-01` : `${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const [category, setCategory] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canAdd = can('expenses.add');
  const canDelete = can('expenses.delete');
  const managesAllBranches = can('branches.all') || !!user?.atWarehouse;
  const blankForm = { date: today, category: '', particulars: '', amount: '', paymentMethod: 'cash', notes: '', branchId: '' };
  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState('');
  const fe = useFieldErrors();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api.expenses.list({ startDate, endDate, category: category || undefined });
      if (res.data) {
        setExpenses(res.data.expenses); setTotal(res.data.total);
        setCategories(res.data.categories); setMethods(res.data.paymentMethods);
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
      'expense-amount': !(amount > 0) && 'Enter an amount above zero.',
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
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={`${input} mt-1`} />
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
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-500">Total spent</p>
            <p className="text-xl font-bold text-gray-900">{peso(total)}</p>
          </div>
        </div>

        {byCategory.length > 1 && (
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap gap-2">
            {byCategory.map(([c, amt]) => (
              <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                {c}: <span className="font-semibold text-gray-900">{peso(amt)}</span>
              </span>
            ))}
          </div>
        )}

        {error && <p className="m-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
        {loading ? (
          <p className="p-8 text-center text-sm text-gray-400">Loading expenses…</p>
        ) : expenses.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">No expenses in this period.</p>
        ) : (
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
                {expenses.map(e => (
                  <tr key={e.id} className="align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{formatDate(e.date)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{e.category}</td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {e.particulars}
                      {e.notes && <p className="text-xs text-gray-500 mt-0.5">{e.notes}</p>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{e.branchName || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{PAYMENT_METHOD_LABELS[e.paymentMethod] || e.paymentMethod}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-right font-medium text-gray-900">{peso(e.amount)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{e.createdBy || '—'}</td>
                    {canDelete && (
                      <td className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => remove(e)} className="text-xs font-medium text-red-600 hover:text-red-700">Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
