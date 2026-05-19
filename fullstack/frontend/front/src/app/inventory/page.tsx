'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, RawMaterial, FinishedGood, MaterialUsageLog, Supplier, MaterialWasteLog } from '@/lib/api';
import Link from 'next/link';

type TabType = 'raw-materials' | 'finished-goods' | 'material-usage' | 'purchase-orders' | 'suppliers' | 'waste-log';

export default function InventoryPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('raw-materials');
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<FinishedGood[]>([]);
  const [materialUsageLogs, setMaterialUsageLogs] = useState<MaterialUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formError, setFormError] = useState('');

  const [newMaterial, setNewMaterial] = useState({
    itemId: '',
    materialType: '',
    color: '',
    pattern: '',
    unitPrice: '',
    stockQuantity: ''
  });

  const [editingMaterialId, setEditingMaterialId] = useState<number | null>(null);
  const [editMaterial, setEditMaterial] = useState({
    materialType: '',
    color: '',
    pattern: '',
    unitPrice: '',
    stockQuantity: ''
  });

  const [globalThreshold, setGlobalThreshold] = useState(0);
  const [thresholdInput, setThresholdInput] = useState('');
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [notificationDismissed, setNotificationDismissed] = useState(false);

  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [newSupplier, setNewSupplier] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', materialsSupplied: '', notes: '' });
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);
  const [editSupplier, setEditSupplier] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', materialsSupplied: '', notes: '' });
  const [supplierSearch, setSupplierSearch] = useState('');

  // Waste Log
  const [wasteLogs, setWasteLogs] = useState<MaterialWasteLog[]>([]);
  const [newWaste, setNewWaste] = useState({ materialId: '', quantity: '', reason: '', notes: '' });
  const [wasteSearch, setWasteSearch] = useState('');

  const [branches, setBranches] = useState<{ id: number; name: string; isWarehouse: boolean; isActive: boolean }[]>([]);
  const [newPremade, setNewPremade] = useState({
    name: '',
    quantity: '',
    price: '',
    category: 'General',
    branchId: ''
  });
  const [premadeMaterials, setPremadeMaterials] = useState<Array<{ materialId: string; quantityUsed: string }>>([
    { materialId: '', quantityUsed: '' }
  ]);
  const [editingPremadeId, setEditingPremadeId] = useState<number | null>(null);
  const [editPremade, setEditPremade] = useState({ quantity: '', price: '' });

  useEffect(() => {
    fetchInventory();
  }, [activeTab]);

  useEffect(() => {
    api.settings.getSystemSettings().then(r => {
      if (r.data) {
        const t = parseFloat(r.data['inventory_low_stock_threshold'] || '0') || 0;
        setGlobalThreshold(t);
        setThresholdInput(String(t));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.settings.getBranches().then(r => {
      if (r.data) {
        const retail = r.data.filter((b: any) => !b.isWarehouse && b.isActive);
        setBranches(retail);
        if (retail.length > 0 && !newPremade.branchId) {
          const def = retail.find((b: any) => b.id === user?.branchId) || retail[0];
          setNewPremade(prev => ({ ...prev, branchId: String(def.id) }));
        }
      }
    }).catch(() => {});
  }, [user?.branchId]);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      if (activeTab === 'raw-materials') {
        const [matRes, supRes] = await Promise.all([
          api.inventory.getRawMaterials({ branchId: user?.branchId }),
          api.inventory.getSuppliers(),
        ]);
        setRawMaterials(matRes.data || []);
        setSuppliers(supRes.data || []);
      } else if (activeTab === 'finished-goods') {
        const [finishedGoodsResponse, rawMaterialsResponse] = await Promise.all([
          api.inventory.getFinishedGoods(),
          api.inventory.getRawMaterials({ branchId: user?.branchId })
        ]);
        setFinishedGoods(finishedGoodsResponse.data || []);
        setRawMaterials(rawMaterialsResponse.data || []);
      } else if (activeTab === 'material-usage') {
        const response = await api.inventory.getMaterialUsage({ branchId: user?.branchId });
        setMaterialUsageLogs(response.data || []);
      } else if (activeTab === 'suppliers') {
        const res = await api.inventory.getSuppliers(true);
        setSuppliers(res.data || []);
      } else if (activeTab === 'waste-log') {
        const [wasteRes, matRes] = await Promise.all([
          api.inventory.getWasteLogs({ branchId: user?.branchId }),
          api.inventory.getRawMaterials({ branchId: user?.branchId }),
        ]);
        setWasteLogs(wasteRes.data || []);
        setRawMaterials(matRes.data || []);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newMaterial.materialType.trim()) {
      setFormError('Material Type is required.');
      return;
    }

    const unitPrice = Number(newMaterial.unitPrice);
    const stockQuantity = Number(newMaterial.stockQuantity);

    if (Number.isNaN(unitPrice) || Number.isNaN(stockQuantity)) {
      setFormError('Unit Price and Stock Quantity must be valid numbers.');
      return;
    }

    const itemId = newMaterial.itemId.trim() || undefined;

    setSaving(true);
    try {
      await api.inventory.createRawMaterial({
        ...(itemId !== undefined && { itemId }),
        materialType: newMaterial.materialType.trim(),
        color: newMaterial.color.trim(),
        pattern: newMaterial.pattern.trim(),
        unitPrice,
        stockQuantity,
        branchId: user?.branchId || 1
      });

      setNewMaterial({ itemId: '', materialType: '', color: '', pattern: '', unitPrice: '', stockQuantity: '' });
      await fetchInventory();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to add item.');
    } finally {
      setSaving(false);
    }
  };

  const startEditMaterial = (material: RawMaterial) => {
    setEditingMaterialId(material.id);
    setEditMaterial({
      materialType: material.materialType,
      color: material.color,
      pattern: material.pattern,
      unitPrice: String(material.unitPrice),
      stockQuantity: String(material.stockQuantity)
    });
  };

  const handleSaveMaterial = async (materialId: number) => {
    setFormError('');

    const unitPrice = Number(editMaterial.unitPrice);
    const stockQuantity = Number(editMaterial.stockQuantity);

    if (Number.isNaN(unitPrice) || Number.isNaN(stockQuantity)) {
      setFormError('Unit Price and Stock Quantity must be valid numbers.');
      return;
    }

    setSaving(true);
    try {
      await api.inventory.updateRawMaterial(materialId, {
        materialType: editMaterial.materialType.trim(),
        color: editMaterial.color.trim(),
        pattern: editMaterial.pattern.trim(),
        unitPrice,
        stockQuantity
      });

      setEditingMaterialId(null);
      await fetchInventory();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to update item.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePremade = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newPremade.name.trim()) {
      setFormError('Premade product name is required.');
      return;
    }

    const quantity = Number(newPremade.quantity);
    const price = Number(newPremade.price);

    if (Number.isNaN(quantity) || Number.isNaN(price)) {
      setFormError('Premade product quantity and price must be valid numbers.');
      return;
    }

    const parsedMaterialsUsed: Array<{ materialId: number; quantityUsed: number }> = [];
    for (let index = 0; index < premadeMaterials.length; index += 1) {
      const entry = premadeMaterials[index];
      const materialId = Number(entry.materialId);
      const quantityUsed = Number(entry.quantityUsed);

      if (!materialId || Number.isNaN(quantityUsed) || quantityUsed <= 0) {
        setFormError(`Please select a material and enter valid quantity for row ${index + 1}.`);
        return;
      }

      parsedMaterialsUsed.push({ materialId, quantityUsed });
    }

    if (parsedMaterialsUsed.length === 0) {
      setFormError('Please add at least one material used.');
      return;
    }

    const branchId = Number(newPremade.branchId) || user?.branchId;
    if (!branchId) {
      setFormError('Please select a branch for this product.');
      return;
    }

    setSaving(true);
    try {
      await api.inventory.createFinishedGood({
        name: newPremade.name.trim(),
        quantity,
        unit: 'pcs',
        category: newPremade.category,
        price,
        cost: 0,
        branchId,
        materialsUsed: parsedMaterialsUsed
      });

      const def = branches.find(b => b.id === user?.branchId) || branches[0];
      setNewPremade({ name: '', quantity: '', price: '', category: 'General', branchId: def ? String(def.id) : '' });
      setPremadeMaterials([{ materialId: '', quantityUsed: '' }]);
      await fetchInventory();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to add premade product.');
    } finally {
      setSaving(false);
    }
  };

  const addPremadeMaterialRow = () => {
    setPremadeMaterials((prev) => [...prev, { materialId: '', quantityUsed: '' }]);
  };

  const removePremadeMaterialRow = (index: number) => {
    setPremadeMaterials((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const updatePremadeMaterialRow = (
    index: number,
    field: 'materialId' | 'quantityUsed',
    value: string
  ) => {
    setPremadeMaterials((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  };

  const startEditPremade = (item: FinishedGood) => {
    setEditingPremadeId(item.id);
    setEditPremade({ quantity: String(item.quantity), price: String(item.price) });
  };

  const handleSavePremade = async (itemId: number) => {
    setFormError('');
    const quantity = Number(editPremade.quantity);
    const price = Number(editPremade.price);

    if (Number.isNaN(quantity) || Number.isNaN(price)) {
      setFormError('Premade product quantity and price must be valid numbers.');
      return;
    }

    setSaving(true);
    try {
      await api.inventory.updateFinishedGood(itemId, { quantity, price, unit: 'pcs' });
      setEditingPremadeId(null);
      await fetchInventory();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to update premade product.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.name.trim()) { setFormError('Supplier name is required.'); return; }
    setFormError('');
    setSaving(true);
    try {
      await api.inventory.createSupplier(newSupplier);
      setNewSupplier({ name: '', contactPerson: '', phone: '', email: '', address: '', materialsSupplied: '', notes: '' });
      await fetchInventory();
    } catch (err: any) { setFormError(err?.message || 'Failed to add supplier.'); }
    finally { setSaving(false); }
  };

  const startEditSupplier = (s: Supplier) => {
    setEditingSupplierId(s.id);
    setEditSupplier({ name: s.name, contactPerson: s.contactPerson || '', phone: s.phone || '', email: s.email || '', address: s.address || '', materialsSupplied: s.materialsSupplied || '', notes: s.notes || '' });
  };

  const handleSaveSupplier = async (id: number) => {
    setFormError('');
    setSaving(true);
    try {
      await api.inventory.updateSupplier(id, editSupplier);
      setEditingSupplierId(null);
      await fetchInventory();
    } catch (err: any) { setFormError(err?.message || 'Failed to update supplier.'); }
    finally { setSaving(false); }
  };

  const handleDeactivateSupplier = async (id: number) => {
    setSaving(true);
    try {
      await api.inventory.updateSupplier(id, { isActive: false });
      await fetchInventory();
    } catch { }
    finally { setSaving(false); }
  };

  const handleCreateWasteLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWaste.materialId || !newWaste.quantity || !newWaste.reason.trim()) {
      setFormError('Material, quantity, and reason are required.');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      await api.inventory.createWasteLog({
        materialId: Number(newWaste.materialId),
        quantity: Number(newWaste.quantity),
        reason: newWaste.reason.trim(),
        notes: newWaste.notes.trim() || undefined,
        branchId: user?.branchId,
      });
      setNewWaste({ materialId: '', quantity: '', reason: '', notes: '' });
      await fetchInventory();
    } catch (err: any) { setFormError(err?.message || 'Failed to log waste.'); }
    finally { setSaving(false); }
  };

  const handleSaveThreshold = async () => {
    const value = Number(thresholdInput);
    if (Number.isNaN(value) || value < 0) return;
    setThresholdSaving(true);
    try {
      await api.settings.updateSystemSetting('inventory_low_stock_threshold', value);
      setGlobalThreshold(value);
      setEditingThreshold(false);
      setNotificationDismissed(false);
    } catch {
      // ignore
    } finally {
      setThresholdSaving(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(amount);

  const getStockStatus = (quantity: number) => {
    if (quantity <= 0) {
      return { label: 'Out of Stock', class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
    }
    if (globalThreshold > 0 && quantity <= globalThreshold) {
      return { label: 'Low Stock', class: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' };
    }
    return { label: 'In Stock', class: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
  };

  const filteredRawMaterials = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (!q) return rawMaterials;
    return rawMaterials.filter((m) =>
      m.materialType.toLowerCase().includes(q) ||
      m.color.toLowerCase().includes(q) ||
      m.pattern.toLowerCase().includes(q)
    );
  }, [rawMaterials, searchTerm]);

  const filteredFinishedGoods = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return finishedGoods.filter((item) => {
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.sku || '').toLowerCase().includes(q)
      );
    });
  }, [finishedGoods, searchTerm]);

  const lowStockItems = useMemo(() =>
    globalThreshold > 0
      ? rawMaterials.filter(m => m.stockQuantity > 0 && m.stockQuantity <= globalThreshold)
      : [],
    [rawMaterials, globalThreshold]
  );

  const outOfStockItems = useMemo(() =>
    rawMaterials.filter(m => m.stockQuantity <= 0),
    [rawMaterials]
  );

  const tabs = [
    { id: 'raw-materials' as TabType, name: 'Raw Materials', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )},
    { id: 'finished-goods' as TabType, name: 'Finished Goods', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    )},
    { id: 'material-usage' as TabType, name: 'Material Usage', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )},
    { id: 'purchase-orders' as TabType, name: 'Purchase Orders', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    )},
    { id: 'suppliers' as TabType, name: 'Suppliers', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
    { id: 'waste-log' as TabType, name: 'Waste / Scrap', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    )},
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Inventory Management</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">Manage raw materials and finished goods</p>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-wrap items-center gap-3">
            {/* Global Low Stock Threshold Setting — admin/supervisor only */}
            {(user?.role === 'administrator' || user?.role === 'supervisor') && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                <svg className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {editingThreshold ? (
                  <>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={thresholdInput}
                      onChange={(e) => setThresholdInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveThreshold(); if (e.key === 'Escape') setEditingThreshold(false); }}
                      className="w-20 px-2 py-0.5 text-sm rounded border border-orange-300 dark:border-orange-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveThreshold}
                      disabled={thresholdSaving}
                      className="text-xs font-medium text-orange-700 dark:text-orange-300 hover:text-orange-900 dark:hover:text-orange-100 disabled:opacity-50"
                    >
                      {thresholdSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingThreshold(false); setThresholdInput(String(globalThreshold)); }}
                      className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-orange-700 dark:text-orange-300">
                      Low stock alert: <strong>{globalThreshold > 0 ? `≤ ${globalThreshold} units` : 'Off'}</strong>
                    </span>
                    <button
                      onClick={() => { setEditingThreshold(true); setThresholdInput(String(globalThreshold)); }}
                      className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 underline"
                    >
                      {globalThreshold > 0 ? 'Change' : 'Set'}
                    </button>
                  </>
                )}
              </div>
            )}
            <Link
              href="/inventory/purchase-orders/new"
              className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              New Purchase Order
            </Link>
          </div>
        </div>

        {formError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {formError}
          </div>
        )}

        {/* Low Stock Notifications */}
        {!notificationDismissed && (lowStockItems.length > 0 || outOfStockItems.length > 0) && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Stock Alerts</p>
              <button
                onClick={() => setNotificationDismissed(true)}
                className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Dismiss
              </button>
            </div>
            {outOfStockItems.length > 0 && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                      {outOfStockItems.length} item{outOfStockItems.length > 1 ? 's' : ''} out of stock
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {outOfStockItems.map(m => `${m.materialType}${m.color ? ` (${m.color})` : ''}`).join(', ')}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {lowStockItems.length > 0 && (
              <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">
                        {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} running low on stock
                      </p>
                      <Link
                        href="/inventory/purchase-orders/new"
                        className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create Purchase Order
                      </Link>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {lowStockItems.map(m => (
                        <li key={m.id} className="text-xs text-orange-600 dark:text-orange-400">
                          {m.materialType}{m.color ? ` (${m.color})` : ''}{m.pattern ? ` / ${m.pattern}` : ''} — {m.stockQuantity} remaining
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add Material Form */}
        {activeTab === 'raw-materials' && (
          <form onSubmit={handleCreateMaterial} className="mb-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Add Inventory Item</h2>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input
                type="text"
                value={newMaterial.itemId}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, itemId: e.target.value }))}
                placeholder="Item ID (e.g. FAB001)"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <input
                type="text"
                value={newMaterial.materialType}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, materialType: e.target.value }))}
                placeholder="Material Type"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <input
                type="text"
                value={newMaterial.color}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, color: e.target.value }))}
                placeholder="Color"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <input
                type="text"
                value={newMaterial.pattern}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, pattern: e.target.value }))}
                placeholder="Pattern"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newMaterial.unitPrice}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, unitPrice: e.target.value }))}
                placeholder="Unit Price"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newMaterial.stockQuantity}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, stockQuantity: e.target.value }))}
                placeholder="Stock Quantity"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Add Item'}
              </button>
            </div>
          </form>
        )}

        {/* Add Premade Form */}
        {activeTab === 'finished-goods' && (
          <form onSubmit={handleCreatePremade} className="mb-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Add Premade Product</h2>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input
                type="text"
                value={newPremade.name}
                onChange={(e) => setNewPremade((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Product name"
                className="md:col-span-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPremade.quantity}
                onChange={(e) => setNewPremade((prev) => ({ ...prev, quantity: e.target.value }))}
                placeholder="Amount"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPremade.price}
                onChange={(e) => setNewPremade((prev) => ({ ...prev, price: e.target.value }))}
                placeholder="Price"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <input
                type="text"
                value={newPremade.category}
                onChange={(e) => setNewPremade((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="Category"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <select
                value={newPremade.branchId}
                onChange={(e) => setNewPremade((prev) => ({ ...prev, branchId: e.target.value }))}
                required
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              >
                <option value="">Select branch *</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Materials Used (Required)</h3>
                <button
                  type="button"
                  onClick={addPremadeMaterialRow}
                  className="text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium"
                >
                  + Add Material
                </button>
              </div>
              <div className="space-y-2">
                {premadeMaterials.map((entry, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <select
                      value={entry.materialId}
                      onChange={(e) => updatePremadeMaterialRow(index, 'materialId', e.target.value)}
                      className="md:col-span-7 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    >
                      <option value="">Select material</option>
                      {rawMaterials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.materialType}{material.color ? ` - ${material.color}` : ''}{material.pattern ? ` (${material.pattern})` : ''} ({material.stockQuantity} available)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={entry.quantityUsed}
                      onChange={(e) => updatePremadeMaterialRow(index, 'quantityUsed', e.target.value)}
                      placeholder="Qty used"
                      className="md:col-span-3 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => removePremadeMaterialRow(index)}
                      className="md:col-span-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Stock will be deducted automatically based on the material quantities you enter.
              </p>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Add Premade Product'}
              </button>
            </div>
          </form>
        )}

        {/* Add Supplier Form */}
        {activeTab === 'suppliers' && (user?.role === 'administrator' || user?.role === 'supervisor') && (
          <form onSubmit={handleCreateSupplier} className="mb-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Add Supplier</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input type="text" value={newSupplier.name} onChange={e => setNewSupplier(p => ({ ...p, name: e.target.value }))} placeholder="Supplier Name *" className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white" />
              <input type="text" value={newSupplier.contactPerson} onChange={e => setNewSupplier(p => ({ ...p, contactPerson: e.target.value }))} placeholder="Contact Person" className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white" />
              <input type="text" value={newSupplier.phone} onChange={e => setNewSupplier(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white" />
              <input type="email" value={newSupplier.email} onChange={e => setNewSupplier(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white" />
              <input type="text" value={newSupplier.address} onChange={e => setNewSupplier(p => ({ ...p, address: e.target.value }))} placeholder="Address" className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white" />
              <input type="text" value={newSupplier.materialsSupplied} onChange={e => setNewSupplier(p => ({ ...p, materialsSupplied: e.target.value }))} placeholder="Materials Supplied" className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white" />
              <input type="text" value={newSupplier.notes} onChange={e => setNewSupplier(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="md:col-span-3 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white" />
            </div>
            <div className="mt-4">
              <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60">
                {saving ? 'Saving...' : 'Add Supplier'}
              </button>
            </div>
          </form>
        )}

        {/* Add Waste Log Form */}
        {activeTab === 'waste-log' && (user?.role === 'administrator' || user?.role === 'supervisor') && (
          <form onSubmit={handleCreateWasteLog} className="mb-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Log Waste / Scrap</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select value={newWaste.materialId} onChange={e => setNewWaste(p => ({ ...p, materialId: e.target.value }))} className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white">
                <option value="">Select Material *</option>
                {rawMaterials.map(m => (
                  <option key={m.id} value={m.id}>{m.materialType}{m.color ? ` - ${m.color}` : ''}{m.pattern ? ` (${m.pattern})` : ''} ({m.stockQuantity} available)</option>
                ))}
              </select>
              <input type="number" min="0.01" step="0.01" value={newWaste.quantity} onChange={e => setNewWaste(p => ({ ...p, quantity: e.target.value }))} placeholder="Quantity Wasted *" className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white" />
              <input type="text" value={newWaste.reason} onChange={e => setNewWaste(p => ({ ...p, reason: e.target.value }))} placeholder="Reason (e.g. cutting error) *" className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white" />
              <input type="text" value={newWaste.notes} onChange={e => setNewWaste(p => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)" className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white" />
            </div>
            <div className="mt-4">
              <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60">
                {saving ? 'Saving...' : 'Log Waste'}
              </button>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">This will deduct the quantity from the material&apos;s stock.</p>
            </div>
          </form>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 mb-6">
          <div className="border-b border-zinc-200 dark:border-zinc-800">
            <nav className="flex -mb-px">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                      : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="relative max-w-md w-full">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search inventory..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-4 text-zinc-500 dark:text-zinc-400">Loading inventory...</p>
            </div>
          ) : activeTab === 'raw-materials' ? (
            <div className="overflow-x-auto">
              {filteredRawMaterials.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">No inventory items found</h3>
                  <p className="text-zinc-500 dark:text-zinc-400">Add your first item to get started.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Item ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Material Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Color</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Pattern</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Unit Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Stock Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredRawMaterials.map((material) => {
                      const status = getStockStatus(material.stockQuantity);
                      return (
                        <tr key={material.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-zinc-500 dark:text-zinc-400">
                            {material.itemId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingMaterialId === material.id ? (
                              <input
                                type="text"
                                value={editMaterial.materialType}
                                onChange={(e) => setEditMaterial((prev) => ({ ...prev, materialType: e.target.value }))}
                                className="w-36 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                              />
                            ) : (
                              <span className="text-sm font-medium text-zinc-900 dark:text-white">{material.materialType}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingMaterialId === material.id ? (
                              <input
                                type="text"
                                value={editMaterial.color}
                                onChange={(e) => setEditMaterial((prev) => ({ ...prev, color: e.target.value }))}
                                className="w-28 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                              />
                            ) : (
                              <span className="text-sm text-zinc-600 dark:text-zinc-300">{material.color || '-'}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingMaterialId === material.id ? (
                              <input
                                type="text"
                                value={editMaterial.pattern}
                                onChange={(e) => setEditMaterial((prev) => ({ ...prev, pattern: e.target.value }))}
                                className="w-28 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                              />
                            ) : (
                              <span className="text-sm text-zinc-600 dark:text-zinc-300">{material.pattern || '-'}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingMaterialId === material.id ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editMaterial.unitPrice}
                                onChange={(e) => setEditMaterial((prev) => ({ ...prev, unitPrice: e.target.value }))}
                                className="w-24 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                              />
                            ) : (
                              <span className="text-sm text-zinc-600 dark:text-zinc-300">{formatCurrency(material.unitPrice)}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingMaterialId === material.id ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editMaterial.stockQuantity}
                                onChange={(e) => setEditMaterial((prev) => ({ ...prev, stockQuantity: e.target.value }))}
                                className="w-24 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                              />
                            ) : (
                              <span className="text-sm font-medium text-zinc-900 dark:text-white">{material.stockQuantity}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.class}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            {editingMaterialId === material.id ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleSaveMaterial(material.id)}
                                  className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm font-medium"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingMaterialId(null)}
                                  className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-sm font-medium"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditMaterial(material)}
                                className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm font-medium"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : activeTab === 'finished-goods' ? (
            <div className="overflow-x-auto">
              {filteredFinishedGoods.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">No finished goods found</h3>
                  <p className="text-zinc-500 dark:text-zinc-400">Finished goods will appear here once job orders are completed.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Product</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Branch</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredFinishedGoods.map((item) => {
                      const status = getStockStatus(item.quantity);
                      return (
                        <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mr-3">
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-zinc-900 dark:text-white">{item.name}</p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.sku || 'No SKU'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                              {item.branchName || `Branch ${item.branchId}`}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                            {item.category}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingPremadeId === item.id ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editPremade.quantity}
                                onChange={(e) => setEditPremade((prev) => ({ ...prev, quantity: e.target.value }))}
                                className="w-24 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                              />
                            ) : (
                              <span className="text-sm font-medium text-zinc-900 dark:text-white">{item.quantity}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                            {editingPremadeId === item.id ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editPremade.price}
                                onChange={(e) => setEditPremade((prev) => ({ ...prev, price: e.target.value }))}
                                className="w-28 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                              />
                            ) : (
                              formatCurrency(item.price)
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.class}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            {editingPremadeId === item.id ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleSavePremade(item.id)}
                                  className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm font-medium"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingPremadeId(null)}
                                  className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-sm font-medium"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditPremade(item)}
                                className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm font-medium"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : activeTab === 'material-usage' ? (
            <div className="overflow-x-auto">
              {materialUsageLogs.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">No material usage yet</h3>
                  <p className="text-zinc-500 dark:text-zinc-400">Material usage entries appear here when premade products are added.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">When Used</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Material</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Where Used</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">How Much</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Used By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {materialUsageLogs
                      .filter((log) => {
                        if (!searchTerm) return true;
                        const q = searchTerm.toLowerCase();
                        return (
                          (log.materialName || '').toLowerCase().includes(q) ||
                          (log.usedInReference || '').toLowerCase().includes(q) ||
                          (log.usedByName || '').toLowerCase().includes(q)
                        );
                      })
                      .map((log) => (
                        <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                            {new Date(log.usedAt).toLocaleString('en-PH', {
                              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-white">
                            {log.materialName || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                            {log.usedInReference}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 dark:text-white">
                            {log.quantityUsed}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                            {log.usedByName || 'System'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : activeTab === 'purchase-orders' ? (
            <div className="p-8 text-center">
              <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">Purchase Orders</h3>
              <p className="text-zinc-500 dark:text-zinc-400 mb-4">View and manage purchase orders for restocking inventory.</p>
              <Link href="/inventory/purchase-orders" className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors">
                View Purchase Orders
              </Link>
            </div>
          ) : activeTab === 'suppliers' ? (
            <div className="overflow-x-auto">
              {/* Search */}
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                <input type="text" placeholder="Search suppliers..." value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} className="w-full max-w-md pl-4 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white" />
              </div>
              {suppliers.filter(s => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.contactPerson || '').toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-zinc-500 dark:text-zinc-400">No suppliers found. Add your first supplier above.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Supplier</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Phone / Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Materials</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {suppliers.filter(s => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.contactPerson || '').toLowerCase().includes(supplierSearch.toLowerCase())).map(s => (
                      <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingSupplierId === s.id ? (
                            <input type="text" value={editSupplier.name} onChange={e => setEditSupplier(p => ({ ...p, name: e.target.value }))} className="w-36 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white" />
                          ) : (
                            <div>
                              <p className="text-sm font-medium text-zinc-900 dark:text-white">{s.name}</p>
                              {s.address && <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[160px]">{s.address}</p>}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingSupplierId === s.id ? (
                            <input type="text" value={editSupplier.contactPerson} onChange={e => setEditSupplier(p => ({ ...p, contactPerson: e.target.value }))} placeholder="Contact Person" className="w-32 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white" />
                          ) : (
                            <span className="text-sm text-zinc-600 dark:text-zinc-300">{s.contactPerson || '—'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingSupplierId === s.id ? (
                            <div className="space-y-1">
                              <input type="text" value={editSupplier.phone} onChange={e => setEditSupplier(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="w-32 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white" />
                              <input type="email" value={editSupplier.email} onChange={e => setEditSupplier(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="w-40 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white" />
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm text-zinc-600 dark:text-zinc-300">{s.phone || '—'}</p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">{s.email || ''}</p>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingSupplierId === s.id ? (
                            <input type="text" value={editSupplier.materialsSupplied} onChange={e => setEditSupplier(p => ({ ...p, materialsSupplied: e.target.value }))} placeholder="Materials" className="w-36 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white" />
                          ) : (
                            <span className="text-sm text-zinc-600 dark:text-zinc-300 truncate max-w-[140px] block">{s.materialsSupplied || '—'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${s.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                            {s.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {editingSupplierId === s.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleSaveSupplier(s.id)} className="text-amber-600 dark:text-amber-400 text-sm font-medium">Save</button>
                              <button onClick={() => setEditingSupplierId(null)} className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-3">
                              <button onClick={() => startEditSupplier(s)} className="text-amber-600 dark:text-amber-400 text-sm font-medium">Edit</button>
                              {s.isActive && (user?.role === 'administrator' || user?.role === 'supervisor') && (
                                <button onClick={() => handleDeactivateSupplier(s.id)} className="text-red-500 dark:text-red-400 text-sm font-medium">Deactivate</button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : activeTab === 'waste-log' ? (
            <div className="overflow-x-auto">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                <input type="text" placeholder="Search waste logs..." value={wasteSearch} onChange={e => setWasteSearch(e.target.value)} className="w-full max-w-md pl-4 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white" />
              </div>
              {wasteLogs.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-zinc-500 dark:text-zinc-400">No waste logs yet. Use the form above to log wasted or scrapped materials.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Material</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Qty Wasted</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Branch</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Logged By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {wasteLogs.filter(l => {
                      if (!wasteSearch) return true;
                      const q = wasteSearch.toLowerCase();
                      return (l.materialName || '').toLowerCase().includes(q) || l.reason.toLowerCase().includes(q) || (l.loggedByName || '').toLowerCase().includes(q);
                    }).map(l => (
                      <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                          {new Date(l.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-zinc-900 dark:text-white">{l.materialName || 'N/A'}</span>
                          {l.materialColor && <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1">({l.materialColor})</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-red-600 dark:text-red-400">{l.quantity}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-zinc-600 dark:text-zinc-300">{l.reason}</span>
                          {l.notes && <p className="text-xs text-zinc-400 dark:text-zinc-500">{l.notes}</p>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">{l.branchName || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">{l.loggedByName || 'System'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Items</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">
                  {rawMaterials.length + finishedGoods.length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Out of Stock</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                  {outOfStockItems.length}
                </p>
                {lowStockItems.length > 0 && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                    +{lowStockItems.length} low stock
                  </p>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Value</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {formatCurrency(rawMaterials.reduce((sum, m) => sum + (m.stockQuantity * m.unitPrice), 0))}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
