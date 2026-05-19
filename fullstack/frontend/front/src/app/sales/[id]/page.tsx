'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, JobOrder, JobOrderItem, RawMaterial, PaymentRecord } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

type EditableJobOrderItem = JobOrderItem & {
  materialSource?: 'inventory' | 'custom';
  materialId?: number;
  category: 'material' | 'labor';
};

export default function JobOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [jobOrder, setJobOrder] = useState<JobOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [inventoryMaterials, setInventoryMaterials] = useState<RawMaterial[]>([]);
  const [editingParts, setEditingParts] = useState<EditableJobOrderItem[]>([]);
  const [editedTotalPrice, setEditedTotalPrice] = useState('0');
  const [savingParts, setSavingParts] = useState(false);
  const [error, setError] = useState('');

  // Payment states
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('cash');
  const [newPaymentRef, setNewPaymentRef] = useState('');
  const [newPaymentNotes, setNewPaymentNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    if (params.id) {
      api.sales.getJobOrder(parseInt(params.id as string))
        .then(response => {
          setJobOrder(response.data || null);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [params.id]);

  useEffect(() => {
    if (!jobOrder) return;

    const blankItem: EditableJobOrderItem = {
      name: '', quantity: 1, unitPrice: 0, materialCost: 0, laborCost: 0,
      partType: 'other', materialName: '', materialSource: 'inventory',
      materialId: undefined, workerName: '', workerRate: 0, notes: '', category: 'material',
    };

    const items: EditableJobOrderItem[] = jobOrder.items && jobOrder.items.length > 0
      ? jobOrder.items.map((item): EditableJobOrderItem => ({
          name: item.name || '',
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          materialCost: Number(item.materialCost) || 0,
          laborCost: Number(item.laborCost) || 0,
          partType: item.partType || 'other',
          materialName: item.materialName || '',
          materialSource: 'inventory',
          materialId: undefined,
          workerName: item.workerName || '',
          workerRate: Number(item.workerRate) || 0,
          notes: item.notes || '',
          category: (Number(item.laborCost) > 0 && Number(item.materialCost) === 0)
            ? 'labor'
            : 'material',
        }))
      : [blankItem];

    setEditingParts(items);
    setEditedTotalPrice(String(jobOrder.totalPrice || 0));
  }, [jobOrder]);

  const canEditParts = ['administrator', 'supervisor'].includes(user?.role || '');
  const canUpdatePaymentStatus = ['administrator', 'supervisor', 'sales_manager'].includes(user?.role || '');
  const canCreateNewMaterial = ['administrator', 'supervisor'].includes(user?.role || '');

  useEffect(() => {
    const isFinished = jobOrder?.status === 'completed' || jobOrder?.status === 'delivered';
    if (!jobOrder || (!canEditParts && !isFinished)) return;

    const loadMaterials = async () => {
      try {
        const response = await api.inventory.getRawMaterials(
          jobOrder.branchId ? { branchId: jobOrder.branchId, includeWarehouse: true } : undefined
        );
        setInventoryMaterials(response.data || []);
      } catch (err) {
        console.error('Failed to load raw materials for job order editing:', err);
      }
    };

    loadMaterials();
  }, [jobOrder, canEditParts]);

  const updateStatus = async (newStatus: string) => {
    if (!jobOrder) return;
    setUpdating(true);
    try {
      await api.sales.updateJobOrder(jobOrder.id, { status: newStatus as any });
      setJobOrder({ ...jobOrder, status: newStatus as any });
    } catch (err) {
      console.error(err);
    }
    setUpdating(false);
  };

  const addMaterialPart = () => {
    setEditingParts((prev) => [...prev, {
      name: '',
      quantity: 1,
      unitPrice: 0,
      materialCost: 0,
      laborCost: 0,
      partType: 'other',
      materialName: '',
      materialSource: 'inventory',
      materialId: undefined,
      workerName: '',
      workerRate: 0,
      notes: '',
      category: 'material',
    }]);
  };

  const addLaborPart = () => {
    setEditingParts((prev) => [...prev, {
      name: '',
      quantity: 1,
      unitPrice: 0,
      materialCost: 0,
      laborCost: 0,
      partType: 'other',
      materialName: '',
      materialSource: 'inventory',
      materialId: undefined,
      workerName: '',
      workerRate: 0,
      notes: '',
      category: 'labor',
    }]);
  };

  const updateOrderPart = (index: number, field: keyof EditableJobOrderItem, value: string | number) => {
    setEditingParts((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  };

  const updateOrderPartMaterialSource = (index: number, value: string) => {
    setEditingParts((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (value === 'custom') {
        return { ...item, materialSource: 'custom', materialId: undefined, name: item.name || '' };
      }
      const selectedId = Number(value);
      const selectedMaterial = inventoryMaterials.find((material) => material.id === selectedId);
      if (!selectedMaterial) {
        return { ...item, materialSource: 'inventory', materialId: undefined, materialCost: 0, unitPrice: 0, name: item.materialSource === 'custom' ? '' : item.name };
      }
      return {
        ...item,
        materialSource: 'inventory',
        materialId: selectedMaterial.id,
        name: selectedMaterial.materialType,
        materialCost: Number(selectedMaterial.unitPrice) || 0,
        unitPrice: Number(selectedMaterial.unitPrice) || 0
      };
    }));
  };

  const removeOrderPart = (index: number) => {
    setEditingParts((prev) => (prev.length > 1 ? prev.filter((_, itemIndex) => itemIndex !== index) : prev));
  };

  const saveOrderParts = async () => {
    if (!jobOrder) return;

    const normalizedItems: JobOrderItem[] = [];

    for (const item of editingParts) {
      const materialName = item.name.trim();
      if (!materialName) continue;

      // Resolve the inventory material ID for this line item
      let resolvedMaterialId: number | undefined = item.materialId ? Number(item.materialId) : undefined;
      const isLaborOnly = Number(item.laborCost) > 0 && Number(item.materialCost) === 0;

      if (item.materialSource === 'custom' && !isLaborOnly) {
        if (!canCreateNewMaterial) {
          setSavingParts(false);
          setError('Only administrators and supervisors can add new materials to inventory.');
          return;
        }

        const normalizedMaterialName = materialName.toLowerCase();
        const existingMaterial = inventoryMaterials.find(
          (material) => material.materialType.trim().toLowerCase() === normalizedMaterialName
        );

        if (existingMaterial) {
          resolvedMaterialId = existingMaterial.id;
        } else {
          const createdMaterialResponse = await api.inventory.createRawMaterial({
            materialType: materialName,
            color: '',
            pattern: '',
            unitPrice: Number(item.materialCost) || Number(item.unitPrice) || 0,
            stockQuantity: 0,
            branchId: jobOrder.branchId,
            status: 'needed',
            sourceJobOrderId: jobOrder.jobOrderId
          });

          if (createdMaterialResponse.data) {
            const newMaterial = createdMaterialResponse.data;
            resolvedMaterialId = newMaterial.id;
            setInventoryMaterials((prev) =>
              prev.some((material) => material.id === newMaterial.id)
                ? prev
                : [...prev, newMaterial]
            );
          }
        }
      }

      normalizedItems.push({
        name: materialName,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || ((Number(item.materialCost) || 0) + (Number(item.laborCost) || 0)),
        materialCost: Number(item.materialCost) || 0,
        laborCost: Number(item.laborCost) || 0,
        partType: item.partType || 'other',
        materialName: item.materialName?.trim() || '',
        workerName: item.workerName?.trim() || '',
        workerRate: Number(item.workerRate) || 0,
        notes: item.notes?.trim() || '',
        ...(resolvedMaterialId ? { materialId: resolvedMaterialId } : {})
      });
    }

    const computedTotalPrice = normalizedItems.reduce(
      (sum, item) => sum + (item.quantity * ((Number(item.materialCost) || 0) + (Number(item.laborCost) || 0))),
      0
    );
    const originalTotalPrice = Number(jobOrder.totalPrice || 0);
    let totalPrice = Number(editedTotalPrice) || 0;

    if (!totalPrice || Math.abs(totalPrice - originalTotalPrice) < 0.01) {
      totalPrice = computedTotalPrice;
      setEditedTotalPrice(String(computedTotalPrice));
    }

    const actualCost = computedTotalPrice;

    setSavingParts(true);
    try {
      const response = await api.sales.updateJobOrder(jobOrder.id, {
        items: normalizedItems,
        totalPrice,
        actualCost
      });

      const updated = response.data;
      if (updated) {
        setJobOrder({
          ...jobOrder,
          items: normalizedItems,
          totalPrice: updated.totalPrice ?? totalPrice,
          actualCost: updated.actualCost ?? actualCost,
          balance: updated.balance ?? Math.max(totalPrice - (jobOrder.downPayment || 0), 0),
          paymentStatus: updated.paymentStatus || jobOrder.paymentStatus
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingParts(false);
    }
  };

  useEffect(() => {
    if (!jobOrder?.id) return;
    setLoadingPayments(true);
    api.payments.getAll({ jobOrderId: jobOrder.id })
      .then(res => setPaymentRecords(res.data || []))
      .catch(err => console.error(err))
      .finally(() => setLoadingPayments(false));
  }, [jobOrder?.id]);

  const recordPayment = async () => {
    if (!jobOrder) return;
    const amount = parseFloat(newPaymentAmount);
    if (!amount || amount <= 0) return;
    setSavingPayment(true);
    try {
      await api.payments.create({
        jobOrderId: jobOrder.id,
        amount,
        paymentMethod: newPaymentMethod,
        referenceNumber: newPaymentRef || undefined,
        notes: newPaymentNotes || undefined,
      });
      const res = await api.payments.getAll({ jobOrderId: jobOrder.id });
      const records = res.data || [];
      setPaymentRecords(records);
      const newTotalPaid = records.reduce((s: number, r: PaymentRecord) => s + r.amount, 0);
      const newBalance = Math.max(0, (jobOrder.totalPrice || 0) - newTotalPaid);
      const newStatus: 'paid' | 'partial' | 'unpaid' =
        newBalance <= 0 ? 'paid' : newTotalPaid > 0 ? 'partial' : 'unpaid';
      setJobOrder({ ...jobOrder, downPayment: newTotalPaid, balance: newBalance, paymentStatus: newStatus });
      setNewPaymentAmount('');
      setNewPaymentRef('');
      setNewPaymentNotes('');
      setShowPaymentForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPayment(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'ready_for_installation': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'completed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'delivered': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'cancelled': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const printReceipt = () => { window.print(); };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
          </div>
        </main>
      </div>
    );
  }

  if (!jobOrder) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <p className="text-red-600 dark:text-red-400">Job order not found</p>
            <button onClick={() => router.push('/sales')} className="mt-4 text-amber-600 hover:text-amber-700 font-medium">
              Back to Sales
            </button>
          </div>
        </main>
      </div>
    );
  }

  const itemBreakdown = (jobOrder.items || []).map((item) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const materialCostPerUnit = Number(item.materialCost) || 0;
    const laborCostPerUnit = Number(item.laborCost) || 0;
    return {
      ...item,
      quantity,
      unitPrice,
      materialCostPerUnit,
      laborCostPerUnit,
      linePrice: quantity * unitPrice,
      lineMaterialCost: quantity * materialCostPerUnit,
      lineLaborCost: quantity * laborCostPerUnit,
    };
  });

  const materialSubtotal = itemBreakdown.reduce((total, item) => total + item.lineMaterialCost, 0);
  const laborSubtotal = itemBreakdown.reduce((total, item) => total + item.lineLaborCost, 0);

  const materialPartsTotal = editingParts
    .filter(p => p.category === 'material')
    .reduce((sum, p) => sum + ((Number(p.quantity) || 0) * (Number(p.materialCost) || 0)), 0);

  const laborPartsTotal = editingParts
    .filter(p => p.category === 'labor')
    .reduce((sum, p) => sum + ((Number(p.quantity) || 0) * (Number(p.laborCost) || 0)), 0);

  const computedPartsTotal = materialPartsTotal + laborPartsTotal;

  // Financial summary (shown when completed/delivered)
  const actualExpenses = materialSubtotal + laborSubtotal;
  const finalPrice = jobOrder.totalPrice || 0;
  const grossProfit = finalPrice - actualExpenses;
  const profitMarginPct = finalPrice > 0 ? (grossProfit / finalPrice) * 100 : 0;
  const isProfit = grossProfit >= 0;
  const estimatedCostQuoted = jobOrder.estimatedCost || 0;
  const priceDiff = finalPrice - estimatedCostQuoted;
  const priceDiffPct = estimatedCostQuoted > 0 ? (priceDiff / estimatedCostQuoted) * 100 : 0;

  // Payment calculation — fall back to job order's stored downPayment for legacy orders with no records
  const totalPaid = paymentRecords.length > 0
    ? paymentRecords.reduce((sum, r) => sum + (r.amount || 0), 0)
    : (jobOrder.downPayment || 0);
  const remainingBalance = Math.max(0, (jobOrder.totalPrice || 0) - totalPaid);
  const isFullySettled = remainingBalance <= 0;

  const inputClass = "w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent";

  return (
    <div className="job-order-print min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <button
              onClick={() => router.push('/sales')}
              className="flex items-center text-zinc-500 dark:text-zinc-400 hover:text-amber-600 mb-3 text-sm transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Sales
            </button>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              Job Order <span className="text-amber-600">#{jobOrder.jobOrderId}</span>
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Created {new Date(jobOrder.createdAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-3">
            <span className={`px-3 py-1.5 text-sm font-semibold rounded-full ${getStatusColor(jobOrder.status)}`}>
              {jobOrder.status.replace(/_/g, ' ').toUpperCase()}
            </span>
            {canEditParts && jobOrder.status === 'pending' && (
              <button onClick={() => updateStatus('in_progress')} disabled={updating} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm">
                Start Work
              </button>
            )}
            {canEditParts && jobOrder.status === 'in_progress' && (
              <button
                onClick={() => updateStatus('completed')}
                disabled={updating || !isFullySettled}
                title={!isFullySettled ? 'Payment must be fully settled before marking as complete' : ''}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Mark Complete
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300 flex items-start gap-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Info Cards Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          {/* Customer Info */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Customer
            </h2>
            <div className="space-y-2.5">
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Name</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{jobOrder.customerName}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Phone</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{jobOrder.customerPhone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Email</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{jobOrder.customerEmail || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Address</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{(jobOrder as any).customer_address || (jobOrder as any).customerAddress || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Vehicle Info */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
              Vehicle
            </h2>
            <div className="space-y-2.5">
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Make & Model</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {jobOrder.vehicleInfo ? `${jobOrder.vehicleInfo.make} ${jobOrder.vehicleInfo.model}` : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Year</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{jobOrder.vehicleInfo?.year || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Color</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{jobOrder.vehicleInfo?.color || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Plate Number</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{jobOrder.vehicleInfo?.plateNumber || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Service Info */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Service
            </h2>
            <div className="space-y-2.5">
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Description</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{jobOrder.description || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Estimated Completion</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {jobOrder.estimatedCompletion ? new Date(jobOrder.estimatedCompletion).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Line Items</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{jobOrder.items.length} item(s)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Assigned Workers */}
        {canEditParts && (jobOrder as any).tasks && (jobOrder as any).tasks.length > 0 && (
          <div className="no-print mb-5 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Assigned Workers
            </h2>
            <div className="space-y-2">
              {(jobOrder as any).tasks.map((task: any) => (
                <div key={task.id} className="flex items-center justify-between py-3 px-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{task.title}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Task #{task.taskNumber}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {task.worker ? (
                      <div className="text-right">
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">{task.worker.name}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{task.worker.specialization}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-400 italic">Unassigned</p>
                    )}
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      task.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      task.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {task.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Admin: Order Parts ── */}
        {canEditParts && (
          <div className="no-print mb-5 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Order Parts &amp; Labor
              </h2>
              <button
                type="button"
                onClick={saveOrderParts}
                disabled={savingParts}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {savingParts ? 'Saving...' : 'Save All Parts'}
              </button>
            </div>

            {/* ── Materials Section ── */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                  Materials
                </h3>
                <button
                  type="button"
                  onClick={addMaterialPart}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs font-medium transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Material
                </button>
              </div>

              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-[40%]">Material / Part</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-20">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-32">Unit Cost (₱)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-28">Line Total</th>
                      <th className="px-4 py-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                    {editingParts.map((part, globalIndex) => {
                      if (part.category !== 'material') return null;
                      const lineTotal = (Number(part.quantity) || 0) * (Number(part.materialCost) || 0);
                      return (
                        <tr key={`material-${globalIndex}`}>
                          <td className="px-4 py-3">
                            <div className="space-y-1.5">
                              <select
                                value={part.materialSource === 'custom' ? 'custom' : (part.materialId || '')}
                                onChange={(e) => updateOrderPartMaterialSource(globalIndex, e.target.value)}
                                className={inputClass}
                              >
                                <option value="">Select inventory material</option>
                                {inventoryMaterials.map((material) => (
                                  <option key={material.id} value={material.id}>
                                    {material.materialType}{material.color ? ` - ${material.color}` : ''}{material.pattern ? ` (${material.pattern})` : ''} — Stock: {material.stockQuantity}
                                  </option>
                                ))}
                                {canCreateNewMaterial && <option value="custom">+ Add new material</option>}
                              </select>
                              {part.materialSource === 'custom' && canCreateNewMaterial ? (
                                <input
                                  type="text"
                                  value={part.name}
                                  onChange={(e) => updateOrderPart(globalIndex, 'name', e.target.value)}
                                  className={inputClass}
                                  placeholder="New material name"
                                />
                              ) : (
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 pl-1">
                                  {part.name || 'No material selected'}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={part.quantity}
                              onChange={(e) => updateOrderPart(globalIndex, 'quantity', e.target.value)}
                              className="w-16 px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white text-right"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={part.materialCost || 0}
                              onChange={(e) => updateOrderPart(globalIndex, 'materialCost', e.target.value)}
                              className="w-28 px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white text-right"
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-white">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeOrderPart(globalIndex)}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Remove"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!editingParts.some(p => p.category === 'material') && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
                          No materials added yet. Click &quot;Add Material&quot; to begin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {editingParts.some(p => p.category === 'material') && (
                    <tfoot className="bg-blue-50 dark:bg-blue-900/20">
                      <tr>
                        <td colSpan={3} className="px-4 py-2.5 text-right text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                          Materials Subtotal
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-bold text-blue-700 dark:text-blue-400">
                          {formatCurrency(materialPartsTotal)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* ── Labor Section ── */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                  Labor
                </h3>
                <button
                  type="button"
                  onClick={addLaborPart}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-xs font-medium transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Labor
                </button>
              </div>

              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-[30%]">Description / Task</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-[25%]">Worker</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-20">Hours</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-32">Rate / Hr (₱)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-28">Line Total</th>
                      <th className="px-4 py-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                    {editingParts.map((part, globalIndex) => {
                      if (part.category !== 'labor') return null;
                      const lineTotal = (Number(part.quantity) || 0) * (Number(part.laborCost) || 0);
                      return (
                        <tr key={`labor-${globalIndex}`}>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={part.name}
                              onChange={(e) => updateOrderPart(globalIndex, 'name', e.target.value)}
                              className={inputClass}
                              placeholder="e.g. Seat cover installation"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={part.workerName || ''}
                              onChange={(e) => updateOrderPart(globalIndex, 'workerName', e.target.value)}
                              className={inputClass}
                              placeholder="Worker name"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={part.quantity}
                              onChange={(e) => updateOrderPart(globalIndex, 'quantity', e.target.value)}
                              className="w-16 px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white text-right"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={part.laborCost || 0}
                              onChange={(e) => updateOrderPart(globalIndex, 'laborCost', e.target.value)}
                              className="w-28 px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white text-right"
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-white">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeOrderPart(globalIndex)}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Remove"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!editingParts.some(p => p.category === 'labor') && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
                          No labor entries added yet. Click &quot;Add Labor&quot; to begin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {editingParts.some(p => p.category === 'labor') && (
                    <tfoot className="bg-amber-50 dark:bg-amber-900/20">
                      <tr>
                        <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                          Labor Subtotal
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-bold text-amber-700 dark:text-amber-400">
                          {formatCurrency(laborPartsTotal)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Grand Total / Price Override */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Final Total Price Override</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editedTotalPrice}
                    onChange={(e) => setEditedTotalPrice(e.target.value)}
                    className="w-full pl-7 pr-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                  />
                </div>
                <p className="text-xs text-zinc-400 mt-1">Leave at computed value or override with a custom price.</p>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 flex flex-col justify-center">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Computed Total</p>
                <p className="text-xl font-bold text-zinc-900 dark:text-white">{formatCurrency(computedPartsTotal)}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>Mat: {formatCurrency(materialPartsTotal)}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>Lab: {formatCurrency(laborPartsTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Cost Breakdown (read-only view) ── */}
        {canEditParts && (
          <div className="no-print mb-5 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Cost Breakdown
            </h2>

            {itemBreakdown.length > 0 ? (
              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg mb-5">
                <table className="w-full min-w-[600px]">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Material / Item</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Unit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-blue-500 dark:text-blue-400 uppercase tracking-wider">Material Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-amber-500 dark:text-amber-400 uppercase tracking-wider">Labor Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Line Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {itemBreakdown.map((item, index) => (
                      <tr key={`${item.name}-${index}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-white">{item.name || `Item ${index + 1}`}</td>
                        <td className="px-4 py-3 text-sm text-right text-zinc-600 dark:text-zinc-400">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm text-right text-zinc-600 dark:text-zinc-400">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-4 py-3 text-sm text-right text-blue-600 dark:text-blue-400">{formatCurrency(item.lineMaterialCost)}</td>
                        <td className="px-4 py-3 text-sm text-right text-amber-600 dark:text-amber-400">{formatCurrency(item.lineLaborCost)}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-zinc-900 dark:text-white">{formatCurrency(item.linePrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">No material or item details recorded for this order.</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center border border-blue-100 dark:border-blue-900/40">
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Material Cost</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{formatCurrency(materialSubtotal)}</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 text-center border border-amber-100 dark:border-amber-900/40">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Labor Cost</p>
                <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatCurrency(laborSubtotal)}</p>
              </div>
              <div className="bg-zinc-900 dark:bg-zinc-800 rounded-xl p-4 text-center border-2 border-zinc-700">
                <p className="text-xs font-medium text-zinc-400 mb-1">TOTAL PRICE</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(jobOrder.totalPrice || 0)}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Payment Information ── */}
        <div className="mb-5 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white mb-5 flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Payment Information
          </h2>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-200 dark:border-zinc-700 text-center">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Total Amount</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{formatCurrency(jobOrder.totalPrice || 0)}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-100 dark:border-green-900/40 text-center">
              <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Amount Paid</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(totalPaid)}</p>
            </div>
            <div className={`rounded-xl p-4 border text-center ${
              remainingBalance <= 0
                ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900/40'
                : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/40'
            }`}>
              <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${
                remainingBalance <= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>Balance Due</p>
              <p className={`text-2xl font-bold ${
                remainingBalance <= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
              }`}>
                {formatCurrency(remainingBalance)}
              </p>
            </div>
          </div>

          {/* Payment Status Badge */}
          <div className="flex items-center gap-3 mb-5">
            <span className={`px-3 py-1.5 text-sm font-semibold rounded-full ${
              jobOrder.paymentStatus === 'paid'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : jobOrder.paymentStatus === 'partial'
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {(jobOrder.paymentStatus || 'unpaid').toUpperCase()}
            </span>
            {jobOrder.paymentStatus === 'paid' && (
              <span className="text-sm text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Fully settled
              </span>
            )}
          </div>

          {/* Payment History */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Payment History</h3>
            {loadingPayments ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full"></div>
              </div>
            ) : paymentRecords.length === 0 ? (
              <p className="text-sm text-zinc-400 dark:text-zinc-500 italic py-4 text-center">No payments recorded yet.</p>
            ) : (
              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
                <table className="w-full min-w-[500px]">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Date</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Amount</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Method</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Reference</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {paymentRecords.map(record => (
                      <tr key={record.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                        <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                          {new Date(record.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-green-700 dark:text-green-400 text-right">
                          {formatCurrency(record.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 capitalize">
                          {record.paymentMethod.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                          {record.referenceNumber || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                          {record.recordedByName || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Record Payment Button + Form */}
          {canUpdatePaymentStatus && !isFullySettled && (
            <div>
              {!showPaymentForm ? (
                <button
                  type="button"
                  onClick={() => setShowPaymentForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Record Payment
                </button>
              ) : (
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-zinc-50 dark:bg-zinc-800/50">
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    New Payment Entry
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Amount (₱) *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-medium">₱</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={remainingBalance}
                          value={newPaymentAmount}
                          onChange={(e) => setNewPaymentAmount(e.target.value)}
                          className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                          placeholder={`Max: ${formatCurrency(remainingBalance)}`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Payment Method *</label>
                      <select
                        value={newPaymentMethod}
                        onChange={(e) => setNewPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                      >
                        <option value="cash">Cash</option>
                        <option value="gcash">GCash</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="check">Check</option>
                        <option value="credit_card">Credit Card</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Reference Number</label>
                      <input
                        type="text"
                        value={newPaymentRef}
                        onChange={(e) => setNewPaymentRef(e.target.value)}
                        placeholder="GCash ref, check no., etc."
                        className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Notes</label>
                      <input
                        type="text"
                        value={newPaymentNotes}
                        onChange={(e) => setNewPaymentNotes(e.target.value)}
                        placeholder="Optional note"
                        className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => { setShowPaymentForm(false); setNewPaymentAmount(''); setNewPaymentRef(''); setNewPaymentNotes(''); }}
                      className="px-4 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={recordPayment}
                      disabled={savingPayment || !newPaymentAmount || parseFloat(newPaymentAmount) <= 0}
                      className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingPayment ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Save Payment
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {canUpdatePaymentStatus && isFullySettled && (
            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400 font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              This order has been fully paid.
            </div>
          )}
        </div>

        {/* ── Job Financial Summary (completed / delivered only) ── */}
        {(jobOrder.status === 'completed' || jobOrder.status === 'delivered') && (
          <div className="mb-5 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Job Financial Summary
              </h2>
              <span className={`px-3 py-1 text-sm font-bold rounded-full ${
                isProfit
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {isProfit ? 'PROFITABLE' : 'AT A LOSS'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left: Expense Breakdown */}
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-5 border border-zinc-200 dark:border-zinc-700">
                <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">
                  Actual Expense Breakdown
                </h3>

                {/* Materials */}
                {itemBreakdown.some(i => i.lineMaterialCost > 0) && (
                  <div className="mb-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                      Materials
                    </p>
                    <div className="space-y-1">
                      {itemBreakdown.filter(i => i.lineMaterialCost > 0).map((item, idx) => {
                        const inv = item.materialId
                          ? inventoryMaterials.find(m => m.id === item.materialId)
                          : null;
                        const color = inv?.color || '';
                        const pattern = inv?.pattern || '';
                        const detail = [color, pattern].filter(Boolean).join(' · ');
                        return (
                          <div key={idx} className="flex justify-between items-start text-sm py-1.5 border-b border-zinc-200 dark:border-zinc-700 last:border-0">
                            <div className="truncate pr-2">
                              <span className="text-zinc-800 dark:text-zinc-200 font-medium">{item.name || `Item ${idx + 1}`}</span>
                              {detail && (
                                <span className="block text-xs text-zinc-400 dark:text-zinc-500">{detail}</span>
                              )}
                              <span className="block text-xs text-zinc-400 dark:text-zinc-500">Qty: {item.quantity}</span>
                            </div>
                            <span className="text-zinc-700 dark:text-zinc-300 shrink-0 font-medium">{formatCurrency(item.lineMaterialCost)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-1">
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Materials Subtotal</span>
                      <span className="text-sm font-bold text-blue-700 dark:text-blue-400">{formatCurrency(materialSubtotal)}</span>
                    </div>
                  </div>
                )}

                {/* Labor */}
                {itemBreakdown.some(i => i.lineLaborCost > 0) && (
                  <div className="mb-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                      Labor
                    </p>
                    <div className="space-y-1">
                      {itemBreakdown.filter(i => i.lineLaborCost > 0).map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm py-1 border-b border-zinc-200 dark:border-zinc-700 last:border-0">
                          <span className="text-zinc-700 dark:text-zinc-300 truncate pr-2">
                            {item.name || `Task ${idx + 1}`}
                            {item.workerName && (
                              <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-1">({item.workerName})</span>
                            )}
                            <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-1">× {item.quantity}</span>
                          </span>
                          <span className="text-zinc-700 dark:text-zinc-300 shrink-0">{formatCurrency(item.lineLaborCost)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-1">
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Labor Subtotal</span>
                      <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{formatCurrency(laborSubtotal)}</span>
                    </div>
                  </div>
                )}

                {itemBreakdown.length === 0 && (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500 italic mb-4">No items recorded.</p>
                )}

                <div className="flex justify-between items-center pt-2 border-t-2 border-zinc-300 dark:border-zinc-600">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white">Total Expenses</span>
                  <span className="text-xl font-bold text-zinc-900 dark:text-white">{formatCurrency(actualExpenses)}</span>
                </div>
              </div>

              {/* Right: Price Comparison & Profit/Loss */}
              <div className="space-y-3">
                {/* Estimated vs Final comparison */}
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-5 border border-zinc-200 dark:border-zinc-700">
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">
                    Estimated vs. Final Price
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-zinc-200 dark:border-zinc-700">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Estimated Cost</span>
                      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{formatCurrency(estimatedCostQuoted)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-zinc-200 dark:border-zinc-700">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Final Price Charged</span>
                      <span className="text-sm font-semibold text-zinc-900 dark:text-white">{formatCurrency(finalPrice)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Variance</span>
                      <span className={`text-sm font-bold ${priceDiff >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {priceDiff >= 0 ? '+' : ''}{formatCurrency(priceDiff)}
                        <span className="text-xs ml-1 font-medium opacity-80">
                          ({priceDiff >= 0 ? '+' : ''}{priceDiffPct.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Profit/Loss card */}
                <div className={`rounded-xl p-5 border-2 ${
                  isProfit
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {isProfit ? 'Gross Profit' : 'Net Loss'}
                    </span>
                    <svg className={`w-5 h-5 ${isProfit ? 'text-green-500' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {isProfit
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                      }
                    </svg>
                  </div>
                  <div className="flex items-end gap-3">
                    <span className={`text-3xl font-bold ${isProfit ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                      {isProfit ? '' : '-'}{formatCurrency(Math.abs(grossProfit))}
                    </span>
                    <span className={`text-base font-semibold mb-0.5 ${isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      ({isProfit ? '+' : '-'}{Math.abs(profitMarginPct).toFixed(1)}%)
                    </span>
                  </div>
                  <p className={`text-xs mt-2 ${isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {isProfit
                      ? `Revenue of ${formatCurrency(finalPrice)} minus ${formatCurrency(actualExpenses)} in expenses`
                      : `Expenses of ${formatCurrency(actualExpenses)} exceeded revenue of ${formatCurrency(finalPrice)}`
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Bottom Actions ── */}
        <div className="no-print flex flex-wrap gap-3">
          <button
            onClick={printReceipt}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-amber-300 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Receipt
          </button>
          {canEditParts && (
            <button
              onClick={saveOrderParts}
              disabled={savingParts}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-amber-300 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {savingParts ? 'Saving...' : 'Save Parts'}
            </button>
          )}
          {canEditParts && jobOrder.status !== 'cancelled' && jobOrder.status !== 'delivered' && (
            <button
              onClick={() => updateStatus('cancelled')}
              disabled={updating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel Order
            </button>
          )}
        </div>

        {/* ── PRINT RECEIPT (hidden on screen via CSS + inline style) ── */}
        <div id="print-receipt" style={{display:'none', fontFamily:'Arial,Helvetica,sans-serif', color:'#000', fontSize:'10.5pt', lineHeight:'1.5', maxWidth:'680px', margin:'0 auto', padding:'0 8px'}}>

          {/* Header */}
          <div style={{textAlign:'center', borderBottom:'2px solid #000', paddingBottom:'10px', marginBottom:'12px'}}>
            <div style={{fontSize:'18pt', fontWeight:900, letterSpacing:'1px', textTransform:'uppercase'}}>Seatmakers Avenue</div>
            <div style={{fontSize:'9pt', color:'#555', marginTop:'2px'}}>Premium Automotive Upholstery &amp; Custom Seat Covers</div>
            <div style={{fontSize:'9pt', marginTop:'2px'}}>{jobOrder.branchName}</div>
          </div>

          {/* Receipt label + meta row */}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px'}}>
            <div>
              <div style={{fontSize:'13pt', fontWeight:900, textTransform:'uppercase', letterSpacing:'1.5px'}}>Official Receipt</div>
              <div style={{fontSize:'9pt', marginTop:'3px'}}>
                Status: <strong>{jobOrder.status.replace(/_/g,' ').toUpperCase()}</strong>
              </div>
            </div>
            <div style={{fontSize:'9pt', textAlign:'right', lineHeight:'1.7'}}>
              <div><strong style={{fontSize:'10pt'}}>{jobOrder.jobOrderId}</strong></div>
              <div>Date: {new Date(jobOrder.createdAt).toLocaleDateString('en-PH',{month:'long',day:'numeric',year:'numeric'})}</div>
              {jobOrder.completedAt && (
                <div>Completed: {new Date(jobOrder.completedAt).toLocaleDateString('en-PH',{month:'long',day:'numeric',year:'numeric'})}</div>
              )}
            </div>
          </div>

          <hr style={{border:'none', borderTop:'1px solid #000', margin:'0 0 10px'}} />

          {/* Customer + Vehicle */}
          <div style={{display:'flex', gap:'24px', marginBottom:'10px'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:'8pt', fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', color:'#555', marginBottom:'4px'}}>Bill To</div>
              <div style={{fontWeight:700}}>{jobOrder.customerName}</div>
              {jobOrder.customerPhone && <div style={{fontSize:'9.5pt'}}>Tel: {jobOrder.customerPhone}</div>}
              {jobOrder.customerEmail && <div style={{fontSize:'9.5pt'}}>{jobOrder.customerEmail}</div>}
            </div>
            {jobOrder.vehicleInfo && (
              <div style={{flex:1}}>
                <div style={{fontSize:'8pt', fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', color:'#555', marginBottom:'4px'}}>Vehicle</div>
                <div style={{fontWeight:700}}>{[jobOrder.vehicleInfo.make, jobOrder.vehicleInfo.model, jobOrder.vehicleInfo.year].filter(Boolean).join(' ')}</div>
                {jobOrder.vehicleInfo.plateNumber && <div style={{fontSize:'9.5pt'}}>Plate: {jobOrder.vehicleInfo.plateNumber}</div>}
                {jobOrder.vehicleInfo.color && <div style={{fontSize:'9.5pt'}}>Color: {jobOrder.vehicleInfo.color}</div>}
              </div>
            )}
          </div>

          {jobOrder.description && (
            <div style={{fontSize:'9.5pt', marginBottom:'10px', color:'#333'}}>
              <span style={{fontWeight:700}}>Services: </span>{jobOrder.description}
            </div>
          )}

          <hr style={{border:'none', borderTop:'2px solid #000', margin:'0 0 8px'}} />

          {/* Items table */}
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'9.5pt', marginBottom:'8px'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #000'}}>
                <th style={{textAlign:'left', padding:'4px 6px', fontWeight:700}}>Item</th>
                <th style={{textAlign:'right', padding:'4px 6px', fontWeight:700, width:'50px'}}>Qty</th>
                <th style={{textAlign:'right', padding:'4px 6px', fontWeight:700, width:'100px'}}>Unit Price</th>
                <th style={{textAlign:'right', padding:'4px 6px', fontWeight:700, width:'100px'}}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {itemBreakdown.map((item, i) => (
                <tr key={i} style={{borderBottom:'1px solid #eee'}}>
                  <td style={{padding:'4px 6px'}}>{item.name}{item.workerName ? ` (${item.workerName})` : ''}</td>
                  <td style={{textAlign:'right', padding:'4px 6px'}}>{item.quantity}</td>
                  <td style={{textAlign:'right', padding:'4px 6px'}}>{formatCurrency(item.unitPrice)}</td>
                  <td style={{textAlign:'right', padding:'4px 6px'}}>{formatCurrency(item.linePrice)}</td>
                </tr>
              ))}
              {itemBreakdown.length === 0 && (
                <tr><td colSpan={4} style={{padding:'10px 6px', textAlign:'center', color:'#888', fontStyle:'italic'}}>No items on record.</td></tr>
              )}
            </tbody>
          </table>

          {/* Payment summary */}
          <div style={{display:'flex', justifyContent:'flex-end', marginBottom:'14px'}}>
            <table style={{fontSize:'10pt', borderCollapse:'collapse', minWidth:'260px'}}>
              <tbody>
                {materialSubtotal > 0 && <tr><td style={{padding:'3px 8px', color:'#555'}}>Materials</td><td style={{padding:'3px 8px', textAlign:'right'}}>{formatCurrency(materialSubtotal)}</td></tr>}
                {laborSubtotal > 0   && <tr><td style={{padding:'3px 8px', color:'#555'}}>Labor</td><td style={{padding:'3px 8px', textAlign:'right'}}>{formatCurrency(laborSubtotal)}</td></tr>}
                <tr style={{borderTop:'2px solid #000'}}>
                  <td style={{padding:'5px 8px', fontWeight:900, fontSize:'11pt'}}>Total</td>
                  <td style={{padding:'5px 8px', textAlign:'right', fontWeight:900, fontSize:'11pt'}}>{formatCurrency(jobOrder.totalPrice || 0)}</td>
                </tr>
                <tr>
                  <td style={{padding:'3px 8px'}}>Amount Paid</td>
                  <td style={{padding:'3px 8px', textAlign:'right'}}>{formatCurrency(jobOrder.downPayment || 0)}</td>
                </tr>
                <tr>
                  <td style={{padding:'3px 8px', fontWeight:700, color:(jobOrder.balance||0)<=0?'#1a6e1a':'#b91c1c'}}>
                    {(jobOrder.balance||0)<=0 ? 'Fully Paid' : 'Balance Due'}
                  </td>
                  <td style={{padding:'3px 8px', textAlign:'right', fontWeight:700, color:(jobOrder.balance||0)<=0?'#1a6e1a':'#b91c1c'}}>
                    {formatCurrency(Math.max(0, jobOrder.balance||0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <hr style={{border:'none', borderTop:'1px solid #000', margin:'0 0 20px'}} />

          {/* Signature lines */}
          <div style={{display:'flex', gap:'40px', marginBottom:'24px'}}>
            <div style={{flex:1, textAlign:'center'}}>
              <div style={{height:'40px'}} />
              <div style={{borderTop:'1px solid #000', paddingTop:'4px', fontSize:'9pt'}}>Authorized Signature</div>
            </div>
            <div style={{flex:1, textAlign:'center'}}>
              <div style={{height:'40px'}} />
              <div style={{borderTop:'1px solid #000', paddingTop:'4px', fontSize:'9pt'}}>Customer Signature</div>
            </div>
          </div>

          {/* Footer */}
          <div style={{textAlign:'center', fontSize:'8.5pt', color:'#555', borderTop:'1px dashed #aaa', paddingTop:'8px'}}>
            <div>Thank you for choosing <strong>Seatmakers Avenue</strong>!</div>
            <div style={{marginTop:'2px'}}>This is your official receipt. Please keep this for your records.</div>
            <div style={{marginTop:'2px', fontSize:'8pt'}}>Printed: {new Date().toLocaleDateString('en-PH',{month:'long',day:'numeric',year:'numeric'})}</div>
          </div>

        </div>

      </main>
    </div>
  );
}
