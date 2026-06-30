'use client';
import { formatDate } from '@/lib/dateUtils';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, type Customer, type FinishedGood, type RawMaterial } from '@/lib/api';

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

interface SlipRow {
  description: string;
  hr: string;
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
  const materialIdRef = useRef(0);
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
  const [linkedCustomerId, setLinkedCustomerId] = useState<number | null>(null);
  const [linkedCustomerDiscount, setLinkedCustomerDiscount] = useState<number | null>(null);
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const customerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    selected: false, design: '', material: '', pocket: '', others: ''
  });
  const [otherServices, setOtherServices] = useState({ selected: false, description: '' });

  // Materials and Labor
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [labor] = useState<LaborItem[]>([]);

  // Slip data (Job Order Slip fields from physical form)
  const [slipRows, setSlipRows] = useState<SlipRow[]>([
    { description: '', hr: '' },
    { description: '', hr: '' },
    { description: '', hr: '' },
    { description: '', hr: '' },
  ]);
  const [materialCenter, setMaterialCenter] = useState('');
  const [materialSides, setMaterialSides] = useState('');
  const [materialBack, setMaterialBack] = useState('');
  const [dStitch, setDStitch] = useState('');
  const [piping, setPiping] = useState('');
  const [pockets, setPockets] = useState('');
  const [logo, setLogo] = useState('');
  const [specification, setSpecification] = useState('');
  const [cutterName, setCutterName] = useState('');
  const [sewerName, setSewerName] = useState('');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [profitMargin, setProfitMargin] = useState(250);
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

  useEffect(() => {
    if (linkedCustomerId) return; // already linked, don't re-search
    const q = customerPhone.trim() || customerEmail.trim() || customerName.trim();
    if (q.length < 2) { setCustomerSuggestions([]); return; }
    if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current);
    customerSearchTimerRef.current = setTimeout(async () => {
      setSearchingCustomer(true);
      try {
        const res = await api.customers.search(q);
        setCustomerSuggestions(res.data || []);
      } catch { setCustomerSuggestions([]); }
      finally { setSearchingCustomer(false); }
    }, 500);
    return () => { if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current); };
  }, [customerName, customerPhone, customerEmail, linkedCustomerId]);

  const linkCustomer = (c: Customer) => {
    setLinkedCustomerId(c.id);
    setLinkedCustomerDiscount(c.discountPercent ?? null);
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerEmail(c.email);
    setCustomerAddress(c.address);
    setCustomerSuggestions([]);
  };

  const unlinkCustomer = () => {
    setLinkedCustomerId(null);
    setLinkedCustomerDiscount(null);
    setCustomerSuggestions([]);
  };

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
      return prev.filter((s) => s.id !== id);
    });
  };

  const updatePremadeSelection = (id: string, field: keyof PremadeSelection, value: number | '') => {
    setPremadeSelections((prev) =>
      prev.map((s) => s.id === id ? { ...s, [field]: value } : s)
    );
  };

  const addMaterial = () => {
    materialIdRef.current += 1;
    setMaterials((prev) => [
      ...prev,
      { id: `mat-${materialIdRef.current}`, materialSource: 'inventory', materialId: '', name: '', quantity: 1, unitPrice: 0 }
    ]);
  };

  const removeMaterial = (id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMaterial = (id: string, field: keyof MaterialItem, value: string | number | '') => {
    setMaterials((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, [field]: value };
        if (field === 'materialId' && value) {
          const inv = inventoryMaterials.find((i) => i.id === Number(value));
          if (inv) {
            updated.name = inv.materialType;
            updated.unitPrice = inv.unitPrice ?? 0;
          }
        }
        if (field === 'materialSource' && value === 'custom') {
          updated.materialId = '';
        }
        return updated;
      })
    );
  };

  const premadeTotal = premadeSelections.reduce((sum, s) => {
    if (!s.productId) return sum;
    const item = premadeItems.find((i) => i.id === s.productId);
    return item ? sum + item.price * s.quantity : sum;
  }, 0);

  const materialTotal = materials.reduce(
    (sum, m) => sum + (Number(m.quantity) || 0) * (Number(m.unitPrice) || 0),
    0
  );
  const suggestedPrice = materialTotal > 0 ? materialTotal * (profitMargin / 100) : 0;

  const goNext = () => {
    setError('');
    setStep((s) => s + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (orderType === 'normal' && step < 5) {
      if (step === 1) {
        if (!customerName.trim()) { setError('Customer name is required.'); return; }
        if (!customerPhone.trim()) { setError('Phone number is required.'); return; }
      }
      if (step === 3) {
        const anyService = flooring.selected || reupholstery.selected || ceiling.selected ||
          sidings.selected || seatCovers.selected || otherServices.selected;
        if (!anyService) { setError('Please select at least one service.'); return; }
        if (reupholstery.selected && !reupholsteryItemType.trim()) {
          setError('Please specify what item will be reupholstered.');
          return;
        }
      }
      if (step === 4) {
        for (const m of materials) {
          if (m.materialSource === 'inventory' && !m.materialId) {
            setError('Please select an inventory material or switch to "Type new material".');
            return;
          }
          if (!m.name.trim()) { setError('Please provide a name for all material rows.'); return; }
        }
      }
      goNext();
      return;
    }

    // Premade step 1 → 2
    if (orderType === 'premade' && premadeStep === 1) {
      if (!customerName.trim() || !customerPhone.trim()) {
        setError('Customer name and phone are required.');
        return;
      }
      const hasItems = premadeSelections.some((s) => s.productId);
      if (!hasItems) { setError('Please select at least one premade inventory item.'); return; }
      setError('');
      setPremadeStep(2);
      return;
    }

    setLoading(true);
    setError('');

    // ── Premade order submit ──────────────────────────────────────────────────
    if (orderType === 'premade') {
      const selected = premadeSelections.filter((s) => s.productId && s.quantity > 0);
      if (!customerName.trim() || !customerPhone.trim()) {
        setError('Customer name and phone are required.');
        setLoading(false);
        return;
      }
      if (selected.length === 0) {
        setError('Please select at least one premade inventory item.');
        setLoading(false);
        return;
      }

      const reqByProduct = new Map<number, number>();
      for (const s of selected) {
        const pid = s.productId as number;
        reqByProduct.set(pid, (reqByProduct.get(pid) || 0) + s.quantity);
      }
      for (const [pid, total] of reqByProduct.entries()) {
        const product = premadeItems.find((i) => i.id === pid);
        if (!product) { setError('One or more selected premade items are no longer available.'); setLoading(false); return; }
        if (total > Number(product.quantity)) {
          setError(`Requested quantity for ${product.name} exceeds available stock (${product.quantity}).`);
          setLoading(false);
          return;
        }
      }

      try {
        const selectedProducts = selected
          .map((s) => premadeItems.find((i) => i.id === s.productId))
          .filter((i): i is FinishedGood => Boolean(i));

        if (selectedProducts.length === 0) {
          setError('Selected finished goods are no longer available. Please reselect items.');
          setLoading(false);
          return;
        }

        const inferredBranchId = selectedProducts[0].branchId;
        if (selectedProducts.some((i) => i.branchId !== inferredBranchId)) {
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

        const premadeNotes = [notes, 'Order Source: Walk-in', `Payment Method: ${paymentMethod}`]
          .filter(Boolean).join('\n');

        await api.productOrders.create({
          customerName, customerPhone, customerEmail, customerAddress, branchId,
          notes: premadeNotes,
          paymentAmount: typeof paymentAmount === 'number' ? paymentAmount : 0,
          items: selected.map((s) => ({ productId: s.productId as number, quantity: s.quantity }))
        });

        router.push('/product-orders');
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : 'Failed to create premade order.');
        console.error(err);
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── Normal job order submit ───────────────────────────────────────────────
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

    const branchId = user?.branchId || 1;

    const normalizedItems = materials.map((m) => ({
      name: m.name.trim(),
      materialId: m.materialId ? Number(m.materialId) : undefined,
      quantity: Number(m.quantity) || 0,
      unitPrice: Number(m.unitPrice) || 0,
      materialCost: Number(m.unitPrice) || 0,
      laborCost: 0
    }));

    if (normalizedItems.length === 0) {
      normalizedItems.push({ name: 'Service Package', materialId: undefined, quantity: 1, unitPrice: 0, materialCost: 0, laborCost: 0 });
    }

    if (labor.length > 0) {
      const totalLaborCost = labor.reduce(
        (sum, item) => sum + (Number(item.hours) || 0) * (Number(item.rate) || 0), 0
      );
      normalizedItems[0].laborCost = totalLaborCost;
    }

    const serviceDescription = selectedServices
      .map((s: any) => s.type === 'reupholstery' && s.itemType ? `reupholstery (${s.itemType})` : s.type)
      .join(', ');

    const computedVehicleInfo = reupholstery.selected
      ? { make: 'Reupholstery', model: reupholsteryItemType.trim(), year: new Date().getFullYear(), plateNumber: '' }
      : { make: vehicleMake || 'N/A', model: vehicleModel || 'N/A', year: Number(vehicleYear) || new Date().getFullYear(), plateNumber: vehiclePlate || '' };

    const estimatedCompletion = estimatedCompletionDate || new Date().toISOString().slice(0, 10);

    const hasSlipData = slipRows.some((r) => r.description || r.hr) ||
      materialCenter || materialSides || materialBack ||
      dStitch || piping || pockets || logo || specification ||
      cutterName || sewerName;

    const slipData = hasSlipData ? {
      rows: slipRows,
      materialCenter, materialSides, materialBack,
      dStitch, piping, pockets, logo, specification,
      cutterName, sewerName,
    } : undefined;

    const computedTotal = materialTotal > 0 ? materialTotal : (estimatedTotal > 0 ? estimatedTotal : 0);
    const finalTotal = estimatedTotal > 0 ? estimatedTotal : computedTotal;
    const finalDown = estimatedTotal > 0 ? downPayment : 0;

    try {
      const jobOrderData: any = {
        customerName, customerPhone, customerEmail,
        ...(linkedCustomerId ? { customerId: linkedCustomerId } : {}),
        branchId,
        description: serviceDescription || 'Custom service order',
        vehicleInfo: computedVehicleInfo,
        items: normalizedItems,
        estimatedCompletion,
        downPayment: finalDown,
        paymentMethod,
        notes,
        ...(slipData ? { slipData } : {}),
        ...(finalTotal > 0 ? { estimatedCost: finalTotal, totalPrice: finalTotal } : {}),
      };

      const createResponse = await api.sales.createJobOrder(jobOrderData);
      const createdJobOrderId = (createResponse.data as any)?.jobOrderId || 'PENDING-JO';

      const customNeeded = materials.filter((m) => m.materialSource === 'custom' && m.name.trim());
      if (customNeeded.length > 0) {
        try {
          await Promise.all(
            customNeeded.map((m) =>
              api.inventory.createRawMaterial({
                materialType: m.name.trim(),
                color: '', pattern: '',
                unitPrice: Number(m.unitPrice) || 0,
                stockQuantity: 0,
                branchId: user?.branchId || 1,
                status: 'needed',
                sourceJobOrderId: createdJobOrderId
              })
            )
          );
        } catch (customErr) {
          console.error('Failed to save some needed materials:', customErr);
        }
      }

      router.push('/sales');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to create job order. Please try again.');
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
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Walk-in Premade Order</h3>
            <p className="text-sm text-gray-500 mb-4">Step 1 of 2 — Customer &amp; Items</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Customer Name *</label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="Walk-in customer name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="09XX XXX XXXX" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="customer@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="Customer address" />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Finished Goods</h3>
              <button type="button" onClick={addPremadeSelection}
                className="inline-flex items-center px-3 py-1.5 bg-[#dde6ff] text-[#011c72] rounded-lg text-sm font-medium hover:bg-[#c7d2f5] transition-colors">
                + Add Item
              </button>
            </div>
            {premadeLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <div className="animate-spin w-4 h-4 border-2 border-[#011c72] border-t-transparent rounded-full"></div>
                Loading premade inventory...
              </div>
            ) : (
              <>
                {premadeItems.length === 0 && (
                  <div className="text-sm text-gray-500 mb-3">No finished goods found in inventory.</div>
                )}
                <div className="space-y-3">
                  {premadeSelections.map((selection) => {
                    const selectedItem = premadeItems.find((i) => i.id === selection.productId);
                    return (
                      <div key={selection.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="md:col-span-7">
                          <select value={selection.productId}
                            onChange={(e) => updatePremadeSelection(selection.id, 'productId', e.target.value ? Number(e.target.value) : '')}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm"
                            disabled={premadeItems.length === 0}>
                            <option value="">Select finished good item</option>
                            {premadeItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.sku}) - Stock: {item.quantity} - ₱{item.price.toLocaleString()}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <input type="number" min={1} max={selectedItem ? Number(selectedItem.quantity) : undefined}
                            value={selection.quantity}
                            onChange={(e) => {
                              const next = Math.max(1, parseInt(e.target.value) || 1);
                              const bounded = selectedItem ? Math.min(next, Number(selectedItem.quantity)) : next;
                              updatePremadeSelection(selection.id, 'quantity', bounded);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm" />
                        </div>
                        <div className="md:col-span-2 flex items-center text-sm font-semibold text-gray-900">
                          {selectedItem ? `₱${(selectedItem.price * selection.quantity).toLocaleString()}` : '—'}
                        </div>
                        <div className="md:col-span-1 flex items-center justify-end">
                          <button type="button" onClick={() => removePremadeSelection(selection.id)}
                            disabled={premadeSelections.length === 1}
                            className="p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
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

          <div className="bg-[#eef1fb] border border-[#c7d2f5] rounded-xl p-4 flex justify-between items-center">
            <span className="text-sm font-medium text-[#011c72]">Order Total</span>
            <span className="text-xl font-bold text-[#011c72]">₱{premadeTotal.toLocaleString()}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Payment</h3>
          <p className="text-sm text-gray-500 mb-4">Step 2 of 2 — Review &amp; Payment</p>
        </div>
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Order Summary</p>
          <div className="flex justify-between text-sm text-gray-700">
            <span>Customer</span>
            <span className="font-medium text-gray-900">{customerName}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-700">
            <span>Items</span>
            <span className="font-medium text-gray-900">{premadeSelections.filter((s) => s.productId).length} item(s)</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
            <span className="font-semibold text-gray-900">Total Due</span>
            <span className="text-lg font-bold text-[#011c72]">₱{premadeTotal.toLocaleString()}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount to Pay</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₱</span>
            <input type="number" min="0" step="0.01" max={premadeTotal} value={paymentAmount}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                setPaymentAmount(val === '' ? '' : (isNaN(val as number) ? '' : val as number));
              }}
              className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent text-lg"
              placeholder="0.00" />
          </div>
          {premadePaymentAmount > 0 && (
            <div className="mt-3">
              {isPremadeFullPayment ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-semibold text-green-700">Full Payment — Order will be marked as Paid</span>
                </div>
              ) : isPremadePartialPayment ? (
                <div className="p-3 bg-[#eef1fb] border border-[#c7d2f5] rounded-lg space-y-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#011c72] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-[#011c72]">Partial Payment</span>
                  </div>
                  <div className="flex justify-between text-sm text-[#011c72] pl-7">
                    <span>Remaining balance:</span>
                    <span className="font-bold">₱{premadeRemaining.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <p className="text-xs text-[#011c72] pl-7">The remaining balance can be settled from the order detail page.</p>
                </div>
              ) : null}
            </div>
          )}
          {(paymentAmount === '' || premadePaymentAmount === 0) && (
            <p className="text-xs text-gray-500 mt-2">Leave at ₱0 to record as unpaid.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent">
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit_card">Credit Card</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
            placeholder="Walk-in order notes" />
        </div>
      </div>
    );
  };

  const STEPS = [
    { num: 1, label: 'Customer', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )},
    { num: 2, label: 'Vehicle', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l1 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1" />
      </svg>
    )},
    { num: 3, label: 'Service', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )},
    { num: 4, label: 'Materials', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    )},
    { num: 5, label: 'Review', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
  ];

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent';
  const smallInputCls = 'w-full px-3 py-2 rounded-lg border border-[#c7d2f5] bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  const renderStep = () => {
    switch (step) {
      // ── Step 1: Customer ───────────────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Customer Information</h3>
              <p className="text-sm text-gray-500 mt-1">Who is this job order for?</p>
            </div>

            {/* Linked account banner */}
            {linkedCustomerId && (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium text-green-800">
                    Linked to existing account
                    {linkedCustomerDiscount ? ` · ${linkedCustomerDiscount}% loyalty discount` : ''}
                  </span>
                </div>
                <button type="button" onClick={unlinkCustomer}
                  className="text-xs text-green-700 underline hover:text-green-900">
                  Unlink
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input type="text" value={customerName}
                  onChange={(e) => { setCustomerName(e.target.value); unlinkCustomer(); }}
                  required className={inputCls} placeholder="e.g. Juan dela Cruz" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input type="tel" value={customerPhone}
                  onChange={(e) => { setCustomerPhone(e.target.value); unlinkCustomer(); }}
                  required className={inputCls} placeholder="09XX XXX XXXX" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input type="email" value={customerEmail}
                  onChange={(e) => { setCustomerEmail(e.target.value); unlinkCustomer(); }}
                  className={inputCls} placeholder="customer@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
                  className={inputCls} placeholder="123 Main St, City" />
              </div>
            </div>

            {/* Customer search suggestions */}
            {!linkedCustomerId && (searchingCustomer || customerSuggestions.length > 0) && (
              <div className="border border-[#c7d2f5] rounded-xl overflow-hidden">
                <div className="bg-[#eef1fb] px-4 py-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#011c72]">
                    {searchingCustomer ? 'Searching…' : `${customerSuggestions.length} existing customer${customerSuggestions.length !== 1 ? 's' : ''} found`}
                  </p>
                  <button type="button" onClick={() => setCustomerSuggestions([])}
                    className="text-xs text-[#011c72] underline">Dismiss</button>
                </div>
                {customerSuggestions.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-white hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">
                        {[c.phone, c.email].filter(Boolean).join(' · ')}
                        {c.discountPercent ? ` · ${c.discountPercent}% discount` : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => linkCustomer(c)}
                      className="text-xs font-medium text-white bg-[#011c72] hover:bg-[#022494] px-3 py-1.5 rounded-lg transition-colors shrink-0 ml-3">
                      Use This Account
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      // ── Step 2: Vehicle ────────────────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Vehicle Information</h3>
              <p className="text-sm text-gray-500 mt-1">Tell us about the vehicle</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Make</label>
                <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)}
                  className={inputCls} placeholder="Toyota" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Model</label>
                <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)}
                  className={inputCls} placeholder="Fortuner" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                <input type="text" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)}
                  className={inputCls} placeholder="2023" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Plate Number</label>
                <input type="text" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)}
                  className={inputCls} placeholder="ABC 1234" />
              </div>
            </div>
          </div>
        );

      // ── Step 3: Service ────────────────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Select Services</h3>
              <p className="text-sm text-gray-500 mt-1">Choose one or more services needed</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* Flooring */}
              <div onClick={() => setFlooring({ ...flooring, selected: !flooring.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${flooring.selected ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200 hover:border-[#011c72]'}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${flooring.selected ? 'border-[#011c72] bg-[#011c72]' : 'border-gray-300'}`}>
                    {flooring.selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={flooring.selected ? 'text-[#011c72]' : 'text-gray-500'}>{SERVICE_ICONS.flooring}</span>
                      <span className="font-semibold text-gray-900">Flooring</span>
                    </div>
                    <ul className="text-xs text-gray-500 mt-1.5 space-y-0.5">
                      <li>• Auto Standard carpet material</li>
                      <li>• All sides trim • With rebonded foam underlay</li>
                    </ul>
                    {flooring.selected && (
                      <input type="text" value={flooring.material}
                        onChange={(e) => { e.stopPropagation(); setFlooring({ ...flooring, material: e.target.value }); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Specify material" className={`mt-3 ${smallInputCls}`} />
                    )}
                  </div>
                </div>
              </div>

              {/* Reupholstery */}
              <div onClick={() => setReupholstery({ ...reupholstery, selected: !reupholstery.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${reupholstery.selected ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200 hover:border-[#011c72]'}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${reupholstery.selected ? 'border-[#011c72] bg-[#011c72]' : 'border-gray-300'}`}>
                    {reupholstery.selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={reupholstery.selected ? 'text-[#011c72]' : 'text-gray-500'}>{SERVICE_ICONS.reupholstery}</span>
                      <span className="font-semibold text-gray-900">Reupholstery</span>
                    </div>
                    <ul className="text-xs text-gray-500 mt-1.5 space-y-0.5">
                      <li>• Auto Standard material • Class A Uratex foam</li>
                      <li>• Includes spring &amp; frame repair</li>
                    </ul>
                    {reupholstery.selected && (
                      <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <input type="text" value={reupholsteryItemType} onChange={(e) => setReupholsteryItemType(e.target.value)}
                          placeholder="Item to reupholster (e.g. Sofa set, dining chair)" className={smallInputCls} />
                        <input type="text" value={reupholstery.material}
                          onChange={(e) => setReupholstery({ ...reupholstery, material: e.target.value })}
                          placeholder="Specify material" className={smallInputCls} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Ceiling */}
              <div onClick={() => setCeiling({ ...ceiling, selected: !ceiling.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${ceiling.selected ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200 hover:border-[#011c72]'}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${ceiling.selected ? 'border-[#011c72] bg-[#011c72]' : 'border-gray-300'}`}>
                    {ceiling.selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={ceiling.selected ? 'text-[#011c72]' : 'text-gray-500'}>{SERVICE_ICONS.ceiling}</span>
                      <span className="font-semibold text-gray-900">Ceiling</span>
                    </div>
                    <ul className="text-xs text-gray-500 mt-1.5 space-y-0.5">
                      <li>• Auto Standard ceiling material • Heat insulation</li>
                      <li>• Includes all post and sunvisor</li>
                    </ul>
                    {ceiling.selected && (
                      <input type="text" value={ceiling.material}
                        onChange={(e) => { e.stopPropagation(); setCeiling({ ...ceiling, material: e.target.value }); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Specify material" className={`mt-3 ${smallInputCls}`} />
                    )}
                  </div>
                </div>
              </div>

              {/* Sidings */}
              <div onClick={() => setSidings({ ...sidings, selected: !sidings.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${sidings.selected ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200 hover:border-[#011c72]'}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${sidings.selected ? 'border-[#011c72] bg-[#011c72]' : 'border-gray-300'}`}>
                    {sidings.selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={sidings.selected ? 'text-[#011c72]' : 'text-gray-500'}>{SERVICE_ICONS.sidings}</span>
                      <span className="font-semibold text-gray-900">Sidings</span>
                    </div>
                    <ul className="text-xs text-gray-500 mt-1.5 space-y-0.5">
                      <li>• Electric pressed design • With 1/8 plyboard base</li>
                      <li>• Note: SIDINGS clips not included (₱5.00 each)</li>
                    </ul>
                    {sidings.selected && (
                      <input type="text" value={sidings.material}
                        onChange={(e) => { e.stopPropagation(); setSidings({ ...sidings, material: e.target.value }); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Specify material" className={`mt-3 ${smallInputCls}`} />
                    )}
                  </div>
                </div>
              </div>

              {/* Seat Covers */}
              <div onClick={() => setSeatCovers({ ...seatCovers, selected: !seatCovers.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${seatCovers.selected ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200 hover:border-[#011c72]'}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${seatCovers.selected ? 'border-[#011c72] bg-[#011c72]' : 'border-gray-300'}`}>
                    {seatCovers.selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={seatCovers.selected ? 'text-[#011c72]' : 'text-gray-500'}>{SERVICE_ICONS.seatCovers}</span>
                      <span className="font-semibold text-gray-900">Seat Covers</span>
                    </div>
                    {seatCovers.selected && (
                      <div className="mt-3 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                        <input type="text" value={seatCovers.design} onChange={(e) => setSeatCovers({ ...seatCovers, design: e.target.value })} placeholder="Design" className={smallInputCls} />
                        <input type="text" value={seatCovers.material} onChange={(e) => setSeatCovers({ ...seatCovers, material: e.target.value })} placeholder="Material" className={smallInputCls} />
                        <input type="text" value={seatCovers.pocket} onChange={(e) => setSeatCovers({ ...seatCovers, pocket: e.target.value })} placeholder="Pocket" className={smallInputCls} />
                        <input type="text" value={seatCovers.others} onChange={(e) => setSeatCovers({ ...seatCovers, others: e.target.value })} placeholder="Others" className={smallInputCls} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Other Services */}
              <div onClick={() => setOtherServices({ ...otherServices, selected: !otherServices.selected })}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${otherServices.selected ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200 hover:border-[#011c72]'}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${otherServices.selected ? 'border-[#011c72] bg-[#011c72]' : 'border-gray-300'}`}>
                    {otherServices.selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={otherServices.selected ? 'text-[#011c72]' : 'text-gray-500'}>{SERVICE_ICONS.other}</span>
                      <span className="font-semibold text-gray-900">Other Services</span>
                    </div>
                    {otherServices.selected && (
                      <input type="text" value={otherServices.description}
                        onChange={(e) => { e.stopPropagation(); setOtherServices({ ...otherServices, description: e.target.value }); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Describe your service needs" className={`mt-3 ${smallInputCls}`} />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Completion Date</label>
                <input type="date" value={estimatedCompletionDate} onChange={(e) => setEstimatedCompletionDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>
        );

      // ── Step 4: Materials ──────────────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Material Breakdown</h3>
              <p className="text-sm text-gray-500 mt-1">Fill in the job order slip details and add materials</p>
            </div>

            {/* Job Order Slip Fields */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Job Order Slip Details</p>

              {/* Row Descriptions */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Seat Row Descriptions</p>
                <div className="space-y-2">
                  {slipRows.map((row, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-500 w-14 shrink-0">{['1st', '2nd', '3rd', '4th'][i]} ROW</span>
                      <input type="text" value={row.description}
                        onChange={(e) => setSlipRows((prev) => prev.map((r, idx) => idx === i ? { ...r, description: e.target.value } : r))}
                        placeholder="Description" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-gray-500">HR</span>
                        <input type="text" value={row.hr}
                          onChange={(e) => setSlipRows((prev) => prev.map((r, idx) => idx === i ? { ...r, hr: e.target.value } : r))}
                          placeholder="0" className="w-16 px-2 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 text-center focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Material Descriptions */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Material Description</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">CENTER</label>
                    <input type="text" value={materialCenter} onChange={(e) => setMaterialCenter(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">SIDES</label>
                    <input type="text" value={materialSides} onChange={(e) => setMaterialSides(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">BACK</label>
                    <input type="text" value={materialBack} onChange={(e) => setMaterialBack(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
                  </div>
                </div>
              </div>

              {/* Details Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'D.STITCH', value: dStitch, set: setDStitch },
                  { label: 'PIPING', value: piping, set: setPiping },
                  { label: 'POCKETS', value: pockets, set: setPockets },
                  { label: 'LOGO', value: logo, set: setLogo },
                ].map(({ label, value, set }) => (
                  <div key={label}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input type="text" value={value} onChange={(e) => set(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
                  </div>
                ))}
              </div>

              {/* Specification */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Specification</label>
                <textarea value={specification} onChange={(e) => setSpecification(e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent resize-none"
                  placeholder="Additional specifications..." />
              </div>

              {/* Cutter & Sewer */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">CUTTER</label>
                  <input type="text" value={cutterName} onChange={(e) => setCutterName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                    placeholder="Cutter name" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">SEWER</label>
                  <input type="text" value={sewerName} onChange={(e) => setSewerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                    placeholder="Sewer name" />
                </div>
              </div>
            </div>

            {/* Material Items List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Materials &amp; Parts</p>
                  <p className="text-xs text-gray-500">Add materials for cost tracking (optional)</p>
                </div>
                <button type="button" onClick={addMaterial}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#dde6ff] text-[#011c72] rounded-lg text-sm font-medium hover:bg-[#c7d2f5] transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Material
                </button>
              </div>

              {materials.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400">
                  No materials added yet. Click "Add Material" to start tracking costs.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <div className="col-span-4">Source / Name</div>
                    <div className="col-span-3">Material</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Unit Price</div>
                    <div className="col-span-1"></div>
                  </div>
                  {materials.map((m) => (
                    <div key={m.id} className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="col-span-4">
                        <select value={m.materialSource}
                          onChange={(e) => updateMaterial(m.id, 'materialSource', e.target.value as 'inventory' | 'custom')}
                          className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white text-xs text-gray-900 focus:ring-1 focus:ring-[#011c72]">
                          <option value="inventory">From Inventory</option>
                          <option value="custom">Type New</option>
                        </select>
                      </div>
                      <div className="col-span-3">
                        {m.materialSource === 'inventory' ? (
                          <select value={m.materialId}
                            onChange={(e) => updateMaterial(m.id, 'materialId', e.target.value ? Number(e.target.value) : '')}
                            className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white text-xs text-gray-900 focus:ring-1 focus:ring-[#011c72]">
                            <option value="">Select material</option>
                            {inventoryMaterials.map((inv) => (
                              <option key={inv.id} value={inv.id}>{inv.materialType}</option>
                            ))}
                          </select>
                        ) : (
                          <input type="text" value={m.name} onChange={(e) => updateMaterial(m.id, 'name', e.target.value)}
                            placeholder="Material name"
                            className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white text-xs text-gray-900 focus:ring-1 focus:ring-[#011c72]" />
                        )}
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="0" step="0.1" value={m.quantity}
                          onChange={(e) => updateMaterial(m.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white text-xs text-gray-900 text-center focus:ring-1 focus:ring-[#011c72]" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="0" step="0.01" value={m.unitPrice}
                          onChange={(e) => updateMaterial(m.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white text-xs text-gray-900 text-right focus:ring-1 focus:ring-[#011c72]" />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button type="button" onClick={() => removeMaterial(m.id)}
                          className="p-1 text-red-400 hover:bg-red-100 rounded transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  {materialTotal > 0 && (
                    <div className="flex justify-between items-center px-3 py-2 bg-[#eef1fb] rounded-lg border border-[#c7d2f5]">
                      <span className="text-sm font-medium text-[#011c72]">Materials Total</span>
                      <span className="text-sm font-bold text-[#011c72]">₱{materialTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      // ── Step 5: Review ─────────────────────────────────────────────────────
      case 5:
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Review &amp; Submit</h3>
              <p className="text-sm text-gray-500 mt-1">Confirm the job order details before submitting</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Customer</p>
                <p className="font-semibold text-gray-900">{customerName || '—'}</p>
                {customerPhone && <p className="text-sm text-gray-600 mt-0.5">{customerPhone}</p>}
                {customerEmail && <p className="text-sm text-gray-500">{customerEmail}</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  {reupholstery.selected ? 'Item' : 'Vehicle'}
                </p>
                <p className="font-semibold text-gray-900">
                  {reupholstery.selected
                    ? (reupholsteryItemType.trim() || 'Reupholstery item')
                    : `${vehicleMake || '—'} ${vehicleModel || ''}`.trim()}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {reupholstery.selected ? 'Reupholstery' : `${vehicleYear || ''} ${vehiclePlate || ''}`.trim() || '—'}
                </p>
              </div>
            </div>

            {/* Services */}
            <div className="bg-[#eef1fb] rounded-xl p-4 border border-[#c7d2f5]">
              <p className="text-xs font-medium text-[#011c72] uppercase tracking-wide mb-2">Selected Services</p>
              <div className="flex flex-wrap gap-2">
                {[
                  flooring.selected && 'Flooring',
                  reupholstery.selected && `Reupholstery${reupholsteryItemType.trim() ? ` (${reupholsteryItemType.trim()})` : ''}`,
                  ceiling.selected && 'Ceiling',
                  sidings.selected && 'Sidings',
                  seatCovers.selected && 'Seat Covers',
                  otherServices.selected && 'Other Services'
                ].filter(Boolean).map((svc) => (
                  <span key={svc as string} className="px-2.5 py-1 bg-[#dde6ff] text-[#011c72] text-sm font-medium rounded-full">{svc}</span>
                ))}
              </div>
              {estimatedCompletionDate && (
                <p className="text-xs text-[#011c72] mt-2">Est. completion: {formatDate(estimatedCompletionDate)}</p>
              )}
            </div>

            {/* Materials summary */}
            {materials.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Materials ({materials.length})</p>
                <div className="space-y-1">
                  {materials.map((m) => (
                    <div key={m.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">{m.name || '(unnamed)'} × {m.quantity}</span>
                      <span className="text-gray-900 font-medium">₱{((Number(m.quantity) || 0) * (Number(m.unitPrice) || 0)).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Profit Margin Calculator */}
            {materialTotal > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800">Profit Margin Calculator</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Base Cost (Materials)</span>
                  <span className="font-medium text-gray-900">₱{materialTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 shrink-0">Profit Margin</label>
                  <div className="relative flex-1">
                    <input
                      type="number" min="0" max="1000" step="1"
                      value={profitMargin}
                      onChange={(e) => setProfitMargin(parseFloat(e.target.value) || 0)}
                      className="w-full pr-8 pl-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-white border border-[#c7d2f5] rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[#011c72]">Suggested Price</p>
                    <p className="text-xs text-gray-500 mt-0.5">{profitMargin}% of materials cost (100% = break-even)</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-[#011c72]">
                      ₱{suggestedPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setEstimatedTotal(suggestedPrice); setDownPayment(suggestedPrice / 2); }}
                      className="text-xs font-medium text-white bg-[#011c72] hover:bg-[#022494] px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                      Use This
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pricing */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Amount for the Work
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₱</span>
                  <input type="number" min="0" step="0.01"
                    value={estimatedTotal || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setEstimatedTotal(val);
                      setDownPayment(val / 2);
                    }}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                    placeholder="0.00" />
                </div>
              </div>
              {estimatedTotal > 0 && (
                <div className="bg-[#eef1fb] border border-[#c7d2f5] rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#011c72]">Down Payment (50%)</p>
                    <p className="text-xs text-[#011c72] mt-0.5">Half of total</p>
                  </div>
                  <span className="text-xl font-bold text-[#011c72]">
                    ₱{downPayment.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent resize-none"
                placeholder="Any special instructions or notes..." />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button onClick={() => router.back()}
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors">
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">New Job Order</h1>
          <p className="text-gray-500 mt-1">Create a new service order for a customer</p>
        </div>

        {/* Order Type Selector */}
        <div className="mb-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Order Type</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" onClick={() => { setOrderType('normal'); setStep(1); setError(''); }}
              className={`text-left px-4 py-3.5 rounded-xl border-2 transition-all ${orderType === 'normal' ? 'border-[#011c72] bg-[#eef1fb] text-[#011c72] shadow-sm' : 'border-gray-200 text-gray-700 hover:border-[#011c72]'}`}>
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <div className="font-semibold">Normal Job Order</div>
              </div>
              <div className="text-xs opacity-70">Custom service work order flow</div>
            </button>
            <button type="button" onClick={() => { setOrderType('premade'); setError(''); }}
              className={`text-left px-4 py-3.5 rounded-xl border-2 transition-all ${orderType === 'premade' ? 'border-[#011c72] bg-[#eef1fb] text-[#011c72] shadow-sm' : 'border-gray-200 text-gray-700 hover:border-[#011c72]'}`}>
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
                    <button type="button" onClick={() => { if (s.num < step) { setError(''); setStep(s.num); } }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-200 ${
                        step > s.num ? 'bg-[#011c72] text-white shadow-md cursor-pointer'
                        : step === s.num ? 'bg-[#011c72] text-white shadow-lg ring-4 ring-amber-200'
                        : 'bg-white border-2 border-gray-200 text-gray-400 cursor-default'
                      }`}>
                      {step > s.num ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : s.num}
                    </button>
                    <span className={`mt-1.5 text-xs font-medium hidden sm:block ${step >= s.num ? 'text-[#011c72]' : 'text-gray-400'}`}>
                      {s.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mt-5 mx-1 rounded-full transition-colors duration-300 ${step > s.num ? 'bg-[#011c72]' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form Card */}
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-5">
            {orderType === 'normal' ? renderStep() : renderPremadeForm()}
          </div>

          {/* Navigation Buttons */}
          {orderType === 'normal' ? (
            <div className="flex justify-between">
              <button type="button" onClick={() => { setError(''); setStep(step - 1); }} disabled={step === 1}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-colors ${
                  step === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>
              {step < 5 ? (
                <button key="next-btn" type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#011c72] hover:bg-[#01268c] text-white rounded-xl font-medium transition-colors shadow-sm">
                  Next
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button key="submit-btn" type="submit" disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#011c72] hover:bg-[#01268c] text-white rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
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
                <button type="button" onClick={() => router.back()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              ) : (
                <button type="button" onClick={() => { setError(''); setPremadeStep(1); }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
              )}
              <div className="flex gap-3">
                {premadeStep === 2 && (
                  <button type="button" onClick={() => router.back()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                    Cancel
                  </button>
                )}
                <button type="submit" disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#011c72] hover:bg-[#01268c] text-white rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
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
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
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
