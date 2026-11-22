'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Supplier } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/components/ConfirmDialog';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';
import Paginated from '@/components/Paginated';
import { PaymentTermPicker, TermValue, termValueError, termExplanation } from '@/components/PaymentTerms';
import SupplierMaterialsEditor, {
  type SupplierMaterialRow, newSupplierMaterialRow, supplierMaterialEntries, supplierMaterialsProblem,
} from '@/components/SupplierMaterialsEditor';
import { formatMaterialQty } from '@/lib/length';

const EMPTY_FORM = { name: '', contactPerson: '', phone: '', email: '', address: '', materialsSupplied: '', notes: '' };
const NO_TERM: TermValue = { term: '', days: null };

/** Phone / telephone: digits only, up to 15 (the longest international number) */
const SUPPLIER_PHONE_MAX = 15;
const cleanSupplierPhone = (v: string) => v.replace(/\D/g, '').slice(0, SUPPLIER_PHONE_MAX);
/** name@domain.ext, e.g. name@gmail.com, sales@company.com.ph (same rule as the server) */
const SUPPLIER_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

/** A supplier must be reachable: a phone / telephone number or an email, each in the right format */
function contactProblem(phone: string, email: string): string {
  const p = phone.trim(), e = email.trim();
  if (!p && !e) return 'Enter a phone / telephone number or an email address.';
  if (p && !/^\d{7,15}$/.test(p)) return 'The phone / telephone number must be 7 to 15 digits, numbers only.';
  if (e && !SUPPLIER_EMAIL_RE.test(e)) return 'Enter a valid email address, e.g. name@gmail.com or sales@company.com.ph.';
  return '';
}

/**
 * Suppliers used to be a tab inside Inventory. The records and API are the same
 * (/api/inventory/suppliers); raw materials and purchase orders still pick from them.
 */
