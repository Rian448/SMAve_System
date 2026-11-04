'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  api, type ManagedWorker, type WorkerAssignment, type WorkerAvailabilityEntry, type JobOrder,
  type JobOrderPriority, PRIORITY_RANK, PRIORITY_LABELS, type MaterialWasteLog, type CalendarAssignment,
  type LinkableWorkerAccount,
} from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';
import { formatDate } from '@/lib/dateUtils';
import ExtraMaterialDialog from '@/components/ExtraMaterialDialog';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';

// ── Constants ────────────────────────────────────────────────────────────────
const WORK_TYPES = ['Seat Maker', 'Sewer', 'Upholstery', 'Installer', 'Cutter', 'Finisher', 'Other'];
const PAY_MODES = [
  { value: 'per_hour', label: 'Per Hour' },
  { value: 'per_day',  label: 'Per Day'  },
  { value: 'per_piece', label: 'Per Piece / Project' },
] as const;
type Tab = 'assign' | 'workers' | 'calendar';

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

// ── Helpers ──────────────────────────────────────────────────────────────────
const fc = (v?: number | null) =>
  v != null ? `₱${v.toLocaleString('en-PH',{minimumFractionDigits:2})}` : '—';

function rateLabelFor(mode: string) {
  if (mode === 'per_day') return '/day';
  if (mode === 'per_piece') return '/piece';
  return '/hr';
}

function computePay(_mode: string, rate: number, qty: number) {
  return Math.round(rate * qty * 100) / 100;
}

const PRIORITY_BADGE: Record<JobOrderPriority, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-gray-100 text-gray-500 border-gray-200',
  low: 'bg-gray-50 text-gray-400 border-gray-200',
};
const rankOf = (p?: JobOrderPriority) => PRIORITY_RANK[p || 'normal'];
/** Calendar "worker" value for the team view (everyone's schedule) */
const TEAM_VIEW = 0;

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
    in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
    pending:     'bg-yellow-100 text-yellow-700 border-yellow-200',
  } as Record<string,string>)[s] || 'bg-gray-100 text-gray-500 border-gray-200';
}

// ── Completion modal ─────────────────────────────────────────────────────────
type CompletionTarget = {
  assignment: WorkerAssignment;
  jobOrder: JobOrder | null;
};

