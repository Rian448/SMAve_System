'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, type RawMaterial, type SupplierMaterialEntry } from '@/lib/api';
import { formatMaterialQty } from '@/lib/length';

/** One row: a material already in Inventory, or a new item typed in */
export type SupplierMaterialRow = {
  key: string;
  materialId: number | '';
  isNew: boolean;
  materialType: string;
  color: string;
  pattern: string;
  costPerUnit: string;
};

let seq = 0;
export const newSupplierMaterialRow = (materialId: number | '' = ''): SupplierMaterialRow =>
  ({ key: `sm-${++seq}`, materialId, isNew: false, materialType: '', color: '', pattern: '', costPerUnit: '' });

/** Rows to send to the server (blank rows dropped) */
export function supplierMaterialEntries(rows: SupplierMaterialRow[]): SupplierMaterialEntry[] {
  return rows.flatMap((r): SupplierMaterialEntry[] => {
    if (r.isNew) {
      if (!r.materialType.trim()) return [];
      return [{ new: { materialType: r.materialType.trim(), color: r.color.trim(), pattern: r.pattern.trim(),
        costPerUnit: Number(r.costPerUnit) || 0 } }];
    }
    return r.materialId ? [{ materialId: Number(r.materialId) }] : [];
  });
}

/** Problem with the rows, or '' */
export function supplierMaterialsProblem(rows: SupplierMaterialRow[]): string {
  if (rows.some((r) => r.isNew && !r.materialType.trim() && (r.color || r.pattern || r.costPerUnit))) return 'Enter the name of each new material.';
  if (rows.some((r) => r.isNew && r.costPerUnit && !(Number(r.costPerUnit) >= 0))) return 'Cost must be a number of zero or more.';
  const ids = rows.filter((r) => !r.isNew && r.materialId).map((r) => r.materialId);
  if (new Set(ids).size !== ids.length) return 'A material is listed twice.';
  return '';
}

const label = (m: RawMaterial) => [m.materialType, m.color, m.pattern].filter(Boolean).join(' - ');

/**
 * Materials Supplied: one dropdown per material, listing what is in Inventory with
 * low-stock items at the top, plus "Add new item"; + Add material adds another row.
 */
export default function SupplierMaterialsEditor({ rows, onChange, supplierId }: {
  rows: SupplierMaterialRow[];
  onChange: (rows: SupplierMaterialRow[]) => void;
  /** When editing: materials already this supplier's aren't flagged as another supplier's */
  supplierId?: number;
}) {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [lowIds, setLowIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    api.inventory.getRawMaterials({ includeWarehouse: true })
      .then((res) => setMaterials((res.data || []).filter((m) => !m.isArchived)))
      .catch(() => setMaterials([]));
    api.inventory.getLowStock()
      .then((res) => setLowIds(new Set((res.data || []).map((m) => m.id))))
      .catch(() => setLowIds(new Set()));
  }, []);

  const [low, others] = useMemo(() => {
    const sorted = [...materials].sort((a, b) => label(a).localeCompare(label(b)));
    return [sorted.filter((m) => lowIds.has(m.id) || m.stockQuantity <= 0).sort((a, b) => a.stockQuantity - b.stockQuantity),
            sorted.filter((m) => !(lowIds.has(m.id) || m.stockQuantity <= 0))];
  }, [materials, lowIds]);

  const update = (key: string, patch: Partial<SupplierMaterialRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const taken = (key: string) => new Set(rows.filter((r) => r.key !== key && !r.isNew && r.materialId).map((r) => Number(r.materialId)));
  const box = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900';

  const option = (m: RawMaterial, used: Set<number>) => (
    <option key={m.id} value={m.id} disabled={used.has(m.id)}>
      {label(m)} — {formatMaterialQty(m.stockQuantity, m)} in stock{m.branchName ? ` (${m.branchName})` : ''}
      {m.supplierName && m.supplierId !== supplierId ? ` · now from ${m.supplierName}` : ''}
    </option>
  );

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const used = taken(r.key);
        const chosen = materials.find((m) => m.id === r.materialId);
        return (
          <div key={r.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex gap-2">
              <select value={r.isNew ? 'new' : r.materialId} aria-label="Material supplied"
                onChange={(e) => e.target.value === 'new'
                  ? update(r.key, { isNew: true, materialId: '' })
                  : update(r.key, { isNew: false, materialId: e.target.value ? Number(e.target.value) : '' })}
                className={`${box} flex-1 min-w-0`}>
                <option value="">Select a material…</option>
                <option value="new">+ Add new item (not in Inventory yet)</option>
                {low.length > 0 && <optgroup label="⚠ Low stock">{low.map((m) => option(m, used))}</optgroup>}
                {others.length > 0 && <optgroup label="In Inventory">{others.map((m) => option(m, used))}</optgroup>}
              </select>
              <button type="button" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-100 shrink-0">Remove</button>
            </div>
            {chosen && chosen.supplierName && chosen.supplierId !== supplierId && (
              <p className="text-xs text-amber-700">Currently bought from {chosen.supplierName}; saving makes this supplier its usual one.</p>
            )}
            {r.isNew && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <input type="text" value={r.materialType} onChange={(e) => update(r.key, { materialType: e.target.value })}
                  placeholder="Material name *" className={`${box} col-span-2 md:col-span-1`} />
                <input type="text" value={r.color} onChange={(e) => update(r.key, { color: e.target.value })} placeholder="Color" className={box} />
                <input type="text" value={r.pattern} onChange={(e) => update(r.key, { pattern: e.target.value })} placeholder="Pattern" className={box} />
                <input type="number" min="0" step="0.01" value={r.costPerUnit} onChange={(e) => update(r.key, { costPerUnit: e.target.value })}
                  placeholder="Cost per yd (₱)" className={box} />
                <p className="col-span-2 md:col-span-4 text-xs text-gray-500">
                  Added to Inventory at the warehouse with 0 in stock; it comes in through purchase orders.
                </p>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...rows, newSupplierMaterialRow()])}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#dde6ff] text-[#011c72] text-sm font-medium hover:bg-[#cfdbff]">
        + Add material
      </button>
    </div>
  );
}
