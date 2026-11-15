'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, RawMaterial, Supplier } from '@/lib/api';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';

interface POItem {
  material_id: string;
  material_name: string;
  quantity: number;
  unit_cost: number;
  unit: string;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fe = useFieldErrors();
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [savedSuppliers, setSavedSuppliers] = useState<Supplier[]>([]);
  
  // Form state
  // A saved supplier only (add new ones under Suppliers first); its contact details come with it
  const [supplierId, setSupplierId] = useState('');
  const chosenSupplier = savedSuppliers.find(s => String(s.id) === supplierId);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<POItem[]>([
    { material_id: '', material_name: '', quantity: 1, unit_cost: 0, unit: 'yd' }
  ]);

  useEffect(() => {
    // Shops order their own stock and the warehouse's (which supplies them)
    api.inventory.getRawMaterials({ includeWarehouse: true })
      .then(response => {
        setMaterials(response.data || []);
        setLoadingMaterials(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingMaterials(false);
      });
    api.inventory.getSuppliers()
      .then(response => setSavedSuppliers((response.data || []).filter((s: Supplier) => s.isActive)))
      .catch(err => console.error(err));
  }, []);

  // Items picked from the restock recommendations (Forecasting) arrive as
  // ?restock=CODE:qty,CODE:qty. They fill the lines to review; nothing is saved yet.
  const [restockNote, setRestockNote] = useState<{ added: number; missing: string[] } | null>(null);
  useEffect(() => {
    if (loadingMaterials) return;
    const raw = new URLSearchParams(window.location.search).get('restock');
    if (!raw) return;
    const lines = new Map<number, POItem>();
    const missing: string[] = [];
    for (const part of raw.split(',')) {
      const at = part.lastIndexOf(':');
      const code = decodeURIComponent(part.slice(0, at));
      const qty = Number(part.slice(at + 1));
      // Only materials in Inventory can be ordered, once each
      const m = materials.find(x => x.itemId === code && !x.isArchived);
      if (!m || !(qty > 0)) { missing.push(code); continue; }
      if (lines.has(m.id)) continue;
      lines.set(m.id, {
        material_id: String(m.id),
        material_name: [m.materialType, m.color, m.pattern].filter(Boolean).join(' - '),
        quantity: qty,
        unit_cost: m.costPerUnit || m.unitPrice,
        unit: 'yd',
      });
    }
    if (lines.size) setItems([...lines.values()]);
    // A purchase order is for one supplier: choose it when every item has the same one
    const suppliers = new Set([...lines.keys()].map(id => materials.find(m => m.id === id)?.supplierId).filter(Boolean));
    if (suppliers.size === 1) setSupplierId(String([...suppliers][0]));
    setRestockNote({ added: lines.size, missing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMaterials]);

  // Lines whose material is normally bought from a different supplier than the one chosen
  const otherSupplierItems = chosenSupplier ? items.filter(it => {
    const m = materials.find(x => String(x.id) === it.material_id);
    return m?.supplierId && m.supplierId !== chosenSupplier.id;
  }) : [];

  const addItem = () => {
    setItems([...items, { material_id: '', material_name: '', quantity: 1, unit_cost: 0, unit: 'yd' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof POItem, value: string | number) => {
    const newItems = [...items];
    if (field === 'material_id') {
      // The dropdown gives the id as text
      const material = materials.find(m => String(m.id) === String(value));
      if (material) {
        const label = [material.materialType, material.color, material.pattern].filter(Boolean).join(' - ');
        newItems[index] = {
          ...newItems[index],
          material_id: material.id.toString(),
          material_name: label,
          // A purchase order pays the supplier's cost, not our selling price
          unit_cost: material.costPerUnit || material.unitPrice,
          unit: 'yd'
        };
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const anyMaterial = items.some(item => item.material_id);
    // The same material twice: its quantity belongs on one line
    const firstRow = new Map<string, number>();
    items.forEach((item, index) => { if (item.material_id && !firstRow.has(item.material_id)) firstRow.set(item.material_id, index); });
    if (fe.show({
      'po-supplier': !chosenSupplier && 'Choose the supplier.',
      'po-date': !expectedDate && 'Choose the expected delivery date.',
      ...Object.fromEntries(items.flatMap((item, index) => [
        [`po-material-${index}`, !item.material_id ? (anyMaterial ? 'Select a material, or remove this row.'
          : 'Add at least one material to the purchase order.')
          : firstRow.get(item.material_id) !== index && 'This material is already on another line. Change the quantity there instead.'],
        [`po-qty-${index}`, !(item.quantity > 0) && 'More than 0.'],
      ])),
    })) return;
    setLoading(true);

    try {
      const purchaseOrder = {
        supplierName: chosenSupplier!.name,
        supplierId: chosenSupplier!.id,
        items: items.filter(item => item.material_id).map(item => ({
          materialId: Number(item.material_id),
          name: item.material_name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unit_cost
        })),
        expectedDelivery: expectedDate
      };

      await api.purchaseOrders.create(purchaseOrder);
      router.push('/purchase-orders');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error && err.message ? err.message : 'Failed to create the purchase order.');
    }
    setLoading(false);
  };


  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/purchase-orders')}
            className="flex items-center text-gray-600 hover:text-[#011c72] mb-2"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Purchase Orders
          </button>
          <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
          <p className="text-gray-500 mt-1">
            Create a new purchase order for raw materials
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}
        {restockNote && (
          <div className="mb-6 p-4 bg-[#eef1fb] border border-[#c7d2f5] rounded-xl text-sm text-[#011c72] space-y-1">
            <p>
              <b>{restockNote.added} item{restockNote.added === 1 ? '' : 's'}</b> added from the restock recommendations with the suggested quantities.
              Review the quantities and remove anything you don&apos;t need. Nothing is ordered until you create the purchase order,
              and stock only goes up when it is received.
            </p>
            {restockNote.missing.length > 0 && (
              <p className="text-amber-800">Not added (not in Inventory): {restockNote.missing.join(', ')}</p>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit} noValidate>
          {/* Supplier Information */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Supplier Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2" {...fe.field('po-supplier')}>
                <label htmlFor="po-supplier" className="block text-sm font-medium text-gray-700 mb-2">
                  Supplier *
                </label>
                <select
                  id="po-supplier"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  required
                >
                  <option value="">Select a supplier</option>
                  {savedSuppliers.map((s: Supplier) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Not in the list? Add the supplier under{' '}
                  <Link href="/suppliers" className="text-[#011c72] font-medium hover:underline">Suppliers</Link> first.
                </p>
                <FieldError message={fe.errors['po-supplier']} />
              </div>
              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">Contact Number</p>
                <p className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 min-h-10.5">
                  {chosenSupplier?.phone || <span className="text-gray-400">—</span>}
                </p>
              </div>
              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">Email Address</p>
                <p className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 min-h-10.5 break-all">
                  {chosenSupplier?.email || <span className="text-gray-400">—</span>}
                </p>
              </div>
              <div {...fe.field('po-date')}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expected Delivery Date *
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  required
                />
                <FieldError message={fe.errors['po-date']} />
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <svg className="w-5 h-5 mr-2 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Order Items
              </h2>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center px-3 py-1.5 bg-[#dde6ff] text-[#011c72] rounded-lg text-sm font-medium hover:bg-[#dde6ff] transition-colors"
              >
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Item
              </button>
            </div>

            <p className="-mt-2 mb-4 text-xs text-gray-500">
              Only materials already in Inventory can be ordered. For a new material, add it in{' '}
              <Link href="/inventory" className="text-[#011c72] font-medium hover:underline">Inventory</Link> first
              (it starts at 0 yd). Stock goes up only when this order is received.
            </p>
            {otherSupplierItems.length > 0 && (
              <p className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Usually bought from another supplier: {otherSupplierItems.map(i => i.material_name).join(', ')}.
                A purchase order is for one supplier — remove these and order them in a separate purchase order if needed.
              </p>
            )}
            {loadingMaterials ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-[#011c72] border-t-transparent rounded-full"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-12 gap-4 items-end">
                      <div className="col-span-12 md:col-span-4" {...fe.field(`po-material-${index}`)}>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Material
                        </label>
                        <select
                          value={item.material_id}
                          onChange={(e) => updateItem(index, 'material_id', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                          required
                        >
                          <option value="">Select material</option>
                          {/* Only materials registered in Inventory; the chosen supplier's own listed first */}
                          {(chosenSupplier
                            ? [['From ' + chosenSupplier.name, materials.filter(m => m.supplierId === chosenSupplier.id)],
                               ['Other materials', materials.filter(m => m.supplierId !== chosenSupplier.id)]] as const
                            : [['', materials]] as const
                          ).filter(([, list]) => list.length > 0).map(([label, list]) => {
                            const opts = list.map(m => (
                              <option key={m.id} value={m.id.toString()}>
                                {m.materialType}{m.color ? ` - ${m.color}` : ''}{m.pattern ? ` (${m.pattern})` : ''} ({m.stockQuantity} yd in stock)
                              </option>
                            ));
                            return label ? <optgroup key={label} label={label}>{opts}</optgroup> : opts;
                          })}
                        </select>
                        <FieldError message={fe.errors[`po-material-${index}`]} />
                      </div>
                      <div className="col-span-4 md:col-span-2" {...fe.field(`po-qty-${index}`)}>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Quantity (yd)
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                          required
                        />
                        <FieldError message={fe.errors[`po-qty-${index}`]} />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Unit
                        </label>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateItem(index, 'unit', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                          readOnly
                        />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Unit Cost
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_cost}
                          onChange={(e) => updateItem(index, 'unit_cost', Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                          required
                        />
                      </div>
                      <div className="col-span-10 md:col-span-1 text-right">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Total
                        </label>
                        <p className="py-2 text-sm font-medium text-gray-900">
                          ₱{(item.quantity * item.unit_cost).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="col-span-2 md:col-span-1">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          disabled={items.length === 1}
                          className="w-full py-2 text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Order Total */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex justify-end">
                <div className="w-64">
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-gray-600">Subtotal</span>
                    <span className="text-sm font-medium text-gray-900">
                      ₱{calculateTotal().toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-gray-200">
                    <span className="text-base font-medium text-gray-900">Total</span>
                    <span className="text-base font-bold text-[#011c72]">
                      ₱{calculateTotal().toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any special instructions or notes for this order..."
              className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => router.push('/purchase-orders')}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || items.every(i => !i.material_id)}
              className="inline-flex items-center px-6 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Create Purchase Order
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}


