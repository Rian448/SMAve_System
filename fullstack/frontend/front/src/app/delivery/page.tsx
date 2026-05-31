'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { api, TransferDashboardItem, TransferSummary } from '@/lib/api';
import Link from 'next/link';

type StatusFilter = 'all' | 'pending' | 'transferred' | 'received';

export default function DeliveryPage() {
  const { user } = useAuth();
  const { refresh: refreshNotifs } = useNotifications();

  const [transfers, setTransfers] = useState<TransferDashboardItem[]>([]);
  const [summary, setSummary] = useState<TransferSummary>({ pending: 0, inTransit: 0, received: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [qrTransferId, setQrTransferId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanInput, setScanInput] = useState('');
  // Admin override confirmation
  const [overrideConfirm, setOverrideConfirm] = useState<{ id: number; action: 'mark-sent' | 'confirm-receipt'; transfer: TransferDashboardItem } | null>(null);

  const isAdmin = user?.role === 'administrator';

  const canSee = user && ['administrator', 'supervisor'].includes(user.role);

  const load = useCallback(async () => {
    if (!canSee) return;
    setLoading(true);
    try {
      const res = await api.productOrderTransfers.getDashboard(
        statusFilter !== 'all' ? { status: statusFilter === 'transferred' ? 'transferred' : statusFilter } : undefined
      );
      setTransfers((res as any).data ?? []);
      setSummary((res as any).summary ?? { pending: 0, inTransit: 0, received: 0, overdue: 0 });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [canSee, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(load, 60_000);
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
    } catch (e: any) {
      flash(e.message || 'Action failed', true);
    } finally { setSavingId(null); }
  };

  const bulkAction = async (action: 'mark-sent' | 'confirm-receipt') => {
    if (selected.size === 0) return;
    setBulkLoading(true); setActionError('');
    try {
      const res = await api.productOrderTransfers.bulkAction(action, [...selected]);
      const { succeeded, failed } = (res as any).data;
      await load(); await refreshNotifs();
      setSelected(new Set());
      const msg = `${succeeded.length} succeeded${failed.length > 0 ? `, ${failed.length} failed` : ''}.`;
      flash(msg, failed.length > 0);
    } catch (e: any) {
      flash(e.message || 'Bulk action failed', true);
    } finally { setBulkLoading(false); }
  };

  const handleScanSubmit = async () => {
    const match = scanInput.trim().match(/^(?:TRANSFER:)?(\d+)$/i);
    if (!match) { flash('Invalid QR — expected TRANSFER:{id}', true); return; }
    const id = parseInt(match[1]);
    setScanning(false); setScanInput('');
    await singleAction(id, 'confirm-receipt');
  };

  const toggleSelect = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const selectAll = () => {
    const actionable = actionableIds();
    setSelected(actionable.size === selected.size ? new Set() : actionable);
  };

  const actionableIds = () => new Set(
    transfers
      .filter(t => t.status === 'pending' || t.status === 'transferred')
      .map(t => t.id)
  );

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  const selectedPending = [...selected].filter(id => transfers.find(t => t.id === id)?.status === 'pending');
  const selectedTransferred = [...selected].filter(id => transfers.find(t => t.id === id)?.status === 'transferred');

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Transfer Dashboard</h1>
          <p className="text-gray-500 mt-1 text-sm">Track all premade product transfers between branches in real time</p>
        </div>

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
          <StatCard label="Overdue (>24h)" value={summary.overdue} color="red" onClick={() => setStatusFilter('all')} active={false} />
        </div>

        {/* Filter bar + QR scan button */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Status:</span>
          {(['all', 'pending', 'transferred', 'received'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === f ? 'bg-[#011c72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f === 'all' ? 'All' : f === 'pending' ? 'Awaiting Dispatch' : f === 'transferred' ? 'In Transit' : 'Received'}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setScanning(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              Scan QR
            </button>
            <button onClick={load} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1.5">
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

        {/* QR Scan Modal */}
        {scanning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <h3 className="font-bold text-gray-900">Scan Transfer QR</h3>
              <p className="text-sm text-gray-500">Enter the Transfer ID from the QR code label, or type it manually:</p>
              <input autoFocus value={scanInput} onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScanSubmit()}
                placeholder="e.g. TRANSFER:42 or just 42"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#011c72]" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setScanning(false); setScanInput(''); }}
                  className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                <button onClick={handleScanSubmit}
                  className="px-4 py-2 rounded-lg text-sm bg-green-600 text-white font-semibold hover:bg-green-700">
                  Confirm Receipt
                </button>
              </div>
            </div>
          </div>
        )}

        {/* QR Preview Modal */}
        {qrTransferId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setQrTransferId(null)}>
            <div className="bg-white rounded-xl shadow-xl p-6 space-y-3 text-center" onClick={e => e.stopPropagation()}>
              <p className="font-bold text-gray-900 text-sm">Transfer #{qrTransferId}</p>
              <p className="text-xs text-gray-500">Scan this at the pickup branch to confirm receipt</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=TRANSFER:${qrTransferId}`}
                alt={`QR for transfer ${qrTransferId}`} className="mx-auto rounded-lg border" />
              <p className="text-xs font-mono text-gray-400">TRANSFER:{qrTransferId}</p>
              <button onClick={() => setQrTransferId(null)}
                className="mt-2 px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200">Close</button>
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
        ) : transfers.length === 0 ? (
          <div className="p-10 text-center bg-white rounded-xl border border-gray-200 text-gray-400 text-sm">
            No transfers found.
          </div>
        ) : (
          <div className="space-y-1">
            {/* Select all row */}
            <div className="flex items-center gap-2 px-2 pb-1">
              <input type="checkbox"
                checked={selected.size > 0 && selected.size === actionableIds().size}
                onChange={selectAll}
                className="w-4 h-4 rounded border-gray-300 text-[#011c72] cursor-pointer" />
              <span className="text-xs text-gray-400">Select actionable</span>
            </div>

            {transfers.map(t => (
              <TransferRow
                key={t.id}
                transfer={t}
                selected={selected.has(t.id)}
                onToggle={toggleSelect}
                onMarkSent={transfer => triggerAction(transfer, 'mark-sent')}
                onConfirm={transfer => triggerAction(transfer, 'confirm-receipt')}
                onShowQr={setQrTransferId}
                savingId={savingId}
                isAdmin={isAdmin}
                fmt={fmt}
              />
            ))}
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
  onToggle: (id: number) => void;
  onMarkSent: (transfer: TransferDashboardItem) => void;
  onConfirm: (transfer: TransferDashboardItem) => void;
  onShowQr: (id: number) => void;
  savingId: number | null;
  isAdmin: boolean;
  fmt: (iso?: string) => string;
}

function TransferRow({ transfer: t, selected, onToggle, onMarkSent, onConfirm, onShowQr, savingId, isAdmin, fmt }: TransferRowProps) {
  const isSaving = savingId === t.id;
  const isActionable = t.status === 'pending' || t.status === 'transferred';
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
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${t.isOverdue ? 'border-red-300' : 'border-gray-200'}`}>
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
              <span className="ml-auto text-sm font-bold text-gray-900">₱{total.toLocaleString()}</span>
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
              {isAdmin && t.status !== 'received' && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  Admin — requires confirmation to act
                </span>
              )}

              {t.status === 'pending' && (
                <>
                  <button onClick={() => onShowQr(t.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1">
                    <QrIcon /> Show QR
                  </button>
                  <button onClick={() => onMarkSent(t)} disabled={isSaving}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5 ${isAdmin ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {isSaving ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4" /></svg>}
                    {isAdmin ? 'Override: Mark Sent' : 'Mark as Sent'}
                  </button>
                </>
              )}
              {t.status === 'transferred' && (
                <>
                  <button onClick={() => onShowQr(t.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1">
                    <QrIcon /> Scan QR
                  </button>
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

function QrIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
    </svg>
  );
}
