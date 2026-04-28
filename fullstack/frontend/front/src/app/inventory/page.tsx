'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, RawMaterial, FinishedGood, MaterialUsageLog, RawMaterialSummaryGroup } from '@/lib/api';
import Link from 'next/link';

type TabType = 'raw-materials' | 'finished-goods' | 'material-usage' | 'purchase-orders';

export default function InventoryPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('raw-materials');
  const [rawMaterialFilter, setRawMaterialFilter] = useState<'all' | 'needed'>('all');
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [rawMaterialGroups, setRawMaterialGroups] = useState<RawMaterialSummaryGroup[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<FinishedGood[]>([]);
  const [materialUsageLogs, setMaterialUsageLogs] = useState<MaterialUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formError, setFormError] = useState('');
  const [newMaterial, setNewMaterial] = useState({
    name: '',
    quantity: '',
    price: '',
    lengthValue: '',
    lengthUnit: 'yards'
  });
  const [editingMaterialId, setEditingMaterialId] = useState<number | null>(null);
  const [expandedMaterialKey, setExpandedMaterialKey] = useState<string | null>(null);
  const [expandedMaterialDetails, setExpandedMaterialDetails] = useState<Record<string, RawMaterialSummaryGroup>>({});
  const [loadingDetailKey, setLoadingDetailKey] = useState<string | null>(null);
  const [editMaterial, setEditMaterial] = useState({
    quantity: '',
    price: '',
    lengthValue: '',
    lengthUnit: 'yards'
  });

  const lengthUnits = ['yards', 'feet', 'meters', 'inches', 'centimeters'];
  const [newPremade, setNewPremade] = useState({
    name: '',
    quantity: '',
    price: '',
    category: 'General'
  });
  const [premadeMaterials, setPremadeMaterials] = useState<Array<{ materialId: string; quantityUsed: string }>>([
    { materialId: '', quantityUsed: '' }
  ]);
  const [editingPremadeId, setEditingPremadeId] = useState<number | null>(null);
  const [editPremade, setEditPremade] = useState({
    quantity: '',
    price: ''
  });

  useEffect(() => {
    fetchInventory();
  }, [activeTab]);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      if (activeTab === 'raw-materials') {
        const [summaryResponse, materialsResponse] = await Promise.all([
          api.inventory.getRawMaterialsSummary({ branchId: user?.branchId, includeComponents: false }),
          api.inventory.getRawMaterials({ branchId: user?.branchId })
        ]);
        setRawMaterialGroups(summaryResponse.data || []);
        setRawMaterials(materialsResponse.data || []);
        setExpandedMaterialKey(null);
        setExpandedMaterialDetails({});
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

    if (!newMaterial.name.trim()) {
      setFormError('Material name is required.');
      return;
    }

    const quantity = Number(newMaterial.quantity);
    const price = Number(newMaterial.price);
    const lengthValue = Number(newMaterial.lengthValue);

    if (Number.isNaN(quantity) || Number.isNaN(price) || Number.isNaN(lengthValue)) {
      setFormError('Quantity, price, and length per quantity must be valid numbers.');
      return;
    }

    setSaving(true);
    try {
      await api.inventory.createRawMaterial({
        name: newMaterial.name.trim(),
        quantity,
        price,
        lengthValue,
        lengthUnit: newMaterial.lengthUnit,
        unit: newMaterial.lengthUnit,
        branchId: user?.branchId || 1,
        category: 'General',
        reorderPoint: 0,
        supplier: ''
      });

      setNewMaterial({
        name: '',
        quantity: '',
        price: '',
        lengthValue: '',
        lengthUnit: 'yards'
      });

      await fetchInventory();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to add material.');
    } finally {
      setSaving(false);
    }
  };

  const startEditMaterial = (material: RawMaterial) => {
    setEditingMaterialId(material.id);
    setEditMaterial({
      quantity: String(material.quantity),
      price: String(material.price),
      lengthValue: String(material.lengthValue ?? material.quantity),
      lengthUnit: material.lengthUnit || material.unit || 'yards'
    });
  };

  const handleSaveMaterial = async (materialId: number) => {
    setFormError('');

    const quantity = Number(editMaterial.quantity);
    const price = Number(editMaterial.price);
    const lengthValue = Number(editMaterial.lengthValue);

    if (Number.isNaN(quantity) || Number.isNaN(price) || Number.isNaN(lengthValue)) {
      setFormError('Quantity, price, and length per quantity must be valid numbers.');
      return;
    }

    setSaving(true);
    try {
      await api.inventory.updateRawMaterial(materialId, {
        quantity,
        price,
        lengthValue,
        lengthUnit: editMaterial.lengthUnit,
        unit: editMaterial.lengthUnit
      });

      setEditingMaterialId(null);
      await fetchInventory();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to update material.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMaterialDetails = async (group: RawMaterialSummaryGroup) => {
    if (expandedMaterialKey === group.key) {
      setExpandedMaterialKey(null);
      return;
    }

    setExpandedMaterialKey(group.key);

    if (expandedMaterialDetails[group.key]) {
      return;
    }

    setLoadingDetailKey(group.key);
    try {
      const response = await api.inventory.getRawMaterialGroupDetail(group.key, {
        branchId: user?.branchId
      });

      if (response.data) {
        setExpandedMaterialDetails((prev) => ({
          ...prev,
          [group.key]: response.data as RawMaterialSummaryGroup
        }));
      }
    } catch (error) {
      console.error('Error loading raw material group details:', error);
      setFormError('Failed to load material details. Please try again.');
    } finally {
      setLoadingDetailKey(null);
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

    setSaving(true);
    try {
      await api.inventory.createFinishedGood({
        name: newPremade.name.trim(),
        quantity,
        unit: 'pcs',
        category: newPremade.category,
        price,
        cost: 0,
        branchId: user?.branchId || 1,
        materialsUsed: parsedMaterialsUsed
      });

      setNewPremade({
        name: '',
        quantity: '',
        price: '',
        category: 'General'
      });
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
    setEditPremade({
      quantity: String(item.quantity),
      price: String(item.price)
    });
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
      await api.inventory.updateFinishedGood(itemId, {
        quantity,
        price,
        unit: 'pcs'
      });

      setEditingPremadeId(null);
      await fetchInventory();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to update premade product.');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getStockStatus = (quantity: number, reorderPoint: number) => {
    if (quantity <= 0) {
      return { label: 'Out of Stock', class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
    } else if (quantity <= reorderPoint) {
      return { label: 'Low Stock', class: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
    }
    return { label: 'In Stock', class: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
  };

  const groupedRawMaterials = useMemo(() => {
    return rawMaterialGroups.filter((group) => {
      if (rawMaterialFilter === 'needed' && group.category !== 'Needed Materials') {
        return false;
      }

      const q = searchTerm.toLowerCase();
      if (!q) return true;
      return (
        group.name.toLowerCase().includes(q) ||
        group.category.toLowerCase().includes(q) ||
        (group.supplier || '').toLowerCase().includes(q)
      );
    });
  }, [rawMaterialGroups, searchTerm, rawMaterialFilter]);

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

  const neededRawMaterialCount = rawMaterialGroups.filter(
    (group) => group.category === 'Needed Materials'
  ).length;
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
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Inventory Management</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              Manage raw materials and finished goods
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex gap-3">
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

        {activeTab === 'raw-materials' && (
          <form onSubmit={handleCreateMaterial} className="mb-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Add Material</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                type="text"
                value={newMaterial.name}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Material name"
                className="md:col-span-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newMaterial.quantity}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, quantity: e.target.value }))}
                placeholder="Quantity"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newMaterial.price}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, price: e.target.value }))}
                placeholder="Price"
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newMaterial.lengthValue}
                  onChange={(e) => setNewMaterial((prev) => ({ ...prev, lengthValue: e.target.value }))}
                  placeholder="Length per quantity"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                />
                <select
                  value={newMaterial.lengthUnit}
                  onChange={(e) => setNewMaterial((prev) => ({ ...prev, lengthUnit: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                >
                  {lengthUnits.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Add Material'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'finished-goods' && (
          <form onSubmit={handleCreatePremade} className="mb-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Add Premade Product</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPremade.category}
                  onChange={(e) => setNewPremade((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="Category"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                />
              </div>
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
                          {material.name} ({material.quantity} {material.unit} available)
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
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
              {activeTab === 'raw-materials' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRawMaterialFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      rawMaterialFilter === 'all'
                        ? 'bg-amber-600 text-white'
                        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    All Materials
                  </button>
                  <button
                    type="button"
                    onClick={() => setRawMaterialFilter('needed')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      rawMaterialFilter === 'needed'
                        ? 'bg-amber-600 text-white'
                        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    Needed Materials
                  </button>
                </div>
              )}
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
              {groupedRawMaterials.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">No raw materials found</h3>
                  <p className="text-zinc-500 dark:text-zinc-400">Add your first raw material to get started.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Material</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Length</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Total Length</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Unit Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Supplier</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {groupedRawMaterials.map((group) => {
                      const status = getStockStatus(group.totalQuantity, group.reorderPoint);
                      const uniqueLengths = [...new Set(group.lengths.map((v) => Number(v.toFixed(4))))];
                      const lengthDisplay =
                        uniqueLengths.length === 1
                          ? `${uniqueLengths[0]} ${group.lengthUnit}`
                          : `Mixed (${group.lengthUnit})`;
                      return [
                          <tr key={`${group.key}-main`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mr-3">
                                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                  </svg>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{group.name}</p>
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{group.components.length} component{group.components.length > 1 ? 's' : ''}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                              {group.category}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 dark:text-white font-medium">
                              {group.totalQuantity} {group.unit}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                              {lengthDisplay}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 dark:text-white font-medium">
                              {group.totalLength.toFixed(2)} {group.lengthUnit}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                              {group.components.length === 1
                                ? formatCurrency(group.components[0].price)
                                : `${formatCurrency(group.totalValue / Math.max(group.totalQuantity, 1))} avg`}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.class}`}>
                                {status.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                              {group.supplier}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <button
                                onClick={() => handleToggleMaterialDetails(group)}
                                className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm font-medium"
                              >
                                {expandedMaterialKey === group.key ? 'Hide Details' : 'View More'}
                              </button>
                            </td>
                          </tr>,
                        expandedMaterialKey === group.key ? (
                            <tr key={`${group.key}-details`}>
                              <td colSpan={9} className="px-6 py-4 bg-zinc-50/70 dark:bg-zinc-900/40">
                                {loadingDetailKey === group.key ? (
                                  <div className="p-4 text-sm text-zinc-500 dark:text-zinc-400">Loading breakdown...</div>
                                ) : (
                                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                                  <table className="w-full">
                                    <thead className="bg-white dark:bg-zinc-900">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Component</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Quantity</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Length</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Total Length</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Price</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                                      {(expandedMaterialDetails[group.key]?.components || group.components).map((material) => (
                                        <tr key={material.id}>
                                          <td className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300">
                                            {material.sku || `ID-${material.id}`}
                                          </td>
                                          <td className="px-4 py-2 text-sm text-zinc-900 dark:text-white">
                                            {editingMaterialId === material.id ? (
                                              <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={editMaterial.quantity}
                                                onChange={(e) => setEditMaterial((prev) => ({ ...prev, quantity: e.target.value }))}
                                                className="w-24 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                                              />
                                            ) : (
                                              `${material.quantity} ${material.unit}`
                                            )}
                                          </td>
                                          <td className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300">
                                            {editingMaterialId === material.id ? (
                                              <div className="flex items-center gap-2">
                                                <input
                                                  type="number"
                                                  min="0"
                                                  step="0.01"
                                                  value={editMaterial.lengthValue}
                                                  onChange={(e) => setEditMaterial((prev) => ({ ...prev, lengthValue: e.target.value }))}
                                                  className="w-24 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                                                />
                                                <select
                                                  value={editMaterial.lengthUnit}
                                                  onChange={(e) => setEditMaterial((prev) => ({ ...prev, lengthUnit: e.target.value }))}
                                                  className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                                                >
                                                  {lengthUnits.map((unit) => (
                                                    <option key={unit} value={unit}>{unit}</option>
                                                  ))}
                                                </select>
                                              </div>
                                            ) : (
                                              `${material.lengthValue ?? 0} ${material.lengthUnit || material.unit}`
                                            )}
                                          </td>
                                          <td className="px-4 py-2 text-sm text-zinc-900 dark:text-white">
                                            {(Number(material.quantity) * Number(material.lengthValue || 0)).toFixed(2)} {material.lengthUnit || material.unit}
                                          </td>
                                          <td className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300">
                                            {editingMaterialId === material.id ? (
                                              <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={editMaterial.price}
                                                onChange={(e) => setEditMaterial((prev) => ({ ...prev, price: e.target.value }))}
                                                className="w-24 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white"
                                              />
                                            ) : (
                                              formatCurrency(material.price)
                                            )}
                                          </td>
                                          <td className="px-4 py-2 text-right">
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
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                )}
                              </td>
                            </tr>
                          ) : null
                      ];
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredFinishedGoods.map((item) => {
                      const status = getStockStatus(item.quantity, 0);
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
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-white">
                            {log.materialName || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                            {log.usedInReference}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 dark:text-white">
                            {log.quantityUsed} {log.materialUnit || ''}
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
          ) : (
            <div className="p-8 text-center">
              <svg className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">Purchase Orders</h3>
              <p className="text-zinc-500 dark:text-zinc-400 mb-4">View and manage purchase orders for restocking inventory.</p>
              <Link
                href="/inventory/purchase-orders"
                className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
              >
                View Purchase Orders
              </Link>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
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
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Low Stock</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                  {rawMaterials.filter(m => m.quantity <= m.reorderPoint && m.quantity > 0).length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Out of Stock</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                  {rawMaterials.filter(m => m.quantity <= 0).length}
                </p>
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
                  {formatCurrency(rawMaterials.reduce((sum, m) => sum + (m.quantity * m.price), 0))}
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


