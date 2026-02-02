'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, RawMaterial } from '@/lib/api';

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
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  
  // Form state
  const [supplier, setSupplier] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<POItem[]>([
    { material_id: '', material_name: '', quantity: 1, unit_cost: 0, unit: 'pcs' }
  ]);

  useEffect(() => {
    api.getRawMaterials()
      .then(response => {
        setMaterials(response.data || []);
        setLoadingMaterials(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingMaterials(false);
      });
  }, []);

  const addItem = () => {
    setItems([...items, { material_id: '', material_name: '', quantity: 1, unit_cost: 0, unit: 'pcs' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof POItem, value: string | number) => {
    const newItems = [...items];
    if (field === 'material_id') {
      const material = materials.find(m => m.id === value);
      if (material) {
        newItems[index] = {
          ...newItems[index],
          material_id: material.id,
          material_name: material.name,
          unit_cost: material.unit_cost,
          unit: material.unit
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
    setLoading(true);

    try {
      const purchaseOrder = {
        supplier_name: supplier,
        supplier_contact: supplierContact,
        supplier_email: supplierEmail,
        expected_date: expectedDate,
        notes,
        items: items.filter(item => item.material_id),
        total_amount: calculateTotal(),
        status: 'pending'
      };

      await api.createPurchaseOrder(purchaseOrder);
      router.push('/inventory?tab=purchase-orders');
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const suppliers = [
    { name: 'Premium Leather Supplies', contact: '(02) 8555-1234', email: 'sales@premiumleather.ph' },
    { name: 'Foam & Padding Co.', contact: '(02) 8666-5678', email: 'orders@foampadding.ph' },
    { name: 'Auto Interior Parts', contact: '(02) 8777-9012', email: 'info@autointerior.ph' },
    { name: 'Fabric World Trading', contact: '(02) 8888-3456', email: 'supply@fabricworld.ph' },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/inventory')}
            className="flex items-center text-zinc-600 dark:text-zinc-400 hover:text-amber-600 mb-2"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Inventory
          </button>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">New Purchase Order</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Create a new purchase order for raw materials
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Supplier Information */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Supplier Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Supplier Name *
                </label>
                <select
                  value={supplier}
                  onChange={(e) => {
                    const selected = suppliers.find(s => s.name === e.target.value);
                    setSupplier(e.target.value);
                    if (selected) {
                      setSupplierContact(selected.contact);
                      setSupplierEmail(selected.email);
                    }
                  }}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                >
                  <option value="">Select supplier or enter new</option>
                  {suppliers.map(s => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Or enter supplier name"
                  className="mt-2 w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Contact Number
                </label>
                <input
                  type="tel"
                  value={supplierContact}
                  onChange={(e) => setSupplierContact(e.target.value)}
                  placeholder="(02) 8XXX-XXXX"
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={supplierEmail}
                  onChange={(e) => setSupplierEmail(e.target.value)}
                  placeholder="supplier@email.com"
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Expected Delivery Date *
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center">
                <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Order Items
              </h2>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
              >
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Item
              </button>
            </div>

            {loadingMaterials ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                    <div className="grid grid-cols-12 gap-4 items-end">
                      <div className="col-span-12 md:col-span-4">
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                          Material
                        </label>
                        <select
                          value={item.material_id}
                          onChange={(e) => updateItem(index, 'material_id', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          required
                        >
                          <option value="">Select material</option>
                          {materials.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.quantity} {m.unit} in stock)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                          Unit
                        </label>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateItem(index, 'unit', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          readOnly
                        />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                          Unit Cost
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_cost}
                          onChange={(e) => updateItem(index, 'unit_cost', Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div className="col-span-10 md:col-span-1 text-right">
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                          Total
                        </label>
                        <p className="py-2 text-sm font-medium text-zinc-900 dark:text-white">
                          ₱{(item.quantity * item.unit_cost).toLocaleString()}
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
            <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex justify-end">
                <div className="w-64">
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Subtotal</span>
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">
                      ₱{calculateTotal().toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-zinc-200 dark:border-zinc-800">
                    <span className="text-base font-medium text-zinc-900 dark:text-white">Total</span>
                    <span className="text-base font-bold text-amber-600 dark:text-amber-400">
                      ₱{calculateTotal().toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Additional Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any special instructions or notes for this order..."
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => router.push('/inventory')}
              className="px-6 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || items.every(i => !i.material_id)}
              className="inline-flex items-center px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
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

