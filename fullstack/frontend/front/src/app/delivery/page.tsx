'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { api, TransferDashboardItem, TransferSummary } from '@/lib/api';
import { formatDateTime } from '@/lib/dateUtils';
import Link from 'next/link';
import Paginated from '@/components/Paginated';
import { JobOrderDeliveriesPanel } from '@/components/JobOrderDelivery';

// 'overdue' is applied client-side: the server has no overdue filter, only a flag per row.
type StatusFilter = 'all' | 'pending' | 'transferred' | 'received' | 'overdue';

export default function DeliveryPage() {
  // useSearchParams needs a Suspense boundary for this route to prerender.
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full" />
      </div>
    }>
      <ItemTrailContent />
    </Suspense>
  );
}

function ItemTrailContent() {
  const { user, can } = useAuth();
  const { refresh: refreshNotifs } = useNotifications();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [transfers, setTransfers] = useState<TransferDashboardItem[]>([]);
  const [summary, setSummary] = useState<TransferSummary>({ pending: 0, inTransit: 0, received: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  // Admin override confirmation
  const [overrideConfirm, setOverrideConfirm] = useState<{ id: number; action: 'mark-sent' | 'confirm-receipt'; transfer: TransferDashboardItem } | null>(null);

  // Pins are kept per user in this browser so each supervisor can flag what they're watching
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [actionFirst, setActionFirst] = useState(true);

  // Cross-branch staff act on other branches' transfers as an override
  const isAdmin = can('branches.all');
  const canSee = !!user && can('item_trail.view');
  // Sending and receiving transfers needs the permission the server checks; viewing accounts only look
  const canTransfer = can('product_orders.transfer');

  // The Audit Trail moved to Settings: forward old ?view=audit links there
  useEffect(() => {
    if (searchParams.get('view') === 'audit') router.replace('/audit-trail');
  }, [searchParams, router]);

  const pinKey = user ? `itemTrailPins:${user.id}` : null;

  useEffect(() => {
    if (!pinKey) return;
    try {
      const raw = localStorage.getItem(pinKey);
      setPinned(new Set(raw ? JSON.parse(raw) : []));
    } catch { /* storage unavailable — pins just won't persist */ }
  }, [pinKey]);

  const togglePin = (id: number) => {
    setPinned(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      if (pinKey) {
        try { localStorage.setItem(pinKey, JSON.stringify([...s])); } catch { /* ignore */ }
      }
      return s;
    });
  };

  // `silent` is for the background refresh: it updates the list in place instead
  // of swapping it for a spinner, which used to wipe the view (and scroll) every minute.
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!canSee) { setLoading(false); return; }
    if (!opts?.silent) setLoading(true);
    try {
      const serverStatus = statusFilter === 'all' || statusFilter === 'overdue' ? undefined : statusFilter;
      const res = await api.productOrderTransfers.getDashboard(serverStatus ? { status: serverStatus } : undefined);
      // The endpoint returns `data` and `summary` side by side at the top level.
      const body = res as unknown as { data?: TransferDashboardItem[]; summary?: TransferSummary };
      const rows = body.data ?? [];
      setTransfers(statusFilter === 'overdue' ? rows.filter(t => t.isOverdue) : rows);
      setSummary(body.summary ?? { pending: 0, inTransit: 0, received: 0, overdue: 0 });
      setLoadError('');
    } catch (e) {
      // A background refresh keeps showing the last good list; only a manual load reports.
      if (!opts?.silent) setLoadError(e instanceof Error ? e.message : 'Failed to load transfers.');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [canSee, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // A selection made under one filter must not carry over to rows the user can no longer see.
  useEffect(() => { setSelected(new Set()); }, [statusFilter]);

  // Auto-refresh every 60s, quietly.
  useEffect(() => {
    const t = setInterval(() => load({ silent: true }), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const flash = (msg: string, isError = false) => {
    if (isError) { setActionError(msg); setTimeout(() => setActionError(''), 5000); }
    else { setActionSuccess(msg); setTimeout(() => setActionSuccess(''), 4000); }
  };

  // Supervisors act directly; admin must confirm override first
  const triggerAction = (transfer: TransferDashboardItem, action: 'mark-sent' | 'confirm-receipt') => {
    if (isAdmin) {
      setOverrideConfirm({ id: transfer.id, action, transfer });
    } else {
      singleAction(transfer.id, action);
    }
  };

  const singleAction = async (id: number, action: 'mark-sent' | 'confirm-receipt') => {
    setSavingId(id); setActionError('');
    try {
      if (action === 'mark-sent') await api.productOrderTransfers.markTransferred(id);
      else await api.productOrderTransfers.confirmReceipt(id);
      await load(); await refreshNotifs();
      flash(action === 'mark-sent' ? 'Marked as sent.' : 'Receipt confirmed.');
    } catch (e) {
      flash((e as Error)?.message || 'Action failed', true);
    } finally { setSavingId(null); }
  };

  const bulkAction = async (action: 'mark-sent' | 'confirm-receipt') => {
    if (selected.size === 0) return;
    setBulkLoading(true); setActionError('');
    try {
      const res = await api.productOrderTransfers.bulkAction(action, [...selected]);
      const { succeeded, failed } = res.data ?? { succeeded: [], failed: [] };
      await load(); await refreshNotifs();
      setSelected(new Set());
      const msg = `${succeeded.length} succeeded${failed.length > 0 ? `, ${failed.length} failed` : ''}.`;
      flash(msg, failed.length > 0);
    } catch (e) {
      flash((e as Error)?.message || 'Bulk action failed', true);
    } finally { setBulkLoading(false); }
  };


  const toggleSelect = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const selectAll = () => {
    const actionable = actionableIds();
    setSelected(actionable.size === selected.size ? new Set() : actionable);
  };

  const actionableIds = () => new Set(
    transfers
      .filter(t => canTransfer && (t.status === 'pending' || t.status === 'transferred'))
      .map(t => t.id)
  );

  const fmt = (iso?: string) => iso ? formatDateTime(iso) : '—';

  const needsAction = (t: TransferDashboardItem) => t.status === 'pending' || t.status === 'transferred';

  // Pinned first; then (if enabled) items needing action — overdue, then oldest — ahead of completed ones.
  // Array.sort is stable, so ties keep the server's order.
  const sortedTransfers = [...transfers].sort((a, b) => {
    const pin = Number(pinned.has(b.id)) - Number(pinned.has(a.id));
    if (pin !== 0) return pin;
    if (!actionFirst) return 0;
    const act = Number(needsAction(b)) - Number(needsAction(a));
    if (act !== 0) return act;
    if (!needsAction(a)) return 0;
    const overdue = Number(b.isOverdue) - Number(a.isOverdue);
    if (overdue !== 0) return overdue;
    return b.agingHours - a.agingHours;
  });

  const selectedPending = [...selected].filter(id => transfers.find(t => t.id === id)?.status === 'pending');
  const selectedTransferred = [...selected].filter(id => transfers.find(t => t.id === id)?.status === 'transferred');

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Item Trail</h1>
            <p className="text-gray-500 mt-1 text-sm">Track all premade product transfers between branches in real time</p>
          </div>
        </div>

        {/* Deliveries of finished job orders (scheduled from the job order or here) */}
        <JobOrderDeliveriesPanel />

        {/* Alerts */}
        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{actionError}</div>
        )}
        {actionSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{actionSuccess}</div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Awaiting Dispatch" value={summary.pending} color="yellow" onClick={() => setStatusFilter('pending')} active={statusFilter === 'pending'} />
          <StatCard label="In Transit" value={summary.inTransit} color="blue" onClick={() => setStatusFilter('transferred')} active={statusFilter === 'transferred'} />
          <StatCard label="Received" value={summary.received} color="green" onClick={() => setStatusFilter('received')} active={statusFilter === 'received'} />
          <StatCard label="Overdue (>24h)" value={summary.overdue} color="red" onClick={() => setStatusFilter('overdue')} active={statusFilter === 'overdue'} />
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Status:</span>
          {(['all', 'pending', 'transferred', 'received', 'overdue'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === f ? 'bg-[#011c72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f === 'all' ? 'All' : f === 'pending' ? 'Awaiting Dispatch' : f === 'transferred' ? 'In Transit' : f === 'received' ? 'Received' : 'Overdue'}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-2 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={actionFirst} onChange={e => setActionFirst(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#011c72] cursor-pointer" />
              Needs action first
            </label>
            <button onClick={() => load()} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="bg-[#011c72] text-white rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            {selectedPending.length > 0 && (
              <button onClick={() => bulkAction('mark-sent')} disabled={bulkLoading}
                className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {bulkLoading ? <Spinner /> : null}
                Mark {selectedPending.length} as Sent
              </button>
            )}
            {selectedTransferred.length > 0 && (
              <button onClick={() => bulkAction('confirm-receipt')} disabled={bulkLoading}
                className="px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {bulkLoading ? <Spinner /> : null}
                Confirm Receipt of {selectedTransferred.length}
              </button>
            )}
            <button onClick={() => setSelected(new Set())} className="ml-auto text-sm underline opacity-70 hover:opacity-100">
              Clear selection
            </button>
          </div>
        )}

        {/* Admin Override Confirmation */}
        {overrideConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Admin Override</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    This action is normally performed by the <strong>branch supervisor</strong>.
                    You are overriding it as administrator. This will be logged.
                  </p>
                  <div className="mt-3 text-xs bg-gray-50 rounded-lg p-2 space-y-0.5 text-gray-600">
                    <p><span className="font-medium">Transfer:</span> #{overrideConfirm.transfer.id} — {overrideConfirm.transfer.orderNumber}</p>
                    <p><span className="font-medium">Action:</span> {overrideConfirm.action === 'mark-sent' ? 'Mark as Sent (dispatch from ' + overrideConfirm.transfer.sourceBranchName + ')' : 'Confirm Receipt (at ' + overrideConfirm.transfer.pickupBranchName + ')'}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setOverrideConfirm(null)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                <button onClick={async () => { const { id, action } = overrideConfirm; setOverrideConfirm(null); await singleAction(id, action); }}
                  className="px-4 py-2 rounded-lg text-sm bg-amber-500 text-white font-semibold hover:bg-amber-600">
                  Yes, Override
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transfer list */}
        {!canSee ? (
          <div className="p-10 text-center bg-white rounded-xl border border-gray-200 text-gray-400">
            You do not have permission to view transfers.
          </div>
        ) : loading ? (
          <div className="p-10 text-center bg-white rounded-xl border border-gray-200">
            <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto" />
            <p className="mt-3 text-gray-500 text-sm">Loading transfers...</p>
          </div>
        ) : loadError ? (
          <div className="p-10 text-center bg-white rounded-xl border border-red-200 text-sm">
            <p className="text-red-600">{loadError}</p>
            <button onClick={() => load()} className="mt-3 px-4 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Try again</button>
          </div>
        ) : transfers.length === 0 ? (
          <div className="p-10 text-center bg-white rounded-xl border border-gray-200 text-gray-400 text-sm">
            {statusFilter === 'overdue' ? 'Nothing is overdue.' : 'No transfers found.'}
          </div>
        ) : (
          <div className="space-y-1">
            {/* Select all row */}
            {canTransfer && (
            <div className="flex items-center gap-2 px-2 pb-1">
              <input type="checkbox"
                checked={selected.size > 0 && selected.size === actionableIds().size}
                onChange={selectAll}
                className="w-4 h-4 rounded border-gray-300 text-[#011c72] cursor-pointer" />
              <span className="text-xs text-gray-400">Select actionable</span>
            </div>
            )}

            <Paginated items={sortedTransfers} resetKey={statusFilter} label="transfers" boxed>{rows => (<>
            {rows.map(t => (
              <TransferRow
                key={t.id}
                transfer={t}
                selected={selected.has(t.id)}
                pinned={pinned.has(t.id)}
                onTogglePin={togglePin}
                onToggle={toggleSelect}
                onMarkSent={transfer => triggerAction(transfer, 'mark-sent')}
                onConfirm={transfer => triggerAction(transfer, 'confirm-receipt')}
                savingId={savingId}
                isAdmin={isAdmin}
                canAct={canTransfer}
                fmt={fmt}
              />
            ))}
            </>)}</Paginated>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, onClick, active }: {
  label: string; value: number; color: 'yellow' | 'blue' | 'green' | 'red';
  onClick: () => void; active: boolean;
}) {
  const colors = {
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  };
  return (
    <button onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-all ${colors[color]} ${active ? 'ring-2 ring-offset-1 ring-current' : 'hover:opacity-80'}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
    </button>
  );
}

// ─── Transfer Row ───────────────────────────────────────────────────────────────

interface TransferRowProps {
  transfer: TransferDashboardItem;
  selected: boolean;
  pinned: boolean;
  onTogglePin: (id: number) => void;
  onToggle: (id: number) => void;
  onMarkSent: (transfer: TransferDashboardItem) => void;
  onConfirm: (transfer: TransferDashboardItem) => void;
  savingId: number | null;
  isAdmin: boolean;
  canAct: boolean;
  fmt: (iso?: string) => string;
}

function TransferRow({ transfer: t, selected, pinned, onTogglePin, onToggle, onMarkSent, onConfirm, savingId, isAdmin, canAct, fmt }: TransferRowProps) {
  const isSaving = savingId === t.id;
  const isActionable = canAct && (t.status === 'pending' || t.status === 'transferred');
  const total = t.items.reduce((s, i) => s + (i.total ?? i.unitPrice * i.quantity), 0);

  const agingLabel = t.agingHours < 1
    ? `${Math.round(t.agingHours * 60)}m ago`
    : `${Math.round(t.agingHours)}h ago`;

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    transferred: 'bg-blue-100 text-blue-700 border-blue-200',
    received: 'bg-green-100 text-green-700 border-green-200',
  };
  const statusLabel: Record<string, string> = {
    pending: 'Awaiting Dispatch',
    transferred: 'In Transit',
    received: 'Received',
  };

  const stepDone = t.status !== 'pending';
  const stepReceived = t.status === 'received';

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${t.isOverdue ? 'border-red-300' : pinned ? 'border-[#011c72]/40' : 'border-gray-200'} ${pinned ? 'ring-1 ring-[#011c72]/20' : ''}`}>
      {/* Overdue banner */}
      {t.isOverdue && (
        <div className="px-4 py-1.5 bg-red-50 border-b border-red-200 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-xs font-semibold text-red-600">No action for {agingLabel} — overdue</span>
        </div>
      )}

      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div className="pt-0.5">
            <input type="checkbox" checked={selected} onChange={() => onToggle(t.id)}
              disabled={!isActionable}
              className="w-4 h-4 rounded border-gray-300 text-[#011c72] cursor-pointer disabled:opacity-30" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Top row */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Link href={`/product-orders/${t.productOrderId}`}
                className="text-sm font-bold text-[#011c72] hover:underline">
                {t.orderNumber || `#${t.productOrderId}`}
              </Link>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusColors[t.status]}`}>
                {statusLabel[t.status]}
              </span>
              {!t.isOverdue && t.status !== 'received' && (
                <span className="text-xs text-gray-400">{agingLabel}</span>
              )}
              <span className="ml-auto text-sm font-bold text-gray-900">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <button onClick={() => onTogglePin(t.id)}
                title={pinned ? 'Unpin' : 'Pin to top'}
                aria-label={pinned ? 'Unpin transfer' : 'Pin transfer to top'}
                aria-pressed={pinned}
                className={`p-1 rounded-md transition-colors ${pinned ? 'text-[#011c72] bg-[#eef1fb] hover:bg-[#dde6ff]' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5v-1l4-5-4-4 2-2 5 1 4-4 1-3z" />
                </svg>
              </button>
            </div>

            {/* Branch route */}
            <div className="flex items-center gap-1.5 text-sm mb-2">
              <span className="font-medium text-gray-700">{t.sourceBranchName}</span>
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-medium text-gray-700">{t.pickupBranchName}</span>
              <span className="text-gray-400 text-xs ml-1">· {t.customerName}</span>
            </div>

            {/* Items */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {t.items.map((item, idx) => (
                <span key={idx} className="text-xs px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg text-gray-700">
                  {item.name} <span className="text-gray-400">×{item.quantity}</span>
                </span>
              ))}
            </div>

            {/* Trail steps */}
            <div className="flex items-center text-xs mb-3">
              {/* Step 1 */}
              <div className="flex flex-col items-center text-center w-28">
                <div className="w-6 h-6 rounded-full border-2 border-green-400 bg-green-50 flex items-center justify-center mb-1">
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="font-semibold text-green-700">Allocated</p>
                <p className="text-gray-400 text-[10px]">{fmt(t.createdAt)}</p>
              </div>

              <div className={`flex-1 h-0.5 mx-1 ${stepDone ? 'bg-green-400' : 'bg-gray-200'}`} />

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center w-32">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mb-1 ${stepDone ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                  {stepDone
                    ? <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4" /></svg>}
                </div>
                <p className={`font-semibold ${stepDone ? 'text-green-700' : 'text-gray-300'}`}>Dispatched</p>
                {t.transferredAt
                  ? <><p className="text-gray-400 text-[10px]">{fmt(t.transferredAt)}</p><p className="text-gray-400 text-[10px]">by {t.transferredByName}</p></>
                  : <p className="text-gray-300 text-[10px]">Pending</p>}
              </div>

              <div className={`flex-1 h-0.5 mx-1 ${stepReceived ? 'bg-green-400' : 'bg-gray-200'}`} />

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center w-32">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mb-1 ${stepReceived ? 'border-green-400 bg-green-50' : t.status === 'transferred' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                  {stepReceived
                    ? <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    : <svg className={`w-3.5 h-3.5 ${t.status === 'transferred' ? 'text-blue-400' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" /></svg>}
                </div>
                <p className={`font-semibold ${stepReceived ? 'text-green-700' : t.status === 'transferred' ? 'text-blue-600' : 'text-gray-300'}`}>Received</p>
                {t.receivedAt
                  ? <><p className="text-gray-400 text-[10px]">{fmt(t.receivedAt)}</p><p className="text-gray-400 text-[10px]">by {t.receivedByName}</p></>
                  : <p className={`text-[10px] ${t.status === 'transferred' ? 'text-blue-400' : 'text-gray-300'}`}>{t.status === 'transferred' ? 'Awaiting confirmation' : 'Pending'}</p>}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 justify-end flex-wrap">
              {/* Admin override label */}
              {canAct && isAdmin && t.status !== 'received' && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  Admin — requires confirmation to act
                </span>
              )}

              {canAct && t.status === 'pending' && (
                <>
                  <button onClick={() => onMarkSent(t)} disabled={isSaving}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5 ${isAdmin ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {isSaving ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4" /></svg>}
                    {isAdmin ? 'Override: Mark Sent' : 'Mark as Sent'}
                  </button>
                </>
              )}
              {canAct && t.status === 'transferred' && (
                <>
                  <button onClick={() => onConfirm(t)} disabled={isSaving}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5 ${isAdmin ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                    {isSaving ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                    {isAdmin ? 'Override: Confirm Receipt' : 'Confirm Receipt'}
                  </button>
                </>
              )}
              {t.status === 'received' && (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Complete
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}