export default function SuppliersPage() {
  const { can } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const fe = useFieldErrors();
  const canAdd = can('suppliers.add');
  const canEdit = can('suppliers.edit');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [newSupplier, setNewSupplier] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSupplier, setEditSupplier] = useState(EMPTY_FORM);
  // Default payment term, copied onto each new purchase order for the supplier
  const [newTerm, setNewTerm] = useState<TermValue>(NO_TERM);
  const [editTerm, setEditTerm] = useState<TermValue>(NO_TERM);
  // Materials Supplied: picked from Inventory (low stock first) or added as new items
  const [newMaterials, setNewMaterials] = useState<SupplierMaterialRow[]>(() => [newSupplierMaterialRow()]);
  const [editMaterials, setEditMaterials] = useState<SupplierMaterialRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.inventory.getSuppliers(true);
      setSuppliers(res.data || []);
      setLoadError('');
    } catch (err) {
      setLoadError((err instanceof Error && err.message) || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (fe.show({
      'supplier-name': !newSupplier.name.trim() && 'Enter the supplier name.',
      'supplier-contact': contactProblem(newSupplier.phone, newSupplier.email),
      'supplier-materials': supplierMaterialsProblem(newMaterials)
        || (supplierMaterialEntries(newMaterials).length === 0 && 'Add at least one material this supplier supplies.'),
      'supplier-term': termValueError(newTerm),
    })) return;
    setSaving(true);
    try {
      await api.inventory.createSupplier({
        ...newSupplier, paymentTerm: newTerm.term || null, paymentTermDays: newTerm.days,
        materials: supplierMaterialEntries(newMaterials),
      });
      setNewSupplier(EMPTY_FORM);
      setNewTerm(NO_TERM);
      setNewMaterials([newSupplierMaterialRow()]);
      await load();
    } catch (err) { setFormError((err instanceof Error && err.message) || 'Failed to add supplier.'); }
    finally { setSaving(false); }
  };

  const startEdit = (s: Supplier) => {
    setEditingId(s.id);
    setEditSupplier({
      name: s.name, contactPerson: s.contactPerson || '', phone: cleanSupplierPhone(s.phone || ''), email: s.email || '',
      address: s.address || '', materialsSupplied: s.materialsSupplied || '', notes: s.notes || '',
    });
    setEditTerm({ term: s.paymentTerm || '', days: s.paymentTermDays ?? null });
    setEditMaterials((s.materials || []).map((m) => newSupplierMaterialRow(m.id)));
  };

  const handleSave = async (id: number) => {
    setFormError('');
    if (!editSupplier.name.trim()) { setFormError('Enter the supplier name.'); return; }
    const problem = contactProblem(editSupplier.phone, editSupplier.email) || supplierMaterialsProblem(editMaterials) || termValueError(editTerm);
    if (problem) { setFormError(problem); return; }
    setSaving(true);
    try {
      await api.inventory.updateSupplier(id, {
        ...editSupplier, paymentTerm: editTerm.term || null, paymentTermDays: editTerm.days,
        materials: supplierMaterialEntries(editMaterials),
      });
      setEditingId(null);
      await load();
    } catch (err) { setFormError((err instanceof Error && err.message) || 'Failed to update supplier.'); }
    finally { setSaving(false); }
  };

  const setActive = async (s: Supplier, isActive: boolean) => {
    if (!isActive && !(await confirm({
      title: 'Deactivate supplier?',
      message: `${s.name} will no longer be offered when adding materials or creating purchase orders. Existing records keep it.`,
      confirmLabel: 'Deactivate',
      variant: 'danger',
    }))) return;
    setFormError('');
    setSaving(true);
    try {
      await api.inventory.updateSupplier(s.id, { isActive });
      await load();
    } catch (err) { setFormError((err instanceof Error && err.message) || 'Failed to update supplier.'); }
    finally { setSaving(false); }
  };

  const q = search.trim().toLowerCase();
  const filtered = suppliers.filter(s =>
    (statusFilter === 'all' || (statusFilter === 'active') === s.isActive) &&
    (!q || s.name.toLowerCase().includes(q)
      || (s.contactPerson || '').toLowerCase().includes(q)
      || (s.materialsSupplied || '').toLowerCase().includes(q)));

  const input = 'px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900';
  const cellInput = 'px-2 py-1 rounded border border-gray-200 bg-white text-sm text-gray-900';

  return (
    <div className="min-h-screen bg-gray-50">
      {confirmDialog}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
            <p className="text-gray-500 mt-1">Who you buy materials from, used by raw materials and purchase orders</p>
          </div>
          {can('purchase_orders.view') && (
            <Link href="/purchase-orders" className="inline-flex items-center px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors self-start sm:self-auto">
              View Purchase Orders
            </Link>
          )}
        </div>

        {formError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{formError}</div>
        )}

        {canAdd && (
          <form onSubmit={handleCreate} noValidate className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Supplier</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div {...fe.field('supplier-name')}>
                <input type="text" value={newSupplier.name} onChange={e => setNewSupplier(p => ({ ...p, name: e.target.value }))} placeholder="Supplier Name *" className={`w-full ${input}`} />
                <FieldError message={fe.errors['supplier-name']} />
              </div>
              <input type="text" value={newSupplier.contactPerson} onChange={e => setNewSupplier(p => ({ ...p, contactPerson: e.target.value }))} placeholder="Contact Person" className={input} />
              <input type="text" value={newSupplier.address} onChange={e => setNewSupplier(p => ({ ...p, address: e.target.value }))} placeholder="Address" className={input} />
              <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3" {...fe.field('supplier-contact')}>
                <input type="tel" inputMode="numeric" maxLength={SUPPLIER_PHONE_MAX} value={newSupplier.phone}
                  onChange={e => setNewSupplier(p => ({ ...p, phone: cleanSupplierPhone(e.target.value) }))}
                  placeholder="Phone / Telephone (numbers only)" className={input} />
                <input type="email" value={newSupplier.email} onChange={e => setNewSupplier(p => ({ ...p, email: e.target.value.trim() }))} placeholder="Email (e.g. name@gmail.com)" className={input} />
                <p className="md:col-span-2 -mt-1 text-xs text-gray-500">At least one is required. Phone / telephone: numbers only, up to 15 digits (e.g. 09171234567 or 0281234567). Email: e.g. name@gmail.com.</p>
                <FieldError message={fe.errors['supplier-contact']} className="md:col-span-2" />
              </div>
              <div className="md:col-span-3" {...fe.field('supplier-materials')}>
                <p className="block text-sm font-medium text-gray-700 mb-1">Materials Supplied *</p>
                <SupplierMaterialsEditor rows={newMaterials} onChange={setNewMaterials} />
                <FieldError message={fe.errors['supplier-materials']} />
              </div>
              <input type="text" value={newSupplier.notes} onChange={e => setNewSupplier(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" className={`md:col-span-3 ${input}`} />
              <div className="md:col-span-3" {...fe.field('supplier-term')}>
                <label htmlFor="supplier-term" className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                <PaymentTermPicker id="supplier-term" value={newTerm} onChange={setNewTerm} className="max-w-md" />
                <p className="mt-1 text-xs text-gray-500">
                  {termExplanation(newTerm.term, newTerm.days)} New purchase orders for this supplier start with this term; it can be changed per order.
                </p>
                <FieldError message={fe.errors['supplier-term']} />
              </div>
            </div>
            <div className="mt-4">
              <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors disabled:opacity-60">
                {saving ? 'Saving...' : 'Add Supplier'}
              </button>
            </div>
          </form>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3">
            <input type="text" placeholder="Search by name, contact or materials..." value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-900" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-900">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {loading ? (
            <div className="p-12 flex justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full" />
            </div>
          ) : loadError ? (
            <div className="p-8 text-center">
              <p className="text-red-600 mb-3">{loadError}</p>
              <button onClick={() => { setLoading(true); load(); }} className="text-[#011c72] font-medium">Try again</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">
                {suppliers.length === 0 ? (canAdd ? 'No suppliers yet. Add your first supplier above.' : 'No suppliers yet.') : 'No suppliers match your search.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Paginated items={filtered} resetKey={`${search}|${statusFilter}`} label="suppliers">{rows => (
              <table className={`w-full ${canEdit ? "table-sticky-actions" : ""}`}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone / Telephone · Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Materials</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Terms</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    {canEdit && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.map(s => {
                    const editing = editingId === s.id;
                    return (
                      <Fragment key={s.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editing ? (
                            <div className="space-y-1">
                              <input type="text" value={editSupplier.name} onChange={e => setEditSupplier(p => ({ ...p, name: e.target.value }))} placeholder="Name" className={`w-40 ${cellInput}`} />
                              <input type="text" value={editSupplier.address} onChange={e => setEditSupplier(p => ({ ...p, address: e.target.value }))} placeholder="Address" className={`w-40 ${cellInput}`} />
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm font-medium text-gray-900">{s.name}</p>
                              {s.address && <p className="text-xs text-gray-500 truncate max-w-40">{s.address}</p>}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editing ? (
                            <input type="text" value={editSupplier.contactPerson} onChange={e => setEditSupplier(p => ({ ...p, contactPerson: e.target.value }))} placeholder="Contact Person" className={`w-32 ${cellInput}`} />
                          ) : (
                            <span className="text-sm text-gray-600">{s.contactPerson || '—'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editing ? (
                            <div className="space-y-1">
                              <input type="tel" inputMode="numeric" maxLength={SUPPLIER_PHONE_MAX} value={editSupplier.phone}
                                onChange={e => setEditSupplier(p => ({ ...p, phone: cleanSupplierPhone(e.target.value) }))}
                                placeholder="Phone / Telephone" className={`w-36 ${cellInput}`} />
                              <input type="email" value={editSupplier.email} onChange={e => setEditSupplier(p => ({ ...p, email: e.target.value.trim() }))} placeholder="name@gmail.com" className={`w-40 ${cellInput}`} />
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm text-gray-600">{s.phone || '—'}</p>
                              <p className="text-xs text-gray-500">{s.email || ''}</p>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editing ? (
                            <span className="text-xs text-gray-500">Edit below</span>
                          ) : s.materials && s.materials.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-64 whitespace-normal">
                              {s.materials.slice(0, 4).map(m => (
                                <span key={m.id} title={`${formatMaterialQty(m.stockQuantity, { isConsumable: m.unit !== 'yd', unit: m.unit })} in stock`}
                                  className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-700">{m.name}</span>
                              ))}
                              {s.materials.length > 4 && <span className="px-2 py-0.5 text-xs text-gray-500">+{s.materials.length - 4} more</span>}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-600 truncate max-w-35 block">{s.materialsSupplied || '—'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editing ? (
                            <PaymentTermPicker compact value={editTerm} onChange={setEditTerm} />
                          ) : (
                            <span className={`text-sm ${s.paymentTermLabel ? 'text-gray-700' : 'text-gray-400'}`}>{s.paymentTermLabel || 'No term'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {s.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {canEdit && (
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            {editing ? (
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => handleSave(s.id)} disabled={saving} className="text-[#011c72] text-sm font-medium disabled:opacity-50">Save</button>
                                <button onClick={() => setEditingId(null)} className="text-gray-500 text-sm font-medium">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-3">
                                <button onClick={() => startEdit(s)} className="text-[#011c72] text-sm font-medium">Edit</button>
                                {s.isActive ? (
                                  <button onClick={() => setActive(s, false)} disabled={saving} className="text-red-500 text-sm font-medium disabled:opacity-50">Deactivate</button>
                                ) : (
                                  <button onClick={() => setActive(s, true)} disabled={saving} className="text-green-600 text-sm font-medium disabled:opacity-50">Reactivate</button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                      {editing && (
                        <tr className="bg-[#fbfcff]">
                          <td colSpan={canEdit ? 7 : 6} className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-700 mb-2">Materials Supplied by {editSupplier.name || s.name}</p>
                            <div className="max-w-3xl"><SupplierMaterialsEditor rows={editMaterials} onChange={setEditMaterials} supplierId={s.id} /></div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              )}</Paginated>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
