'use client';
import { useEffect, useState } from 'react';
import { api, type RawMaterial, type MaterialWasteLog, type ManagedWorker } from '@/lib/api';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';

const REASONS = ['Cutting mistake', 'Sewing error', 'Defective material', 'Wrong measurement', 'Rework requested'];

/**
 * Issue extra material for a job order: it leaves stock now, is added to the
 * job's actual cost and, when a worker is named, shows in their history. Used by
 * the job order page (worker picked from `workers`) and Worker Management (the
 * task's worker is given as workerId).
 */
export default function ExtraMaterialDialog({ jobOrderId, jobOrderRef, workerId, workerName, workers, onClose, onSaved }: {
  jobOrderId: number;
  jobOrderRef: string;
  /** The worker it is for; leave out to let the user pick one from `workers` */
  workerId?: number;
  workerName?: string;
  workers?: ManagedWorker[];
  onClose: () => void;
  onSaved: (log: MaterialWasteLog) => void;
}) {
  const [materials, setMaterials] = useState<RawMaterial[] | null>(null);
  const [form, setForm] = useState({ materialId: '', quantity: '', reason: '', notes: '', workerId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fe = useFieldErrors();

  // The order's own branch and the warehouse, as on the job order page
  useEffect(() => {
    api.sales.getJobOrder(jobOrderId)
      .then(res => api.inventory.getRawMaterials(
        res.data?.branchId ? { branchId: res.data.branchId, includeWarehouse: true } : undefined))
      .then(res => setMaterials((res.data || []).filter(m => !m.isArchived && Number(m.stockQuantity) > 0)))
      .catch(() => { setMaterials([]); setError('Could not load the materials. Please try again.'); });
  }, [jobOrderId]);

  const save = async () => {
    setError('');
    const qty = Number(form.quantity);
    const chosen = materials?.find(m => String(m.id) === form.materialId);
    if (fe.show({
      'extra-material': !form.materialId && 'Choose the material that was used.',
      'extra-quantity': !(qty > 0) ? 'Enter a quantity more than zero.'
        : chosen && qty > Number(chosen.stockQuantity) && `Only ${chosen.stockQuantity} in stock.`,
      'extra-reason': !form.reason.trim() && 'Give a reason.',
    })) return;
    setSaving(true);
    try {
      const res = await api.sales.issueExtraMaterials(jobOrderId, {
        materialId: Number(form.materialId), quantity: qty, reason: form.reason.trim(),
        workerId: workerId ?? (form.workerId ? Number(form.workerId) : undefined),
        notes: form.notes.trim() || undefined,
      });
      if (res.data) onSaved(res.data);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  const inputCls = 'mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add Extra Material</h2>
          <p className="text-xs text-gray-500 mt-1">
            {workerName ? `${workerName} · ` : ''}{jobOrderRef}. For material taken beyond the plan, e.g. a recut after a mistake. It leaves
            stock now and is added to the job&apos;s cost.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <label className="block" {...fe.field('extra-material')}>
            <span className="text-sm font-medium text-gray-700">Material used *</span>
            <select value={form.materialId} onChange={e => setForm(f => ({ ...f, materialId: e.target.value }))}
              disabled={!materials} className={inputCls}>
              <option value="">{materials ? 'Select material' : 'Loading…'}</option>
              {(materials || []).map(m => (
                <option key={m.id} value={m.id}>
                  {m.materialType}{m.color ? ` - ${m.color}` : ''}{m.pattern ? ` (${m.pattern})` : ''}
                  {' '}· {m.stockQuantity} in stock{m.branchName ? ` · ${m.branchName}` : ''}
                </option>
              ))}
            </select>
            <FieldError message={fe.errors['extra-material']} />
          </label>
          <label className="block" {...fe.field('extra-quantity')}>
            <span className="text-sm font-medium text-gray-700">Quantity *</span>
            <input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className={inputCls} />
            <FieldError message={fe.errors['extra-quantity']} />
          </label>
          <label className="block" {...fe.field('extra-reason')}>
            <span className="text-sm font-medium text-gray-700">Reason *</span>
            <input type="text" list="worker-extra-reasons" maxLength={255} value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Cutting mistake" className={inputCls} />
            <datalist id="worker-extra-reasons">{REASONS.map(r => <option key={r} value={r} />)}</datalist>
            <FieldError message={fe.errors['extra-reason']} />
          </label>
          {workerId === undefined && workers && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Worker responsible (optional)</span>
              <select value={form.workerId} onChange={e => setForm(f => ({ ...f, workerId: e.target.value }))} className={inputCls}>
                <option value="">Not specified</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Notes</span>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional" className={inputCls} />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !materials}
            className="px-4 py-2 rounded-xl bg-[#011c72] text-white text-sm font-semibold hover:bg-[#01268c] disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Extra Material'}
          </button>
        </div>
      </div>
    </div>
  );
}
