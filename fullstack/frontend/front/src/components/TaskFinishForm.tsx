'use client';
import { useEffect, useRef, useState } from 'react';
import {
  type CutMaterialsData, type RawMaterial, type TaskConsumableUse, type TaskMaterialCut, type TaskMaterialNote,
  type TaskSubmission, type TaskSubmitPayload,
} from '@/lib/api';
import MaterialPicker, { materialLabel } from '@/components/MaterialPicker';
import LengthInput from '@/components/LengthInput';
import { formatLength, formatMaterialQty } from '@/lib/length';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';

/** Suggested reasons for material added on top of the job order's (same as the Extra material form) */
const EXTRA_REASONS = ['Actually needed', 'Cutting mistake', 'Wrong measurement', 'Sewing error', 'Defective material', 'Rework requested'];

/** A time as the value of a datetime-local input (the browser's own time zone) */
export function toLocalInput(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2 h 15 min" */
export function formatDuration(hours: number) {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h} h` : '', m || !h ? `${m} min` : ''].filter(Boolean).join(' ');
}

type CutRow = {
  key: string; line: number | null; lineName: string; planned: number | null; linked: boolean;
  options: RawMaterial[]; materialId: number | ''; cut: number; used: number;
  /** Cut by other tasks on this job order already */
  alreadyCut: number;
  /** Why an added material was needed (rows the worker adds) */
  reason: string;
};
type ConsumableRow = { key: string; materialId: number | ''; kind: 'full' | 'partial'; quantity: string };

/**
 * What was done on a task, filled in when it is finished: when the work started and
 * ended, the materials cut and actually used, consumables, and anything needed on
 * top of the job order. No pay: an administrator checks and approves it, and the
 * pay is worked out then.
 */
export default function TaskFinishForm({
  title, subtitle, workerName, isSpecialTask, isCuttingTask, defaultStart, previous, returnedNote,
  loadMaterials, onClose, onSubmit,
}: {
  title: string;
  subtitle: string;
  workerName: string;
  isSpecialTask: boolean;
  /** Only cutting records the job order's materials cut; sewing, installation and
   *  the rest record consumables and any extra material only (no cutting twice) */
  isCuttingTask: boolean;
  /** When the task was started (fills in the start time) */
  defaultStart?: string | null;
  /** What was submitted before, if it was sent back to correct */
  previous?: TaskSubmission | null;
  returnedNote?: string | null;
  loadMaterials: () => Promise<CutMaterialsData | undefined>;
  onClose: () => void;
  /** Resolves to an error message, or null when it was saved */
  onSubmit: (payload: TaskSubmitPayload) => Promise<string | null>;
}) {
  const fe = useFieldErrors();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [start, setStart] = useState(toLocalInput(previous?.startTime || defaultStart || null));
  const [end, setEnd] = useState(toLocalInput(previous?.endTime || null));
  const [notes, setNotes] = useState(previous?.notes || '');

  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  const hours = Number.isFinite(startMs) && Number.isFinite(endMs) ? (endMs - startMs) / 3_600_000 : NaN;

  const [rows, setRows] = useState<CutRow[] | null>(isSpecialTask ? [] : null);
  const [notInInventory, setNotInInventory] = useState<string[]>([]);
  const [extraOptions, setExtraOptions] = useState<RawMaterial[]>([]);
  const [consumableOptions, setConsumableOptions] = useState<RawMaterial[]>([]);
  const [consumables, setConsumables] = useState<ConsumableRow[]>([]);
  const rowSeq = useRef(0);

  useEffect(() => {
    if (isSpecialTask) return;
    loadMaterials()
      .then((d) => {
        const prevCuts = previous?.materialCuts || [];
        const fromLines: CutRow[] = (d?.materials || []).map((l) => {
          const before = prevCuts.find((c) => c.line === l.line);
          const left = Math.max(0, Math.round((l.plannedQuantity - (l.alreadyCut || 0)) * 1e6) / 1e6);
          return {
            key: `line-${l.line}`, line: l.line, lineName: l.lineName, planned: l.plannedQuantity, linked: l.linked,
            options: l.options, reason: '', alreadyCut: l.alreadyCut || 0,
            materialId: before?.materialId ?? l.options[0]?.id ?? '',
            // Starts at the planned amount still left to cut (others may have cut some),
            // all of it used; the worker changes it to what really happened
            cut: before ? before.cut : left,
            used: before ? before.used : left,
          };
        });
        const added: CutRow[] = prevCuts.filter((c) => c.line == null).map((c, i) => ({
          key: `extra-prev-${i}`, line: null, lineName: '', planned: null, linked: false,
          options: d?.extraMaterials || [], materialId: c.materialId, cut: c.cut, used: c.used,
          reason: c.reason || '', alreadyCut: 0,
        }));
        setRows([...fromLines, ...added]);
        setNotInInventory(d?.notInInventory || []);
        setExtraOptions(d?.extraMaterials || []);
        setConsumableOptions(d?.consumables || []);
        setConsumables((previous?.consumables || []).map((c, i) => ({
          key: `con-prev-${i}`, materialId: c.materialId, kind: c.kind, quantity: String(c.quantity ?? 1),
        })));
      })
      .catch(() => setRows([]));
    // Loaded once when the form opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateRow = (key: string, patch: Partial<CutRow>) =>
    setRows((prev) => (prev || []).map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => {
    rowSeq.current += 1;
    setRows((prev) => [...(prev || []), {
      key: `extra-${rowSeq.current}`, line: null, lineName: '', planned: null, linked: false,
      options: extraOptions, materialId: '', cut: 0, used: 0, reason: '', alreadyCut: 0,
    }]);
  };
  const removeRow = (key: string) => setRows((prev) => (prev || []).filter((r) => r.key !== key));
  const addConsumable = () => {
    rowSeq.current += 1;
    setConsumables((prev) => [...prev, { key: `con-${rowSeq.current}`, materialId: '', kind: 'full', quantity: '1' }]);
  };
  const updateConsumable = (key: string, patch: Partial<ConsumableRow>) =>
    setConsumables((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  // The job order's own material lines are for cutting tasks only; added rows are for any task
  const activeRows = (rows || []).filter((r) => r.line === null || isCuttingTask);
  const rowProblems = Object.fromEntries(activeRows.map((r) => [`cut-${r.key}`,
    (r.cut > 0 || r.used > 0 || r.line === null) && (
      !r.materialId ? 'Choose the material.'
      : r.line === null && !(r.cut > 0) ? 'Enter how much was cut, or remove this row.'
      : r.line === null && !r.reason.trim() ? 'Give the reason it was needed.'
      : r.used > r.cut + 1e-9 && 'Used can\'t be more than what was cut.')]));
  const consumableProblems = Object.fromEntries(consumables.map((c) => {
    const opt = consumableOptions.find((o) => o.id === c.materialId);
    const n = Number(c.quantity);
    return [`con-${c.key}`, !c.materialId ? 'Choose the consumable.'
      : c.kind === 'full' && !(n > 0) ? 'Enter how many were used up.'
      : c.kind === 'full' && opt && n > opt.stockQuantity + 1e-9 && `Only ${formatMaterialQty(opt.stockQuantity, opt)} in stock.`];
  }));

  const submit = async () => {
    setSaveError('');
    const timeProblem = !start ? 'Enter when the work started.'
      : !end ? 'Enter when the work finished.'
      : !(hours > 0) ? 'The finish time must be after the start time.'
      : endMs > Date.now() + 5 * 60_000 ? "The finish time can't be later than now."
      : hours > 24 * 7 ? 'A task can run at most 7 days. Check the dates.'
      : false;
    if (fe.show({ 'finish-times': timeProblem, ...rowProblems, ...consumableProblems })) return;
    setSaving(true);
    const materialCuts: TaskMaterialCut[] = activeRows
      .filter((r) => r.materialId && (r.cut > 0 || r.used > 0))
      .map((r) => ({ ...(r.line !== null ? { line: r.line } : { reason: r.reason.trim() }),
        materialId: Number(r.materialId), cut: r.cut, used: r.used }));
    const consumableUses: TaskConsumableUse[] = consumables.filter((c) => c.materialId).map((c) => ({
      materialId: Number(c.materialId), kind: c.kind, ...(c.kind === 'full' ? { quantity: Number(c.quantity) } : {}),
    }));
    const nameOf = (id: number, list: RawMaterial[]) => {
      const m = list.find((o) => o.id === id);
      return m ? [m.materialType, m.color, m.pattern].filter(Boolean).join(' - ') : 'Material';
    };
    const allOptions = [...(rows || []).flatMap((r) => r.options), ...extraOptions];
    const materialsUsed: TaskMaterialNote[] = [
      ...materialCuts.map((c) => ({ name: nameOf(c.materialId, allOptions), qty: c.used, cut: c.cut,
        unit: allOptions.find((o) => o.id === c.materialId)?.unit || 'yd', ...(c.reason ? { reason: c.reason } : {}) })),
      ...consumableUses.map((c) => ({ name: nameOf(c.materialId, consumableOptions), qty: c.quantity ?? 0,
        unit: consumableOptions.find((o) => o.id === c.materialId)?.unit || 'pcs', reason: c.kind === 'full' ? 'Fully used' : 'Partially used' })),
    ];
    const error = await onSubmit({
      startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(),
      materialCuts, consumables: consumableUses, materialsUsed, notes: notes.trim() || undefined,
    });
    if (error) { setSaveError(error); setSaving(false); }
  };

  const lineRows = (rows || []).filter((r) => r.line !== null);
  const addedRows = (rows || []).filter((r) => r.line === null);
  const inputCls = 'w-full px-3 py-2 rounded-lg border border-[#c7d2f5] bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  const renderCutRow = (r: CutRow) => {
    const chosen = r.options.find((o) => o.id === r.materialId);
    const excess = Math.max(0, r.cut - r.used);
    const isExtra = r.line === null;
    return (
      <li key={r.key} className="px-4 py-3 space-y-2" {...fe.field(`cut-${r.key}`)}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-gray-800">
            {isExtra ? (chosen ? materialLabel(chosen) : 'Material') : r.linked && chosen ? materialLabel(chosen) : r.lineName}
            {r.planned !== null && <span className="text-xs text-gray-400 font-normal"> · planned {formatLength(r.planned)}</span>}
            {r.alreadyCut > 0 && <span className="text-xs text-gray-400 font-normal"> · {formatLength(r.alreadyCut)} already cut by others</span>}
          </p>
          {isExtra && (
            <button type="button" onClick={() => removeRow(r.key)}
              className="text-xs text-red-600 hover:underline shrink-0">Remove</button>
          )}
        </div>
        {(!r.linked || r.options.length > 1) && (
          <div>
            <p className="text-[11px] font-medium text-gray-500 mb-0.5">Material</p>
            <MaterialPicker materials={r.options} value={r.materialId}
              onSelect={(id) => updateRow(r.key, { materialId: id })}
              takenIds={isExtra ? new Set((rows || []).filter((x) => x.key !== r.key && x.materialId).map((x) => Number(x.materialId))) : undefined}
              invalid={!!fe.errors[`cut-${r.key}`] && !r.materialId} />
          </div>
        )}
        {chosen && (
          <p className="text-[11px] text-gray-500">
            {formatLength(chosen.stockQuantity)} in stock{chosen.branchName ? ` · ${chosen.branchName}` : ''}
          </p>
        )}
        {isExtra && (
          <div>
            <p className="text-[11px] font-medium text-gray-500 mb-0.5">Reason it was needed *</p>
            <input type="text" list="cut-extra-reasons" maxLength={200} value={r.reason}
              onChange={(e) => updateRow(r.key, { reason: e.target.value })}
              placeholder="e.g. Cutting mistake"
              className={`w-full px-2 py-1.5 rounded-lg border bg-white text-sm text-gray-900 ${
                fe.errors[`cut-${r.key}`] && !r.reason.trim() ? 'border-red-400' : 'border-[#c7d2f5]'}`} />
          </div>
        )}
        <div>
          <p className="text-[11px] font-medium text-gray-500 mb-0.5">Cut from stock</p>
          <LengthInput compact value={r.cut} ariaLabel="Cut from stock" onChange={(y) => updateRow(r.key, { cut: y })} />
        </div>
        <div>
          <p className="text-[11px] font-medium text-gray-500 mb-0.5">Actually used</p>
          <LengthInput compact value={r.used} ariaLabel="Actually used" invalid={r.used > r.cut + 1e-9}
            onChange={(y) => updateRow(r.key, { used: y })} />
        </div>
        {r.cut > 0 && (
          <p className="text-xs text-gray-600">
            Leaves stock: <b>{formatLength(r.cut)}</b> · used <b>{formatLength(Math.min(r.used, r.cut))}</b>
            {excess > 0 && <> · <span className="text-amber-700">excess to waste <b>{formatLength(excess)}</b></span></>}
          </p>
        )}
        <FieldError message={fe.errors[`cut-${r.key}`]} />
      </li>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {returnedNote && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">Sent back to fix</p>
              <p className="mt-0.5">{returnedNote}</p>
            </div>
          )}

          {/* Time worked */}
          <div className="bg-[#eef1fb] rounded-xl p-4 space-y-3" {...fe.field('finish-times')}>
            <p className="text-xs font-semibold text-[#011c72]">Time worked</p>
            {/* One field per row, so the date, time and "Now" fit on a phone without scrolling sideways */}
            {([['Started', start, setStart], ['Finished', end, setEnd]] as const).map(([label, value, set]) => (
              <div key={label}>
                <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
                <div className="flex gap-2 min-w-0">
                  <input type="datetime-local" value={value} onChange={e => set(e.target.value)} aria-label={label}
                    className={`${inputCls} min-w-0 flex-1`} />
                  <button type="button" onClick={() => set(toLocalInput(null))}
                    className="px-3 rounded-lg border border-[#c7d2f5] bg-white text-xs font-medium text-[#011c72] hover:bg-[#dde6ff] shrink-0">
                    Now
                  </button>
                </div>
              </div>
            ))}
            <p className="text-sm text-gray-700">
              {hours > 0 ? <>Total: <b>{formatDuration(hours)}</b></> : <span className="text-gray-400">Set both times to see the total.</span>}
            </p>
            <FieldError message={fe.errors['finish-times']} />
          </div>

          {/* Materials cut for this job: the job order's own materials */}
          {rows === null && (
            <p className="text-xs text-gray-400 text-center">Loading materials…</p>
          )}
          {rows !== null && !isSpecialTask && isCuttingTask && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-600">Materials cut by {workerName}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  The whole amount cut leaves stock. What was actually used is recorded as material usage; the rest goes
                  to the waste log as cutting excess. Leave blank what wasn&apos;t cut.
                </p>
              </div>
              {notInInventory.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border-b border-amber-200 px-4 py-2">
                  Not in Inventory, so nothing to take from stock: {notInInventory.join(', ')}.
                </p>
              )}
              {lineRows.length === 0 ? (
                <p className="text-xs text-gray-500 px-4 py-3">No materials on this job order.</p>
              ) : (
                <ul className="divide-y divide-gray-100">{lineRows.map(renderCutRow)}</ul>
              )}
            </div>
          )}

          {/* Consumables used on this job */}
          {rows !== null && !isSpecialTask && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-600">Consumables used</p>
                  {consumableOptions.length > 0 && (
                    <button type="button" onClick={addConsumable}
                      className="text-xs font-medium text-[#011c72] hover:underline shrink-0">+ Add consumable</button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Glue, thread, staples… <b>Fully used</b> takes them out of stock; <b>Partially used</b> only records that one was opened.
                </p>
              </div>
              {consumableOptions.length === 0 ? (
                <p className="text-xs text-gray-500 px-4 py-3">No consumables in Inventory yet.</p>
              ) : consumables.length === 0 ? (
                <p className="text-xs text-gray-500 px-4 py-3">None. Use + Add consumable for anything used up or opened on this job.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {consumables.map((c) => {
                    const opt = consumableOptions.find((o) => o.id === c.materialId);
                    return (
                      <li key={c.key} className="px-4 py-3 space-y-2" {...fe.field(`con-${c.key}`)}>
                        <div className="flex items-center gap-2">
                          <select value={c.materialId} aria-label="Consumable"
                            onChange={(e) => updateConsumable(c.key, { materialId: e.target.value ? Number(e.target.value) : '' })}
                            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-[#c7d2f5] bg-white text-sm text-gray-900">
                            <option value="">Choose the consumable…</option>
                            {consumableOptions.map((o) => (
                              <option key={o.id} value={o.id}>{materialLabel(o)} — {formatMaterialQty(o.stockQuantity, o)} in stock</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => setConsumables((prev) => prev.filter((x) => x.key !== c.key))}
                            className="text-xs text-red-600 hover:underline shrink-0">Remove</button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                            {(['full', 'partial'] as const).map((k) => (
                              <button key={k} type="button" onClick={() => updateConsumable(c.key, { kind: k })}
                                className={`px-3 py-1.5 ${c.kind === k ? 'bg-[#011c72] text-white' : 'bg-white text-gray-600'}`}>
                                {k === 'full' ? 'Fully used' : 'Partially used'}
                              </button>
                            ))}
                          </div>
                          {c.kind === 'full' ? (
                            <label className="flex items-center gap-1.5 text-xs text-gray-600">
                              <input type="number" min="1" step="1" value={c.quantity} aria-label="How many used up"
                                onChange={(e) => updateConsumable(c.key, { quantity: e.target.value })}
                                className="w-16 px-2 py-1 rounded-lg border border-[#c7d2f5] bg-white text-sm text-gray-900" />
                              {opt?.unit || 'pcs'} used up
                            </label>
                          ) : (
                            <span className="text-xs text-gray-500">Recorded only; stock stays the same.</span>
                          )}
                        </div>
                        <FieldError message={fe.errors[`con-${c.key}`]} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Other materials needed beyond the job order's (a recut, a wrong measurement...) */}
          {rows !== null && !isSpecialTask && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-600">Other materials used by {workerName}</p>
                <button type="button" onClick={addRow}
                  className="text-xs font-medium text-[#011c72] hover:underline shrink-0">+ Add material</button>
              </div>
              <datalist id="cut-extra-reasons">
                {EXTRA_REASONS.map((x) => <option key={x} value={x} />)}
              </datalist>
              {addedRows.length === 0 ? (
                <p className="text-xs text-gray-500 px-4 py-3">
                  None. If more was needed than the job order lists (e.g. a recut after a cutting mistake), add it with the reason
                  so stock and the job&apos;s cost stay right.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">{addedRows.map(renderCutRow)}</ul>
              )}
            </div>
          )}

          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={500}
              placeholder="Anything the administrator should know"
              className={inputCls} />
          </label>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={submit}
            disabled={saving || rows === null}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 text-sm">
            {saving ? 'Submitting…' : 'Submit'}
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
