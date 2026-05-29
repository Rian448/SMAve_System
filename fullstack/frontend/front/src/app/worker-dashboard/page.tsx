'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ManagedWorker, WorkerAssignment } from '@/lib/api';

const WORK_TYPES = ['Seat Maker', 'Sewer', 'Upholstery', 'Installer', 'Cutter', 'Finisher', 'Other'];

export default function WorkerDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [workers, setWorkers] = useState<ManagedWorker[]>([]);
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Add/Edit worker modal
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<ManagedWorker | null>(null);
  const [workerForm, setWorkerForm] = useState({ name: '', workType: '', ratePerHour: '' });
  const [savingWorker, setSavingWorker] = useState(false);

  // Assignment status update
  const [updatingAssignment, setUpdatingAssignment] = useState<number | null>(null);
  const [hoursInput, setHoursInput] = useState<{ [id: number]: string }>({});

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else if (user.role !== 'administrator') {
        router.push('/dashboard');
      } else {
        fetchWorkers();
      }
    }
  }, [user, authLoading, router]);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      const res = await api.managedWorkers.list();
      setWorkers(res.data?.workers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async (workerId?: number) => {
    try {
      setLoadingAssignments(true);
      const res = await api.workerAssignments.list(workerId);
      setAssignments(res.data?.assignments || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAssignments(false);
    }
  };

  useEffect(() => {
    if (!loading) {
      fetchAssignments(selectedWorkerId ?? undefined);
    }
  }, [selectedWorkerId, loading]);

  const openAddModal = () => {
    setEditingWorker(null);
    setWorkerForm({ name: '', workType: WORK_TYPES[0], ratePerHour: '' });
    setShowWorkerModal(true);
  };

  const openEditModal = (w: ManagedWorker) => {
    setEditingWorker(w);
    setWorkerForm({ name: w.name, workType: w.workType, ratePerHour: String(w.ratePerHour) });
    setShowWorkerModal(true);
  };

  const saveWorker = async () => {
    if (!workerForm.name.trim() || !workerForm.workType.trim()) return;
    setSavingWorker(true);
    try {
      const payload = {
        name: workerForm.name.trim(),
        workType: workerForm.workType.trim(),
        ratePerHour: parseFloat(workerForm.ratePerHour) || 0,
      };
      if (editingWorker) {
        await api.managedWorkers.update(editingWorker.id, payload);
      } else {
        await api.managedWorkers.create(payload);
      }
      setShowWorkerModal(false);
      fetchWorkers();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingWorker(false);
    }
  };

  const deactivateWorker = async (w: ManagedWorker) => {
    if (!confirm(`Deactivate ${w.name}? They will no longer appear in labor dropdowns.`)) return;
    try {
      await api.managedWorkers.update(w.id, { isActive: false });
      fetchWorkers();
    } catch (err) {
      console.error(err);
    }
  };

  const reactivateWorker = async (w: ManagedWorker) => {
    try {
      await api.managedWorkers.update(w.id, { isActive: true });
      fetchWorkers();
    } catch (err) {
      console.error(err);
    }
  };

  const startWork = async (a: WorkerAssignment) => {
    setUpdatingAssignment(a.id);
    try {
      await api.workerAssignments.update(a.id, { status: 'in_progress' });
      fetchAssignments(selectedWorkerId ?? undefined);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingAssignment(null);
    }
  };

  const finishWork = async (a: WorkerAssignment) => {
    const hrs = parseFloat(hoursInput[a.id] || '0');
    if (!hrs || hrs <= 0) {
      alert('Please enter the hours worked before finishing.');
      return;
    }
    setUpdatingAssignment(a.id);
    try {
      await api.workerAssignments.update(a.id, { status: 'completed', hoursWorked: hrs });
      fetchAssignments(selectedWorkerId ?? undefined);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingAssignment(null);
    }
  };

  const formatCurrency = (v?: number) =>
    v != null ? `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—';

  const formatDateTime = (s?: string) => {
    if (!s) return '—';
    return new Date(s).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700 border-green-200';
      case 'in_progress': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
  };

  const activeWorkers = workers.filter(w => w.isActive);
  const inactiveWorkers = workers.filter(w => !w.isActive);

  const totalPay = assignments
    .filter(a => a.status === 'completed')
    .reduce((sum, a) => sum + (a.pay || 0), 0);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#011c72] mx-auto"></div>
          <p className="mt-3 text-gray-500 text-sm">Loading...</p>
        </div>
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
            <p className="text-sm text-gray-500 mt-1">
              Manage workers, track assignments and pay
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#011c72] hover:bg-[#022a9e] text-white text-sm font-medium rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Worker
          </button>
        </div>

        {/* Worker List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-8">
          <div className="p-5 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Workers ({activeWorkers.length} active)</h2>
          </div>

          {activeWorkers.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">
              No workers yet. Click "Add Worker" to get started.
            </div>
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelectedWorkerId(w.id === selectedWorkerId ? null : w.id); }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        selectedWorkerId === w.id
                          ? 'bg-[#011c72] text-white border-[#011c72]'
                          : 'text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {selectedWorkerId === w.id ? 'Viewing' : 'View History'}
                    </button>
                    <button
                      onClick={() => openEditModal(w)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deactivateWorker(w)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Deactivate
                    </button>
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
                    <button
                      onClick={() => reactivateWorker(w)}
                      className="text-xs text-[#011c72] hover:underline font-medium"
                    >
                      Reactivate
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Assignments Panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {selectedWorkerId
                  ? `Work History — ${workers.find(w => w.id === selectedWorkerId)?.name || ''}`
                  : 'All Assignments'}
              </h2>
              {selectedWorkerId && assignments.some(a => a.status === 'completed') && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Total earned: <span className="font-semibold text-green-600">{formatCurrency(totalPay)}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Filter by worker:</label>
              <select
                value={selectedWorkerId ?? ''}
                onChange={e => setSelectedWorkerId(e.target.value ? parseInt(e.target.value) : null)}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-900"
              >
                <option value="">All workers</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          {loadingAssignments ? (
            <div className="p-10 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#011c72] mx-auto"></div>
            </div>
          ) : assignments.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">
              No assignments found. Assignments are created when you assign a worker to a labor item in a sales job order.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Worker</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Order</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Hours</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Pay</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {assignments.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
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
                        <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full border ${statusBadge(a.status)}`}>
                          {a.status.replace('_', ' ')}
                        </span>
                        {a.startTime && (
                          <p className="text-xs text-gray-400 mt-1">Started {formatDateTime(a.startTime)}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {a.status === 'completed' ? (
                          <span className="text-sm font-semibold text-gray-900">{a.hoursWorked}h</span>
                        ) : a.status === 'in_progress' ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              placeholder="hrs"
                              value={hoursInput[a.id] || ''}
                              onChange={e => setHoursInput(prev => ({ ...prev, [a.id]: e.target.value }))}
                              className="w-16 px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 text-right"
                            />
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {a.status === 'completed'
                          ? <span className="text-sm font-semibold text-green-600">{formatCurrency(a.pay)}</span>
                          : '—'}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {a.status === 'pending' && (
                            <button
                              disabled={updatingAssignment === a.id}
                              onClick={() => startWork(a)}
                              className="px-3 py-1.5 text-xs font-medium bg-[#011c72] hover:bg-[#022a9e] text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              Start Work
                            </button>
                          )}
                          {a.status === 'in_progress' && (
                            <button
                              disabled={updatingAssignment === a.id}
                              onClick={() => finishWork(a)}
                              className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              Finish
                            </button>
                          )}
                          {a.status === 'completed' && (
                            <span className="text-xs text-gray-400">
                              {a.endTime ? formatDateTime(a.endTime) : 'Done'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Worker Modal */}
      {showWorkerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowWorkerModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingWorker ? 'Edit Worker' : 'Add Worker'}
              </h2>
              <button onClick={() => setShowWorkerModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={workerForm.name}
                  onChange={e => setWorkerForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="e.g. Juan dela Cruz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                <select
                  value={workerForm.workType}
                  onChange={e => setWorkerForm(f => ({ ...f, workType: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                >
                  {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rate per Hour (₱)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={workerForm.ratePerHour}
                  onChange={e => setWorkerForm(f => ({ ...f, ratePerHour: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="e.g. 100"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={saveWorker}
                disabled={savingWorker || !workerForm.name.trim()}
                className="flex-1 py-2.5 bg-[#011c72] hover:bg-[#022a9e] text-white font-medium rounded-xl transition-colors disabled:opacity-50 text-sm"
              >
                {savingWorker ? 'Saving...' : editingWorker ? 'Save Changes' : 'Add Worker'}
              </button>
              <button
                onClick={() => setShowWorkerModal(false)}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
