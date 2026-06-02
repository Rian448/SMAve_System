'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ManagedWorker, WorkerAssignment, WorkerAvailabilityEntry } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/dateUtils';
import Link from 'next/link';

const WORK_TYPES = ['Seat Maker', 'Sewer', 'Upholstery', 'Installer', 'Cutter', 'Finisher', 'Other'];
type Tab = 'workers' | 'calendar';

// ── Calendar helpers ──────────────────────────────────────────────────────────
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}
function toYMD(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Sub-components ────────────────────────────────────────────────────────────
function OverdueBadge({ hours }: { hours: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-200">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Overdue +{hours}h
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkerDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('workers');

  // Workers & assignments
  const [workers, setWorkers] = useState<ManagedWorker[]>([]);
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [updatingAssignment, setUpdatingAssignment] = useState<number | null>(null);
  const [hoursInput, setHoursInput] = useState<Record<number, string>>({});

  // Worker modal
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<ManagedWorker | null>(null);
  const [workerForm, setWorkerForm] = useState({ name: '', workType: WORK_TYPES[0], ratePerHour: '' });
  const [savingWorker, setSavingWorker] = useState(false);

  // Calendar
  const [calWorker, setCalWorker] = useState<number | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [availability, setAvailability] = useState<WorkerAvailabilityEntry[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);
  const [savingDate, setSavingDate] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) router.push('/login');
      else if (user.role !== 'administrator') router.push('/dashboard');
      else fetchWorkers();
    }
  }, [user, authLoading, router]);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      const res = await api.managedWorkers.list();
      const all = res.data?.workers || [];
      setWorkers(all);
      if (!calWorker && all.length > 0) setCalWorker(all[0].id);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const fetchAssignments = useCallback(async (workerId?: number) => {
    setLoadingAssignments(true);
    try {
      const res = await api.workerAssignments.list(workerId);
      setAssignments(res.data?.assignments || []);
    } catch { /* ignore */ } finally { setLoadingAssignments(false); }
  }, []);

  useEffect(() => {
    if (!loading) fetchAssignments(selectedWorkerId ?? undefined);
  }, [selectedWorkerId, loading, fetchAssignments]);

  const fetchCalendar = useCallback(async () => {
    if (!calWorker) return;
    setLoadingCal(true);
    try {
      const month = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
      const res = await api.workerAvailability.get({ workerId: calWorker, month });
      setAvailability(res.data?.entries || []);
    } catch { /* ignore */ } finally { setLoadingCal(false); }
  }, [calWorker, calYear, calMonth]);

  useEffect(() => { if (activeTab === 'calendar') fetchCalendar(); }, [activeTab, fetchCalendar]);

  // Calendar: toggle a day's availability
  // Each click cycles: no-entry → unavailable → clear (back to no-entry)
  const toggleDay = async (day: number) => {
    if (!calWorker || savingDate) return;
    const dateStr = toYMD(calYear, calMonth, day);
    setSavingDate(dateStr);
    const existing = availability.find(e => e.date === dateStr);
    try {
      if (!existing) {
        // Mark unavailable
        await api.workerAvailability.set({ managedWorkerId: calWorker, date: dateStr, isAvailable: false });
      } else {
        // Clear the entry (reset to default)
        await api.workerAvailability.set({ managedWorkerId: calWorker, date: dateStr, isAvailable: null });
      }
      await fetchCalendar();
    } catch { /* ignore */ } finally { setSavingDate(null); }
  };

  // Assignments
  const startWork = async (a: WorkerAssignment) => {
    setUpdatingAssignment(a.id);
    try {
      await api.workerAssignments.update(a.id, { status: 'in_progress' });
      fetchAssignments(selectedWorkerId ?? undefined);
    } catch { /* ignore */ } finally { setUpdatingAssignment(null); }
  };

  const finishWork = async (a: WorkerAssignment) => {
    const hrs = parseFloat(hoursInput[a.id] || '0');
    if (!hrs || hrs <= 0) { alert('Enter hours worked before finishing.'); return; }
    setUpdatingAssignment(a.id);
    try {
      await api.workerAssignments.update(a.id, { status: 'completed', hoursWorked: hrs });
      fetchAssignments(selectedWorkerId ?? undefined);
    } catch { /* ignore */ } finally { setUpdatingAssignment(null); }
  };

  // Worker modal
  const openAdd = () => { setEditingWorker(null); setWorkerForm({ name: '', workType: WORK_TYPES[0], ratePerHour: '' }); setShowWorkerModal(true); };
  const openEdit = (w: ManagedWorker) => { setEditingWorker(w); setWorkerForm({ name: w.name, workType: w.workType, ratePerHour: String(w.ratePerHour) }); setShowWorkerModal(true); };

  const saveWorker = async () => {
    if (!workerForm.name.trim()) return;
    setSavingWorker(true);
    try {
      const payload = { name: workerForm.name.trim(), workType: workerForm.workType, ratePerHour: parseFloat(workerForm.ratePerHour) || 0 };
      if (editingWorker) await api.managedWorkers.update(editingWorker.id, payload);
      else await api.managedWorkers.create(payload);
      setShowWorkerModal(false);
      fetchWorkers();
    } catch { /* ignore */ } finally { setSavingWorker(false); }
  };

  const deactivate = async (w: ManagedWorker) => {
    if (!confirm(`Deactivate ${w.name}?`)) return;
    await api.managedWorkers.update(w.id, { isActive: false });
    fetchWorkers();
  };
  const reactivate = async (w: ManagedWorker) => {
    await api.managedWorkers.update(w.id, { isActive: true });
    fetchWorkers();
  };

  const formatCurrency = (v?: number) =>
    v != null ? `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—';

  const statusBadge = (s: string) => ({
    completed:  'bg-green-100 text-green-700 border-green-200',
    in_progress:'bg-blue-100 text-blue-700 border-blue-200',
    pending:    'bg-yellow-100 text-yellow-700 border-yellow-200',
  }[s] || 'bg-gray-100 text-gray-500 border-gray-200');

  const activeWorkers   = workers.filter(w => w.isActive);
  const inactiveWorkers = workers.filter(w => !w.isActive);
  const totalPay = assignments.filter(a => a.status === 'completed').reduce((s, a) => s + (a.pay || 0), 0);

  // Calendar data
  const calDays = daysInMonth(calYear, calMonth);
  const firstDay = firstDayOfMonth(calYear, calMonth);
  const availMap = Object.fromEntries(availability.map(e => [e.date, e]));
  const today = new Date();
  const todayStr = toYMD(today.getFullYear(), today.getMonth(), today.getDate());

  const navMonth = (delta: number) => {
    let m = calMonth + delta;
    let y = calYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCalMonth(m);
    setCalYear(y);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#011c72]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Worker Management</h1>
            <p className="text-sm text-gray-500 mt-1">Manage workers, track assignments and availability</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/tasks"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Task Queue
            </Link>
            <button onClick={openAdd}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#011c72] hover:bg-[#022a9e] text-white text-sm font-medium rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Worker
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 mb-6 w-fit shadow-sm">
          {([['workers', 'Workers & Assignments'], ['calendar', 'Availability Calendar']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === id ? 'bg-[#011c72] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── WORKERS & ASSIGNMENTS TAB ── */}
        {activeTab === 'workers' && (
          <>
            {/* Worker list */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-8">
              <div className="p-5 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-900">Workers ({activeWorkers.length} active)</h2>
              </div>
              {activeWorkers.length === 0 ? (
                <p className="p-10 text-center text-gray-400 text-sm">No workers yet. Click "Add Worker" to get started.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activeWorkers.map(w => (
                    <div key={w.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#011c72]/10 text-[#011c72] flex items-center justify-center font-bold text-sm">
                          {w.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{w.name}</p>
                          <p className="text-xs text-gray-500">{w.workType} · {formatCurrency(w.ratePerHour)}/hr</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button onClick={() => setSelectedWorkerId(w.id === selectedWorkerId ? null : w.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${selectedWorkerId === w.id ? 'bg-[#011c72] text-white border-[#011c72]' : 'text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                          {selectedWorkerId === w.id ? 'Viewing' : 'View History'}
                        </button>
                        <button onClick={() => openEdit(w)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">Edit</button>
                        <button onClick={() => deactivate(w)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">Deactivate</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {inactiveWorkers.length > 0 && (
                <div className="border-t border-gray-200 px-5 py-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Inactive</p>
                  <div className="flex flex-wrap gap-2">
                    {inactiveWorkers.map(w => (
                      <div key={w.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                        <span className="text-sm text-gray-500">{w.name}</span>
                        <button onClick={() => reactivate(w)} className="text-xs text-[#011c72] hover:underline font-medium">Reactivate</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Assignments table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
              <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {selectedWorkerId ? `Work History — ${workers.find(w => w.id === selectedWorkerId)?.name}` : 'All Assignments'}
                  </h2>
                  {selectedWorkerId && totalPay > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">Total earned: <span className="font-semibold text-green-600">{formatCurrency(totalPay)}</span></p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Filter:</label>
                  <select value={selectedWorkerId ?? ''} onChange={e => setSelectedWorkerId(e.target.value ? parseInt(e.target.value) : null)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-900">
                    <option value="">All workers</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              {loadingAssignments ? (
                <div className="p-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#011c72] mx-auto" /></div>
              ) : assignments.length === 0 ? (
                <p className="p-10 text-center text-gray-400 text-sm">No assignments found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Worker', 'Job Order', 'Description', 'Status', 'Hours', 'Pay', 'Actions'].map((h, i) => (
                          <th key={h} className={`px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${i >= 4 ? 'text-right' : 'text-left'} ${h === 'Actions' ? 'text-center' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {assignments.map(a => (
                        <tr key={a.id} className={`hover:bg-gray-50 transition-colors ${a.isOverdue ? 'bg-red-50/40' : ''}`}>
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-gray-900">{a.workerName}</p>
                            <p className="text-xs text-gray-500">{a.workType} · {formatCurrency(a.ratePerHour)}/hr</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm text-gray-700 font-mono">{a.jobOrderRef}</p>
                          </td>
                          <td className="px-5 py-4 max-w-[180px]">
                            <p className="text-sm text-gray-700 truncate">{a.description || '—'}</p>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full border w-fit ${statusBadge(a.status)}`}>
                                {a.status.replace('_', ' ')}
                              </span>
                              {a.isOverdue && <OverdueBadge hours={a.overdueByHours || 0} />}
                              {a.startTime && <p className="text-xs text-gray-400">Started {formatDateTime(a.startTime)}</p>}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            {a.status === 'completed' ? (
                              <span className="text-sm font-semibold text-gray-900">{a.hoursWorked}h</span>
                            ) : a.status === 'in_progress' ? (
                              <input type="number" min="0" step="0.5" placeholder="hrs"
                                value={hoursInput[a.id] || ''}
                                onChange={e => setHoursInput(p => ({ ...p, [a.id]: e.target.value }))}
                                className="w-16 px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 text-right" />
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {a.status === 'completed'
                              ? <span className="text-sm font-semibold text-green-600">{formatCurrency(a.pay)}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-5 py-4 text-center">
                            {a.status === 'pending' && (
                              <button disabled={updatingAssignment === a.id} onClick={() => startWork(a)}
                                className="px-3 py-1.5 text-xs font-medium bg-[#011c72] hover:bg-[#022a9e] text-white rounded-lg disabled:opacity-50 transition-colors">
                                Start Work
                              </button>
                            )}
                            {a.status === 'in_progress' && (
                              <button disabled={updatingAssignment === a.id} onClick={() => finishWork(a)}
                                className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                                Finish
                              </button>
                            )}
                            {a.status === 'completed' && (
                              <span className="text-xs text-gray-400">{a.endTime ? formatDateTime(a.endTime) : 'Done'}</span>
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

        {/* ── AVAILABILITY CALENDAR TAB ── */}
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 flex items-start gap-3">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                Click a date to mark a worker as <strong>unavailable</strong> for that day (vacation, sick leave, etc.).
                Click again to clear it. Days with no mark are assumed available by default.
              </div>
            </div>

            {/* Worker + month selector */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Worker:</label>
                  <select value={calWorker ?? ''} onChange={e => setCalWorker(parseInt(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 min-w-[180px]">
                    {workers.filter(w => w.isActive).map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.workType})</option>
                    ))}
                  </select>
                </div>
                {/* Month navigation */}
                <div className="flex items-center gap-3">
                  <button onClick={() => navMonth(-1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-base font-semibold text-gray-900 w-36 text-center">
                    {MONTH_NAMES[calMonth]} {calYear}
                  </span>
                  <button onClick={() => navMonth(1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button onClick={fetchCalendar} disabled={loadingCal}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    {loadingCal ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-white border border-gray-300"></div>
                  <span>Available (default)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-red-100 border border-red-300"></div>
                  <span>Unavailable / Off</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded border-2 border-[#011c72]"></div>
                  <span>Today</span>
                </div>
              </div>

              {/* Calendar grid */}
              <div className="select-none">
                {/* Day labels */}
                <div className="grid grid-cols-7 mb-2">
                  {DAY_LABELS.map(d => (
                    <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1">
                  {/* Empty cells for first row */}
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: calDays }, (_, i) => i + 1).map(day => {
                    const dateStr = toYMD(calYear, calMonth, day);
                    const entry = availMap[dateStr];
                    const isUnavailable = entry && !entry.isAvailable;
                    const isToday = dateStr === todayStr;
                    const isSaving = savingDate === dateStr;
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        disabled={!!savingDate}
                        title={isUnavailable ? (entry.note || 'Unavailable') : 'Click to mark unavailable'}
                        className={`
                          relative aspect-square rounded-lg flex flex-col items-center justify-center
                          text-sm font-medium transition-colors border
                          ${isUnavailable
                            ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200'
                            : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'}
                          ${isToday ? 'border-2 border-[#011c72] font-bold' : ''}
                          ${isSaving ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                          disabled:cursor-not-allowed
                        `}
                      >
                        <span>{day}</span>
                        {isUnavailable && (
                          <svg className="w-3 h-3 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        {isSaving && <div className="absolute inset-0 flex items-center justify-center"><div className="w-3 h-3 border-2 border-[#011c72] border-t-transparent rounded-full animate-spin" /></div>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Summary of marked days */}
              {availability.filter(e => !e.isAvailable).length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Unavailable Days This Month ({availability.filter(e => !e.isAvailable).length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availability.filter(e => !e.isAvailable).map(e => (
                      <span key={e.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                        {formatDate(e.date)}
                        {e.note && <span className="text-red-400">· {e.note}</span>}
                        <button
                          onClick={() => api.workerAvailability.set({ managedWorkerId: e.managedWorkerId, date: e.date, isAvailable: null }).then(fetchCalendar)}
                          className="text-red-400 hover:text-red-600 ml-1"
                          title="Clear"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Worker Modal */}
      {showWorkerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowWorkerModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{editingWorker ? 'Edit Worker' : 'Add Worker'}</h2>
              <button onClick={() => setShowWorkerModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" value={workerForm.name} onChange={e => setWorkerForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="e.g. Juan dela Cruz" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                <select value={workerForm.workType} onChange={e => setWorkerForm(f => ({ ...f, workType: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent">
                  {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rate per Hour (₱)</label>
                <input type="number" min="0" step="0.01" value={workerForm.ratePerHour}
                  onChange={e => setWorkerForm(f => ({ ...f, ratePerHour: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="e.g. 100" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button onClick={saveWorker} disabled={savingWorker || !workerForm.name.trim()}
                className="flex-1 py-2.5 bg-[#011c72] hover:bg-[#022a9e] text-white font-medium rounded-xl transition-colors disabled:opacity-50 text-sm">
                {savingWorker ? 'Saving...' : editingWorker ? 'Save Changes' : 'Add Worker'}
              </button>
              <button onClick={() => setShowWorkerModal(false)}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
