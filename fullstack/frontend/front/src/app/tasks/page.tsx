'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, WorkerWorkload, WorkTask } from '@/lib/api';
import { formatDateTime } from '@/lib/dateUtils';
import Link from 'next/link';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high:   'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-blue-100 text-blue-700 border-blue-200',
  low:    'bg-gray-100 text-gray-500 border-gray-200',
};

function OverdueBadge({ task }: { task: WorkTask }) {
  if (!task.isOverdue) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Overdue +{task.overdueByHours}h
    </span>
  );
}

function QueueBadge({ pos }: { pos: number }) {
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border
      ${pos === 1 ? 'bg-[#dde6ff] text-[#011c72] border-[#011c72]/30' : 'bg-gray-100 text-gray-500 border-gray-300'}`}>
      {pos}
    </span>
  );
}

function TaskCard({ task, showQueue }: { task: WorkTask; showQueue?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 text-sm space-y-1.5 ${
      task.isOverdue ? 'border-red-200 bg-red-50' :
      task.status === 'in_progress' ? 'border-blue-200 bg-blue-50' :
      'border-gray-200 bg-white'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {showQueue && task.queuePosition != null && <QueueBadge pos={task.queuePosition} />}
          <span className="font-semibold text-gray-900 truncate max-w-[180px]">{task.title}</span>
          <OverdueBadge task={task} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal}`}>
            {task.priority}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <Link href={`/sales/${task.jobOrderId}`} className="text-[#011c72] hover:underline font-medium">
          {task.jobOrderId}
        </Link>
        {task.estimatedHours && <span>{task.estimatedHours}h est.</span>}
        {task.status === 'in_progress' && task.startedAt && (
          <span>Started {formatDateTime(task.startedAt)}</span>
        )}
        {task.status === 'completed' && task.completedAt && (
          <span>Done {formatDateTime(task.completedAt)}</span>
        )}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [workload, setWorkload] = useState<WorkerWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'overdue'>('all');

  const canAccess = user && ['administrator', 'supervisor', 'sales_manager'].includes(user.role);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (!authLoading && user && !canAccess) router.push('/dashboard');
  }, [user, authLoading, canAccess, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.workers.getWorkload();
      setWorkload(res.data?.workload || []);
    } catch {
      setError('Failed to load task queue. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canAccess) fetchData(); }, [canAccess, fetchData]);

  const totalActive   = workload.filter(w => w.activeTask).length;
  const totalQueued   = workload.reduce((s, w) => s + w.queuedCount, 0);
  const totalOverdue  = workload.filter(w => w.activeTask?.isOverdue).length;
  const totalIdleWorkers = workload.filter(w => !w.activeTask && w.queuedCount === 0).length;

  const filteredWorkload = workload.filter(w => {
    if (statusFilter === 'active') return w.activeTask != null;
    if (statusFilter === 'overdue') return w.activeTask?.isOverdue === true;
    return true;
  });

  if (authLoading || (!canAccess && !authLoading)) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Task Queue</h1>
            <p className="text-gray-500 mt-1">Worker workload, queue order, and overdue tasks</p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors gap-2">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        {/* Summary cards */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 mb-1">Active Tasks</p>
              <p className="text-2xl font-bold text-blue-600">{totalActive}</p>
              <p className="text-xs text-gray-400 mt-1">currently in progress</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 mb-1">Queued Tasks</p>
              <p className="text-2xl font-bold text-[#011c72]">{totalQueued}</p>
              <p className="text-xs text-gray-400 mt-1">waiting to start</p>
            </div>
            <div className={`rounded-xl border p-4 shadow-sm ${totalOverdue > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
              <p className={`text-xs font-medium mb-1 ${totalOverdue > 0 ? 'text-red-600' : 'text-gray-500'}`}>Overdue</p>
              <p className={`text-2xl font-bold ${totalOverdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{totalOverdue}</p>
              <p className={`text-xs mt-1 ${totalOverdue > 0 ? 'text-red-500' : 'text-gray-400'}`}>past estimated hours</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 mb-1">Idle Workers</p>
              <p className="text-2xl font-bold text-green-600">{totalIdleWorkers}</p>
              <p className="text-xs text-gray-400 mt-1">no tasks assigned</p>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['all', 'active', 'overdue'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === f ? 'bg-[#011c72] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {f === 'all' ? 'All Workers' : f === 'active' ? 'Has Active Task' : 'Overdue Only'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-16 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-500">Loading task queues…</p>
          </div>
        ) : filteredWorkload.length === 0 ? (
          <div className="p-16 text-center bg-white rounded-xl border border-gray-200">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500">No workers found for the selected filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredWorkload.map(w => (
              <div key={w.workerId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Worker header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{w.workerName}</p>
                    <p className="text-xs text-gray-400">{w.workerType}</p>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    {w.totalRemainingHours > 0 && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        ~{w.totalRemainingHours}h remaining
                      </span>
                    )}
                    {w.activeTask?.isOverdue && (
                      <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">
                        OVERDUE
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 space-y-3">
                  {/* Active task */}
                  {w.activeTask ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block animate-pulse"></span>
                        In Progress
                      </p>
                      <TaskCard task={w.activeTask} />
                    </div>
                  ) : (
                    <div className="py-2 text-center">
                      <span className="text-xs text-green-600 font-medium bg-green-50 px-3 py-1 rounded-full border border-green-200">
                        Available — no active task
                      </span>
                    </div>
                  )}

                  {/* Queue */}
                  {w.queuedTasks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                        Queue ({w.queuedCount})
                      </p>
                      <div className="space-y-2">
                        {w.queuedTasks.map(t => (
                          <TaskCard key={t.id} task={t} showQueue />
                        ))}
                      </div>
                    </div>
                  )}

                  {!w.activeTask && w.queuedCount === 0 && (
                    <p className="text-xs text-gray-400 text-center pb-1">No tasks assigned</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
