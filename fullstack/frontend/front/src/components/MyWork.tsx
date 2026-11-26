'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, PRIORITY_RANK, PRIORITY_LABELS, type MyWork as MyWorkData } from '@/lib/api';
import { formatDate, manilaDateString } from '@/lib/dateUtils';
import WorkerWorkSummary from '@/components/WorkerWorkSummary';
import TaskFinishForm, { formatDuration } from '@/components/TaskFinishForm';

type Task = NonNullable<MyWorkData['assignments']>[number];

const STATUS: Record<Task['status'], { label: string; cls: string }> = {
  pending: { label: 'To do', cls: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'In progress', cls: 'bg-blue-100 text-blue-700' },
  submitted: { label: 'Waiting for approval', cls: 'bg-amber-100 text-amber-800' },
  completed: { label: 'Done', cls: 'bg-green-100 text-green-700' },
};

/**
 * A worker's own tasks: they start a task, and when it is done they fill in when they
 * started and finished and what materials they used. That goes to an administrator to
 * check and approve.
 */
export default function MyWork() {
  const [data, setData] = useState<MyWorkData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [finishing, setFinishing] = useState<Task | null>(null);

  const load = useCallback(() => {
    api.managedWorkers.myWork().then(res => setData(res.data || null)).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (text: string, error = false) => {
    setMessage({ text, error });
    setTimeout(() => setMessage(null), error ? 8000 : 5000);
  };

  const start = async (t: Task) => {
    setBusyId(t.id);
    try {
      await api.managedWorkers.startMyTask(t.id);
      flash(`Started ${t.title}.`);
      load();
    } catch (err) {
      flash(err instanceof Error && err.message ? err.message : "Couldn't start the task.", true);
    } finally { setBusyId(null); }
  };

  const box = 'bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8';
  if (failed) return <div className={box}><p className="text-sm text-gray-500">Could not load your tasks. Please refresh the page.</p></div>;
  if (!data) return <div className={`${box} h-40 animate-pulse`} />;
  if (!data.linked) {
    return (
      <div className={`${box} max-w-2xl`}>
        <h2 className="text-lg font-semibold text-gray-900">Your work assignments</h2>
        <p className="text-sm text-gray-600 mt-2">
          Your account isn&apos;t linked to a worker in Worker Management yet, so your tasks can&apos;t be shown here.
          Ask your administrator to link it (Worker Management → Edit worker → Login account).
        </p>
      </div>
    );
  }

  const today = manilaDateString();
  const tasks = data.assignments || [];
  const working = tasks.filter(t => t.status === 'in_progress');
  const waiting = tasks.filter(t => t.status === 'submitted');
  const open = tasks.filter(t => t.status === 'pending')
    .sort((a, b) => (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999')
      || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const groups: [string, Task[]][] = [
    ['Working on now', working],
    ['Late', open.filter(t => t.scheduledDate && t.scheduledDate < today)],
    ['Today', open.filter(t => t.scheduledDate === today)],
    ['Coming up', open.filter(t => t.scheduledDate && t.scheduledDate > today)],
    ['No date yet', open.filter(t => !t.scheduledDate)],
    ['Waiting for approval', waiting],
  ];
  const done = tasks.filter(t => t.status === 'completed').slice(0, 10);
  const hasOpen = groups.some(([, list]) => list.length > 0);
  const busyElsewhere = working.length > 0;

  const actionBtn = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50';

  return (
    <div className={box}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">My Work</h2>
        <p className="text-sm text-gray-500">{data.worker?.name} · {data.worker?.workType}</p>
      </div>

      {message && (
        <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${message.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message.text}
        </p>
      )}

      {!hasOpen ? (
        <p className="text-sm text-gray-500 mb-4">No tasks assigned to you right now.</p>
      ) : groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
        <div key={label} className="mb-5">
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${label === 'Late' ? 'text-red-600' : label === 'Working on now' ? 'text-blue-700' : 'text-gray-500'}`}>
            {label} ({list.length})
          </h3>
          <div className="space-y-2">
            {list.map(t => (
              <div key={t.id} className={`rounded-lg border px-4 py-3 ${t.status === 'in_progress' ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                    {t.status === 'in_progress' && t.startTime && (
                      <p className="text-[11px] text-blue-700 mt-0.5">
                        Started {new Date(t.startTime).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    )}
                    {t.status === 'submitted' && t.submission?.hours != null && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Submitted · {formatDuration(t.submission.hours)} worked. An administrator will check it.
                      </p>
                    )}
                    {t.waitingOn && (
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        Wait for {t.waitingOn.workerName} to finish {t.waitingOn.description || 'their part'} first.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
                    {t.status === 'pending' && (
                      <button type="button" onClick={() => start(t)}
                        disabled={busyId === t.id || !!t.waitingOn || busyElsewhere}
                        title={t.waitingOn ? 'Wait for the earlier task to finish' : busyElsewhere ? 'Finish your current task first' : undefined}
                        className={`${actionBtn} bg-[#011c72] text-white hover:bg-[#022a9e]`}>
                        {busyId === t.id ? 'Starting…' : 'Start'}
                      </button>
                    )}
                    {t.status === 'in_progress' && (
                      <button type="button" onClick={() => setFinishing(t)}
                        className={`${actionBtn} bg-green-600 text-white hover:bg-green-700`}>
                        Finish &amp; submit
                      </button>
                    )}
                  </div>
                </div>
                {t.status === 'in_progress' && t.reviewNote && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span className="font-semibold">Sent back to fix:</span> {t.reviewNote}
                  </div>
                )}
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
                <span className="shrink-0 text-gray-600">{t.hoursWorked != null ? `${t.hoursWorked}h` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">My finished work</h2>
        <WorkerWorkSummary />
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Press Start when you begin a task. When it is done, press Finish &amp; submit and fill in your times and the materials
        you used. Your hours are recorded once an administrator approves it.
      </p>

      {finishing && (
        <TaskFinishForm
          title="Finish task"
          subtitle={`${finishing.title}${finishing.description ? ` · ${finishing.description}` : ''}`}
          workerName={data.worker?.name || 'you'}
          isSpecialTask={finishing.assignmentType === 'special_task'}
          // A cutter's task, or one named Cutting (same rule as the server)
          isCuttingTask={(data.worker?.workType || '').toLowerCase() === 'cutter'
            || (finishing.description || '').split(' (')[0].trim().toLowerCase() === 'cutting'}
          defaultStart={finishing.startTime}
          previous={finishing.submission}
          returnedNote={finishing.reviewNote}
          loadMaterials={async () => (await api.managedWorkers.myTaskMaterials(finishing.id)).data}
          onClose={() => setFinishing(null)}
          onSubmit={async (payload) => {
            try {
              await api.managedWorkers.submitMyTask(finishing.id, payload);
              setFinishing(null);
              flash('Submitted. An administrator will check and approve it.');
              load();
              return null;
            } catch (err) {
              return err instanceof Error && err.message ? err.message : "Couldn't submit. Please try again.";
            }
          }}
        />
      )}
    </div>
  );
}
