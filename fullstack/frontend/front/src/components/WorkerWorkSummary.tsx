'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type WorkerWorkSummary as Summary } from '@/lib/api';
import { formatDate, manilaDateString } from '@/lib/dateUtils';
import { exactPeso } from '@/lib/format';
import { formatLength } from '@/lib/length';

type Period = 'day' | 'week' | 'month' | 'custom';

// Dates are handled as YYYY-MM-DD (Philippine calendar days), computed in UTC so
// the browser's own time zone can't shift them
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

function rangeFor(period: Period, anchor: string): [string, string] {
  const d = parse(anchor);
  if (period === 'week') {
    const start = addDays(anchor, -((d.getUTCDay() + 6) % 7)); // Monday
    return [start, addDays(start, 6)];
  }
  if (period === 'month') {
    const start = ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    return [start, ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))];
  }
  return [anchor, anchor];
}

function shift(period: Period, anchor: string, dir: 1 | -1): string {
  if (period === 'week') return addDays(anchor, 7 * dir);
  if (period === 'month') {
    const d = parse(anchor);
    return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1)));
  }
  return addDays(anchor, dir);
}

function periodTitle(period: Period, start: string, end: string) {
  if (period === 'month') return parse(start).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (start === end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

const qty = (n: number, unit: string) => (unit === 'yd' ? formatLength(n) : `${n} ${unit}`);

/**
 * What a worker finished in a day, week, month or chosen dates: every task with
 * its job order, hours, pay and material, with totals and a per-day breakdown.
 * Without workerId it shows the signed-in worker's own work.
 */
export default function WorkerWorkSummary({ workerId }: { workerId?: number }) {
  const today = manilaDateString();
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState<[string, string]>([addDays(today, -13), today]);
  // The last answer and which worker/period it was for: loading until it matches
  const [result, setResult] = useState<{ key: string; data: Summary | null; error: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const [start, end] = period === 'custom' ? custom : rangeFor(period, anchor);
  const key = `${workerId ?? 'me'}|${start}|${end}`;
  const loading = result?.key !== key;
  const data = result?.data ?? null;
  const error = loading ? '' : result?.error || '';

  useEffect(() => {
    let live = true;
    (workerId ? api.managedWorkers.workSummary(workerId, start, end) : api.managedWorkers.myWorkSummary(start, end))
      .then(res => { if (live) setResult({ key, data: res.data || null, error: '' }); })
      .catch(err => {
        if (live) setResult({ key, data: null, error: err instanceof Error && err.message ? err.message : 'Could not load the work summary.' });
      });
    return () => { live = false; };
  }, [workerId, start, end, key]);

  const t = data?.totals;
  const atToday = period !== 'custom' && end >= today;

  return (
    <div>
      {/* Period picker */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['day', 'week', 'month', 'custom'] as const).map(p => (
            <button key={p} onClick={() => { setPeriod(p); setAnchor(today); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${period === p ? 'bg-white text-[#011c72] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              {p === 'day' ? 'Day' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Custom'}
            </button>
          ))}
        </div>
        {period === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input type="date" value={custom[0]} max={today} aria-label="From"
              onChange={e => e.target.value && setCustom([e.target.value, custom[1]])}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
            <span className="text-gray-400">to</span>
            <input type="date" value={custom[1]} max={today} aria-label="To"
              onChange={e => e.target.value && setCustom([custom[0], e.target.value])}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setAnchor(shift(period, anchor, -1))} aria-label="Previous"
              className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">‹</button>
            <span className="text-sm font-semibold text-gray-900 min-w-40 text-center">{periodTitle(period, start, end)}</span>
            <button onClick={() => setAnchor(shift(period, anchor, 1))} disabled={atToday} aria-label="Next"
              className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30">›</button>
            {anchor !== today && (
              <button onClick={() => setAnchor(today)} className="text-xs text-[#011c72] font-medium hover:underline">Today</button>
            )}
          </div>
        )}
      </div>

      {error && <p className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}

      {/* Totals */}
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 ${loading ? 'opacity-50' : ''}`}>
        {[
          ['Pay', t && t.pay != null ? exactPeso(t.pay) : '—', 'text-green-700'],
          ['Tasks done', t ? `${t.tasks}` : '—', 'text-gray-900'],
          ['Hours', t ? `${t.hours}` : '—', 'text-gray-900'],
          ['Material cut', t ? (t.yardsUsed + t.yardsExcess > 0 ? formatLength(t.yardsUsed + t.yardsExcess) : '—') : '—', 'text-gray-900'],
        ].map(([label, value, cls]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
            <p className={`text-lg font-bold mt-0.5 ${cls}`}>{value}</p>
          </div>
        ))}
      </div>
      {t && (
        <p className="text-xs text-gray-500 -mt-3 mb-5">
          {t.jobOrders} job order{t.jobOrders === 1 ? '' : 's'}
          {t.yardsExcess > 0 && <> · {formatLength(t.yardsUsed)} went into the jobs, {formatLength(t.yardsExcess)} left over from cutting</>}
          {t.openTasks > 0 && <> · {t.openTasks} task{t.openTasks === 1 ? '' : 's'} still to do</>}
        </p>
      )}

      {/* Per day (for more than one day) */}
      {data && start !== end && data.days.length > 0 && (
        <div className="mb-5 overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full min-w-96 text-sm">
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Day</th>
                <th className="px-3 py-2 text-right font-semibold">Tasks</th>
                <th className="px-3 py-2 text-right font-semibold">Hours</th>
                <th className="px-3 py-2 text-right font-semibold">Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.days.map(d => (
                <tr key={d.date}>
                  <td className="px-3 py-2 text-gray-800">
                    {parse(d.date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{d.tasks}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{d.hours}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{d.pay != null ? exactPeso(d.pay) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tasks */}
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Finished tasks</h3>
      {data && data.tasks.length === 0 ? (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-6 text-center">Nothing finished in this period.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
          {data?.tasks.map(task => {
            const details = task.cuts.length + task.consumables.length;
            return (
              <div key={task.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {task.jobOrderDbId && workerId
                        ? <Link href={`/sales/${task.jobOrderDbId}`} className="font-mono text-[#011c72] hover:underline">{task.jobOrderRef}</Link>
                        : <span className="font-mono">{task.jobOrderRef}</span>}
                      <span className="font-normal text-gray-600"> · {task.task || 'Task'}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(task.date)}
                      {task.customerName ? ` · ${task.customerName}` : ''}
                      {task.vehicle ? ` · ${task.vehicle}` : ''}
                      {task.branchName ? ` · ${task.branchName}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {task.pay != null && <p className="text-sm font-bold text-green-700">{exactPeso(task.pay)}</p>}
                    <p className="text-[11px] text-gray-500">{task.hours}h{task.payOverridden ? ' · pay set by hand' : ''}</p>
                  </div>
                </div>
                {details > 0 && (
                  <button onClick={() => setOpen(open === task.id ? null : task.id)}
                    className="mt-1 text-xs text-[#011c72] font-medium hover:underline">
                    {open === task.id ? 'Hide material' : `Material (${details})`}
                  </button>
                )}
                {open === task.id && (
                  <ul className="mt-2 space-y-1 text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                    {task.cuts.map((c, i) => (
                      <li key={`c${i}`}>
                        <span className="font-medium">{c.material}</span>: cut {qty(c.used + c.excess, c.unit)}
                        {c.excess > 0 && <span className="text-amber-700"> ({qty(c.used, c.unit)} used, {qty(c.excess, c.unit)} left over)</span>}
                      </li>
                    ))}
                    {task.consumables.map((c, i) => (
                      <li key={`s${i}`}>
                        <span className="font-medium">{c.material}</span>: {c.partial ? 'partly used' : `${c.quantity} ${c.unit} used up`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {!data && loading && <div className="h-24 animate-pulse" />}
        </div>
      )}
    </div>
  );
}
