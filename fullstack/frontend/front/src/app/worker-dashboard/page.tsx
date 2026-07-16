'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, type ManagedWorker, type WorkerAssignment, type WorkerAvailabilityEntry, type JobOrder } from '@/lib/api';

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
  const { assignment, jobOrder } = target;
  const mode = assignment.payMode || 'per_hour';
  const rate = assignment.ratePerHour || 0;

  const [qty, setQty] = useState('');
  const [override, setOverride] = useState(false);
  const [overridePay, setOverridePay] = useState('');
  const [saving, setSaving] = useState(false);

  const qtyNum = parseFloat(qty) || 0;
  const computedPay = override
    ? (parseFloat(overridePay) || 0)
    : computePay(mode, rate, qtyNum || 1);

  // Materials from job order items
  const materials = (jobOrder?.items || [])
    .filter((it: any) => it.type === 'material' || it.category === 'material' || it.itemType === 'material' || it.name)
    .map((it: any) => ({ name: it.name || it.description || 'Item', qty: it.quantity || 1, unit: it.unit }));

  const qtyLabel = mode === 'per_hour' ? 'Hours worked' : mode === 'per_day' ? 'Days worked' : 'Pieces / projects';

  const confirm = async () => {
    if (!qty || qtyNum <= 0) { alert(`Enter ${qtyLabel.toLowerCase()}.`); return; }
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{qtyLabel}</label>
              <input
                type="number" min="0.5" step="0.5"
                value={qty} onChange={e => setQty(e.target.value)}
                placeholder={mode === 'per_hour' ? '0.0' : '1'}
                className="w-full px-3 py-2 rounded-lg border border-[#c7d2f5] bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
              />
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

          {/* Materials */}
          {materials.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-600">Materials Used in This Job Order</p>
              </div>
              <ul className="divide-y divide-gray-100">
                {materials.map((m, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-gray-800">{m.name}</span>
                    <span className="text-gray-500 font-medium">{m.qty} {m.unit || 'pcs'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {materials.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">No materials found for this job order.</p>
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

// ── Special task modal ───────────────────────────────────────────────────────
function SpecialTaskModal({
  worker, onClose, onSave,
}: {
  worker: ManagedWorker;
  onClose: () => void;
  onSave: (title: string, notes: string, scheduledDate: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(todayYMD());
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { alert('Enter a task title.'); return; }
    setSaving(true);
    onSave(title.trim(), notes.trim(), date);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add Special Task</h2>
            <p className="text-sm text-gray-500">{worker.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Title <span className="text-red-500">*</span></label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder="e.g. Installation at customer site"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Address, instructions, etc."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent resize-none" />
          </div>
        </div>
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button onClick={save} disabled={saving || !title.trim()}
            className="flex-1 py-2.5 bg-[#011c72] text-white font-medium rounded-xl hover:bg-[#022a9e] disabled:opacity-50 text-sm">
            {saving ? 'Saving…' : 'Add Task'}
          </button>
          <button onClick={onClose}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function WorkerDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('assign');

  // Data
  const [workers, setWorkers]       = useState<ManagedWorker[]>([]);
  const [jobOrders, setJobOrders]   = useState<JobOrder[]>([]);
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingJO, setLoadingJO]   = useState(false);

  // Drag state
  const dragJob = useRef<{ id: number; ref: string } | null>(null);

  // Job order filter
  const [joSearch, setJoSearch] = useState('');
  const [joStatus, setJoStatus] = useState<'pending' | 'in_progress'>('pending');

  // Assign panel: which worker card is the drop-target highlight
  const [dropTarget, setDropTarget]       = useState<number | null>(null);
  // Calendar tab: which date cell is the drop-target highlight
  const [calDropTarget, setCalDropTarget] = useState<string | null>(null);

  // Worker modal
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker]     = useState<ManagedWorker | null>(null);
  const [workerForm, setWorkerForm] = useState({ name: '', workType: WORK_TYPES[0], ratePerHour: '', payMode: 'per_hour' as string });
  const [savingWorker, setSavingWorker] = useState(false);

  // Completion modal
  const [completionTarget, setCompletionTarget] = useState<CompletionTarget | null>(null);

  // Special task modal
  const [specialTaskWorker, setSpecialTaskWorker] = useState<ManagedWorker | null>(null);

  // Calendar
  const [calWorker, setCalWorker]   = useState<number | null>(null);
  const [calYear, setCalYear]       = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]     = useState(new Date().getMonth());
  const [availability, setAvailability] = useState<WorkerAvailabilityEntry[]>([]);
  const [calAssignments, setCalAssignments] = useState<Record<string, Array<{ id: number; jobOrderRef: string; assignmentType: string; specialTaskTitle?: string; workerName: string; status: string; description?: string }>>>({});
  const [loadingCal, setLoadingCal] = useState(false);
  const [savingDate, setSavingDate] = useState<string | null>(null);

  // Inline "start" tracking
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // ── Auth guard ──
  useEffect(() => {
    if (!authLoading) {
      if (!user) router.push('/login');
      else if (user.role !== 'administrator') router.push('/dashboard');
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
    if (!calWorker) return;
    setLoadingCal(true);
    try {
      const month = `${calYear}-${String(calMonth + 1).padStart(2,'0')}`;
      const [avRes, caRes] = await Promise.all([
        api.workerAvailability.get({ workerId: calWorker, month }),
        api.workerAssignments.getCalendar({ workerId: calWorker, month }),
      ]);
      setAvailability(avRes.data?.entries || []);
      setCalAssignments(caRes.data || {});
    } catch { /* ignore */ } finally { setLoadingCal(false); }
  }, [calWorker, calYear, calMonth]);

  useEffect(() => { if (activeTab === 'calendar') fetchCalendar(); }, [activeTab, fetchCalendar]);

  // ── Drag helpers ──
  const onDragStart = (jo: JobOrder) => {
    dragJob.current = { id: jo.id, ref: jo.jobOrderId };
  };

  const onDrop = async (worker: ManagedWorker) => {
    setDropTarget(null);
    const job = dragJob.current;
    dragJob.current = null;
    if (!job) return;
    try {
      await api.workerAssignments.create({ workerId: worker.id, jobOrderRef: job.ref, jobOrderDbId: job.id });
      fetchAssignments();
    } catch { /* ignore */ }
  };

  const onDropCalendar = async (dateStr: string) => {
    setCalDropTarget(null);
    const job = dragJob.current;
    dragJob.current = null;
    if (!job || !calWorker) return;
    try {
      await api.workerAssignments.create({ workerId: calWorker, jobOrderRef: job.ref, jobOrderDbId: job.id, scheduledDate: dateStr });
      fetchCalendar();
    } catch { /* ignore */ }
  };

  const removeAssignment = async (a: WorkerAssignment) => {
    if (!confirm(`Remove ${a.jobOrderRef} from ${a.workerName}?`)) return;
    try { await api.workerAssignments.delete(a.id); fetchAssignments(); } catch { /* ignore */ }
  };

  const startWork = async (a: WorkerAssignment) => {
    setUpdatingId(a.id);
    try { await api.workerAssignments.update(a.id, { status: 'in_progress' }); fetchAssignments(); }
    catch { /* ignore */ } finally { setUpdatingId(null); }
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
      fetchAssignments();
    } catch { /* ignore */ }
  };

  const addSpecialTask = async (title: string, notes: string, scheduledDate: string) => {
    if (!specialTaskWorker) return;
    try {
      await api.workerAssignments.create({
        workerId: specialTaskWorker.id,
        jobOrderRef: 'SPECIAL-TASK',
        assignmentType: 'special_task',
        specialTaskTitle: title,
        notes,
        scheduledDate,
      });
      setSpecialTaskWorker(null);
      fetchAssignments();
    } catch { /* ignore */ }
  };

  // ── Worker modal ──
  const openAdd  = () => { setEditingWorker(null); setWorkerForm({ name: '', workType: WORK_TYPES[0], ratePerHour: '', payMode: 'per_hour' }); setShowWorkerModal(true); };
  const openEdit = (w: ManagedWorker) => { setEditingWorker(w); setWorkerForm({ name: w.name, workType: w.workType, ratePerHour: String(w.ratePerHour), payMode: w.payMode || 'per_hour' }); setShowWorkerModal(true); };

  const saveWorker = async () => {
    if (!workerForm.name.trim()) return;
    setSavingWorker(true);
    try {
      const payload = { name: workerForm.name.trim(), workType: workerForm.workType, ratePerHour: parseFloat(workerForm.ratePerHour) || 0, payMode: workerForm.payMode };
      if (editingWorker) await api.managedWorkers.update(editingWorker.id, payload);
      else await api.managedWorkers.create(payload);
      setShowWorkerModal(false);
      fetchWorkers();
    } catch { /* ignore */ } finally { setSavingWorker(false); }
  };

  // ── Calendar toggles ──
  const toggleDay = async (day: number) => {
    if (!calWorker || savingDate) return;
    const dateStr = toYMD(calYear, calMonth, day);
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
  });

  const workerAssignmentsMap = assignments.reduce((acc, a) => {
    acc[a.workerId] = [...(acc[a.workerId] || []), a];
    return acc;
  }, {} as Record<number, WorkerAssignment[]>);

  const calDays    = daysInMonth(calYear, calMonth);
  const firstDay   = firstDayOfMonth(calYear, calMonth);
  const availMap   = Object.fromEntries(availability.map(e => [e.date, e]));
  const todayStr   = todayYMD();

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
                      <p className="text-xs font-bold text-[#011c72] font-mono">{jo.jobOrderId}</p>
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
                const workerAsgns = workerAssignmentsMap[w.id]?.filter(a => a.status !== 'completed') || [];
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
                      <button
                        onClick={() => setSpecialTaskWorker(w)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                        </svg>
                        Special Task
                      </button>
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
                              className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors
                                ${a.assignmentType === 'special_task' ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-gray-50 border-gray-200 text-gray-800'}`}>
                              <div>
                                <p className="font-bold">{a.assignmentType === 'special_task' ? (a.specialTaskTitle || 'Special Task') : a.jobOrderRef}</p>
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
                                {a.status === 'in_progress' && (
                                  <button onClick={() => openCompletion(a)} title="Complete"
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
                    return (
                      <div key={w.id} className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#011c72]/10 text-[#011c72] flex items-center justify-center font-bold">
                            {w.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{w.name}</p>
                            <p className="text-xs text-gray-500">
                              {w.workType} · {fc(w.ratePerHour)}{rateLabelFor(w.payMode || 'per_hour')}
                              {' · '}<span className="font-medium text-[#011c72]">{PAY_MODES.find(p => p.value === (w.payMode || 'per_hour'))?.label}</span>
                              {earned > 0 && <span className="ml-2 text-green-600 font-medium">Total earned: {fc(earned)}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(w)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">Edit</button>
                          <button onClick={() => api.managedWorkers.update(w.id, { isActive: false }).then(fetchWorkers)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Deactivate</button>
                        </div>
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
                            {a.status === 'in_progress' && (
                              <button onClick={() => openCompletion(a)}
                                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">Complete</button>
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
          <div className="flex gap-6 items-start">

            {/* Job order sidebar for calendar drag */}
            <div className="w-64 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Drag to Date</h3>
                <input type="text" value={joSearch} onChange={e => setJoSearch(e.target.value)}
                  placeholder="Search job orders…"
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-900" />
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1.5">
                {jobOrders.filter(jo => {
                  const q = joSearch.toLowerCase();
                  return !q || jo.jobOrderId.toLowerCase().includes(q) || jo.customerName.toLowerCase().includes(q);
                }).filter(jo => jo.status === 'pending' || jo.status === 'in_progress').map(jo => (
                  <div key={jo.id} draggable onDragStart={() => onDragStart(jo)}
                    className="p-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-[#eef1fb] hover:border-[#c7d2f5] cursor-grab active:cursor-grabbing text-xs select-none">
                    <p className="font-bold text-[#011c72] font-mono">{jo.jobOrderId}</p>
                    <p className="text-gray-500 truncate">{jo.customerName}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Calendar */}
            <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              {/* Worker + month nav */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Worker:</label>
                  <select value={calWorker ?? ''} onChange={e => setCalWorker(parseInt(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 min-w-45">
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
              <div className="flex items-center flex-wrap gap-4 mb-4 text-xs text-gray-500">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-white border border-gray-300" /><span>Available</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-100 border border-red-300" /><span>Unavailable</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-100 border border-blue-300" /><span>Has assignments</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded border-2 border-[#011c72]" /><span>Today</span></div>
              </div>

              {/* Grid */}
              <div className="select-none">
                <div className="grid grid-cols-7 mb-1">
                  {DAY_LABELS.map(d => <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: calDays }, (_, i) => i + 1).map(day => {
                    const dateStr = toYMD(calYear, calMonth, day);
                    const entry = availMap[dateStr];
                    const isUnavail = entry && !entry.isAvailable;
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
                        className={`relative min-h-17.5 rounded-lg border p-1 flex flex-col transition-colors cursor-pointer
                          ${isDropTarget ? 'bg-[#dde6ff] border-[#011c72] border-2' : ''}
                          ${isUnavail && !isDropTarget ? 'bg-red-50 border-red-200' : ''}
                          ${!isUnavail && !isDropTarget ? 'bg-white border-gray-200 hover:bg-gray-50' : ''}
                          ${hasAsgns && !isUnavail && !isDropTarget ? 'bg-blue-50 border-blue-200' : ''}
                          ${isToday ? 'border-2 border-[#011c72]' : ''}
                        `}
                        onClick={() => toggleDay(day)}
                      >
                        <span className={`text-xs font-semibold ${isUnavail ? 'text-red-600' : isToday ? 'text-[#011c72]' : 'text-gray-700'}`}>{day}</span>
                        {isUnavail && <div className="text-[9px] text-red-500 leading-tight">Off</div>}
                        {isSaving && <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg"><div className="w-3 h-3 border-2 border-[#011c72] border-t-transparent rounded-full animate-spin" /></div>}
                        {dayAsgns.slice(0, 2).map(a => (
                          <div key={a.id} title={a.jobOrderRef + (a.description ? ' – ' + a.description : '')}
                            className={`mt-0.5 text-[9px] leading-tight px-1 py-0.5 rounded truncate font-medium
                              ${a.status === 'completed' ? 'bg-green-100 text-green-700' : a.assignmentType === 'special_task' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {a.assignmentType === 'special_task' ? (a.specialTaskTitle || 'Task') : a.jobOrderRef}
                          </div>
                        ))}
                        {dayAsgns.length > 2 && <div className="text-[9px] text-gray-400">+{dayAsgns.length - 2} more</div>}
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

      {/* ── Special Task Modal ──────────────────────────────────────────────── */}
      {specialTaskWorker && (
        <SpecialTaskModal
          worker={specialTaskWorker}
          onClose={() => setSpecialTaskWorker(null)}
          onSave={addSpecialTask}
        />
      )}
    </div>
  );
}
