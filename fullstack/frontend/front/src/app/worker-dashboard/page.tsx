'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { homePath } from '@/lib/permissions';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  api, type ManagedWorker, type WorkerAssignment, type WorkerAvailabilityEntry, type JobOrder,
  type JobOrderPriority, PRIORITY_RANK, PRIORITY_LABELS, type MaterialWasteLog, type CalendarAssignment,
  type LinkableWorkerAccount, ApiError,
} from '@/lib/api';
import { formatLength } from '@/lib/length';
import { useConfirm } from '@/components/ConfirmDialog';
import { formatDate } from '@/lib/dateUtils';
import Paginated from '@/components/Paginated';
import WorkerWorkSummary from '@/components/WorkerWorkSummary';
import { formatDuration } from '@/components/TaskFinishForm';
import { WORKER_MANAGEMENT_PERMS } from '@/lib/permissions';

// ── Constants ────────────────────────────────────────────────────────────────
const WORK_TYPES = ['Seat Maker', 'Sewer', 'Upholstery', 'Installer', 'Cutter', 'Finisher', 'Other'];
const PAY_MODES = [
  { value: 'per_hour', label: 'Per Hour' },
  { value: 'per_day',  label: 'Per Day'  },
  { value: 'per_piece', label: 'Per Piece / Project' },
] as const;
type Tab = 'assign' | 'workers' | 'calendar';
/** Standard rate for each pay mode (₱), used for new workers and when the pay mode
 *  changes. Not shown on the form; it still prices the job orders' labor. */
const DEFAULT_RATES: Record<string, number> = { per_hour: 80, per_day: 600, per_piece: 600 };

// ── Calendar helpers ─────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function firstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }
function toYMD(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function todayYMD() {
  const t = new Date();
  return toYMD(t.getFullYear(), t.getMonth(), t.getDate());
}
/** Work can't be put on a day that has already passed (YYYY-MM-DD compares as text) */
const isPastDay = (dateStr: string) => dateStr < todayYMD();
const PAST_DAY_MSG = 'That day has passed. Work can only be scheduled for today or a later day.';



const PRIORITY_BADGE: Record<JobOrderPriority, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-gray-100 text-gray-500 border-gray-200',
  low: 'bg-gray-50 text-gray-400 border-gray-200',
};
const rankOf = (p?: JobOrderPriority) => PRIORITY_RANK[p || 'normal'];
/** Most urgent first; within the same priority, the oldest job order first (FIFO). Ids grow
 *  with creation, so they order same-day orders too. Work with no job order goes last. */
const LAST = Number.MAX_SAFE_INTEGER;
const byPriority = (a: { priority?: JobOrderPriority; id: number }, b: { priority?: JobOrderPriority; id: number }) =>
  rankOf(a.priority) - rankOf(b.priority) || a.id - b.id;
/** When a task is due, for its label and order: late, today, a later day, or no date */
function dueOf(scheduledDate: string | null | undefined, today: string) {
  if (!scheduledDate) return { rank: 3, text: 'No date', cls: 'bg-gray-100 text-gray-500' };
  const [y, m, d] = scheduledDate.split('-').map(Number);
  const short = new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
  if (scheduledDate < today) return { rank: 0, text: `Late · ${short}`, cls: 'bg-red-50 text-red-700' };
  if (scheduledDate === today) return { rank: 1, text: 'Today', cls: 'bg-green-50 text-green-700' };
  const t = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + 1);
  const tomorrow = toYMD(t.getFullYear(), t.getMonth(), t.getDate());
  return { rank: 2, text: scheduledDate === tomorrow ? 'Tomorrow' : short, cls: 'bg-blue-50 text-blue-700' };
}

/** Today's work for a worker: due today, late, or already started */
const isTodaysWork = (a: { scheduledDate?: string | null; status: string }, today: string) =>
  a.status === 'in_progress' || (!!a.scheduledDate && a.scheduledDate <= today);

const tasksByPriority = (
  a: { jobOrderPriority?: JobOrderPriority; jobOrderDbId?: number | null; id: number },
  b: { jobOrderPriority?: JobOrderPriority; jobOrderDbId?: number | null; id: number },
) => rankOf(a.jobOrderPriority) - rankOf(b.jobOrderPriority)
  || (a.jobOrderDbId ?? LAST) - (b.jobOrderDbId ?? LAST) || a.id - b.id;
/** Calendar "worker" value for the team view (everyone's schedule) */
const TEAM_VIEW = 0;

/** Picked to place by clicking: a job order from the list, or a task already assigned */
type Picked = { kind: 'job'; jo: JobOrder } | { kind: 'task'; id: number };
/** another: give a worker who already has the job order a second task instead of moving theirs */
type AssignForm = { date: string; jobId: number | null; workerId: number | null; search: string; another: boolean };
/** Giving a worker a job order they already finished: asks if it is rework, and why */
type ReworkPrompt = {
  workerId: number; workerName: string; jobId: number; jobRef: string; date: string | null;
  previous?: string; completedAt?: string | null;
  reason: string; other: string; saving: boolean; error: string;
};
const REWORK_REASONS = ['Additional cutting', 'Mistake in previous work', 'Defective material', 'Customer requested changes', 'Other'];
/** The kind of work a task is, without the "(2)" / "(Rework: ...)" added to repeats (as the server does) */
const taskBase = (name?: string | null) => {
  const n = (name || '').trim();
  const cut = n.indexOf(' (');
  return (cut > 0 ? n.slice(0, cut) : n).trim().toLowerCase();
};
/** The server's answer when the worker already completed this job order */
const alreadyCompleted = (err: unknown) =>
  err instanceof ApiError && err.status === 409 && err.body?.code === 'already_completed'
    ? (err.body?.data || {}) as { description?: string; completedAt?: string | null }
    : null;
const pickedRef = (p: Picked, tasks: WorkerAssignment[]) =>
  p.kind === 'job' ? p.jo.jobOrderId : (tasks.find(a => a.id === p.id)?.jobOrderRef || 'this task');