function CompletionModal({
  target, onClose, onConfirm,
}: {
  target: CompletionTarget;
  onClose: () => void;
  onConfirm: (hoursWorked: number, unitsWorked: number, payOverride: number | null, materialsUsed: object[]) => void;
}) {
  const { assignment } = target;
  const mode = assignment.payMode || 'per_hour';
  const rate = assignment.ratePerHour || 0;

  const [qty, setQty] = useState('');
  const [override, setOverride] = useState(false);
  const fe = useFieldErrors();
  const [overridePay, setOverridePay] = useState('');
  const [saving, setSaving] = useState(false);

  const qtyNum = parseFloat(qty) || 0;
  const computedPay = override
    ? (parseFloat(overridePay) || 0)
    : computePay(mode, rate, qtyNum || 1);

  // Extra material this worker needed on this job (the planned materials belong to
  // the job order and leave stock when it is completed)
  const [extras, setExtras] = useState<MaterialWasteLog[] | null>(assignment.jobOrderDbId ? null : []);
  const [addingExtra, setAddingExtra] = useState(false);
  const loadExtras = useCallback(() => {
    if (!assignment.jobOrderDbId) return;
    api.managedWorkers.extraMaterials({ workerId: assignment.workerId, jobOrderId: assignment.jobOrderDbId })
      .then(res => setExtras(res.data || []))
      .catch(() => setExtras([]));
  }, [assignment.workerId, assignment.jobOrderDbId]);
  useEffect(() => { loadExtras(); }, [loadExtras]);
  const materials = (extras || []).map(x => ({ name: x.materialName || 'Material', qty: x.quantity, reason: x.reason }));

  const qtyLabel = mode === 'per_hour' ? 'Hours worked' : mode === 'per_day' ? 'Days worked' : 'Pieces / projects';

  const confirm = async () => {
    if (fe.show({ 'complete-qty': (!qty || qtyNum <= 0) && `Enter ${qtyLabel.toLowerCase()}.` })) return;
    setSaving(true);
    const hours = mode === 'per_hour' ? qtyNum : (qtyNum * (mode === 'per_day' ? 8 : 1));
    onConfirm(hours, qtyNum, override ? computedPay : null, materials);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Mark as Complete</h2>
            <p className="text-sm text-gray-500">{assignment.workerName} · {assignment.assignmentType === 'special_task' ? (assignment.specialTaskTitle || 'Special Task') : assignment.jobOrderRef}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Pay info */}
          <div className="bg-[#eef1fb] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#011c72]">Pay Computation</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-[#c7d2f5] text-[#011c72] font-medium">
                {PAY_MODES.find(p => p.value === mode)?.label}
              </span>
            </div>
            <div {...fe.field('complete-qty')}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{qtyLabel}</label>
              <input
                type="number" min="0.5" step="0.5"
                value={qty} onChange={e => setQty(e.target.value)}
                placeholder={mode === 'per_hour' ? '0.0' : '1'}
                className="w-full px-3 py-2 rounded-lg border border-[#c7d2f5] bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
              />
              <FieldError message={fe.errors['complete-qty']} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Rate: <span className="font-semibold">{fc(rate)}{rateLabelFor(mode)}</span></span>
              <span className="text-gray-600">Computed: <span className="font-bold text-[#011c72]">{fc(computedPay)}</span></span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#011c72] focus:ring-[#011c72]" />
              <span className="text-xs text-gray-700">Override pay amount</span>
            </label>
            {override && (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₱</span>
                <input type="number" min="0" step="0.01"
                  value={overridePay} onChange={e => setOverridePay(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 rounded-lg border border-[#c7d2f5] bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72]" />
              </div>
            )}
          </div>

          {/* Extra materials this worker needed */}
          {assignment.jobOrderDbId && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-600">Extra materials used by {assignment.workerName}</p>
                <button type="button" onClick={() => setAddingExtra(true)}
                  className="text-xs font-medium text-[#011c72] hover:underline">+ Add extra material</button>
              </div>
              {extras === null ? (
                <p className="text-xs text-gray-400 text-center py-3">Loading…</p>
              ) : materials.length === 0 ? (
                <p className="text-xs text-gray-500 px-4 py-3">
                  None. If they needed more than planned (e.g. a recut), add it so stock and the job&apos;s cost stay right.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {materials.map((m, i) => (
                    <li key={i} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-800">{m.name}<span className="text-gray-400 text-xs"> · {m.reason}</span></span>
                      <span className="text-gray-500 font-medium shrink-0">{m.qty}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {addingExtra && assignment.jobOrderDbId && (
            <ExtraMaterialDialog
              jobOrderId={assignment.jobOrderDbId} jobOrderRef={assignment.jobOrderRef}
              workerId={assignment.workerId} workerName={assignment.workerName}
              onClose={() => setAddingExtra(false)}
              onSaved={() => { setAddingExtra(false); loadExtras(); }}
            />
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={confirm}
            disabled={saving || !qty || qtyNum <= 0}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 text-sm">
            {saving ? 'Saving…' : `Confirm — Pay ${fc(computedPay)}`}
          </button>
          <button onClick={onClose}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function WorkerDashboard() {
  const { confirm, confirmDialog } = useConfirm();
  const router = useRouter();
  const { user, isLoading: authLoading, can } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('assign');

  // Data
  const [workers, setWorkers]       = useState<ManagedWorker[]>([]);
  const [jobOrders, setJobOrders]   = useState<JobOrder[]>([]);
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]);
  // Extra material: the task it is being added for, and what each worker has had issued
  const [extraFor, setExtraFor] = useState<WorkerAssignment | null>(null);
  const [workerExtras, setWorkerExtras] = useState<MaterialWasteLog[]>([]);
  const [openExtrasFor, setOpenExtrasFor] = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);
  const [loadingJO, setLoadingJO]   = useState(false);

  // Drag state: a job order from the list, or an assignment already made (calendar)
  const dragJob = useRef<{ id: number; ref: string } | null>(null);
  const dragTask = useRef<number | null>(null);

  // Job order filter
  const [joSearch, setJoSearch] = useState('');
  const [joStatus, setJoStatus] = useState<'pending' | 'in_progress'>('pending');

  // Assign panel: which worker card is the drop-target highlight
  const [dropTarget, setDropTarget]       = useState<number | null>(null);
  const [actionError, setActionError]     = useState('');
  const showError = (err: unknown, fallback: string) => {
    setActionError(err instanceof Error && err.message ? err.message : fallback);
    setTimeout(() => setActionError(''), 6000);
  };
  // Calendar tab: which date cell is the drop-target highlight
  const [calDropTarget, setCalDropTarget] = useState<string | null>(null);

  // Worker modal
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker]     = useState<ManagedWorker | null>(null);
  const [workerForm, setWorkerForm] = useState({ name: '', workType: WORK_TYPES[0], ratePerHour: '', payMode: 'per_hour' as string, userId: '' });
  const [workerFormError, setWorkerFormError] = useState('');
  // Seat maker / sewer logins the worker can be linked to, so they see their own work
  const [linkableAccounts, setLinkableAccounts] = useState<LinkableWorkerAccount[]>([]);
  const [savingWorker, setSavingWorker] = useState(false);

  // Completion modal
  const [completionTarget, setCompletionTarget] = useState<CompletionTarget | null>(null);

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

  // Inline "start" tracking
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // ── Auth guard ──
  useEffect(() => {
    if (!authLoading) {
      if (!user) router.push('/login');
      else if (!can('workers.add', 'workers.edit', 'workers.delete')) router.push('/dashboard');
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
  const canAddExtra = (a: WorkerAssignment) =>
    a.status === 'in_progress' && a.assignmentType !== 'special_task' && !!a.jobOrderDbId;

  // ── Drag helpers ──
  const onDragStart = (jo: JobOrder) => {
    dragJob.current = { id: jo.id, ref: jo.jobOrderId };
  };

  const onDrop = async (worker: ManagedWorker) => {
    setDropTarget(null);
    const taskId = dragTask.current;
    dragTask.current = null;
    if (taskId) {
      const task = assignments.find(a => a.id === taskId);
      if (task) await moveTaskToWorker(task, worker);
      return;
    }
    const job = dragJob.current;
    dragJob.current = null;
    if (!job) return;
    try {
      await api.workerAssignments.create({ workerId: worker.id, jobOrderRef: job.ref, jobOrderDbId: job.id });
      fetchAssignments();
    } catch (err) { showError(err, `Couldn't assign ${job.ref} to ${worker.name}.`); }
  };

  const onDropCalendar = async (dateStr: string) => {
    setCalDropTarget(null);
    const taskId = dragTask.current;
    dragTask.current = null;
    if (taskId) {
      const task = assignments.find(a => a.id === taskId);
      if (task && task.scheduledDate !== dateStr) await scheduleTask(task, dateStr);
      return;
    }
    const job = dragJob.current;
    dragJob.current = null;
    if (!job || !calWorker || teamView) return;
    const worker = workers.find(w => w.id === calWorker);
    if (!(await okToSchedule(calWorker, worker?.name || 'This worker', dateStr, job.ref))) return;

    // Already on this job: move that assignment to the day instead of adding a
    // second one (one without a date first, so dated work isn't moved by accident)
    const current = assignments
      .filter(a => a.workerId === calWorker && a.jobOrderDbId === job.id
        && a.status !== 'completed' && a.assignmentType !== 'special_task')
      .sort((a, b) => Number(!!a.scheduledDate) - Number(!!b.scheduledDate))[0];
    try {
      if (current) await api.workerAssignments.update(current.id, { scheduledDate: dateStr });
      else await api.workerAssignments.create({ workerId: calWorker, jobOrderRef: job.ref, jobOrderDbId: job.id, scheduledDate: dateStr });
      refreshAssignments();
      fetchCalendar();
    } catch (err) { showError(err, `Couldn't schedule ${job.ref}.`); }
  };

  const removeAssignment = async (a: WorkerAssignment) => {
    const ok = await confirm({
      title: 'Remove this assignment?',
      message: <>{a.jobOrderRef} will be unassigned from {a.workerName}.</>,
      warning: 'Any logged hours and pay for this assignment are removed with it.',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    try { await api.workerAssignments.delete(a.id); refreshAssignments(); }
    catch (err) { showError(err, "Couldn't remove the assignment."); }
  };

  const startWork = async (a: WorkerAssignment) => {
    setUpdatingId(a.id);
    try { await api.workerAssignments.update(a.id, { status: 'in_progress' }); refreshAssignments(); }
    catch (err) { showError(err, "Couldn't start the task."); } finally { setUpdatingId(null); }
  };

  const openCompletion = async (a: WorkerAssignment) => {
    let jo: JobOrder | null = null;
    if (a.jobOrderDbId) {
      try { jo = (await api.sales.getJobOrder(a.jobOrderDbId)).data || null; } catch { /* ignore */ }
    }
    setCompletionTarget({ assignment: a, jobOrder: jo });
  };

  const confirmComplete = async (hoursWorked: number, unitsWorked: number, payOverride: number | null, materialsUsed: object[]) => {
    if (!completionTarget) return;
    const a = completionTarget.assignment;
    try {
      await api.workerAssignments.update(a.id, {
        status: 'completed',
        hoursWorked,
        unitsWorked,
        ...(payOverride != null ? { payOverride } : {}),
        materialsUsed,
      });
      setCompletionTarget(null);
      refreshAssignments();
    } catch (err) { showError(err, "Couldn't mark the task complete."); }
  };

  // ── Worker modal ──
  const loadLinkableAccounts = () => {
    api.managedWorkers.linkableAccounts().then(res => setLinkableAccounts(res.data || [])).catch(() => setLinkableAccounts([]));
  };
  const openAdd  = () => {
    setEditingWorker(null); setWorkerFormError(''); loadLinkableAccounts();
    setWorkerForm({ name: '', workType: WORK_TYPES[0], ratePerHour: '', payMode: 'per_hour', userId: '' });
    setShowWorkerModal(true);
  };
  const openEdit = (w: ManagedWorker) => {
    setEditingWorker(w); setWorkerFormError(''); loadLinkableAccounts();
    setWorkerForm({ name: w.name, workType: w.workType, ratePerHour: String(w.ratePerHour), payMode: w.payMode || 'per_hour', userId: w.userId ? String(w.userId) : '' });
    setShowWorkerModal(true);
  };

  const saveWorker = async () => {
    if (!workerForm.name.trim()) return;
    setSavingWorker(true);
    setWorkerFormError('');
    try {
      const payload = {
        name: workerForm.name.trim(), workType: workerForm.workType, ratePerHour: parseFloat(workerForm.ratePerHour) || 0,
        payMode: workerForm.payMode, userId: workerForm.userId ? Number(workerForm.userId) : null,
      };
      if (editingWorker) await api.managedWorkers.update(editingWorker.id, payload);
      else await api.managedWorkers.create(payload);
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
      message: <>{a.jobOrderRef} for {a.workerName} goes back to In Progress so it can be completed again.</>,
      warning: `Its recorded ${a.hoursWorked != null ? `${a.hoursWorked}h and ` : ''}pay of ${fc(a.pay || 0)} are cleared, and the job order's labor cost goes back to the estimate until it is completed again.`,
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
  const activeWorkers   = workers.filter(w => w.isActive);
  const inactiveWorkers = workers.filter(w => !w.isActive);

  const filteredJO = jobOrders.filter(jo => {
    const matchStatus = joStatus === 'pending' ? jo.status === 'pending' : jo.status === 'in_progress';
    const q = joSearch.toLowerCase();
    const matchQ = !q || jo.jobOrderId.toLowerCase().includes(q) || jo.customerName.toLowerCase().includes(q) || jo.description.toLowerCase().includes(q);
    return matchStatus && matchQ;
  }).sort((a, b) => rankOf(a.priority) - rankOf(b.priority));

  const workerAssignmentsMap = assignments.reduce((acc, a) => {
    acc[a.workerId] = [...(acc[a.workerId] || []), a];
    return acc;
  }, {} as Record<number, WorkerAssignment[]>);

  const calDays    = daysInMonth(calYear, calMonth);
  const firstDay   = firstDayOfMonth(calYear, calMonth);
  const availMap   = Object.fromEntries(availability.map(e => [e.date, e]));
  const todayStr   = todayYMD();
  // Assigned work with no date yet, most urgent first (the calendar's side list)
  const unscheduled = assignments
    .filter(a => !a.scheduledDate && a.status !== 'completed' && a.assignmentType !== 'special_task'
      && (teamView || a.workerId === calWorker))
    .sort((a, b) => rankOf(a.jobOrderPriority) - rankOf(b.jobOrderPriority));

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
            <p className="text-sm text-gray-500 mt-1">Assign job orders, track tasks, and manage worker pay</p>
          </div>
          <button onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#011c72] hover:bg-[#022a9e] text-white text-sm font-medium rounded-xl transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Add Worker
          </button>
        </div>

        {actionError && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{actionError}</div>
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
          <div className="flex gap-6 items-start">

            {/* Left — Job Orders panel */}
            <div className="w-72 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
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
                ) : filteredJO.map(jo => (
                  <div
                    key={jo.id}
                    draggable
                    onDragStart={() => onDragStart(jo)}
                    className="group p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-[#eef1fb] hover:border-[#c7d2f5] cursor-grab active:cursor-grabbing transition-colors select-none"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs font-bold text-[#011c72] font-mono">{jo.jobOrderId}</p>
                        <PriorityBadge priority={jo.priority} />
                      </div>
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5 group-hover:text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
                      </svg>
                    </div>
                    <p className="text-xs text-gray-700 font-medium mt-0.5 truncate">{jo.customerName}</p>
                    <p className="text-xs text-gray-500 truncate">{jo.description}</p>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-gray-100 text-xs text-gray-400 text-center">
                Drag a job order onto a worker
              </div>
            </div>

            {/* Right — Worker drop zones */}
            <div className="flex-1 space-y-4">
              {activeWorkers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
                  No active workers. Click "Add Worker" to get started.
                </div>
              ) : activeWorkers.map(w => {
                const workerAsgns = (workerAssignmentsMap[w.id]?.filter(a => a.status !== 'completed') || [])
                  .sort((a, b) => rankOf(a.jobOrderPriority) - rankOf(b.jobOrderPriority));
                const isDrop = dropTarget === w.id;
                return (
                  <div
                    key={w.id}
                    onDragOver={e => { e.preventDefault(); setDropTarget(w.id); }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={() => onDrop(w)}
                    className={`bg-white rounded-2xl border-2 shadow-sm transition-colors ${isDrop ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200'}`}
                  >
                    {/* Worker header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#011c72]/10 text-[#011c72] flex items-center justify-center font-bold text-sm shrink-0">
                          {w.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{w.name}</p>
                          <p className="text-xs text-gray-500">{w.workType} · {fc(w.ratePerHour)}{rateLabelFor(w.payMode || 'per_hour')} ({PAY_MODES.find(p => p.value === (w.payMode || 'per_hour'))?.label})</p>
                        </div>
                      </div>
                    </div>

                    {/* Assignments */}
                    <div className="p-3">
                      {isDrop && (
                        <div className="mb-2 flex items-center justify-center h-12 rounded-xl border-2 border-dashed border-[#011c72] text-[#011c72] text-xs font-semibold animate-pulse">
                          Drop to assign
                        </div>
                      )}
                      {workerAsgns.length === 0 && !isDrop ? (
                        <p className="text-xs text-gray-400 text-center py-4">No active assignments. Drag a job order here.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {workerAsgns.map(a => (
                            <div key={a.id}
                              draggable={a.status === 'pending'}
                              onDragStart={() => { dragTask.current = a.id; }}
                              title={a.status === 'pending' ? 'Drag onto another worker to move this task' : undefined}
                              className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${a.status === 'pending' ? 'cursor-grab' : ''}
                                ${a.assignmentType === 'special_task' ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-gray-50 border-gray-200 text-gray-800'}`}>
                              <div>
                                <p className="font-bold flex items-center gap-1.5">
                                  {a.assignmentType === 'special_task' ? (a.specialTaskTitle || 'Special Task') : a.jobOrderRef}
                                  <PriorityBadge priority={a.jobOrderPriority} />
                                </p>
                                {a.description && <p className="text-gray-400 font-normal truncate max-w-30">{a.description}</p>}
                              </div>
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge(a.status)}`}>
                                {a.status.replace('_',' ')}
                              </span>
                              {/* Actions */}
                              <div className="hidden group-hover:flex items-center gap-1 ml-1">
                                {a.status === 'pending' && (
                                  <button onClick={() => startWork(a)} disabled={updatingId === a.id}
                                    title="Start"
                                    className="p-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                  </button>
                                )}
                                {canAddExtra(a) && (
                                  <button onClick={() => setExtraFor(a)} title="Add extra material"
                                    className="p-1 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                                  </button>
                                )}
                                {a.status !== 'completed' && (
                                  <button onClick={() => openCompletion(a)} title={a.status === 'pending' ? 'Complete (already done)' : 'Complete'}
                                    className="p-1 rounded-lg bg-green-600 text-white hover:bg-green-700">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                                  </button>
                                )}
                                <button onClick={() => removeAssignment(a)} title="Remove"
                                  className="p-1 rounded-lg bg-red-100 text-red-600 hover:bg-red-200">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
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
                    const earned  = wAsgns.filter(a => a.status === 'completed').reduce((s, a) => s + (a.pay || 0), 0);
                    const wExtras = workerExtras.filter(x => x.workerId === w.id);
                    const extrasValue = wExtras.reduce((s, x) => s + (x.value || 0), 0);
                    return (
                      <div key={w.id}>
                      <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#011c72]/10 text-[#011c72] flex items-center justify-center font-bold">
                            {w.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{w.name}</p>
                            <p className="text-xs text-gray-500">
                              {w.userName && <span className="mr-1.5 inline-flex px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">Login: {w.userName}</span>}
                              {w.workType} · {fc(w.ratePerHour)}{rateLabelFor(w.payMode || 'per_hour')}
                              {' · '}<span className="font-medium text-[#011c72]">{PAY_MODES.find(p => p.value === (w.payMode || 'per_hour'))?.label}</span>
                              {earned > 0 && <span className="ml-2 text-green-600 font-medium">Total earned: {fc(earned)}</span>}
                              {wExtras.length > 0 && <span className="ml-2 text-amber-700 font-medium">Extra material: {fc(extrasValue)}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setOpenExtrasFor(openExtrasFor === w.id ? null : w.id)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">
                            Materials ({wExtras.length}) {openExtrasFor === w.id ? '▲' : '▼'}
                          </button>
                          <button onClick={() => openEdit(w)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">Edit</button>
                          <button onClick={() => api.managedWorkers.update(w.id, { isActive: false }).then(fetchWorkers)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Deactivate</button>
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
                                    <th className="px-3 py-2 text-right font-semibold">Cost</th>
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
                                      <td className="px-3 py-2 text-right font-medium text-gray-900">{fc(x.value || 0)}</td>
                                      {can('inventory.log_waste') && (
                                        <td className="px-3 py-2 text-right">
                                          <button onClick={() => undoWorkerExtra(x)} title="Undo: return it to stock"
                                            className="text-gray-500 hover:text-red-600 hover:underline">Undo</button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-amber-50">
                                  <tr>
                                    <td colSpan={5} className="px-3 py-2 text-right font-semibold text-amber-800">Total</td>
                                    <td className="px-3 py-2 text-right font-bold text-amber-800">{fc(extrasValue)}</td>
                                    {can('inventory.log_waste') && <td></td>}
                                  </tr>
                                </tfoot>
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
                        <button onClick={() => api.managedWorkers.update(w.id, { isActive: true }).then(fetchWorkers)} className="text-xs text-[#011c72] font-medium hover:underline">Reactivate</button>
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
                <div className="overflow-x-auto">
                  <table className="w-full min-w-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Worker','Type','Ref / Task','Status','Pay Mode','Hours','Pay','Actions'].map((h, i) => (
                          <th key={h} className={`px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${i >= 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {assignments.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-5 py-4 font-medium text-gray-900">{a.workerName}</td>
                          <td className="px-5 py-4">
                            <span className={`px-2 py-0.5 text-xs rounded-full ${a.assignmentType === 'special_task' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {a.assignmentType === 'special_task' ? 'Special' : 'Job Order'}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-mono text-gray-700">
                            {a.assignmentType === 'special_task' ? (a.specialTaskTitle || '—') : a.jobOrderRef}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2.5 py-1 text-xs rounded-full border ${statusBadge(a.status)}`}>
                              {a.status.replace('_',' ')}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-500">{PAY_MODES.find(p => p.value === (a.payMode || 'per_hour'))?.label}</td>
                          <td className="px-5 py-4 text-right text-gray-700">{a.hoursWorked != null ? `${a.hoursWorked}h` : '—'}</td>
                          <td className="px-5 py-4 text-right font-semibold text-green-600">{a.status === 'completed' ? fc(a.pay) : '—'}</td>
                          <td className="px-5 py-4 text-right">
                            {a.status === 'pending' && (
                              <button onClick={() => startWork(a)} disabled={updatingId === a.id}
                                className="px-3 py-1.5 text-xs bg-[#011c72] text-white rounded-lg hover:bg-[#022a9e] disabled:opacity-50">Start</button>
                            )}
                            {canAddExtra(a) && (
                              <button onClick={() => setExtraFor(a)}
                                className="mr-1 px-3 py-1.5 text-xs border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50">Extra material</button>
                            )}
                            {a.status !== 'completed' && (
                              <button onClick={() => openCompletion(a)}
                                className="ml-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">Complete</button>
                            )}
                            {a.status === 'completed' && (
                              <button onClick={() => reopenTask(a)}
                                className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Reopen</button>
                            )}
                            {a.status !== 'completed' && (
                              <button onClick={() => removeAssignment(a)}
                                className="ml-1 px-2 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── CALENDAR TAB ───────────────────────────────────────────────── */}
        {activeTab === 'calendar' && (
          <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-start">

            <div className="w-full lg:w-64 shrink-0 space-y-4">
              {/* Job orders to drag onto a day */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col" style={{ maxHeight: 'calc(60vh - 80px)' }}>
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Drag to Date</h3>
                  {teamView ? (
                    <p className="text-[11px] text-gray-400">Choose a worker above to schedule a job order for them.</p>
                  ) : (
                    <>
                      <input type="text" value={joSearch} onChange={e => setJoSearch(e.target.value)}
                        placeholder="Search job orders…"
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-900" />
                      <p className="md:hidden text-[11px] text-gray-400 mt-2">
                        On a phone, assign in the Assign &amp; Tasks tab, then set the date from the task&apos;s details.
                      </p>
                    </>
                  )}
                </div>
                {!teamView && (
                  <div className="hidden md:block overflow-y-auto flex-1 p-2 space-y-1.5">
                    {jobOrders.filter(jo => {
                      const q = joSearch.toLowerCase();
                      return !q || jo.jobOrderId.toLowerCase().includes(q) || jo.customerName.toLowerCase().includes(q);
                    }).filter(jo => jo.status === 'pending' || jo.status === 'in_progress')
                      .sort((a, b) => rankOf(a.priority) - rankOf(b.priority)).map(jo => (
                      <div key={jo.id} draggable onDragStart={() => onDragStart(jo)}
                        className="p-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-[#eef1fb] hover:border-[#c7d2f5] cursor-grab active:cursor-grabbing text-xs select-none">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-[#011c72] font-mono">{jo.jobOrderId}</p>
                          <PriorityBadge priority={jo.priority} />
                        </div>
                        <p className="text-gray-500 truncate">{jo.customerName}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Work already assigned but not on a day yet */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col" style={{ maxHeight: '40vh' }}>
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Unscheduled Work ({unscheduled.length})</h3>
                  <p className="text-[11px] text-gray-400 mt-1">Assigned without a date. Drag onto a day, or click for details.</p>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-1.5">
                  {unscheduled.length === 0 ? (
                    <p className="text-center text-gray-400 text-xs py-4">Everything assigned has a date.</p>
                  ) : unscheduled.map(a => (
                    <div key={a.id} draggable onDragStart={() => { dragTask.current = a.id; }}
                      onClick={() => setTaskPanel(a.id)}
                      className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 cursor-grab active:cursor-grabbing text-xs select-none">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-[#011c72] font-mono">{a.jobOrderRef}</p>
                        <PriorityBadge priority={a.jobOrderPriority} />
                      </div>
                      <p className="text-gray-600 truncate">{teamView ? `${a.workerName} · ` : ''}{a.description || a.workType}</p>
                    </div>
                  ))}
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
                <span className="hidden md:inline">Click a day to see all of its work{teamView ? '' : ' or mark it off'}. Click a task for details. Drag a task to another day to move it.</span>
                <span className="md:hidden">Tap a day to see its work{teamView ? '' : ' or mark it off'}, then tap a task to change its date.</span>
              </p>

              {/* Phones: the month as a list of days */}
              <div className="md:hidden divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {Array.from({ length: calDays }, (_, i) => i + 1).map(day => {
                  const dateStr = toYMD(calYear, calMonth, day);
                  const dayAsgns = calAssignments[dateStr] || [];
                  const isOff = !teamView && availMap[dateStr] && !availMap[dateStr].isAvailable;
                  const isToday = dateStr === todayStr;
                  return (
                    <button key={day} type="button" onClick={() => setDayPanel(dateStr)}
                      className={`w-full text-left px-3 py-2.5 flex items-start gap-3 ${isOff ? 'bg-red-50' : isToday ? 'bg-[#eef1fb]' : 'bg-white'}`}>
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
                    const isDropTarget = calDropTarget === dateStr;

                    return (
                      <div key={day}
                        onDragOver={e => { e.preventDefault(); setCalDropTarget(dateStr); }}
                        onDragLeave={() => setCalDropTarget(null)}
                        onDrop={() => onDropCalendar(dateStr)}
                        className={`relative min-h-20 rounded-lg border p-1 flex flex-col transition-colors cursor-pointer
                          ${isDropTarget ? 'bg-[#dde6ff] border-[#011c72] border-2' : ''}
                          ${isUnavail && !isDropTarget ? 'bg-red-50 border-red-200' : ''}
                          ${!isUnavail && !isDropTarget ? 'bg-white border-gray-200 hover:bg-gray-50' : ''}
                          ${hasAsgns && !isUnavail && !isDropTarget ? 'bg-blue-50 border-blue-200' : ''}
                          ${isToday ? 'border-2 border-[#011c72]' : ''}
                        `}
                        onClick={() => setDayPanel(dateStr)}
                      >
                        <span className={`text-xs font-semibold ${isUnavail ? 'text-red-600' : isToday ? 'text-[#011c72]' : 'text-gray-700'}`}>{day}</span>
                        {isUnavail && <div className="text-[9px] text-red-500 leading-tight">Off</div>}
                        {isSaving && <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg"><div className="w-3 h-3 border-2 border-[#011c72] border-t-transparent rounded-full animate-spin" /></div>}
                        {dayAsgns.slice(0, 3).map(a => (
                          <div key={a.id}
                            draggable={a.status !== 'completed'}
                            onDragStart={e => { e.stopPropagation(); dragTask.current = a.id; }}
                            onClick={e => { e.stopPropagation(); setTaskPanel(a.id); }}
                            title={`${a.jobOrderRef}${a.description ? ' – ' + a.description : ''}${teamView ? ' · ' + a.workerName : ''}`}
                            className={`mt-0.5 text-[9px] leading-tight px-1 py-0.5 rounded truncate font-medium hover:ring-1 hover:ring-[#011c72]
                              ${a.status === 'completed' ? 'bg-green-100 text-green-700' : a.assignmentType === 'special_task' ? 'bg-purple-100 text-purple-700'
                                : a.jobOrderPriority === 'urgent' ? 'bg-red-100 text-red-700' : a.jobOrderPriority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}
                              ${a.status !== 'completed' ? 'cursor-grab' : ''}`}>
                            {teamView ? `${a.workerName.split(' ')[0]}: ` : ''}
                            {a.assignmentType === 'special_task' ? (a.specialTaskTitle || 'Task') : a.jobOrderRef}
                          </div>
                        ))}
                        {dayAsgns.length > 3 && <div className="text-[9px] text-[#011c72] font-medium mt-0.5">+{dayAsgns.length - 3} more</div>}
                        {isDropTarget && <div className="absolute inset-0 flex items-center justify-center rounded-lg text-[10px] font-bold text-[#011c72]">Drop here</div>}
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
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(a.status)}`}>{a.status.replace('_', ' ')}</span>
                </div>
                {a.status === 'completed' ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Paid</span>
                    <span className="font-semibold text-green-700">{fc(a.pay || 0)}{a.hoursWorked != null ? ` · ${a.hoursWorked}h` : ''}</span>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Scheduled date</label>
                    <div className="flex items-center gap-2">
                      <input type="date" value={a.scheduledDate || ''}
                        onChange={e => e.target.value && scheduleTask(a, e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
                      {a.scheduledDate && (
                        <button type="button" onClick={() => scheduleTask(a, null)}
                          className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">Clear date</button>
                      )}
                    </div>
                    {!a.scheduledDate && <p className="text-[11px] text-gray-400 mt-1">Not on the calendar yet.</p>}
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
                <div className="flex flex-wrap gap-2 pt-1">
                  {a.status === 'pending' && (
                    <button type="button" onClick={() => { startWork(a); close(); }}
                      className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">Start</button>
                  )}
                  {a.status !== 'completed' && (
                    <button type="button" onClick={() => { close(); openCompletion(a); }}
                      className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700">Complete</button>
                  )}
                  {canAddExtra(a) && (
                    <button type="button" onClick={() => { close(); setExtraFor(a); }}
                      className="px-3 py-2 rounded-lg border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-50">Extra material</button>
                  )}
                  {a.status === 'completed' && (
                    <button type="button" onClick={() => { close(); reopenTask(a); }}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50">Reopen</button>
                  )}
                  {a.jobOrderDbId && (
                    <button type="button" onClick={() => router.push(`/sales/${a.jobOrderDbId}`)}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50">Open job order</button>
                  )}
                  {a.status !== 'completed' && (
                    <button type="button" onClick={() => { close(); removeAssignment(a); }}
                      className="ml-auto px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50">Remove</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add/Edit Worker Modal ───────────────────────────────────────────── */}
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
                    <button key={pm.value} type="button" onClick={() => setWorkerForm(f => ({ ...f, payMode: pm.value }))}
                      className={`flex-1 py-2 font-medium transition-colors ${workerForm.payMode === pm.value ? 'bg-[#011c72] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rate ({PAY_MODES.find(p => p.value === workerForm.payMode)?.label}) ₱
                </label>
                <input type="number" min="0" step="0.01" value={workerForm.ratePerHour}
                  onChange={e => setWorkerForm(f => ({ ...f, ratePerHour: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="e.g. 600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Login account (optional)</label>
                <select value={workerForm.userId} onChange={e => setWorkerForm(f => ({ ...f, userId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent">
                  <option value="">Not linked</option>
                  {linkableAccounts
                    .filter(u => !u.linkedWorkerId || u.linkedWorkerId === editingWorker?.id)
                    .map(u => <option key={u.id} value={u.id}>{u.fullName} (@{u.username})</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  A seat maker or sewer account. When linked, they see their own tasks and schedule on their dashboard.
                  Create the account in Settings → Users.
                </p>
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
      {completionTarget && (
        <CompletionModal
          target={completionTarget}
          onClose={() => setCompletionTarget(null)}
          onConfirm={confirmComplete}
        />
      )}

      {extraFor && extraFor.jobOrderDbId && (
        <ExtraMaterialDialog
          jobOrderId={extraFor.jobOrderDbId} jobOrderRef={extraFor.jobOrderRef}
          workerId={extraFor.workerId} workerName={extraFor.workerName}
          onClose={() => setExtraFor(null)}
          onSaved={() => { setExtraFor(null); fetchWorkerExtras(); }}
        />
      )}
      {confirmDialog}
    </div>
  );
}
