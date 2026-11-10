'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Supplier } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/components/ConfirmDialog';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';
import Paginated from '@/components/Paginated';

const EMPTY_FORM = { name: '', contactPerson: '', phone: '', email: '', address: '', materialsSupplied: '', notes: '' };

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
    if (fe.show({ 'supplier-name': !newSupplier.name.trim() && 'Enter the supplier name.' })) return;
    setSaving(true);
    try {
      await api.inventory.createSupplier(newSupplier);
      setNewSupplier(EMPTY_FORM);
      await load();
    } catch (err) { setFormError((err instanceof Error && err.message) || 'Failed to add supplier.'); }
    finally { setSaving(false); }
  };

  const startEdit = (s: Supplier) => {
    setEditingId(s.id);
    setEditSupplier({
      name: s.name, contactPerson: s.contactPerson || '', phone: s.phone || '', email: s.email || '',
      address: s.address || '', materialsSupplied: s.materialsSupplied || '', notes: s.notes || '',
    });
  };

  const handleSave = async (id: number) => {
    setFormError('');
    if (!editSupplier.name.trim()) { setFormError('Enter the supplier name.'); return; }
    setSaving(true);
    try {
      await api.inventory.updateSupplier(id, editSupplier);
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
              <input type="text" value={newSupplier.phone} onChange={e => setNewSupplier(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className={input} />
              <input type="email" value={newSupplier.email} onChange={e => setNewSupplier(p => ({ ...p, email: e.target.value }))} placeholder="Email" className={input} />
              <input type="text" value={newSupplier.address} onChange={e => setNewSupplier(p => ({ ...p, address: e.target.value }))} placeholder="Address" className={input} />
              <input type="text" value={newSupplier.materialsSupplied} onChange={e => setNewSupplier(p => ({ ...p, materialsSupplied: e.target.value }))} placeholder="Materials Supplied" className={input} />
              <input type="text" value={newSupplier.notes} onChange={e => setNewSupplier(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" className={`md:col-span-3 ${input}`} />
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
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone / Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Materials</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    {canEdit && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.map(s => {
                    const editing = editingId === s.id;
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
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
                              <input type="text" value={editSupplier.phone} onChange={e => setEditSupplier(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className={`w-32 ${cellInput}`} />
                              <input type="email" value={editSupplier.email} onChange={e => setEditSupplier(p => ({ ...p, email: e.target.value }))} placeholder="Email" className={`w-40 ${cellInput}`} />
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
                            <input type="text" value={editSupplier.materialsSupplied} onChange={e => setEditSupplier(p => ({ ...p, materialsSupplied: e.target.value }))} placeholder="Materials" className={`w-36 ${cellInput}`} />
                          ) : (
                            <span className="text-sm text-gray-600 truncate max-w-35 block">{s.materialsSupplied || '—'}</span>
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
