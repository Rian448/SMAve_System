'use client';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, type FinishedGood, type RawMaterial } from '@/lib/api';

interface MaterialItem {
  id: string;
  materialSource: 'inventory' | 'custom';
  materialId?: number | '';
  name: string;
  quantity: number;
  unitPrice: number;
}

interface LaborItem {
  description: string;
  hours: number;
  rate: number;
}

interface PremadeSelection {
  id: string;
  productId: number | '';
  quantity: number;
}

const SERVICE_ICONS: Record<string, ReactElement> = {
  flooring: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  reupholstery: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  ceiling: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  ),
  sidings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    </svg>
  ),
  seatCovers: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  other: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  ),
};

export default function NewJobOrderPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderType, setOrderType] = useState<'normal' | 'premade'>('normal');
  const [step, setStep] = useState(1);
  const [premadeStep, setPremadeStep] = useState(1);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const premadeSelectionIdRef = useRef(1);
  const [premadeSelections, setPremadeSelections] = useState<PremadeSelection[]>([
    { id: 'premade-1', productId: '', quantity: 1 }
  ]);
  const [premadeItems, setPremadeItems] = useState<FinishedGood[]>([]);
  const [premadeLoading, setPremadeLoading] = useState(false);
  const [inventoryMaterials, setInventoryMaterials] = useState<RawMaterial[]>([]);

  // Customer Information
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Vehicle Information
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [reupholsteryItemType, setReupholsteryItemType] = useState('');

  // Service Information
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState('');
  const [priority, setPriority] = useState('normal');

  // Services Selection
  const [flooring, setFlooring] = useState({ selected: false, material: '' });
  const [reupholstery, setReupholstery] = useState({ selected: false, material: '' });
  const [ceiling, setCeiling] = useState({ selected: false, material: '' });
  const [sidings, setSidings] = useState({ selected: false, material: '' });
  const [seatCovers, setSeatCovers] = useState({
    selected: false,
    design: '',
    material: '',
    pocket: '',
    others: ''
  });
  const [otherServices, setOtherServices] = useState({ selected: false, description: '' });

  // Materials and Labor
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [labor, setLabor] = useState<LaborItem[]>([]);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  const [downPayment, setDownPayment] = useState(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const loadPremadeItems = async () => {
      if (orderType !== 'premade') return;
      setPremadeLoading(true);
      try {
        const response = await api.inventory.getFinishedGoods(
          user?.branchId ? { branchId: user.branchId } : undefined
        );
        setPremadeItems(response.data || []);
      } catch (err) {
        console.error(err);
        setError('Failed to load premade inventory items.');
      } finally {
        setPremadeLoading(false);
      }
    };
    loadPremadeItems();
  }, [orderType, user?.branchId]);

  useEffect(() => {
    const loadInventoryMaterials = async () => {
      if (orderType !== 'normal') return;
      try {
        const response = await api.inventory.getRawMaterials(
          user?.branchId ? { branchId: user.branchId, includeWarehouse: true } : undefined
        );
        setInventoryMaterials(response.data || []);
      } catch (err) {
        console.error('Failed to load inventory materials:', err);
      }
    };
    loadInventoryMaterials();
  }, [orderType, user?.branchId]);

  const addPremadeSelection = () => {
    premadeSelectionIdRef.current += 1;
    setPremadeSelections((prev) => [
      ...prev,
      { id: `premade-${premadeSelectionIdRef.current}`, productId: '', quantity: 1 }
    ]);
  };

  const removePremadeSelection = (id: string) => {
    setPremadeSelections((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((selection) => selection.id !== id);
    });
  };

  const updatePremadeSelection = (id: string, field: keyof PremadeSelection, value: number | '') => {
    setPremadeSelections((prev) =>
      prev.map((selection) =>
        selection.id === id ? { ...selection, [field]: value } : selection
      )
    );
  };

  const premadeTotal = premadeSelections.reduce((sum, selection) => {
    if (!selection.productId) return sum;
    const item = premadeItems.find((premadeItem) => premadeItem.id === selection.productId);
    if (!item) return sum;
    return sum + (item.price * selection.quantity);
  }, 0);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orderType === 'normal' && step < 5) {
      setStep(step + 1);
      return;
    }
    if (orderType === 'premade' && premadeStep === 1) {
      if (!customerName.trim() || !customerPhone.trim()) {
        setError('Customer name and phone are required.');
        return;
      }
      const hasItems = premadeSelections.some(s => s.productId);
      if (!hasItems) {
        setError('Please select at least one premade inventory item.');
        return;
      }
      setError('');
      setPremadeStep(2);
      return;
    }
    setLoading(true);
    setError('');

    if (orderType === 'premade') {
      const selectedPremadeItems = premadeSelections.filter(
        (selection) => selection.productId && selection.quantity > 0
      );

      if (!customerName.trim() || !customerPhone.trim()) {
        setError('Customer name and phone are required for premade orders.');
        setLoading(false);
        return;
      }

      if (selectedPremadeItems.length === 0) {
        setError('Please select at least one premade inventory item.');
        setLoading(false);
        return;
      }

      const requestedByProduct = new Map<number, number>();
      for (const selection of selectedPremadeItems) {
        const productId = selection.productId as number;
        requestedByProduct.set(productId, (requestedByProduct.get(productId) || 0) + selection.quantity);
      }

      for (const [productId, totalRequested] of requestedByProduct.entries()) {
        const product = premadeItems.find((item) => item.id === productId);
        if (!product) {
          setError('One or more selected premade items are no longer available.');
          setLoading(false);
          return;
        }
        if (totalRequested > Number(product.quantity)) {
          setError(`Requested quantity for ${product.name} exceeds available stock (${product.quantity}).`);
          setLoading(false);
          return;
        }
      }

      try {
        const selectedProducts = selectedPremadeItems
          .map((selection) => premadeItems.find((item) => item.id === selection.productId))
          .filter((item): item is FinishedGood => Boolean(item));

        if (selectedProducts.length === 0) {
          setError('Selected finished goods are no longer available. Please reselect items.');
          setLoading(false);
          return;
        }

        const inferredBranchId = selectedProducts[0].branchId;
        const mixedBranch = selectedProducts.some((item) => item.branchId !== inferredBranchId);
        if (mixedBranch) {
          setError('Please select finished goods from one branch only.');
          setLoading(false);
          return;
        }

        const branchId = user?.branchId || inferredBranchId;
        if (user?.branchId && user.branchId !== inferredBranchId) {
          setError('Selected finished goods do not match your assigned branch.');
          setLoading(false);
          return;
        }

        const premadeNotes = [notes, `Order Source: Walk-in`, `Payment Method: ${paymentMethod}`]
          .filter(Boolean).join('\n');

        await api.productOrders.create({
          customerName,
          customerPhone,
          customerEmail,
          customerAddress,
          branchId,
          notes: premadeNotes,
          paymentAmount: typeof paymentAmount === 'number' ? paymentAmount : 0,
          items: selectedPremadeItems.map((selection) => ({
            productId: selection.productId as number,
            quantity: selection.quantity
          }))
        });

        router.push('/product-orders');
      } catch (err) {
        const errorMessage = err instanceof Error && err.message
          ? err.message
          : 'Failed to create premade order. Please try again.';
        setError(errorMessage);
        console.error(err);
      } finally {
        setLoading(false);
      }
      return;
    }

    const selectedServices = [];
    if (flooring.selected) selectedServices.push({ type: 'flooring', material: flooring.material });
    if (reupholstery.selected) selectedServices.push({ type: 'reupholstery', material: reupholstery.material, itemType: reupholsteryItemType.trim() || undefined });
    if (ceiling.selected) selectedServices.push({ type: 'ceiling', material: ceiling.material });
    if (sidings.selected) selectedServices.push({ type: 'sidings', material: sidings.material });
    if (seatCovers.selected) selectedServices.push({ type: 'seat_covers', design: seatCovers.design, material: seatCovers.material, pocket: seatCovers.pocket, others: seatCovers.others });
    if (otherServices.selected) selectedServices.push({ type: 'other', description: otherServices.description });

    if (selectedServices.length === 0) {
      setError('Please select at least one service');
      setLoading(false);
      return;
    }

    for (const material of materials) {
      if (material.materialSource === 'inventory' && !material.materialId) {
        setError('Please select an inventory material or choose Type new material.');
        setLoading(false);
        return;
      }
      if (!material.name.trim()) {
        setError('Please provide a material name for all material rows.');
        setLoading(false);
        return;
      }
    }

    if (reupholstery.selected && !reupholsteryItemType.trim()) {
      setError('Please specify what furniture or item will be reupholstered.');
      setLoading(false);
      return;
    }

    const branchId = user?.branchId || 1;
    if (!branchId) {
      setError('Unable to determine branch for this job order.');
      setLoading(false);
      return;
    }

    const normalizedItems = materials.map((material) => ({
      name: material.name.trim(),
      quantity: Number(material.quantity) || 0,
      unitPrice: Number(material.unitPrice) || 0,
      materialCost: Number(material.unitPrice) || 0,
      laborCost: 0
    }));

    if (normalizedItems.length === 0) {
      normalizedItems.push({ name: 'Service Package', quantity: 1, unitPrice: 0, materialCost: 0, laborCost: 0 });
    }

    if (labor.length > 0) {
      const totalLaborCost = labor.reduce(
        (sum, item) => sum + ((Number(item.hours) || 0) * (Number(item.rate) || 0)),
        0
      );
      normalizedItems[0].laborCost = totalLaborCost;
    }

    const serviceDescription = selectedServices
      .map((service: any) => {
        if (service.type === 'reupholstery' && service.itemType) return `reupholstery (${service.itemType})`;
        return service.type;
      })
      .join(', ');

    const computedVehicleInfo = reupholstery.selected
      ? { make: 'Reupholstery', model: reupholsteryItemType.trim(), year: new Date().getFullYear(), plateNumber: '' }
      : { make: vehicleMake || 'N/A', model: vehicleModel || 'N/A', year: Number(vehicleYear) || new Date().getFullYear(), plateNumber: vehiclePlate || '' };

    const estimatedCompletion = estimatedCompletionDate || new Date().toISOString().slice(0, 10);

    try {
      const jobOrderData = {
        customerName,
        customerPhone,
        customerEmail,
        branchId,
        description: serviceDescription || 'Custom service order',
        vehicleInfo: computedVehicleInfo,
        items: normalizedItems,
        estimatedCompletion,
        downPayment,
        paymentMethod,
        notes,
        ...(estimatedTotal > 0 ? { estimatedCost: estimatedTotal, totalPrice: estimatedTotal } : {})
      };

      const createResponse = await api.sales.createJobOrder(jobOrderData as any);
      const createdJobOrderId = (createResponse.data as any)?.jobOrderId || 'PENDING-JO';
      const customNeededMaterials = materials.filter(
        (material) => material.materialSource === 'custom' && material.name.trim()
      );

      if (customNeededMaterials.length > 0) {
        try {
          await Promise.all(
            customNeededMaterials.map((material) =>
              api.inventory.createRawMaterial({
                materialType: material.name.trim(),
                color: '',
                pattern: '',
                unitPrice: Number(material.unitPrice) || 0,
                stockQuantity: 0,
                branchId: user?.branchId || 1,
                status: 'needed',
                sourceJobOrderId: createdJobOrderId
              })
            )
          );
        } catch (customMaterialErr) {
          console.error('Failed to save some needed materials:', customMaterialErr);
        }
      }

      router.push('/sales');
    } catch (err) {
      const errorMessage = err instanceof Error && err.message
        ? err.message
        : 'Failed to create job order. Please try again.';
      setError(errorMessage);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const premadePaymentAmount = typeof paymentAmount === 'number' ? paymentAmount : 0;
  const isPremadeFullPayment = premadePaymentAmount >= premadeTotal && premadeTotal > 0;
  const isPremadePartialPayment = premadePaymentAmount > 0 && premadePaymentAmount < premadeTotal;
  const premadeRemaining = Math.max(0, premadeTotal - premadePaymentAmount);

  const renderPremadeForm = () => {
    if (premadeStep === 1) {
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Walk-in Premade Order</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Step 1 of 2 — Customer & Items</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Customer Name *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Walk-in customer name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Phone Number *</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="09XX XXX XXXX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Email Address</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="customer@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Address</label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Customer address"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Finished Goods</h3>
              <button
                type="button"
                onClick={addPremadeSelection}
                className="inline-flex items-center px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
              >
                + Add Item
              </button>
            </div>

            {premadeLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 py-4">
                <div className="animate-spin w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full"></div>
                Loading premade inventory...
              </div>
            ) : (
              <>
                {premadeItems.length === 0 && (
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">No finished goods found in inventory.</div>
                )}
                <div className="space-y-3">
                  {premadeSelections.map((selection) => {
                    const selectedItem = premadeItems.find((item) => item.id === selection.productId);
                    return (
                      <div key={selection.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700">
                        <div className="md:col-span-7">
                          <select
                            value={selection.productId}
                            onChange={(e) => updatePremadeSelection(selection.id, 'productId', e.target.value ? Number(e.target.value) : '')}
                            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                            disabled={premadeItems.length === 0}
                          >
                            <option value="">Select finished good item</option>
                            {premadeItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.sku}) - Stock: {item.quantity} - ₱{item.price.toLocaleString()}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <input
                            type="number"
                            min={1}
                            max={selectedItem ? Number(selectedItem.quantity) : undefined}
                            value={selection.quantity}
                            onChange={(e) => {
                              const nextValue = Math.max(1, parseInt(e.target.value) || 1);
                              const boundedValue = selectedItem ? Math.min(nextValue, Number(selectedItem.quantity)) : nextValue;
                              updatePremadeSelection(selection.id, 'quantity', boundedValue);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="md:col-span-2 flex items-center text-sm font-semibold text-zinc-900 dark:text-white">
                          {selectedItem ? `₱${(selectedItem.price * selection.quantity).toLocaleString()}` : '—'}
                        </div>
                        <div className="md:col-span-1 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => removePremadeSelection(selection.id)}
                            disabled={premadeSelections.length === 1}
                            className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex justify-between items-center">
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Order Total</span>
            <span className="text-xl font-bold text-amber-700 dark:text-amber-400">₱{premadeTotal.toLocaleString()}</span>
          </div>
        </div>
      );
    }

    // Step 2: Payment
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Payment</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Step 2 of 2 — Review & Payment</p>
        </div>

        {/* Order Summary */}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-2">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Order Summary</p>
          <div className="flex justify-between text-sm text-zinc-700 dark:text-zinc-300">
            <span>Customer</span>
            <span className="font-medium text-zinc-900 dark:text-white">{customerName}</span>
          </div>
          <div className="flex justify-between text-sm text-zinc-700 dark:text-zinc-300">
            <span>Items</span>
            <span className="font-medium text-zinc-900 dark:text-white">
              {premadeSelections.filter(s => s.productId).length} item(s)
            </span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700">
            <span className="font-semibold text-zinc-900 dark:text-white">Total Due</span>
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">₱{premadeTotal.toLocaleString()}</span>
          </div>
        </div>

        {/* Amount to Pay */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Amount to Pay
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 font-medium">₱</span>
            <input
              type="number"
              min="0"
              step="0.01"
              max={premadeTotal}
              value={paymentAmount}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                setPaymentAmount(val === '' ? '' : (isNaN(val as number) ? '' : val as number));
              }}
              className="w-full pl-8 pr-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent text-lg"
              placeholder="0.00"
            />
          </div>

          {/* Payment type indicator */}
          {premadePaymentAmount > 0 && (
            <div className="mt-3 space-y-2">
              {isPremadeFullPayment ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-semibold text-green-700 dark:text-green-400">Full Payment — Order will be marked as Paid</span>
                </div>
              ) : isPremadePartialPayment ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Partial Payment</span>
                  </div>
                  <div className="flex justify-between text-sm text-amber-700 dark:text-amber-300 pl-7">
                    <span>Remaining balance:</span>
                    <span className="font-bold">₱{premadeRemaining.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 pl-7">The remaining balance can be settled from the order detail page.</p>
                </div>
              ) : null}
            </div>
          )}

          {paymentAmount === '' || premadePaymentAmount === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">Leave at ₱0 to record as unpaid.</p>
          ) : null}
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Payment Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          >
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit_card">Credit Card</option>
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Additional Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            placeholder="Walk-in order notes"
          />
        </div>
      </div>
    );
  };

  const STEPS = [
    { num: 1, label: 'Name', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )},
    { num: 2, label: 'Service', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )},
    { num: 3, label: 'Contact', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    )},
    { num: 4, label: reupholstery.selected ? 'Item' : 'Vehicle', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l1 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1" />
      </svg>
    )},
    { num: 5, label: 'Review', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
  ];

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Who is this order for?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Enter the customer's name to get started</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent text-lg"
                placeholder="e.g. Juan dela Cruz"
                autoFocus
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Select Services</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Choose one or more services needed</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* Flooring */}
              <div
                onClick={() => setFlooring({ ...flooring, selected: !flooring.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                  flooring.selected
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    flooring.selected ? 'border-amber-500 bg-amber-500' : 'border-zinc-300 dark:border-zinc-600'
                  }`}>
                    {flooring.selected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`${flooring.selected ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {SERVICE_ICONS.flooring}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-white">Flooring</span>
                    </div>
                    <ul className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 space-y-0.5">
                      <li>• Auto Standard carpet material</li>
                      <li>• All sides trim • With rebonded foam underlay</li>
                    </ul>
                    {flooring.selected && (
                      <input
                        type="text"
                        value={flooring.material}
                        onChange={(e) => { e.stopPropagation(); setFlooring({ ...flooring, material: e.target.value }); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Reupholstery */}
              <div
                onClick={() => setReupholstery({ ...reupholstery, selected: !reupholstery.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                  reupholstery.selected
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    reupholstery.selected ? 'border-amber-500 bg-amber-500' : 'border-zinc-300 dark:border-zinc-600'
                  }`}>
                    {reupholstery.selected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`${reupholstery.selected ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {SERVICE_ICONS.reupholstery}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-white">Reupholstery</span>
                    </div>
                    <ul className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 space-y-0.5">
                      <li>• Auto Standard material • Class A Uratex foam</li>
                      <li>• Includes spring & frame repair</li>
                    </ul>
                    {reupholstery.selected && (
                      <input
                        type="text"
                        value={reupholstery.material}
                        onChange={(e) => { e.stopPropagation(); setReupholstery({ ...reupholstery, material: e.target.value }); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Ceiling */}
              <div
                onClick={() => setCeiling({ ...ceiling, selected: !ceiling.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                  ceiling.selected
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    ceiling.selected ? 'border-amber-500 bg-amber-500' : 'border-zinc-300 dark:border-zinc-600'
                  }`}>
                    {ceiling.selected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`${ceiling.selected ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {SERVICE_ICONS.ceiling}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-white">Ceiling</span>
                    </div>
                    <ul className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 space-y-0.5">
                      <li>• Auto Standard ceiling material • Heat insulation</li>
                      <li>• Includes all post and sunvisor</li>
                    </ul>
                    {ceiling.selected && (
                      <input
                        type="text"
                        value={ceiling.material}
                        onChange={(e) => { e.stopPropagation(); setCeiling({ ...ceiling, material: e.target.value }); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Sidings */}
              <div
                onClick={() => setSidings({ ...sidings, selected: !sidings.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                  sidings.selected
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    sidings.selected ? 'border-amber-500 bg-amber-500' : 'border-zinc-300 dark:border-zinc-600'
                  }`}>
                    {sidings.selected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`${sidings.selected ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {SERVICE_ICONS.sidings}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-white">Sidings</span>
                    </div>
                    <ul className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 space-y-0.5">
                      <li>• Electric pressed design • With 1/8 plyboard base</li>
                      <li>• Note: SIDINGS clips not included (₱5.00 each)</li>
                    </ul>
                    {sidings.selected && (
                      <input
                        type="text"
                        value={sidings.material}
                        onChange={(e) => { e.stopPropagation(); setSidings({ ...sidings, material: e.target.value }); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Seat Covers */}
              <div
                onClick={() => setSeatCovers({ ...seatCovers, selected: !seatCovers.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                  seatCovers.selected
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    seatCovers.selected ? 'border-amber-500 bg-amber-500' : 'border-zinc-300 dark:border-zinc-600'
                  }`}>
                    {seatCovers.selected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`${seatCovers.selected ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {SERVICE_ICONS.seatCovers}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-white">Seat Covers</span>
                    </div>
                    {seatCovers.selected && (
                      <div className="mt-3 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                        <input type="text" value={seatCovers.design} onChange={(e) => setSeatCovers({ ...seatCovers, design: e.target.value })} placeholder="Design" className="w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                        <input type="text" value={seatCovers.material} onChange={(e) => setSeatCovers({ ...seatCovers, material: e.target.value })} placeholder="Material" className="w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                        <input type="text" value={seatCovers.pocket} onChange={(e) => setSeatCovers({ ...seatCovers, pocket: e.target.value })} placeholder="Pocket" className="w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                        <input type="text" value={seatCovers.others} onChange={(e) => setSeatCovers({ ...seatCovers, others: e.target.value })} placeholder="Others" className="w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Other Services */}
              <div
                onClick={() => setOtherServices({ ...otherServices, selected: !otherServices.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                  otherServices.selected
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    otherServices.selected ? 'border-amber-500 bg-amber-500' : 'border-zinc-300 dark:border-zinc-600'
                  }`}>
                    {otherServices.selected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`${otherServices.selected ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {SERVICE_ICONS.other}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-white">Other Services</span>
                    </div>
                    {otherServices.selected && (
                      <input
                        type="text"
                        value={otherServices.description}
                        onChange={(e) => { e.stopPropagation(); setOtherServices({ ...otherServices, description: e.target.value }); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Describe your service needs"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Estimated Completion Date</label>
                <input
                  type="date"
                  value={estimatedCompletionDate}
                  onChange={(e) => setEstimatedCompletionDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Customer Contact Details</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">How can we reach {customerName || 'the customer'}?</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="09XX XXX XXXX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Email Address</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="customer@email.com"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Address</label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="123 Main St, City"
                />
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                {reupholstery.selected ? 'Reupholstery Item Details' : 'Vehicle Information'}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {reupholstery.selected ? 'What item needs to be reupholstered?' : 'Tell us about the vehicle'}
              </p>
            </div>
            {reupholstery.selected ? (
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Furniture or item to reupholster <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={reupholsteryItemType}
                  onChange={(e) => setReupholsteryItemType(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="e.g. Sofa set, dining chair, office chair, motorcycle seat"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Vehicle Make <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={vehicleMake}
                    onChange={(e) => setVehicleMake(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Toyota"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Vehicle Model <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Fortuner"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Year <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={vehicleYear}
                    onChange={(e) => setVehicleYear(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="2023"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Plate Number</label>
                  <input
                    type="text"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="ABC 1234"
                  />
                </div>
              </div>
            )}
          </div>
        );

      case 5:
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Review & Submit</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Confirm the job order details before submitting</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-200 dark:border-zinc-700">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Customer</p>
                <p className="font-semibold text-zinc-900 dark:text-white text-base">{customerName || '—'}</p>
                {customerPhone && <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">{customerPhone}</p>}
                {customerEmail && <p className="text-sm text-zinc-500 dark:text-zinc-400">{customerEmail}</p>}
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-200 dark:border-zinc-700">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                  {reupholstery.selected ? 'Item' : 'Vehicle'}
                </p>
                <p className="font-semibold text-zinc-900 dark:text-white text-base">
                  {reupholstery.selected
                    ? (reupholsteryItemType.trim() || 'Reupholstery item')
                    : `${vehicleMake || '—'} ${vehicleModel || ''}`.trim()}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {reupholstery.selected ? 'Reupholstery request' : `${vehicleYear || ''} ${vehiclePlate || ''}`.trim() || '—'}
                </p>
              </div>
            </div>

            {/* Services */}
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2">Selected Services</p>
              <div className="flex flex-wrap gap-2">
                {[
                  flooring.selected && 'Flooring',
                  reupholstery.selected && `Reupholstery${reupholsteryItemType.trim() ? ` (${reupholsteryItemType.trim()})` : ''}`,
                  ceiling.selected && 'Ceiling',
                  sidings.selected && 'Sidings',
                  seatCovers.selected && 'Seat Covers',
                  otherServices.selected && 'Other Services'
                ].filter(Boolean).map((service) => (
                  <span key={service as string} className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-sm font-medium rounded-full">
                    {service}
                  </span>
                ))}
                {![flooring.selected, reupholstery.selected, ceiling.selected, sidings.selected, seatCovers.selected, otherServices.selected].some(Boolean) && (
                  <span className="text-sm text-amber-600 dark:text-amber-400">No services selected yet</span>
                )}
              </div>
              {estimatedCompletionDate && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                  Est. completion: {new Date(estimatedCompletionDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Note</p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Materials, labor, and final pricing will be added by admin or supervisor after the job order is created.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Estimated Total Amount for the Work
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 font-medium">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={estimatedTotal || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setEstimatedTotal(val);
                      setDownPayment(val / 2);
                    }}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Down Payment (50%)</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Half of estimated total</p>
                </div>
                <span className="text-xl font-bold text-amber-700 dark:text-amber-400">
                  ₱{downPayment.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Additional Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                placeholder="Any special instructions or notes..."
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">New Job Order</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Create a new service order for a customer</p>
        </div>

        {/* Order Type Selector */}
        <div className="mb-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Order Type</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOrderType('normal')}
              className={`text-left px-4 py-3.5 rounded-xl border-2 transition-all ${
                orderType === 'normal'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-amber-300 dark:hover:border-amber-800'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <div className="font-semibold">Normal Job Order</div>
              </div>
              <div className="text-xs opacity-70">Custom service work order flow</div>
            </button>
            <button
              type="button"
              onClick={() => setOrderType('premade')}
              className={`text-left px-4 py-3.5 rounded-xl border-2 transition-all ${
                orderType === 'premade'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-amber-300 dark:hover:border-amber-800'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <div className="font-semibold">Premade Order</div>
              </div>
              <div className="text-xs opacity-70">Walk-in sale from finished goods inventory</div>
            </button>
          </div>
        </div>

        {/* Step Indicator (Normal orders only) */}
        {orderType === 'normal' && (
          <div className="mb-6">
            <div className="flex items-start justify-between">
              {STEPS.map((s, index) => (
                <div key={s.num} className="flex items-start flex-1">
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => setStep(s.num)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-200 ${
                        step > s.num
                          ? 'bg-amber-600 text-white shadow-md'
                          : step === s.num
                          ? 'bg-amber-600 text-white shadow-lg ring-4 ring-amber-200 dark:ring-amber-900/50'
                          : 'bg-white dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500'
                      }`}
                    >
                      {step > s.num ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : s.num}
                    </button>
                    <span className={`mt-1.5 text-xs font-medium hidden sm:block ${
                      step >= s.num ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'
                    }`}>
                      {s.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mt-5 mx-1 rounded-full transition-colors duration-300 ${
                      step > s.num ? 'bg-amber-500' : 'bg-zinc-200 dark:bg-zinc-700'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form Card */}
        <form onSubmit={handleSubmit}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-5">
            {orderType === 'normal' ? renderStep() : renderPremadeForm()}
          </div>

          {/* Navigation Buttons */}
          {orderType === 'normal' ? (
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={step === 1}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-colors ${
                  step === 1
                    ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed'
                    : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>
              {step < 5 ? (
                <button
                  key="next-btn"
                  type="button"
                  onClick={(e) => { e.preventDefault(); setStep(step + 1); }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors shadow-sm"
                >
                  Next
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button
                  key="submit-btn"
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Create Job Order
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="flex justify-between gap-3">
              {premadeStep === 1 ? (
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setError(''); setPremadeStep(1); }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
              )}
              <div className="flex gap-3">
                {premadeStep === 2 && (
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Creating...
                    </>
                  ) : premadeStep === 1 ? (
                    <>
                      Next
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Create Premade Order
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