/** The job order's priority; normal ones get no badge to keep the list quiet */
function PriorityBadge({ priority }: { priority?: JobOrderPriority }) {
  if (!priority || priority === 'normal') return null;
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wide ${PRIORITY_BADGE[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function statusBadge(s: string) {
  return ({
    completed:   'bg-green-100 text-green-700 border-green-200',
    submitted:   'bg-amber-100 text-amber-800 border-amber-300',
    in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
    pending:     'bg-yellow-100 text-yellow-700 border-yellow-200',
  } as Record<string,string>)[s] || 'bg-gray-100 text-gray-500 border-gray-200';
}
/** A task's status as shown: submitted work waits for an administrator */
const statusText = (s: string) => (s === 'submitted' ? 'to approve' : s.replace('_', ' '));

// ── Review: check a worker's finished work, then approve it or send it back ──
/** A length in yards reads as "1 yd 2 ft"; anything else with its unit */
const qtyText = (qty: number, unit?: string) =>
  !unit || unit === 'yd' ? formatLength(qty) : `${qty} ${unit}`;

function ReviewModal({ assignment, onClose, onDone }: {
  assignment: WorkerAssignment;
  onClose: () => void;
  /** approved: true when the work was approved (false = sent back) */
  onDone: (approved: boolean) => void;
}) {
  const sub = assignment.submission;
  // Workers paid by the day or piece: how many, so the job's labor cost is right.
  // No money is shown here; pay is for finance and stays on the job order.
  const mode = assignment.payMode || 'per_hour';
  const hours = sub?.hours || 0;
  const [units, setUnits] = useState('1');
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const qty = mode === 'per_hour' ? hours : (parseFloat(units) || 0);
  const ref = assignment.assignmentType === 'special_task' ? (assignment.specialTaskTitle || 'Special Task') : assignment.jobOrderRef;
  const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const send = async (action: 'approve' | 'return') => {
    setError('');
    if (action === 'return' && !note.trim()) { setError('Say what needs to be fixed, so the worker knows.'); return; }
    if (action === 'approve' && mode !== 'per_hour' && !(qty > 0)) { setError(`Enter the ${mode === 'per_day' ? 'days' : 'pieces'} worked.`); return; }
    setSaving(true);
    try {
      await api.workerAssignments.review(assignment.id, action === 'approve'
        ? { action, ...(mode !== 'per_hour' ? { unitsWorked: qty } : {}) }
        : { action, note: note.trim() });
      onDone(action === 'approve');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="review-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="review-title" className="text-lg font-semibold text-gray-900">Check finished work</h2>
            <p className="text-sm text-gray-500">
              {assignment.workerName} · <span className="font-mono">{ref}</span>{assignment.description ? ` · ${assignment.description}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {!sub ? (
            <p className="text-sm text-gray-500">Nothing was submitted for this task.</p>
          ) : (<>
            <div className="rounded-xl bg-[#eef1fb] p-4 text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <span className="text-gray-500">Started</span><span className="text-gray-900">{when(sub.startTime)}</span>
              <span className="text-gray-500">Finished</span><span className="text-gray-900">{when(sub.endTime)}</span>
              <span className="text-gray-500">Time worked</span><span className="font-semibold text-[#011c72]">{formatDuration(hours)}</span>
              <span className="text-gray-500">Submitted</span>
              <span className="text-gray-900">{when(sub.submittedAt)}{sub.submittedBy && sub.submittedBy !== assignment.workerName ? ` by ${sub.submittedBy}` : ''}</span>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <p className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">Materials used</p>
              {sub.materialsUsed.length === 0 ? (
                <p className="px-4 py-3 text-xs text-gray-500">No materials recorded.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {sub.materialsUsed.map((m, i) => (
                    <li key={i} className="px-4 py-2.5 text-sm flex items-start justify-between gap-3">
                      <span className="text-gray-800 min-w-0">
                        {m.name}
                        {m.reason && <span className="block text-[11px] text-gray-500">{m.reason}</span>}
                      </span>
                      <span className="text-right shrink-0 text-gray-700">
                        {m.cut != null ? <>cut {qtyText(m.cut, m.unit)}<span className="block text-[11px] text-gray-500">used {qtyText(m.qty, m.unit)}</span></>
                          : qtyText(m.qty, m.unit)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {sub.notes && (
              <div className="rounded-xl border border-gray-200 px-4 py-3 text-sm">
                <p className="text-xs font-semibold text-gray-600 mb-0.5">Notes</p>
                <p className="text-gray-800 whitespace-pre-line">{sub.notes}</p>
              </div>
            )}

            {/* Workers paid by the day or piece: how much they did (no money shown) */}
            {mode !== 'per_hour' && (
              <label className="block rounded-xl border border-gray-200 p-4">
                <span className="block text-xs font-medium text-gray-600 mb-1">{mode === 'per_day' ? 'Days worked' : 'Pieces / projects done'}</span>
                <input type="number" min="0.5" step="0.5" value={units} onChange={e => setUnits(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
              </label>
            )}
          </>)}

          {returning && (
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">What needs to be fixed? *</span>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500} autoFocus
                placeholder="e.g. The material used looks too low. Check the cut again."
                className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm text-gray-900" />
              <span className="block text-[11px] text-gray-500 mt-1">The task goes back to {assignment.workerName} to correct and submit again.</span>
            </label>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {!returning && sub && (
            <p className="text-[11px] text-gray-500">
              Approving takes the materials out of stock, records the hours, and completes the task.
            </p>
          )}
        </div>

        <div className="p-5 border-t border-gray-200 flex gap-3">
          {returning ? (<>
            <button type="button" onClick={() => send('return')} disabled={saving}
              className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl disabled:opacity-50">
              {saving ? 'Sending…' : 'Send back to worker'}
            </button>
            <button type="button" onClick={() => { setReturning(false); setError(''); }} disabled={saving}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm">Back</button>
          </>) : (<>
            <button type="button" onClick={() => send('approve')} disabled={saving || !sub}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl disabled:opacity-50">
              {saving ? 'Approving…' : 'Approve'}
            </button>
            <button type="button" onClick={() => { setReturning(true); setError(''); }} disabled={saving}
              className="px-4 py-2.5 border border-amber-300 text-amber-700 rounded-xl hover:bg-amber-50 text-sm font-medium">Send back</button>
          </>)}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
// ── After a task is finished: hand the job order on to the next worker ────────
/** A day with this many tasks or more for one worker counts as full */
const BUSY_DAY_TASKS = 4;

/** The usual next step after a task, and which trades do it */
function nextStepAfter(task: string | null | undefined): { task: string; trades: string[] } | null {
  const t = (task || '').toLowerCase();
  if (t.includes('cut')) return { task: 'Sewing', trades: ['sew'] };
  if (t.includes('sew')) return { task: 'Installation', trades: ['install', 'finish', 'upholster', 'seat'] };
  return null;
}

/** A task name from a worker's trade: Sewer → Sewing, Installer → Installation… */
function taskForTrade(workType: string) {
  const t = workType.toLowerCase();
  if (t.includes('cut')) return 'Cutting';
  if (t.includes('sew')) return 'Sewing';
  if (t.includes('install')) return 'Installation';
  if (t.includes('finish')) return 'Finishing';
  return workType;
}

const ymdShift = (s: string, days: number) => {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return toYMD(dt.getFullYear(), dt.getMonth(), dt.getDate());
};
const ymdWeekday = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const dayLabel = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
};

function HandoverModal({ done, workers, assignments, onClose, onAssign, onOpenJob }: {
  done: WorkerAssignment;
  workers: ManagedWorker[];
  assignments: WorkerAssignment[];
  onClose: () => void;
  /** Returns an error message, or null when assigned */
  onAssign: (workerId: number, task: string, date: string) => Promise<string | null>;
  onOpenJob: () => void;
}) {
  const next = nextStepAfter(done.description);
  // Tasks on this job order already lined up for someone
  const lined = assignments.filter(a => a.jobOrderDbId === done.jobOrderDbId && a.id !== done.id
    && a.status !== 'completed' && a.assignmentType !== 'special_task');
  const suggested = next ? workers.filter(w => next.trades.some(k => w.workType.toLowerCase().includes(k))) : [];
  const others = workers.filter(w => !suggested.includes(w));

  const [choice, setChoice] = useState<'handover' | 'finished' | 'later'>(
    lined.length ? 'later' : next ? 'handover' : 'finished');
  const [workerId, setWorkerId] = useState<number>((suggested[0] || others[0])?.id ?? 0);
  const [task, setTask] = useState(next?.task || '');
  const [taskEdited, setTaskEdited] = useState(false);
  const [date, setDate] = useState(todayYMD());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const worker = workers.find(w => w.id === workerId);
  /** Tasks the worker has on a day (any status: it is their workload for that day) */
  const load = (wid: number, d: string) => assignments.filter(a => a.workerId === wid && a.scheduledDate === d).length;
  const dayLoad = worker ? load(worker.id, date) : 0;
  const full = dayLoad >= BUSY_DAY_TASKS;
  /** The next working day (not Sunday) after `from` with room for the worker */
  const nextFreeDay = (from: string) => {
    let d = from;
    for (let i = 0; i < 30; i++) {
      d = ymdShift(d, 1);
      if (ymdWeekday(d) !== 0 && worker && load(worker.id, d) < BUSY_DAY_TASKS) return d;
    }
    return null;
  };
  const freeDay = full ? nextFreeDay(date) : null;

  const pickWorker = (id: number) => {
    setWorkerId(id);
    const w = workers.find(x => x.id === id);
    if (w && !taskEdited) setTask(taskForTrade(w.workType));
  };

  const submit = async () => {
    if (choice !== 'handover') { onClose(); return; }
    if (!worker) { setError('Choose who does the next task.'); return; }
    if (!task.trim()) { setError('Name the next task, e.g. Sewing.'); return; }
    if (date < todayYMD()) { setError(PAST_DAY_MSG); return; }
    setSaving(true);
    setError('');
    const err = await onAssign(worker.id, task.trim(), date);
    setSaving(false);
    if (err) setError(err); else onClose();
  };

  const option = (value: typeof choice, title: string, hint: string) => (
    <label className={`flex gap-3 rounded-xl border px-4 py-3 cursor-pointer ${choice === value ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200 hover:bg-gray-50'}`}>
      <input type="radio" name="handover" checked={choice === value} onChange={() => setChoice(value)}
        className="mt-1 w-4 h-4 text-[#011c72] focus:ring-[#011c72]" />
      <span>
        <span className="block text-sm font-semibold text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center p-2 sm:p-4 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="handover-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200">
          <h2 id="handover-title" className="text-lg font-semibold text-gray-900">
            {done.description || 'Task'} done. What&apos;s next for {done.jobOrderRef}?
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{done.workerName} finished their part.</p>
        </div>
        <div className="p-5 space-y-3">
          {lined.length > 0 && (
            <p className="text-xs rounded-lg bg-blue-50 border border-blue-100 text-blue-800 px-3 py-2">
              Already lined up on this job order: {lined.map(a => `${a.description || 'Task'} – ${a.workerName} (${a.status === 'in_progress' ? 'in progress' : 'pending'})`).join(', ')}.
            </p>
          )}

          {option('handover', 'Hand it over to the next worker',
            next ? `Usually ${next.task.toLowerCase()} comes next.` : 'Give the job order to another worker for the next task.')}
          {choice === 'handover' && (
            <div className="ml-7 space-y-3">
              <div>
                <label htmlFor="handover-worker" className="block text-xs font-medium text-gray-600 mb-1">Worker</label>
                <select id="handover-worker" value={workerId} onChange={e => pickWorker(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900">
                  {suggested.length > 0 && (
                    <optgroup label={`${next?.task} (suggested)`}>
                      {suggested.map(w => <option key={w.id} value={w.id}>{w.name} ({w.workType}) · {load(w.id, date)} task{load(w.id, date) === 1 ? '' : 's'} on {dayLabel(date)}</option>)}
                    </optgroup>
                  )}
                  <optgroup label={suggested.length ? 'Other workers' : 'Workers'}>
                    {others.map(w => <option key={w.id} value={w.id}>{w.name} ({w.workType}) · {load(w.id, date)} task{load(w.id, date) === 1 ? '' : 's'} on {dayLabel(date)}</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="handover-task" className="block text-xs font-medium text-gray-600 mb-1">Task</label>
                  <input id="handover-task" value={task} onChange={e => { setTask(e.target.value); setTaskEdited(true); }}
                    placeholder="Sewing"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
                </div>
                <div>
                  <label htmlFor="handover-date" className="block text-xs font-medium text-gray-600 mb-1">Day</label>
                  <input id="handover-date" type="date" value={date} min={todayYMD()} onChange={e => e.target.value && setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
                </div>
              </div>
              {worker && (
                full ? (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-2">
                    <p>
                      <b>{worker.name}</b> already has <b>{dayLoad} tasks</b> on {dayLabel(date)}, a full day.
                    </p>
                    {freeDay && (
                      <button type="button" onClick={() => setDate(freeDay)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 font-semibold text-amber-900 hover:bg-amber-100">
                        Put it in the queue for {dayLabel(freeDay)} ({load(worker.id, freeDay)} task{load(worker.id, freeDay) === 1 ? '' : 's'})
                      </button>
                    )}
                    <p>Or keep {dayLabel(date)}, or choose another worker.</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    {worker.name} has {dayLoad} task{dayLoad === 1 ? '' : 's'} on {dayLabel(date)}.
                  </p>
                )
              )}
            </div>
          )}

          {option('finished', 'All the work is finished',
            'Nothing else to do on it. Complete the job order in Sales when the balance is paid and the customer picks it up.')}
          {option('later', 'Decide later',
            lined.length ? 'The next task is already lined up.' : 'Leave it for now; assign the next worker from the list any time.')}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex flex-wrap justify-end gap-2">
          {choice === 'finished' && done.jobOrderDbId && (
            <button type="button" onClick={onOpenJob}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
              Open job order
            </button>
          )}
          <button type="button" onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#011c72] text-white hover:bg-[#022a9e] disabled:opacity-50">
            {choice === 'handover' ? (saving ? 'Assigning…' : `Assign to ${worker?.name || 'worker'}`) : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkerDashboard() {
  const { confirm, confirmDialog } = useConfirm();
  const router = useRouter();
  const { user, isLoading: authLoading, can } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('assign');

  // Data
  const [workers, setWorkers]       = useState<ManagedWorker[]>([]);
  const [jobOrders, setJobOrders]   = useState<JobOrder[]>([]);
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]);
  // Extra material each worker has had issued (Workers tab)
  const [workerExtras, setWorkerExtras] = useState<MaterialWasteLog[]>([]);
  const [openExtrasFor, setOpenExtrasFor] = useState<number | null>(null);
  // The worker whose finished work and pay (day / week / month) is open
  const [summaryFor, setSummaryFor] = useState<ManagedWorker | null>(null);
  const [loading, setLoading]       = useState(true);
  const [loadingJO, setLoadingJO]   = useState(false);

  // Click-to-assign: what was picked to place (a job order, or a task already assigned);
  // clicking a worker (Assign tab) or a day (Calendar) then puts it there
  const [picked, setPicked] = useState<Picked | null>(null);
  // "Assign to this day" form, from a day's + button or a day clicked with a job order picked
  const [assignForm, setAssignForm] = useState<AssignForm | null>(null);
  const [savingAssign, setSavingAssign] = useState(false);
  const [rework, setRework] = useState<ReworkPrompt | null>(null);

  // Job order filter
  const [joSearch, setJoSearch] = useState('');
  const [joStatus, setJoStatus] = useState<'pending' | 'in_progress'>('pending');
  const [showAssignedJO, setShowAssignedJO] = useState(false);
  // One assignment at a time, so a double click can't create the same assignment twice
  const assigning = useRef(false);

  const [actionError, setActionError]     = useState('');
  const showError = (err: unknown, fallback: string) => {
    setActionError(err instanceof Error && err.message ? err.message : fallback);
    setTimeout(() => setActionError(''), 6000);
  };
  // A heads-up after an action that still went through (e.g. sewing given before cutting)
  const [actionWarning, setActionWarning] = useState('');
  const showWarning = (res: { data?: { warning?: string | null } } | undefined) => {
    const w = res?.data?.warning;
    if (!w) return;
    setActionWarning(`Assigned. ${w}`);
    setTimeout(() => setActionWarning(''), 9000);
  };
  // Workers start and submit their own tasks; administrators check and approve them.
  // Everyone else here (supervisors) only assigns work.
  const canApprove = can('workers.approve');
  const canEditWorkers = can('workers.edit');

  // Worker modal. userId: '' not linked, 'new' make a login, otherwise an existing account
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker]     = useState<ManagedWorker | null>(null);
  const emptyLogin = { loginUsername: '', loginPassword: '', loginEmail: '' };
  const [workerForm, setWorkerForm] = useState({ name: '', workType: WORK_TYPES[0], ratePerHour: '', payMode: 'per_hour' as string, userId: '', ...emptyLogin });
  const [workerFormError, setWorkerFormError] = useState('');
  // Seat maker / sewer logins the worker can be linked to, so they see their own work
  const [linkableAccounts, setLinkableAccounts] = useState<LinkableWorkerAccount[]>([]);
  const [savingWorker, setSavingWorker] = useState(false);

  // Submitted work being checked, and a task being filled in for a worker with no login
  const [reviewFor, setReviewFor] = useState<WorkerAssignment | null>(null);
  // The task just approved, while asking who does the next part of its job order
  const [handover, setHandover] = useState<WorkerAssignment | null>(null);
  // Assign tab: each worker's work for today (with late and started work), or everything open
  const [taskView, setTaskView] = useState<'today' | 'all'>('today');

  // Special task modal

  // Calendar
  const [calWorker, setCalWorker]   = useState<number | null>(null);
  const [calYear, setCalYear]       = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]     = useState(new Date().getMonth());
  const [availability, setAvailability] = useState<WorkerAvailabilityEntry[]>([]);
  const [calAssignments, setCalAssignments] = useState<Record<string, CalendarAssignment[]>>({});
  const [loadingCal, setLoadingCal] = useState(false);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  // calWorker === TEAM_VIEW shows every worker's schedule
  const teamView = calWorker === TEAM_VIEW;
  // The day whose work is listed, and the task whose details are open
  const [dayPanel, setDayPanel] = useState<string | null>(null);
  const [taskPanel, setTaskPanel] = useState<number | null>(null);

  // ── Auth guard ──
  useEffect(() => {
    if (!authLoading) {
      if (!user) router.push('/login');
      else if (!can(...WORKER_MANAGEMENT_PERMS)) router.push(homePath(can));
      else { fetchWorkers(); fetchJobOrders(); fetchAssignments(); }
    }
  }, [user, authLoading]);

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const res = await api.managedWorkers.list();
      const all = res.data?.workers || [];
      setWorkers(all);
      if (!calWorker && all.length) setCalWorker(all[0].id);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const fetchJobOrders = async () => {
    setLoadingJO(true);
    try {
      const res = await api.sales.getJobOrders();
      setJobOrders(res.data || []);
    } catch { /* ignore */ } finally { setLoadingJO(false); }
  };

  const fetchAssignments = async () => {
    try {
      const res = await api.workerAssignments.list();
      setAssignments(res.data?.assignments || []);
    } catch { /* ignore */ }
  };

  const fetchCalendar = useCallback(async () => {
    if (calWorker === null) return;
    setLoadingCal(true);
    try {
      const month = `${calYear}-${String(calMonth + 1).padStart(2,'0')}`;
      const team = calWorker === TEAM_VIEW;
      const [avRes, caRes] = await Promise.all([
        team ? Promise.resolve(null) : api.workerAvailability.get({ workerId: calWorker, month }),
        api.workerAssignments.getCalendar({ workerId: team ? undefined : calWorker, month }),
      ]);
      setAvailability(avRes?.data?.entries || []);
      setCalAssignments(caRes.data || {});
    } catch { /* ignore */ } finally { setLoadingCal(false); }
  }, [calWorker, calYear, calMonth]);

  /** After any change to assignments: the lists and the calendar both show them */
  const refreshAssignments = () => {
    fetchAssignments();
    // Starting a task moves a pending job order to In Progress; removing the last
    // worker before anyone started puts it back to Pending
    fetchJobOrders();
    if (activeTab === 'calendar') fetchCalendar();
  };

  /** Whether a worker is marked off that day (asks the server for other workers) */
  const isOffOn = async (workerId: number, dateStr: string) => {
    if (workerId === calWorker) return availability.some(e => e.date === dateStr && !e.isAvailable);
    try {
      const res = await api.workerAvailability.get({ workerId, month: dateStr.slice(0, 7) });
      return (res.data?.entries || []).some(e => e.date === dateStr && !e.isAvailable);
    } catch { return false; }
  };

  /** Ask before booking someone on a day they are off; true to go ahead */
  const okToSchedule = async (workerId: number, workerName: string, dateStr: string, what: string) => {
    if (!(await isOffOn(workerId, dateStr))) return true;
    return confirm({
      title: `${workerName} is off on ${formatDate(dateStr)}`,
      message: <>Schedule <span className="font-medium text-gray-900">{what}</span> on that day anyway?</>,
      confirmLabel: 'Schedule anyway',
      variant: 'warning',
    });
  };

  /** Move an assignment to a date, or take its date off (null) */
  const scheduleTask = async (a: { id: number; workerId: number; workerName: string; jobOrderRef: string }, dateStr: string | null) => {
    if (dateStr && isPastDay(dateStr)) { showError(null, PAST_DAY_MSG); return; }
    if (dateStr && !(await okToSchedule(a.workerId, a.workerName, dateStr, a.jobOrderRef))) return;
    try {
      await api.workerAssignments.update(a.id, { scheduledDate: dateStr || '' });
      refreshAssignments();
      fetchCalendar();
    } catch (err) { showError(err, `Couldn't change the date of ${a.jobOrderRef}.`); }
  };

  useEffect(() => { if (activeTab === 'calendar') fetchCalendar(); }, [activeTab, fetchCalendar]);

  const fetchWorkerExtras = useCallback(() => {
    api.managedWorkers.extraMaterials()
      .then(res => setWorkerExtras(res.data || []))
      .catch(() => setWorkerExtras([]));
  }, []);
  useEffect(() => { if (activeTab === 'workers') fetchWorkerExtras(); }, [activeTab, fetchWorkerExtras]);
  const undoWorkerExtra = async (x: MaterialWasteLog) => {
    if (!x.jobOrderId) return;
    const ok = await confirm({
      title: 'Undo this extra material?',
      message: <>{x.quantity} of <span className="font-medium text-gray-900">{x.materialName}</span> goes back into
        stock and comes off {x.jobOrderNumber}&apos;s cost.</>,
      confirmLabel: 'Undo',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      await api.sales.undoExtraMaterial(x.jobOrderId, x.id);
      fetchWorkerExtras();
    } catch (err) { showError(err, 'Could not undo the extra material.'); }
  };
  /** Extra material can be added once the worker has started on a job order task */
  /** Work on a job order goes in the order it was given out: an earlier task is still unfinished */
  const blocked = (a: WorkerAssignment) => a.status === 'pending' && !!a.waitingOn;
  const waitMsg = (a: WorkerAssignment) => (a.status === 'pending' && a.waitingOn
    ? `Waiting for ${a.waitingOn.workerName} to finish ${a.waitingOn.description || 'their part'} first`
    : '');

  // ── Click-to-assign ──
  // Picking is per tab (worker vs day), and Esc lets go of it
  useEffect(() => { setPicked(null); }, [activeTab]);
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicked(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked]);

  /** Click a job order to pick it; click it again to let go */
  const togglePickJob = (jo: JobOrder) =>
    setPicked(p => (p?.kind === 'job' && p.jo.id === jo.id ? null : { kind: 'job', jo }));
  const togglePickTask = (id: number) =>
    setPicked(p => (p?.kind === 'task' && p.id === id ? null : { kind: 'task', id }));

  /** The worker's open assignment on this job order, if any (one without a date first,
   *  so dated work isn't moved by accident) */
  const openAssignmentFor = (workerId: number, jobId: number) => assignments
    .filter(a => a.workerId === workerId && a.jobOrderDbId === jobId
      && a.status !== 'completed' && a.assignmentType !== 'special_task')
    .sort((a, b) => Number(!!a.scheduledDate) - Number(!!b.scheduledDate))[0];

  /** Assign tab: give the picked job order to a worker, or move the picked task to them */
  const assignPickedToWorker = async (worker: ManagedWorker, another = false) => {
    const p = picked;
    if (!p) return;
    if (p.kind === 'task') {
      const task = assignments.find(a => a.id === p.id);
      setPicked(null);
      if (task) await moveTaskToWorker(task, worker);
      return;
    }
    if (assigning.current) return;
    // A second task on a day they already have this job order: ask first
    const today = todayYMD();
    const sameDay = another && assignments.some(a => a.workerId === worker.id && a.jobOrderDbId === p.jo.id
      && a.status !== 'completed' && a.assignmentType !== 'special_task' && a.scheduledDate === today);
    if (sameDay && !(await confirm({
      title: 'Add a separate task?',
      message: <>{worker.name} already has {p.jo.jobOrderId} today.</>,
      warning: 'The new task counts on its own and adds to the job order\'s labor. Only add it if it is really separate work.',
      confirmLabel: 'Add task',
    }))) return;
    assigning.current = true;
    try {
      // The server returns the existing assignment instead of a copy if the worker already has it.
      // Work handed out here starts today, so it shows on the calendar right away.
      showWarning(await api.workerAssignments.create({ workerId: worker.id, jobOrderRef: p.jo.jobOrderId, jobOrderDbId: p.jo.id, scheduledDate: today, ...(another ? { another: true, sameDay } : {}) }));
      setPicked(null);
      await fetchAssignments();
    } catch (err) {
      const done = alreadyCompleted(err);
      if (done) { setPicked(null); askRework(worker.id, worker.name, p.jo, todayYMD(), done); }
      else showError(err, `Couldn't assign ${p.jo.jobOrderId} to ${worker.name}.`);
    }
    finally { assigning.current = false; }
  };

  const askRework = (workerId: number, workerName: string, jo: JobOrder, date: string | null,
    done: { description?: string; completedAt?: string | null }) =>
    setRework({
      workerId, workerName, jobId: jo.id, jobRef: jo.jobOrderId, date,
      previous: done.description, completedAt: done.completedAt,
      reason: '', other: '', saving: false, error: '',
    });

  /** Give the finished job order back to the worker as a new, separately paid task */
  const submitRework = async () => {
    const r = rework;
    if (!r || r.saving) return;
    const reason = (r.reason === 'Other' ? r.other : r.reason).trim();
    if (!reason) { setRework({ ...r, error: r.reason === 'Other' ? 'Write the reason for the rework.' : 'Choose the reason for the rework.' }); return; }
    setRework({ ...r, saving: true, error: '' });
    try {
      await api.workerAssignments.create({
        workerId: r.workerId, jobOrderRef: r.jobRef, jobOrderDbId: r.jobId,
        ...(r.date ? { scheduledDate: r.date } : {}), rework: true, reworkReason: reason,
      });
      setRework(null);
      refreshAssignments();
    } catch (err) {
      setRework(prev => prev && { ...prev, saving: false, error: err instanceof Error && err.message ? err.message : "Couldn't assign the rework." });
    }
  };

  /** Put a job order on a worker's day: what both the + button and pick-then-click do.
   *  A worker already on the job has that assignment moved to the day, not a second one made. */
  const assignJobToDate = async (job: JobOrder, workerId: number, dateStr: string, another = false) => {
    if (assigning.current) return false;
    const worker = workers.find(w => w.id === workerId);
    if (!(await okToSchedule(workerId, worker?.name || 'This worker', dateStr, job.jobOrderId))) return false;
    // "Another task" adds a second one; otherwise their open task moves to the day
    const current = another ? undefined : openAssignmentFor(workerId, job.id);
    assigning.current = true;
    try {
      if (current) await api.workerAssignments.update(current.id, { scheduledDate: dateStr });
      else showWarning(await api.workerAssignments.create({
        workerId, jobOrderRef: job.jobOrderId, jobOrderDbId: job.id, scheduledDate: dateStr,
        // Only reached through a choice made on purpose (the assign form)
        ...(another ? { another: true, sameDay: true } : {}),
      }));
      refreshAssignments();
      return true;
    } catch (err) {
      const done = alreadyCompleted(err);
      if (done) {
        // The rework pop-up takes over from the assign form
        setAssignForm(null); setPicked(null);
        askRework(workerId, worker?.name || 'This worker', job, dateStr, done);
      } else showError(err, `Couldn't schedule ${job.jobOrderId}.`);
      return false;
    }
    finally { assigning.current = false; }
  };

  const openAssignForm = (date: string, jobId: number | null = null) =>
    setAssignForm({ date, jobId, workerId: teamView ? null : calWorker, search: '', another: false });

  /** Calendar day clicked: place what is picked there, or else show the day's work */
  const onDayClick = (dateStr: string) => {
    const p = picked;
    if (!p) { setDayPanel(dateStr); return; }
    if (isPastDay(dateStr)) { showError(null, PAST_DAY_MSG); return; }
    if (p.kind === 'task') {
      const task = assignments.find(a => a.id === p.id);
      setPicked(null);
      if (task && task.scheduledDate !== dateStr) scheduleTask(task, dateStr);
      return;
    }
    // A job order still needs its worker confirmed (and chosen, in the team view)
    openAssignForm(dateStr, p.jo.id);
  };

  const submitAssignForm = async () => {
    const f = assignForm;
    const jo = f && jobOrders.find(j => j.id === f.jobId);
    if (!f || !jo || !f.workerId) return;
    if (isPastDay(f.date)) { showError(null, PAST_DAY_MSG); return; }
    // Already on that day: only a separate task, and only when ticked on purpose
    const sameDay = assignments.some(a => a.workerId === f.workerId && a.jobOrderDbId === jo.id
      && a.status !== 'completed' && a.assignmentType !== 'special_task' && a.scheduledDate === f.date);
    if (sameDay && !f.another) return;
    setSavingAssign(true);
    // Picked in this form on purpose, so it also confirms a same-day task
    const ok = await assignJobToDate(jo, f.workerId, f.date, f.another);
    setSavingAssign(false);
    if (ok) { setAssignForm(null); setPicked(null); }
  };

  const removeAssignment = async (a: WorkerAssignment) => {
    const ok = await confirm({
      title: 'Remove this assignment?',
      message: <>{a.jobOrderRef} will be unassigned from {a.workerName}.</>,
      warning: 'Any logged hours for this assignment are removed with it.',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.workerAssignments.delete(a.id);
      // Drop it right away so the job order is back in Available work without waiting for the reload
      setAssignments(prev => prev.filter(x => x.id !== a.id));
      refreshAssignments();
    }
    catch (err) { showError(err, "Couldn't remove the assignment."); }
  };

  /** Approved or sent back: refresh, and after approving job order work ask who does the next part */
  const reviewDone = (a: WorkerAssignment, approved: boolean) => {
    setReviewFor(null);
    refreshAssignments();
    setActionWarning(approved ? `Approved ${a.workerName}'s work on ${a.jobOrderRef}.` : `Sent ${a.jobOrderRef} back to ${a.workerName}.`);
    setTimeout(() => setActionWarning(''), 6000);
    if (approved && a.jobOrderDbId && a.assignmentType !== 'special_task') setHandover({ ...a, status: 'completed' });
  };

  /** Give the finished task's job order to the next worker; an error message, or null */
  const handOver = async (done: WorkerAssignment, workerId: number, task: string, date: string) => {
    const worker = workers.find(w => w.id === workerId);
    if (!(await okToSchedule(workerId, worker?.name || 'This worker', date, done.jobOrderRef))) return 'Not assigned.';
    try {
      showWarning(await api.workerAssignments.create({
        workerId, jobOrderRef: done.jobOrderRef, jobOrderDbId: done.jobOrderDbId ?? undefined,
        description: task, scheduledDate: date,
      }));
      refreshAssignments();
      return null;
    } catch (err) {
      return err instanceof Error && err.message ? err.message : `Couldn't assign ${done.jobOrderRef}.`;
    }
  };

  // ── Worker modal ──
  const loadLinkableAccounts = () => {
    api.managedWorkers.linkableAccounts().then(res => setLinkableAccounts(res.data || [])).catch(() => setLinkableAccounts([]));
  };
  const openAdd  = () => {
    setEditingWorker(null); setWorkerFormError(''); loadLinkableAccounts();
    // A new worker gets their own login by default, so they can submit their work
    setWorkerForm({ name: '', workType: WORK_TYPES[0], ratePerHour: String(DEFAULT_RATES.per_hour), payMode: 'per_hour', userId: 'new', ...emptyLogin });
    setShowWorkerModal(true);
  };
  const openEdit = (w: ManagedWorker) => {
    setEditingWorker(w); setWorkerFormError(''); loadLinkableAccounts();
    // Blank when the rate isn't sent to this user: then it is left as it is on saving
    setWorkerForm({ name: w.name, workType: w.workType, ratePerHour: w.ratePerHour != null ? String(w.ratePerHour) : '', payMode: w.payMode || 'per_hour', userId: w.userId ? String(w.userId) : '', ...emptyLogin });
    setShowWorkerModal(true);
  };

  /** Editing a worker who keeps their login: the password field changes it */
  const changingPassword = !!editingWorker?.userId && workerForm.userId === String(editingWorker.userId);
  const saveWorker = async () => {
    if (!workerForm.name.trim()) return;
    const makingLogin = workerForm.userId === 'new';
    if (makingLogin && (!workerForm.loginUsername.trim() || !workerForm.loginPassword)) {
      setWorkerFormError('Enter a username and password for the new login, or choose "No login".');
      return;
    }
    setSavingWorker(true);
    setWorkerFormError('');
    try {
      const payload = {
        name: workerForm.name.trim(), workType: workerForm.workType,
        ...(workerForm.ratePerHour !== '' ? { ratePerHour: parseFloat(workerForm.ratePerHour) || 0 } : {}),
        payMode: workerForm.payMode,
        ...(makingLogin
          ? { newAccount: { username: workerForm.loginUsername.trim(), password: workerForm.loginPassword,
              ...(workerForm.loginEmail.trim() ? { email: workerForm.loginEmail.trim() } : {}) } }
          : { userId: workerForm.userId ? Number(workerForm.userId) : null }),
      };
      if (editingWorker) {
        // A new password for their current login, if one was typed (checked first, so
        // a weak password doesn't leave the rest half-saved)
        if (changingPassword && workerForm.loginPassword) {
          await api.managedWorkers.setPassword(editingWorker.id, workerForm.loginPassword);
        }
        await api.managedWorkers.update(editingWorker.id, payload);
      } else await api.managedWorkers.create(payload);
      setShowWorkerModal(false);
      fetchWorkers();
    } catch (err) {
      setWorkerFormError(err instanceof Error && err.message ? err.message : 'Could not save the worker.');
    } finally { setSavingWorker(false); }
  };

  /** Reopen a finished task: its recorded hours and pay are cleared */
  const reopenTask = async (a: WorkerAssignment) => {
    const ok = await confirm({
      title: 'Reopen this task?',
      message: <>{a.jobOrderRef} for {a.workerName} goes back to In Progress so it can be submitted and approved again.</>,
      warning: `Its recorded ${a.hoursWorked != null ? `${a.hoursWorked}h and ` : ''}materials are cleared until it is approved again.`,
      confirmLabel: 'Reopen',
      variant: 'warning',
    });
    if (!ok) return;
    try { await api.workerAssignments.update(a.id, { status: 'in_progress' }); refreshAssignments(); }
    catch (err) { showError(err, "Couldn't reopen the task."); }
  };

  /** Give a task that hasn't started to another worker */
  const moveTaskToWorker = async (a: WorkerAssignment, worker: ManagedWorker) => {
    if (a.workerId === worker.id) return;
    if (a.status !== 'pending') {
      showError(null, 'Only a task that has not started can move to another worker.');
      return;
    }
    // A dated task keeps its date, so the new worker may be off that day
    if (a.scheduledDate && !(await okToSchedule(worker.id, worker.name, a.scheduledDate, a.jobOrderRef))) return;
    try {
      await api.workerAssignments.update(a.id, { workerId: worker.id });
      refreshAssignments();
    } catch (err) { showError(err, `Couldn't move ${a.jobOrderRef} to ${worker.name}.`); }
  };

  // ── Calendar toggles ──
  const toggleDay = async (dateStr: string) => {
    if (!calWorker || teamView || savingDate) return;
    setSavingDate(dateStr);
    const existing = availability.find(e => e.date === dateStr);
    try {
      if (!existing) await api.workerAvailability.set({ managedWorkerId: calWorker, date: dateStr, isAvailable: false });
      else await api.workerAvailability.set({ managedWorkerId: calWorker, date: dateStr, isAvailable: null });
      await fetchCalendar();
    } catch { /* ignore */ } finally { setSavingDate(null); }
  };

  const navMonth = (delta: number) => {
    let m = calMonth + delta, y = calYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCalMonth(m); setCalYear(y);
  };

  // ── Derived data ──
  const toReview = assignments.filter(a => a.status === 'submitted')
    .sort((a, b) => (a.submission?.submittedAt || '').localeCompare(b.submission?.submittedAt || ''));
  const activeWorkers   = workers.filter(w => w.isActive);
  const inactiveWorkers = workers.filter(w => !w.isActive);

  const filteredJO = jobOrders.filter(jo => {
    const matchStatus = joStatus === 'pending' ? jo.status === 'pending' : jo.status === 'in_progress';
    const q = joSearch.toLowerCase();
    const matchQ = !q || jo.jobOrderId.toLowerCase().includes(q) || jo.customerName.toLowerCase().includes(q) || jo.description.toLowerCase().includes(q);
    return matchStatus && matchQ;
  }).sort(byPriority);

  // Job orders someone is actively working on (or queued to): worker names per job order.
  // A job order with none of these is available work; removing its last assignment puts it back.
  const activeAssignees = assignments.reduce((acc, a) => {
    if (a.assignmentType !== 'special_task' && a.status !== 'completed' && a.jobOrderDbId) {
      acc.set(a.jobOrderDbId, [...(acc.get(a.jobOrderDbId) || []), a.workerName]);
    }
    return acc;
  }, new Map<number, string[]>());
  const availableJO = filteredJO.filter(jo => !activeAssignees.has(jo.id));
  const assignedJO  = filteredJO.filter(jo => activeAssignees.has(jo.id));
  const isPickedJob = (jo: JobOrder) => picked?.kind === 'job' && picked.jo.id === jo.id;
  const renderJobCard = (jo: JobOrder, compact = false) => {
    const on = isPickedJob(jo);
    return (
      <button
        key={jo.id}
        type="button"
        onClick={() => togglePickJob(jo)}
        aria-pressed={on}
        title={on ? 'Selected. Click again to unselect.' : 'Select, then click where it goes'}
        className={`w-full text-left rounded-xl border transition-colors ${compact ? 'p-2.5' : 'p-3'} ${on
          ? 'border-[#011c72] bg-[#eef1fb] ring-2 ring-[#011c72]'
          : 'border-gray-200 bg-gray-50 hover:bg-[#eef1fb] hover:border-[#c7d2f5]'}`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-xs font-bold text-[#011c72] font-mono">{jo.jobOrderId}</p>
            <PriorityBadge priority={jo.priority} />
          </div>
          {on && <span className="shrink-0 text-[10px] font-semibold text-white bg-[#011c72] px-1.5 py-0.5 rounded-full">Selected</span>}
        </div>
        <p className="text-xs text-gray-700 font-medium mt-0.5 truncate">{jo.customerName}</p>
        {!compact && <p className="text-xs text-gray-500 truncate">{jo.description}</p>}
        {activeAssignees.has(jo.id) && (
          <p className="text-[11px] text-[#011c72] font-medium truncate mt-1">
            Assigned to {activeAssignees.get(jo.id)!.join(', ')}
          </p>
        )}
      </button>
    );
  };

  /** "Placing X: click a … · Cancel", shown while something is picked */
  const pickedBanner = (where: string) => picked && (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-[#011c72] bg-[#eef1fb] text-sm text-[#011c72]">
      <span>
        <span className="font-mono font-bold">{pickedRef(picked, assignments)}</span> selected.{' '}
        {picked.kind === 'task' ? `Click ${where} to move it there.` : `Click ${where} to assign it.`}
      </span>
      <button type="button" onClick={() => setPicked(null)}
        className="px-3 py-1 rounded-lg border border-[#011c72]/30 bg-white text-xs font-semibold hover:bg-gray-50">Cancel (Esc)</button>
    </div>
  );

  const workerAssignmentsMap = assignments.reduce((acc, a) => {
    acc[a.workerId] = [...(acc[a.workerId] || []), a];
    return acc;
  }, {} as Record<number, WorkerAssignment[]>);

  const calDays    = daysInMonth(calYear, calMonth);
  const firstDay   = firstDayOfMonth(calYear, calMonth);
  const availMap   = Object.fromEntries(availability.map(e => [e.date, e]));
  const todayStr   = todayYMD();
  /** Open job orders that can go on the calendar, matching the search; ones nobody has yet first */
  const openJO = jobOrders.filter(jo => jo.status === 'pending' || jo.status === 'in_progress');
  const matchesJO = (jo: JobOrder, q: string) => {
    q = q.trim().toLowerCase();
    return !q || jo.jobOrderId.toLowerCase().includes(q) || jo.customerName.toLowerCase().includes(q)
      || (jo.description || '').toLowerCase().includes(q);
  };
  const availableFirst = (a: JobOrder, b: JobOrder) =>
    Number(activeAssignees.has(a.id)) - Number(activeAssignees.has(b.id)) || byPriority(a, b);
  const schedulableJO = openJO.filter(jo => matchesJO(jo, joSearch)).sort(availableFirst);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#011c72]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Worker Management</h1>
            <p className="text-sm text-gray-500 mt-1">
              Assign work to workers. They start and submit their own tasks{canApprove ? ', and you check and approve them' : ''}.
            </p>
          </div>
          {can('workers.add') && (
            <button onClick={openAdd}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#011c72] hover:bg-[#022a9e] text-white text-sm font-medium rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Add Worker
            </button>
          )}
        </div>

        {/* Finished work waiting for an administrator */}
        {toReview.length > 0 && (
          <div className="mb-6 bg-white rounded-2xl border border-amber-300 shadow-sm">
            <div className="px-5 py-3 border-b border-amber-200 bg-amber-50 rounded-t-2xl flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-amber-900">Waiting for approval ({toReview.length})</h2>
              <p className="text-xs text-amber-800">
                {canApprove ? 'Check what each worker submitted, then approve it or send it back.' : 'An administrator checks and approves these.'}
              </p>
            </div>
            <ul className="divide-y divide-gray-100">
              {toReview.map(a => (
                <li key={a.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {a.workerName} · <span className="font-mono">{a.assignmentType === 'special_task' ? (a.specialTaskTitle || 'Special Task') : a.jobOrderRef}</span>
                      {a.description && <span className="text-gray-500 font-normal"> · {a.description}</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {a.submission?.hours != null && <>{formatDuration(a.submission.hours)} worked · </>}
                      {a.submission?.materialsUsed.length ? `${a.submission.materialsUsed.length} material${a.submission.materialsUsed.length === 1 ? '' : 's'} · ` : ''}
                      submitted {a.submission?.submittedAt ? new Date(a.submission.submittedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                    </p>
                  </div>
                  {canApprove && (
                    <button type="button" onClick={() => setReviewFor(a)}
                      className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700">Check &amp; approve</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {actionError && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{actionError}</div>
        )}
        {actionWarning && (
          <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">{actionWarning}</div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 mb-6 w-fit shadow-sm">
          {([
            ['assign',   'Assign & Tasks'],
            ['workers',  'Workers & History'],
            ['calendar', 'Calendar'],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === id ? 'bg-[#011c72] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── ASSIGN TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'assign' && (
          // Phones: the job order list on top, the workers below it; side by side from tablets up
          <div className="flex flex-col md:flex-row gap-6 md:items-start">

            {/* Left — Job Orders panel */}
            <div className="w-full md:w-72 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col max-h-[60vh] md:max-h-[calc(100vh-200px)]">
              <div className="p-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Job Orders</h2>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-3 text-xs">
                  {(['pending', 'in_progress'] as const).map(s => (
                    <button key={s} onClick={() => setJoStatus(s)}
                      className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${joStatus === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                      {s === 'pending' ? 'Pending' : 'In Progress'}
                    </button>
                  ))}
                </div>
                <input type="text" value={joSearch} onChange={e => setJoSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1.5">
                {loadingJO ? (
                  <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-[#011c72] border-t-transparent rounded-full animate-spin" /></div>
                ) : filteredJO.length === 0 ? (
                  <p className="text-center text-gray-400 text-xs py-8">No {joStatus.replace('_',' ')} orders.</p>
                ) : (<>
                  <p className="px-1 pt-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Available ({availableJO.length})</p>
                  {availableJO.length === 0
                    ? <p className="text-center text-gray-400 text-xs py-4">Every {joStatus.replace('_',' ')} order has a worker.</p>
                    : availableJO.map(jo => renderJobCard(jo))}
                  {assignedJO.length > 0 && (<>
                    {/* Still assignable: a job order can need more than one trade (e.g. a sewer and a seat maker) */}
                    <button type="button" onClick={() => setShowAssignedJO(v => !v)}
                      className="w-full flex items-center justify-between px-1 pt-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700">
                      <span>Already assigned ({assignedJO.length})</span>
                      <span>{showAssignedJO ? '▲' : '▼'}</span>
                    </button>
                    {showAssignedJO && assignedJO.map(jo => renderJobCard(jo))}
                  </>)}
                </>)}
              </div>
              <div className="p-3 border-t border-gray-100 text-xs text-gray-400 text-center">
                Click a job order, then &quot;Assign here&quot; on a worker. It goes on today in the Calendar. Removing a worker puts it back in Available.
              </div>
            </div>

            {/* Right — Workers */}
            <div className="flex-1 min-w-0 space-y-4">
              {pickedBanner('"Assign here" on a worker')}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                  {([['today', 'Today'], ['all', 'All open tasks']] as const).map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setTaskView(id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${taskView === id ? 'bg-[#011c72] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  {taskView === 'today'
                    ? `Work for ${formatDate(todayStr)}, plus anything late or already started`
                    : 'Every unfinished task, whatever day it is for'}
                </p>
              </div>
              {activeWorkers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
                  No active workers. Click &quot;Add Worker&quot; to get started.
                </div>
              ) : activeWorkers.map(w => {
                // Open work, by when it is due (late, today, later, no date), then by priority
                const openAsgns = (workerAssignmentsMap[w.id]?.filter(a => a.status !== 'completed') || [])
                  .sort((a, b) => dueOf(a.scheduledDate, todayStr).rank - dueOf(b.scheduledDate, todayStr).rank
                    || (a.scheduledDate || '').localeCompare(b.scheduledDate || '') || tasksByPriority(a, b));
                const todaysAsgns = openAsgns.filter(a => isTodaysWork(a, todayStr));
                const workerAsgns = taskView === 'today' ? todaysAsgns : openAsgns;
                const hiddenCount = openAsgns.length - workerAsgns.length;
                // A picked task can't "move" to the worker it already belongs to
                const pickedTask = picked?.kind === 'task' ? assignments.find(a => a.id === picked.id) : undefined;
                const canTake = !!picked && (picked.kind === 'job' || (!!pickedTask && pickedTask.workerId !== w.id));
                const hasPickedJob = picked?.kind === 'job' && !!openAssignmentFor(w.id, picked.jo.id);
                return (
                  <div
                    key={w.id}
                    className={`bg-white rounded-2xl border-2 shadow-sm transition-colors ${canTake ? 'border-[#c7d2f5]' : 'border-gray-200'}`}
                  >
                    {/* Worker header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#011c72]/10 text-[#011c72] flex items-center justify-center font-bold text-sm shrink-0">
                          {w.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{w.name}</p>
                          <p className="text-xs text-gray-500">{w.workType}</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 text-right shrink-0">
                        <span className={`font-semibold ${todaysAsgns.length >= BUSY_DAY_TASKS ? 'text-amber-700' : 'text-gray-900'}`}>
                          {todaysAsgns.length} today
                        </span>
                        {' · '}{openAsgns.length} open
                      </p>
                    </div>

                    {/* Assignments */}
                    <div className="p-3">
                      {canTake && (
                        hasPickedJob ? (
                          <div className="mb-2 text-center text-xs text-gray-500 py-2 rounded-xl border border-dashed border-gray-300">
                            Already working on {pickedRef(picked!, assignments)}.{' '}
                            <button type="button" onClick={() => assignPickedToWorker(w, true)}
                              className="font-semibold text-[#011c72] hover:underline">+ Give another task</button>
                            <p className="text-[10px] text-gray-400 mt-0.5">It can start once their first task is finished.</p>
                          </div>
                        ) : (
                          <button type="button" onClick={() => assignPickedToWorker(w)}
                            className="mb-2 w-full flex items-center justify-center gap-1.5 h-11 rounded-xl border-2 border-dashed border-[#011c72] text-[#011c72] text-xs font-semibold hover:bg-[#eef1fb]">
                            <span className="text-base leading-none">+</span>
                            {picked!.kind === 'task' ? 'Move' : 'Assign'} <span className="font-mono">{pickedRef(picked!, assignments)}</span> here
                          </button>
                        )
                      )}
                      {workerAsgns.length === 0 && !canTake ? (
                        <p className="text-xs text-gray-400 text-center py-4">
                          {taskView === 'today' && hiddenCount > 0
                            ? 'Nothing for today.'
                            : 'No active assignments. Click a job order to assign it here.'}
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {/* Tasks are already in date order (late, today, later, no date): one row per day */}
                          {workerAsgns.reduce((groups, a) => {
                            const key = a.scheduledDate || '';
                            const last = groups[groups.length - 1];
                            if (last && last.key === key) last.items.push(a);
                            else groups.push({ key, items: [a] });
                            return groups;
                          }, [] as { key: string; items: WorkerAssignment[] }[]).map(group => {
                            const due = dueOf(group.key || null, todayStr);
                            return (
                          <div key={group.key || 'none'}>
                            <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-gray-500">
                              <span className={`px-1.5 py-0.5 rounded ${due.cls}`}>{due.text}</span>
                              <span className="font-normal text-gray-400">{group.items.length} task{group.items.length === 1 ? '' : 's'}</span>
                            </p>
                        <div className="flex flex-wrap gap-2">
                          {group.items.map(a => (
                            <div key={a.id}
                              className={`group relative flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors
                                ${picked?.kind === 'task' && picked.id === a.id ? 'ring-2 ring-[#011c72]' : ''}
                                ${a.assignmentType === 'special_task' ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-gray-50 border-gray-200 text-gray-800'}`}>
                              <div>
                                <p className="font-bold flex items-center gap-1.5">
                                  {a.assignmentType === 'special_task' ? (a.specialTaskTitle || 'Special Task') : a.jobOrderRef}
                                  <PriorityBadge priority={a.jobOrderPriority} />
                                </p>
                                {a.description && <p className="text-gray-400 font-normal truncate max-w-30">{a.description}</p>}
                                {blocked(a) && <p className="text-amber-700 font-normal text-[10px] max-w-40 truncate" title={waitMsg(a)}>⏳ {waitMsg(a)}</p>}
                                {!blocked(a) && a.cuttingNotDone && (
                                  <p className="text-amber-700 font-normal text-[10px] max-w-40 truncate" title={a.cuttingNotDone}>✂ Not cut yet</p>
                                )}
                              </div>
                              {/* Level with the job order number, not floating in the middle of the card */}
                              <span className={`shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge(a.status)}`}>
                                {statusText(a.status)}
                              </span>
                              {/* Checking submitted work is always in view, not only on hover */}
                              {a.status === 'submitted' && canApprove && (
                                <button onClick={() => setReviewFor(a)} title="Check and approve"
                                  className="shrink-0 px-2 py-0.5 rounded-lg bg-green-600 text-white text-[10px] font-semibold hover:bg-green-700">
                                  Check
                                </button>
                              )}
                              {/* Actions: assigning only. Workers start and finish their own tasks */}
                              <div className="hidden group-hover:flex group-focus-within:flex items-center gap-1 ml-1">
                                {a.status === 'pending' && a.assignmentType !== 'special_task' && (
                                  <button onClick={() => togglePickTask(a.id)} title="Move to another worker"
                                    className="p-1 rounded-lg bg-[#eef1fb] text-[#011c72] hover:bg-[#dde6ff]">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                                  </button>
                                )}
                                {(a.status === 'pending' || a.status === 'in_progress') && (
                                  <button onClick={() => removeAssignment(a)} title="Remove"
                                    className="p-1 rounded-lg bg-red-100 text-red-600 hover:bg-red-200">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                          </div>
                            );
                          })}
                        </div>
                      )}
                      {taskView === 'today' && hiddenCount > 0 && (
                        <button type="button" onClick={() => setTaskView('all')}
                          className="mt-2 text-[11px] text-gray-500 hover:text-[#011c72] hover:underline">
                          + {hiddenCount} more on later days or with no date
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── WORKERS & HISTORY TAB ──────────────────────────────────────── */}
        {activeTab === 'workers' && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-6">
              <div className="p-5 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-900">Active Workers ({activeWorkers.length})</h2>
              </div>
              {activeWorkers.length === 0 ? (
                <p className="p-10 text-center text-gray-400 text-sm">No workers yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activeWorkers.map(w => {
                    const wAsgns = workerAssignmentsMap[w.id] || [];
                    const tasksDone = wAsgns.filter(a => a.status === 'completed').length;
                    const wExtras = workerExtras.filter(x => x.workerId === w.id);
                    return (
                      <div key={w.id}>
                      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#011c72]/10 text-[#011c72] flex items-center justify-center font-bold">
                            {w.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{w.name}</p>
                            <p className="text-xs text-gray-500">
                              {w.userName && <span className="mr-1.5 inline-flex px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">Login: {w.userName}</span>}
                              {w.workType}
                              {tasksDone > 0 && <span className="ml-2 text-green-600 font-medium">{tasksDone} task{tasksDone === 1 ? '' : 's'} done</span>}
                              {wExtras.length > 0 && <span className="ml-2 text-amber-700 font-medium">{wExtras.length} extra material{wExtras.length === 1 ? '' : 's'}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button onClick={() => setSummaryFor(w)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#011c72] text-white hover:bg-[#022a9e]">
                            Work history
                          </button>
                          <button onClick={() => setOpenExtrasFor(openExtrasFor === w.id ? null : w.id)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">
                            Materials ({wExtras.length}) {openExtrasFor === w.id ? '▲' : '▼'}
                          </button>
                          {canEditWorkers && (<>
                            <button onClick={() => openEdit(w)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">Edit</button>
                            <button onClick={() => api.managedWorkers.update(w.id, { isActive: false }).then(fetchWorkers)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Deactivate</button>
                          </>)}
                        </div>
                      </div>
                      {openExtrasFor === w.id && (
                        <div className="px-5 pb-4">
                          {wExtras.length === 0 ? (
                            <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
                              No extra material issued under {w.name}&apos;s name.
                            </p>
                          ) : (
                            <div className="overflow-x-auto border border-gray-200 rounded-xl">
                              <table className="w-full min-w-150 text-xs">
                                <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                                    <th className="px-3 py-2 text-left font-semibold">Job order</th>
                                    <th className="px-3 py-2 text-left font-semibold">Material</th>
                                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                                    <th className="px-3 py-2 text-left font-semibold">Reason</th>
                                    {can('inventory.log_waste') && <th className="px-3 py-2"></th>}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {wExtras.map(x => (
                                    <tr key={x.id}>
                                      <td className="px-3 py-2 text-gray-600">{formatDate(x.createdAt)}</td>
                                      <td className="px-3 py-2">
                                        {x.jobOrderId
                                          ? <button onClick={() => router.push(`/sales/${x.jobOrderId}`)} className="font-mono text-[#011c72] hover:underline">{x.jobOrderNumber}</button>
                                          : '—'}
                                      </td>
                                      <td className="px-3 py-2 text-gray-800">{x.materialName}{x.materialColor ? ` - ${x.materialColor}` : ''}</td>
                                      <td className="px-3 py-2 text-right text-gray-800">{x.quantity}</td>
                                      <td className="px-3 py-2 text-gray-600">{x.reason}</td>
                                      {can('inventory.log_waste') && (
                                        <td className="px-3 py-2 text-right">
                                          <button onClick={() => undoWorkerExtra(x)} title="Undo: return it to stock"
                                            className="text-gray-500 hover:text-red-600 hover:underline">Undo</button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                      </div>
                    );
                  })}
                </div>
              )}
              {inactiveWorkers.length > 0 && (
                <div className="border-t border-gray-200 px-5 py-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Inactive</p>
                  <div className="flex flex-wrap gap-2">
                    {inactiveWorkers.map(w => (
                      <div key={w.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                        <span className="text-sm text-gray-500">{w.name}</span>
                        {canEditWorkers && (
                          <button onClick={() => api.managedWorkers.update(w.id, { isActive: true }).then(fetchWorkers)} className="text-xs text-[#011c72] font-medium hover:underline">Reactivate</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* All assignments table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
              <div className="p-5 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-900">All Assignments</h2>
              </div>
              {assignments.length === 0 ? (
                <p className="p-10 text-center text-gray-400 text-sm">No assignments yet.</p>
              ) : (
                <Paginated items={assignments} label="assignments">{rows => (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Worker','Type','Ref / Task','Status','Hours','Actions'].map((h, i) => (
                          <th key={h} className={`px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-5 py-4 font-medium text-gray-900 whitespace-nowrap">{a.workerName}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-block whitespace-nowrap px-2 py-0.5 text-xs rounded-full ${a.assignmentType === 'special_task' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {a.assignmentType === 'special_task' ? 'Special' : 'Job Order'}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-mono text-gray-700 whitespace-nowrap">
                            {a.assignmentType === 'special_task' ? (a.specialTaskTitle || '—') : a.jobOrderRef}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-block whitespace-nowrap px-2.5 py-1 text-xs rounded-full border ${statusBadge(a.status)}`}>
                              {statusText(a.status)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right text-gray-700">
                            {a.hoursWorked != null ? `${a.hoursWorked}h`
                              : a.status === 'submitted' && a.submission?.hours != null ? <span className="text-amber-700">{a.submission.hours}h</span> : '—'}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {/* One evenly spaced row, so the buttons don't stack unevenly on phones */}
                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            {a.status === 'submitted' && canApprove && (
                              <button onClick={() => setReviewFor(a)}
                                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">Check &amp; approve</button>
                            )}
                            {a.status === 'completed' && canApprove && (
                              <button onClick={() => reopenTask(a)}
                                className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Reopen</button>
                            )}
                            {(a.status === 'pending' || a.status === 'in_progress') && (
                              <button onClick={() => removeAssignment(a)}
                                className="px-2 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">✕</button>
                            )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}</Paginated>
              )}
            </div>
          </>
        )}

        {/* ── CALENDAR TAB ───────────────────────────────────────────────── */}
        {activeTab === 'calendar' && (
          <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-start">

            <div className="w-full lg:w-64 shrink-0 space-y-4">
              {/* Job orders: pick one, then click a day */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col" style={{ maxHeight: 'calc(60vh - 80px)' }}>
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Job Orders</h3>
                  <p className="text-[11px] text-gray-400 mb-2">Click one, then click a day. Or use a day&apos;s + button.</p>
                  <input type="text" value={joSearch} onChange={e => setJoSearch(e.target.value)}
                    placeholder="Search job orders…"
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-900" />
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-1.5">
                  {schedulableJO.length === 0
                    ? <p className="text-center text-gray-400 text-xs py-4">No pending or in-progress job orders.</p>
                    : schedulableJO.map(jo => renderJobCard(jo, true))}
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              {/* Worker + month nav */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Worker:</label>
                  <select value={calWorker ?? ''} onChange={e => { setCalWorker(parseInt(e.target.value)); setDayPanel(null); }}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 min-w-45">
                    <option value={TEAM_VIEW}>All workers (team view)</option>
                    {activeWorkers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.workType})</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => navMonth(-1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <span className="text-base font-semibold text-gray-900 w-36 text-center">{MONTH_NAMES[calMonth]} {calYear}</span>
                  <button onClick={() => navMonth(1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                  </button>
                  {loadingCal && <div className="w-4 h-4 border-2 border-[#011c72] border-t-transparent rounded-full animate-spin" />}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center flex-wrap gap-4 mb-2 text-xs text-gray-500">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-white border border-gray-300" /><span>Available</span></div>
                {!teamView && <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-100 border border-red-300" /><span>Off</span></div>}
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-100 border border-blue-300" /><span>Has work</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-100 border border-green-300" /><span>Done</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded border-2 border-[#011c72]" /><span>Today</span></div>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Press a day&apos;s + to assign a job order to it. Click a day to see its work{teamView ? '' : ' or mark it off'}; click a task for details, or to move it to another day.
              </p>
              {pickedBanner('a day')}

              {/* Phones: the month as a list of days */}
              <div className="md:hidden divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {Array.from({ length: calDays }, (_, i) => i + 1).map(day => {
                  const dateStr = toYMD(calYear, calMonth, day);
                  const dayAsgns = calAssignments[dateStr] || [];
                  const isOff = !teamView && availMap[dateStr] && !availMap[dateStr].isAvailable;
                  const isToday = dateStr === todayStr;
                  return (
                    <div key={day} className={`flex items-stretch ${picked && isPastDay(dateStr) ? 'bg-gray-50 opacity-50' : picked ? 'bg-[#f5f7fe]' : isOff ? 'bg-red-50' : isToday ? 'bg-[#eef1fb]' : 'bg-white'}`}>
                    <button type="button" onClick={() => onDayClick(dateStr)}
                      aria-label={picked ? `Put ${pickedRef(picked, assignments)} on ${formatDate(dateStr)}` : undefined}
                      className="flex-1 min-w-0 text-left px-3 py-2.5 flex items-start gap-3">
                      <div className="w-12 shrink-0">
                        <p className={`text-sm font-bold ${isToday ? 'text-[#011c72]' : isOff ? 'text-red-600' : 'text-gray-800'}`}>{day}</p>
                        <p className="text-[10px] text-gray-400">{DAY_LABELS[new Date(calYear, calMonth, day).getDay()]}</p>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                        {isOff && <span className="text-[11px] font-medium text-red-600">Off</span>}
                        {dayAsgns.length === 0 && !isOff && <span className="text-[11px] text-gray-300">—</span>}
                        {dayAsgns.map(a => (
                          <span key={a.id} className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${a.status === 'completed' ? 'bg-green-100 text-green-700'
                            : a.jobOrderPriority === 'urgent' ? 'bg-red-100 text-red-700' : a.jobOrderPriority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                            {teamView ? `${a.workerName.split(' ')[0]}: ` : ''}{a.assignmentType === 'special_task' ? (a.specialTaskTitle || 'Task') : a.jobOrderRef}
                          </span>
                        ))}
                      </div>
                    </button>
                    {isPastDay(dateStr) ? <span className="shrink-0 w-11" aria-hidden /> : (
                      <button type="button" onClick={() => openAssignForm(dateStr)} title="Assign a job order to this day"
                        aria-label={`Assign a job order to ${formatDate(dateStr)}`}
                        className="shrink-0 w-11 flex items-center justify-center text-lg font-bold text-[#011c72] hover:bg-[#eef1fb]">+</button>
                    )}
                    </div>
                  );
                })}
              </div>

              {/* Grid */}
              <div className="hidden md:block select-none">
                <div className="grid grid-cols-7 mb-1">
                  {DAY_LABELS.map(d => <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: calDays }, (_, i) => i + 1).map(day => {
                    const dateStr = toYMD(calYear, calMonth, day);
                    const entry = availMap[dateStr];
                    const isUnavail = !teamView && entry && !entry.isAvailable;
                    const isToday = dateStr === todayStr;
                    const isSaving = savingDate === dateStr;
                    const dayAsgns = calAssignments[dateStr] || [];
                    const hasAsgns = dayAsgns.length > 0;
                    const isPast = isPastDay(dateStr);
                    return (
                      <div key={day}
                        role="button" tabIndex={0}
                        aria-label={picked ? `Put ${pickedRef(picked, assignments)} on ${formatDate(dateStr)}` : `${formatDate(dateStr)}: see the day's work`}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDayClick(dateStr); } }}
                        className={`group relative min-h-20 rounded-lg border p-1 flex flex-col transition-colors cursor-pointer
                          ${isUnavail ? 'bg-red-50 border-red-200' : ''}
                          ${!isUnavail ? 'bg-white border-gray-200 hover:bg-gray-50' : ''}
                          ${hasAsgns && !isUnavail ? 'bg-blue-50 border-blue-200' : ''}
                          ${picked && !isPast ? 'hover:bg-[#dde6ff]! hover:border-[#011c72]! hover:ring-1 hover:ring-[#011c72]' : ''}
                          ${picked && isPast ? 'opacity-40 cursor-not-allowed' : ''}
                          ${isToday ? 'border-2 border-[#011c72]' : ''}
                        `}
                        onClick={() => onDayClick(dateStr)}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-semibold ${isUnavail ? 'text-red-600' : isToday ? 'text-[#011c72]' : 'text-gray-700'}`}>{day}</span>
                          {!picked && !isPast && (
                            <button type="button" onClick={e => { e.stopPropagation(); openAssignForm(dateStr); }}
                              title="Assign a job order to this day" aria-label={`Assign a job order to ${formatDate(dateStr)}`}
                              className="w-5 h-5 flex items-center justify-center rounded-md text-sm font-bold leading-none text-[#011c72] opacity-40 group-hover:opacity-100 focus:opacity-100 hover:bg-[#011c72] hover:text-white">+</button>
                          )}
                        </div>
                        {isUnavail && <div className="text-[9px] text-red-500 leading-tight">Off</div>}
                        {isSaving && <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg"><div className="w-3 h-3 border-2 border-[#011c72] border-t-transparent rounded-full animate-spin" /></div>}
                        {dayAsgns.slice(0, 3).map(a => (
                          <div key={a.id}
                            // With something picked, a click anywhere on the day places it there
                            onClick={e => { if (picked) return; e.stopPropagation(); setTaskPanel(a.id); }}
                            title={`${a.jobOrderRef}${a.description ? ' – ' + a.description : ''}${teamView ? ' · ' + a.workerName : ''}`}
                            className={`mt-0.5 text-[9px] leading-tight px-1 py-0.5 rounded truncate font-medium hover:ring-1 hover:ring-[#011c72]
                              ${a.status === 'completed' ? 'bg-green-100 text-green-700' : a.assignmentType === 'special_task' ? 'bg-purple-100 text-purple-700'
                                : a.jobOrderPriority === 'urgent' ? 'bg-red-100 text-red-700' : a.jobOrderPriority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}
                              ${picked?.kind === 'task' && picked.id === a.id ? 'ring-2 ring-[#011c72]' : ''}`}>
                            {teamView ? `${a.workerName.split(' ')[0]}: ` : ''}
                            {a.assignmentType === 'special_task' ? (a.specialTaskTitle || 'Task') : a.jobOrderRef}
                          </div>
                        ))}
                        {dayAsgns.length > 3 && <div className="text-[9px] text-[#011c72] font-medium mt-0.5">+{dayAsgns.length - 3} more</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Calendar: one day's work ─────────────────────────────────────────── */}
      {dayPanel && (() => {
        const dayAsgns = calAssignments[dayPanel] || [];
        const isOff = !teamView && availability.some(e => e.date === dayPanel && !e.isAvailable);
        const workerName = teamView ? 'All workers' : workers.find(w => w.id === calWorker)?.name;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setDayPanel(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{formatDate(dayPanel)}</h2>
                  <p className="text-xs text-gray-500">{workerName}{isOff ? ' · Off this day' : ''}</p>
                </div>
                <button onClick={() => setDayPanel(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
              <div className="p-5 overflow-y-auto flex-1 space-y-2">
                {dayAsgns.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Nothing scheduled.</p>
                ) : dayAsgns.map(a => (
                  <button key={a.id} type="button" onClick={() => { setDayPanel(null); setTaskPanel(a.id); }}
                    className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                        <span className="font-mono">{a.assignmentType === 'special_task' ? (a.specialTaskTitle || 'Task') : a.jobOrderRef}</span>
                        <PriorityBadge priority={a.jobOrderPriority} />
                      </p>
                      <p className="text-xs text-gray-500 truncate">{teamView ? `${a.workerName} · ` : ''}{a.description}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge(a.status)}`}>{a.status.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
              {!teamView && (
                <div className="p-5 border-t border-gray-200 flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">{isOff ? 'Marked as a day off.' : 'Available this day.'}</p>
                  <button type="button" onClick={() => toggleDay(dayPanel)} disabled={savingDate === dayPanel}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${isOff
                      ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      : 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'}`}>
                    {isOff ? 'Mark as available' : 'Mark as day off'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Calendar: one task's details ─────────────────────────────────────── */}
      {taskPanel !== null && (() => {
        const a = assignments.find(x => x.id === taskPanel);
        if (!a) return null;
        const close = () => setTaskPanel(null);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={close}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span className="font-mono">{a.assignmentType === 'special_task' ? (a.specialTaskTitle || 'Special Task') : a.jobOrderRef}</span>
                    <PriorityBadge priority={a.jobOrderPriority} />
                  </h2>
                  <p className="text-xs text-gray-500">{a.workerName} · {a.description || a.workType}</p>
                </div>
                <button onClick={close} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Status</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(a.status)}`}>{statusText(a.status)}</span>
                </div>
                {a.status === 'completed' ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Time worked</span>
                    <span className="font-semibold text-green-700">{a.hoursWorked != null ? formatDuration(a.hoursWorked) : '—'}</span>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Scheduled date</label>
                    <div className="flex items-center gap-2">
                      <input type="date" value={a.scheduledDate || ''} min={todayStr}
                        onChange={e => e.target.value && scheduleTask(a, e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
                      {a.scheduledDate && (
                        <button type="button" onClick={() => scheduleTask(a, null)}
                          className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">Clear date</button>
                      )}
                    </div>
                    {!a.scheduledDate && <p className="text-[11px] text-gray-400 mt-1">Not on the calendar yet.</p>}
                    {activeTab === 'calendar' && (
                      <button type="button" onClick={() => { close(); setPicked({ kind: 'task', id: a.id }); }}
                        className="mt-2 text-xs font-medium text-[#011c72] hover:underline">
                        {a.scheduledDate ? 'Move to another day on the calendar' : 'Pick a day on the calendar'}
                      </button>
                    )}
                  </div>
                )}
                {a.status === 'pending' && a.assignmentType !== 'special_task' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Worker</label>
                    <select value={a.workerId}
                      onChange={e => { const w = activeWorkers.find(x => x.id === Number(e.target.value)); if (w) moveTaskToWorker(a, w); }}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900">
                      {!activeWorkers.some(w => w.id === a.workerId) && <option value={a.workerId}>{a.workerName}</option>}
                      {activeWorkers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.workType})</option>)}
                    </select>
                  </div>
                )}
                {a.isOverdue && (
                  <p className="text-xs text-red-600">Running {a.overdueByHours}h over the expected time.</p>
                )}
                {blocked(a) && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {waitMsg(a)}. Work on a job order goes in the order it was assigned.
                  </p>
                )}
                {a.status === 'submitted' && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Finished{a.submission?.hours != null ? ` (${formatDuration(a.submission.hours)})` : ''} and waiting for an administrator to approve it.
                  </p>
                )}
                {a.status === 'in_progress' && a.reviewNote && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Sent back to the worker: {a.reviewNote}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {a.status === 'submitted' && canApprove && (
                    <button type="button" onClick={() => { close(); setReviewFor(a); }}
                      className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700">Check &amp; approve</button>
                  )}
                  {a.status === 'completed' && canApprove && (
                    <button type="button" onClick={() => { close(); reopenTask(a); }}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50">Reopen</button>
                  )}
                  {a.jobOrderDbId && (
                    <button type="button" onClick={() => router.push(`/sales/${a.jobOrderDbId}`)}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50">Open job order</button>
                  )}
                  {(a.status === 'pending' || a.status === 'in_progress') && (
                    <button type="button" onClick={() => { close(); removeAssignment(a); }}
                      className="ml-auto px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50">Remove</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Calendar: assign a job order to a day (+ button, or picked then day clicked) ── */}
      {assignForm && (() => {
        const f = assignForm;
        const close = () => setAssignForm(null);
        const jo = f.jobId != null ? jobOrders.find(j => j.id === f.jobId) : undefined;
        const worker = f.workerId ? workers.find(w => w.id === f.workerId) : undefined;
        // Look for one already on this day first, so it isn't mistaken for a move
        const existing = jo && f.workerId
          ? (assignments.find(a => a.workerId === f.workerId && a.jobOrderDbId === jo.id && a.status !== 'completed'
              && a.assignmentType !== 'special_task' && a.scheduledDate === f.date) || openAssignmentFor(f.workerId, jo.id))
          : undefined;
        const alreadyThere = existing?.scheduledDate === f.date;
        // Only the same work finished by them is a rework; a finished task from another
        // step (cutting before sewing) is the normal flow, so there's nothing to warn about
        const trade = taskBase(worker?.workType.replace(/_/g, ' '));
        const finishedBefore = !existing && jo && f.workerId
          ? assignments.some(a => a.workerId === f.workerId && a.jobOrderDbId === jo.id && a.status === 'completed'
              && a.assignmentType !== 'special_task' && taskBase(a.description) === trade)
          : false;
        const isOff = !!f.workerId && f.workerId === calWorker && availability.some(e => e.date === f.date && !e.isAvailable);
        const choices = openJO.filter(j => matchesJO(j, f.search)).sort(availableFirst);
        const set = (patch: Partial<AssignForm>) => setAssignForm(prev => (prev ? { ...prev, ...patch } : prev));
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={close}>
            <div role="dialog" aria-modal="true" aria-labelledby="assign-form-title"
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
                <div>
                  <h2 id="assign-form-title" className="text-base font-semibold text-gray-900">Assign work for {formatDate(f.date)}</h2>
                  <p className="text-xs text-gray-500">Choose the job order and the worker, then confirm.</p>
                </div>
                <button onClick={close} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                {/* Job order */}
                {jo ? (
                  <div className="rounded-xl border border-[#011c72] bg-[#eef1fb] p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-[#011c72]">{jo.jobOrderId}</span>
                        <PriorityBadge priority={jo.priority} />
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge(jo.status)}`}>{jo.status.replace('_', ' ')}</span>
                      </div>
                      <button type="button" onClick={() => set({ jobId: null })}
                        className="shrink-0 text-xs font-medium text-[#011c72] hover:underline">Change</button>
                    </div>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-gray-500">Customer</dt><dd className="text-gray-900">{jo.customerName}</dd>
                      {jo.description && <><dt className="text-gray-500">Work</dt><dd className="text-gray-900">{jo.description}</dd></>}
                      {jo.branchName && <><dt className="text-gray-500">Branch</dt><dd className="text-gray-900">{jo.branchName}</dd></>}
                      {jo.estimatedCompletion && <><dt className="text-gray-500">Due</dt><dd className="text-gray-900">{formatDate(jo.estimatedCompletion)}</dd></>}
                      <dt className="text-gray-500">Assigned to</dt>
                      <dd className="text-gray-900">{activeAssignees.get(jo.id)?.join(', ') || 'Nobody yet'}</dd>
                    </dl>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="assign-jo-search" className="block text-xs font-medium text-gray-600 mb-1">Job order</label>
                    <input id="assign-jo-search" type="text" value={f.search} onChange={e => set({ search: e.target.value })}
                      placeholder="Search by number, customer or work…" autoFocus
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 mb-2" />
                    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                      {choices.length === 0 ? (
                        <p className="text-center text-gray-400 text-xs py-4">No pending or in-progress job orders{f.search ? ' match' : ''}.</p>
                      ) : choices.map(j => (
                        <button key={j.id} type="button" onClick={() => set({ jobId: j.id })}
                          className="w-full text-left p-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-[#eef1fb] hover:border-[#c7d2f5] text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-[#011c72]">{j.jobOrderId}</span>
                            <PriorityBadge priority={j.priority} />
                            <span className="ml-auto text-[10px] text-gray-400">{j.status.replace('_', ' ')}</span>
                          </div>
                          <p className="text-gray-700 truncate">{j.customerName}{j.description ? ` · ${j.description}` : ''}</p>
                          <p className={`text-[11px] ${activeAssignees.has(j.id) ? 'text-[#011c72] font-medium' : 'text-gray-400'}`}>
                            {activeAssignees.has(j.id) ? `Assigned to ${activeAssignees.get(j.id)!.join(', ')}` : 'Available'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Worker */}
                <div>
                  <label htmlFor="assign-worker" className="block text-xs font-medium text-gray-600 mb-1">Worker</label>
                  <select id="assign-worker" value={f.workerId ?? ''} onChange={e => set({ workerId: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900">
                    <option value="">Choose a worker…</option>
                    {activeWorkers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.workType})</option>)}
                  </select>
                  {isOff && <p className="text-xs text-red-600 mt-1">{worker?.name} is marked off on this day.</p>}
                  {finishedBefore && (
                    <p className="text-xs text-amber-700 mt-1">
                      {worker?.name} already finished {jo!.jobOrderId}. You&apos;ll be asked if this is rework, and why.
                    </p>
                  )}
                  {existing && (alreadyThere ? (
                    // Same worker, same job order, same day: nothing to do unless a separate
                    // task is really needed (each one is its own labor line, paid separately)
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs text-amber-800">
                        {worker?.name} already has {jo!.jobOrderId} on this day.
                      </p>
                      <label className="mt-1.5 flex items-start gap-2 text-xs text-gray-800 cursor-pointer">
                        <input type="checkbox" checked={f.another} onChange={e => set({ another: e.target.checked })}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-[#011c72]" />
                        Add a separate task anyway. It counts on its own and can start once their first one is finished.
                      </label>
                    </div>
                  ) : (
                    <fieldset className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <legend className="px-1 text-xs text-amber-800">
                        {worker?.name} already has {jo!.jobOrderId}{existing.scheduledDate ? ` on ${formatDate(existing.scheduledDate)}` : ' without a date'}.
                      </legend>
                      <label className="flex items-start gap-2 text-xs text-gray-800 cursor-pointer">
                        <input type="radio" name="assign-mode" checked={!f.another} onChange={() => set({ another: false })} className="mt-0.5 accent-[#011c72]" />
                        Move that task to this day
                      </label>
                      <label className="mt-1.5 flex items-start gap-2 text-xs text-gray-800 cursor-pointer">
                        <input type="radio" name="assign-mode" checked={f.another} onChange={() => set({ another: true })} className="mt-0.5 accent-[#011c72]" />
                        Add another task on this day (it can start once their first one is finished)
                      </label>
                    </fieldset>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400">The job order&apos;s status and priority stay as they are.</p>
              </div>

              <div className="p-5 border-t border-gray-200 flex gap-3">
                <button type="button" onClick={submitAssignForm} disabled={!jo || !f.workerId || savingAssign || (alreadyThere && !f.another)}
                  className="flex-1 py-2.5 bg-[#011c72] hover:bg-[#022a9e] text-white text-sm font-medium rounded-xl disabled:opacity-50">
                  {savingAssign ? 'Saving…' : existing && !alreadyThere && !f.another ? 'Move to this day' : existing ? 'Add another task' : 'Assign'}
                </button>
                <button type="button" onClick={close}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Rework: the worker already finished this job order ─────────────────── */}
      {rework && (() => {
        const r = rework;
        const close = () => { if (!r.saving) setRework(null); };
        const set = (patch: Partial<ReworkPrompt>) => setRework(prev => (prev ? { ...prev, ...patch, error: '' } : prev));
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={close}>
            <div role="dialog" aria-modal="true" aria-labelledby="rework-title"
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
                <div>
                  <h2 id="rework-title" className="text-base font-semibold text-gray-900">
                    {r.workerName} already finished <span className="font-mono">{r.jobRef}</span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.previous ? `${r.previous}, ` : ''}completed{r.completedAt ? ` on ${formatDate(r.completedAt)}` : ''}.
                  </p>
                </div>
                <button onClick={close} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-gray-700">
                  Do they need to work on it again? It is added as a new rework task
                  {r.date ? <> on <span className="font-medium">{formatDate(r.date)}</span></> : null}, counted separately when it is completed.
                  Their finished task stays as it is.
                </p>
                <fieldset>
                  <legend className="block text-xs font-medium text-gray-600 mb-2">Reason for the rework *</legend>
                  <div className="space-y-1.5">
                    {REWORK_REASONS.map(reason => (
                      <label key={reason} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${r.reason === reason ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input type="radio" name="rework-reason" value={reason} checked={r.reason === reason}
                          onChange={() => set({ reason })} className="accent-[#011c72]" />
                        {reason}
                      </label>
                    ))}
                  </div>
                  {r.reason === 'Other' && (
                    <input type="text" value={r.other} onChange={e => set({ other: e.target.value })} maxLength={150} autoFocus
                      aria-label="Other reason" placeholder="Write the reason…"
                      className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
                  )}
                </fieldset>
                {r.error && <p role="alert" className="text-sm text-red-600">{r.error}</p>}
              </div>
              <div className="p-5 border-t border-gray-200 flex gap-3">
                <button type="button" onClick={submitRework} disabled={r.saving}
                  className="flex-1 py-2.5 bg-[#011c72] hover:bg-[#022a9e] text-white text-sm font-medium rounded-xl disabled:opacity-50">
                  {r.saving ? 'Saving…' : 'Yes, assign as rework'}
                </button>
                <button type="button" onClick={close} disabled={r.saving}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm disabled:opacity-50">No</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add/Edit Worker Modal ───────────────────────────────────────────── */}
      {summaryFor && (
        <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center p-2 sm:p-4 z-50" onClick={() => setSummaryFor(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="work-summary-title"
            className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 bg-white rounded-t-2xl flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 id="work-summary-title" className="text-lg font-semibold text-gray-900 truncate">{summaryFor.name}: work history</h2>
                <p className="text-xs text-gray-500">{summaryFor.workType}</p>
              </div>
              <button onClick={() => setSummaryFor(null)} aria-label="Close"
                className="w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 text-xl leading-none">×</button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto">
              <WorkerWorkSummary workerId={summaryFor.id} />
            </div>
          </div>
        </div>
      )}

      {showWorkerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowWorkerModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{editingWorker ? 'Edit Worker' : 'Add Worker'}</h2>
              <button onClick={() => setShowWorkerModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" value={workerForm.name} onChange={e => setWorkerForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="e.g. Juan dela Cruz" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                <select value={workerForm.workType} onChange={e => setWorkerForm(f => ({ ...f, workType: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent">
                  {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pay Mode</label>
                <div className="flex rounded-xl border border-gray-300 overflow-hidden text-sm">
                  {PAY_MODES.map(pm => (
                    <button key={pm.value} type="button" onClick={() => setWorkerForm(f => ({ ...f, payMode: pm.value,
                      // The rate isn't shown: a worker keeps their own rate for their pay mode;
                      // switching to another mode takes that mode's standard rate
                      ratePerHour: editingWorker && editingWorker.payMode === pm.value && editingWorker.ratePerHour != null
                        ? String(editingWorker.ratePerHour) : String(DEFAULT_RATES[pm.value]) }))}
                      className={`flex-1 py-2 font-medium transition-colors ${workerForm.payMode === pm.value ? 'bg-[#011c72] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Worker login</label>
                <select value={workerForm.userId} onChange={e => setWorkerForm(f => ({ ...f, userId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent">
                  {!editingWorker?.userId && <option value="new">Create a new login</option>}
                  <option value="">No login</option>
                  {linkableAccounts
                    .filter(u => !u.linkedWorkerId || u.linkedWorkerId === editingWorker?.id)
                    .map(u => <option key={u.id} value={u.id}>Existing: {u.fullName} (@{u.username})</option>)}
                </select>
                {workerForm.userId === 'new' ? (
                  <div className="mt-3 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <input type="text" value={workerForm.loginUsername} autoComplete="off"
                      onChange={e => setWorkerForm(f => ({ ...f, loginUsername: e.target.value }))}
                      placeholder="Username (e.g. juan.delacruz)" aria-label="Username"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm" />
                    <input type="password" value={workerForm.loginPassword} autoComplete="new-password"
                      onChange={e => setWorkerForm(f => ({ ...f, loginPassword: e.target.value }))}
                      placeholder="Password" aria-label="Password"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm" />
                    <input type="email" value={workerForm.loginEmail} autoComplete="off"
                      onChange={e => setWorkerForm(f => ({ ...f, loginEmail: e.target.value }))}
                      placeholder="Email (optional)" aria-label="Email"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm" />
                    <p className="text-[11px] text-gray-500">
                      The worker signs in with this username and password. The password needs 8+ characters with an
                      uppercase and a lowercase letter, a number and a symbol.
                    </p>
                  </div>
                ) : changingPassword ? (
                  <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-600">Login: <span className="font-medium">{editingWorker?.userName}</span></p>
                    <input type="password" value={workerForm.loginPassword} autoComplete="new-password"
                      onChange={e => setWorkerForm(f => ({ ...f, loginPassword: e.target.value }))}
                      placeholder="New password (leave blank to keep it)" aria-label="New password"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm" />
                    <p className="text-[11px] text-gray-500">
                      8+ characters with an uppercase and a lowercase letter, a number and a symbol. Changing it signs the
                      worker out; give them the new password.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    With a login, the worker starts their own tasks and submits the time and materials when they finish.
                    {!workerForm.userId && ' Without one, their tasks can\'t be finished, so give every worker a login.'}
                  </p>
                )}
              </div>
              {workerFormError && <p role="alert" className="text-sm text-red-600">{workerFormError}</p>}
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button onClick={saveWorker} disabled={savingWorker || !workerForm.name.trim()}
                className="flex-1 py-2.5 bg-[#011c72] hover:bg-[#022a9e] text-white font-medium rounded-xl disabled:opacity-50 text-sm">
                {savingWorker ? 'Saving…' : editingWorker ? 'Save Changes' : 'Add Worker'}
              </button>
              <button onClick={() => setShowWorkerModal(false)}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Completion Modal ────────────────────────────────────────────────── */}
      {handover && (
        <HandoverModal
          done={handover}
          workers={workers.filter(w => w.isActive)}
          assignments={assignments}
          onClose={() => setHandover(null)}
          onAssign={(workerId, task, date) => handOver(handover, workerId, task, date)}
          onOpenJob={() => { const id = handover.jobOrderDbId; setHandover(null); if (id) router.push(`/sales/${id}`); }}
        />
      )}

      {reviewFor && (
        <ReviewModal
          assignment={reviewFor}
          onClose={() => setReviewFor(null)}
          onDone={(approved) => reviewDone(reviewFor, approved)}
        />
      )}

      {confirmDialog}
    </div>
  );
}
