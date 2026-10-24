'use client';
import { useEffect, useState } from 'react';
import { api, PRIORITY_RANK, PRIORITY_LABELS, type MyWork as MyWorkData } from '@/lib/api';
import { formatDate, manilaDateString } from '@/lib/dateUtils';

const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(n || 0);

type Task = NonNullable<MyWorkData['assignments']>[number];

const STATUS: Record<Task['status'], { label: string; cls: string }> = {
  pending: { label: 'To do', cls: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'In progress', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Done', cls: 'bg-green-100 text-green-700' },
};

/** A seat maker's or sewer's own tasks: today, coming up, no date yet, and recently done. */
export default function MyWork() {
  const [data, setData] = useState<MyWorkData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.managedWorkers.myWork().then(res => setData(res.data || null)).catch(() => setFailed(true));
  }, []);

  const box = 'bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8';
  if (failed) return <div className={box}><p className="text-sm text-gray-500">Could not load your tasks. Please refresh the page.</p></div>;
  if (!data) return <div className={`${box} h-40 animate-pulse`} />;
  if (!data.linked) {
    return (
      <div className={`${box} max-w-2xl`}>
        <h2 className="text-lg font-semibold text-gray-900">Your work assignments</h2>
        <p className="text-sm text-gray-600 mt-2">
          Your account isn&apos;t linked to a worker in Worker Management yet, so your tasks can&apos;t be shown here.
          Ask your supervisor or administrator to link it (Worker Management → Edit worker → Login account).
        </p>
      </div>
    );
  }

  const today = manilaDateString();
  const tasks = data.assignments || [];
  const open = tasks.filter(t => t.status !== 'completed')
    .sort((a, b) => (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999')
      || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const groups: [string, Task[]][] = [
    ['Late', open.filter(t => t.scheduledDate && t.scheduledDate < today)],
    ['Today', open.filter(t => t.scheduledDate === today)],
    ['Coming up', open.filter(t => t.scheduledDate && t.scheduledDate > today)],
    ['No date yet', open.filter(t => !t.scheduledDate)],
  ];
  const done = tasks.filter(t => t.status === 'completed').slice(0, 10);

  return (
    <div className={box}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">My Work</h2>
        <p className="text-sm text-gray-500">{data.worker?.name} · {data.worker?.workType}</p>
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No tasks assigned to you right now.</p>
      ) : groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
        <div key={label} className="mb-5">
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${label === 'Late' ? 'text-red-600' : 'text-gray-500'}`}>
            {label} ({list.length})
          </h3>
          <div className="space-y-2">
            {list.map(t => (
              <div key={t.id} className="rounded-lg border border-gray-200 px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 flex flex-wrap items-center gap-2">
                    <span className="font-mono">{t.title}</span>
                    {t.priority !== 'normal' && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${t.priority === 'urgent' ? 'bg-red-100 text-red-700'
                        : t.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                        {PRIORITY_LABELS[t.priority]}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {t.description}
                    {t.customerName ? ` · ${t.customerName}` : ''}
                    {t.vehicle?.make && t.vehicle.make !== 'N/A' ? ` · ${[t.vehicle.make, t.vehicle.model].filter(Boolean).join(' ')}` : ''}
                  </p>
                  {t.scheduledDate && <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(t.scheduledDate)}</p>}
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Recently done</h3>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {done.map(t => (
              <div key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-800 min-w-0 truncate">
                  <span className="font-mono">{t.title}</span>
                  <span className="text-gray-400"> · {t.description}</span>
                </span>
                <span className="shrink-0 text-gray-600">
                  {t.hoursWorked != null ? `${t.hoursWorked}h · ` : ''}<span className="font-semibold text-green-700">{peso(t.pay || 0)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Tell your supervisor when you start and finish a task so your hours and pay are recorded.
      </p>
    </div>
  );
}
