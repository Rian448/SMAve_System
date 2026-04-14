'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, type FinishedGood } from '@/lib/api';

interface MaterialItem {
  id: string;
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

export default function NewJobOrderPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderType, setOrderType] = useState<'normal' | 'premade'>('normal');
  const [step, setStep] = useState(1);
  const premadeSelectionIdRef = useRef(1);
  const [premadeSelections, setPremadeSelections] = useState<PremadeSelection[]>([
    { id: 'premade-1', productId: '', quantity: 1 }
  ]);
  const [premadeItems, setPremadeItems] = useState<FinishedGood[]>([]);
  const [premadeLoading, setPremadeLoading] = useState(false);
  
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
  const [downPayment, setDownPayment] = useState(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const loadPremadeItems = async () => {
      if (orderType !== 'premade') {
        return;
      }

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

  const addPremadeSelection = () => {
    premadeSelectionIdRef.current += 1;
    setPremadeSelections((prev) => [
      ...prev,
      { id: `premade-${premadeSelectionIdRef.current}`, productId: '', quantity: 1 }
    ]);
  };

  const removePremadeSelection = (id: string) => {
    setPremadeSelections((prev) => {
      if (prev.length === 1) {
        return prev;
      }
      return prev.filter((selection) => selection.id !== id);
    });
  };

  const updatePremadeSelection = (
    id: string,
    field: keyof PremadeSelection,
    value: number | ''
  ) => {
    setPremadeSelections((prev) =>
      prev.map((selection) =>
        selection.id === id ? { ...selection, [field]: value } : selection
      )
    );
  };

  const premadeTotal = premadeSelections.reduce((sum, selection) => {
    if (!selection.productId) {
      return sum;
    }

    const item = premadeItems.find((premadeItem) => premadeItem.id === selection.productId);
    if (!item) {
      return sum;
    }

    return sum + (item.price * selection.quantity);
  }, 0);

  const addMaterial = () => {
    setMaterials([...materials, { id: Date.now().toString(), name: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  const updateMaterial = (id: string, field: keyof MaterialItem, value: string | number) => {
    setMaterials(materials.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const addLabor = () => {
    setLabor([...labor, { description: '', hours: 1, rate: 0 }]);
  };

  const removeLabor = (index: number) => {
    setLabor(labor.filter((_, i) => i !== index));
  };

  const updateLabor = (index: number, field: keyof LaborItem, value: string | number) => {
    setLabor(labor.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const calculateSubtotals = () => {
    const materialsTotal = materials.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0);
    const laborTotal = labor.reduce((sum, l) => sum + (l.hours * l.rate), 0);
    return { materialsTotal, laborTotal };
  };

  const { materialsTotal, laborTotal } = calculateSubtotals();
  const totalAmount = materialsTotal + laborTotal;
  const balanceDue = totalAmount - downPayment;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        requestedByProduct.set(
          productId,
          (requestedByProduct.get(productId) || 0) + selection.quantity
        );
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

        const premadeNotes = [
          notes,
          `Order Source: Walk-in`,
          `Payment Method: ${paymentMethod}`
        ]
          .filter(Boolean)
          .join('\n');

        await api.productOrders.create({
          customerName,
          customerPhone,
          customerEmail,
          customerAddress,
          branchId,
          notes: premadeNotes,
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

    // Build services array
    const selectedServices = [];
    if (flooring.selected) selectedServices.push({ type: 'flooring', material: flooring.material });
    if (reupholstery.selected) selectedServices.push({ type: 'reupholstery', material: reupholstery.material });
    if (ceiling.selected) selectedServices.push({ type: 'ceiling', material: ceiling.material });
    if (sidings.selected) selectedServices.push({ type: 'sidings', material: sidings.material });
    if (seatCovers.selected) selectedServices.push({
      type: 'seat_covers',
      design: seatCovers.design,
      material: seatCovers.material,
      pocket: seatCovers.pocket,
      others: seatCovers.others
    });
    if (otherServices.selected) selectedServices.push({
      type: 'other',
      description: otherServices.description
    });

    if (selectedServices.length === 0) {
      setError('Please select at least one service');
      setLoading(false);
      return;
    }

    try {
      const jobOrderData = {
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        vehicleInfo: `${vehicleYear} ${vehicleMake} ${vehicleModel}`,
        vehiclePlate,
        services: selectedServices,
        estimatedCompletionDate,
        priority,
        materials,
        labor,
        materialsTotal,
        laborTotal,
        totalAmount,
        downPayment,
        balanceDue,
        paymentMethod,
        notes,
        branch: user?.branch || 'Main Branch'
      };

      await api.sales.createJobOrder(jobOrderData);
      router.push('/sales');
    } catch (err) {
      setError('Failed to create job order. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderPremadeForm = () => {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Walk-in Premade Order</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Customer Name *
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="Walk-in customer name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="09XX XXX XXXX"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="customer@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Address
              </label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
              Add Item
            </button>
          </div>

          {premadeLoading ? (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading premade inventory...</div>
          ) : (
            <>
              {premadeItems.length === 0 && (
                <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
                  No finished goods found in inventory.
                </div>
              )}
              <div className="space-y-3">
              {premadeSelections.map((selection) => {
                const selectedItem = premadeItems.find((item) => item.id === selection.productId);

                return (
                  <div
                    key={selection.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg"
                  >
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
                            {item.name} ({item.sku}) - Stock: {item.quantity} - {item.price.toLocaleString()}
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
                          const boundedValue = selectedItem
                            ? Math.min(nextValue, Number(selectedItem.quantity))
                            : nextValue;
                          updatePremadeSelection(selection.id, 'quantity', boundedValue);
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center text-sm font-medium text-zinc-900 dark:text-white">
                      {selectedItem ? `₱${(selectedItem.price * selection.quantity).toLocaleString()}` : '-'}
                    </div>
                    <div className="md:col-span-1 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => removePremadeSelection(selection.id)}
                        disabled={premadeSelections.length === 1}
                        className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        X
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            </>
          )}
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 flex justify-between items-center">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Premade Order Total</span>
          <span className="text-lg font-semibold text-zinc-900 dark:text-white">₱{premadeTotal.toLocaleString()}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="credit_card">Credit Card</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Additional Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="Walk-in order notes"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Customer Name</h3>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Customer Name *
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="Juan dela Cruz"
              />
            </div>
          </div>
        );
      
      case 2:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Service Details</h3>
            
            {/* Services Selection */}
            <div className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Select the services needed *</p>
              
              {/* Flooring */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="flooring"
                    checked={flooring.selected}
                    onChange={(e) => setFlooring({ ...flooring, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="flooring" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Flooring
                    </label>
                    <ul className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 space-y-1">
                      <li>• Auto Standard carpet material</li>
                      <li>• All sides trim</li>
                      <li>• With rebonded foam underlay</li>
                    </ul>
                    {flooring.selected && (
                      <input
                        type="text"
                        value={flooring.material}
                        onChange={(e) => setFlooring({ ...flooring, material: e.target.value })}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Reupholstery */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="reupholstery"
                    checked={reupholstery.selected}
                    onChange={(e) => setReupholstery({ ...reupholstery, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="reupholstery" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Reupholstery
                    </label>
                    <ul className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 space-y-1">
                      <li>• Auto Standard material</li>
                      <li>• To rebuild sag foam with Class A Uratex foam</li>
                      <li>• Includes spring & frame repair</li>
                    </ul>
                    {reupholstery.selected && (
                      <input
                        type="text"
                        value={reupholstery.material}
                        onChange={(e) => setReupholstery({ ...reupholstery, material: e.target.value })}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Ceiling */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="ceiling"
                    checked={ceiling.selected}
                    onChange={(e) => setCeiling({ ...ceiling, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="ceiling" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Ceiling
                    </label>
                    <ul className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 space-y-1">
                      <li>• Auto Standard ceiling material</li>
                      <li>• With heat insulation</li>
                      <li>• Includes all post and sunvisor</li>
                    </ul>
                    {ceiling.selected && (
                      <input
                        type="text"
                        value={ceiling.material}
                        onChange={(e) => setCeiling({ ...ceiling, material: e.target.value })}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Sidings */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="sidings"
                    checked={sidings.selected}
                    onChange={(e) => setSidings({ ...sidings, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="sidings" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Sidings
                    </label>
                    <ul className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 space-y-1">
                      <li>• Electric pressed design</li>
                      <li>• With 1/8 plyboard base</li>
                      <li>• Note: SIDINGS clips are not included (₱5.00 each)</li>
                    </ul>
                    {sidings.selected && (
                      <input
                        type="text"
                        value={sidings.material}
                        onChange={(e) => setSidings({ ...sidings, material: e.target.value })}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Seat Covers */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="seatCovers"
                    checked={seatCovers.selected}
                    onChange={(e) => setSeatCovers({ ...seatCovers, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="seatCovers" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Seat Covers
                    </label>
                    {seatCovers.selected && (
                      <div className="mt-3 space-y-3">
                        <input
                          type="text"
                          value={seatCovers.design}
                          onChange={(e) => setSeatCovers({ ...seatCovers, design: e.target.value })}
                          placeholder="Design"
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={seatCovers.material}
                          onChange={(e) => setSeatCovers({ ...seatCovers, material: e.target.value })}
                          placeholder="Material"
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={seatCovers.pocket}
                          onChange={(e) => setSeatCovers({ ...seatCovers, pocket: e.target.value })}
                          placeholder="Pocket"
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={seatCovers.others}
                          onChange={(e) => setSeatCovers({ ...seatCovers, others: e.target.value })}
                          placeholder="Others"
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Other Services */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="otherServices"
                    checked={otherServices.selected}
                    onChange={(e) => setOtherServices({ ...otherServices, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="otherServices" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Other Services
                    </label>
                    {otherServices.selected && (
                      <input
                        type="text"
                        value={otherServices.description}
                        onChange={(e) => setOtherServices({ ...otherServices, description: e.target.value })}
                        placeholder="Describe your service needs"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Estimated Completion Date
                </label>
                <input
                  type="date"
                  value={estimatedCompletionDate}
                  onChange={(e) => setEstimatedCompletionDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        );
      
      case 3:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Customer Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="09XX XXX XXXX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="customer@email.com"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="123 Main St, City"
                />
              </div>
            </div>
          </div>
        );
      
      case 4:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Vehicle Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Vehicle Make *
                </label>
                <input
                  type="text"
                  value={vehicleMake}
                  onChange={(e) => setVehicleMake(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Toyota"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Vehicle Model *
                </label>
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Fortuner"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Year *
                </label>
                <input
                  type="text"
                  value={vehicleYear}
                  onChange={(e) => setVehicleYear(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="2023"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Plate Number
                </label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="ABC 1234"
                />
              </div>
            </div>
          </div>
        );
      
      case 5:
        return (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Materials</h3>
                <button
                  type="button"
                  onClick={addMaterial}
                  className="inline-flex items-center px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Material
                </button>
              </div>
              {materials.length === 0 ? (
                <div className="text-center py-8 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border-2 border-dashed border-zinc-200 dark:border-zinc-700">
                  <p className="text-zinc-500 dark:text-zinc-400">No materials added yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {materials.map((material) => (
                    <div key={material.id} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                      <input
                        type="text"
                        value={material.name}
                        onChange={(e) => updateMaterial(material.id, 'name', e.target.value)}
                        placeholder="Material name"
                        className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <input
                        type="number"
                        value={material.quantity}
                        onChange={(e) => updateMaterial(material.id, 'quantity', parseInt(e.target.value) || 0)}
                        placeholder="Qty"
                        className="w-20 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <input
                        type="number"
                        value={material.unitPrice}
                        onChange={(e) => updateMaterial(material.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                        placeholder="Price"
                        className="w-28 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <span className="w-24 text-right text-sm font-medium text-zinc-900 dark:text-white">
                        ₱{(material.quantity * material.unitPrice).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeMaterial(material.id)}
                        className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Labor</h3>
                <button
                  type="button"
                  onClick={addLabor}
                  className="inline-flex items-center px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Labor
                </button>
              </div>
              {labor.length === 0 ? (
                <div className="text-center py-8 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border-2 border-dashed border-zinc-200 dark:border-zinc-700">
                  <p className="text-zinc-500 dark:text-zinc-400">No labor items added yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {labor.map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLabor(index, 'description', e.target.value)}
                        placeholder="Labor description"
                        className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <input
                        type="number"
                        value={item.hours}
                        onChange={(e) => updateLabor(index, 'hours', parseFloat(e.target.value) || 0)}
                        placeholder="Hours"
                        className="w-20 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <input
                        type="number"
                        value={item.rate}
                        onChange={(e) => updateLabor(index, 'rate', parseFloat(e.target.value) || 0)}
                        placeholder="Rate"
                        className="w-28 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                      />
                      <span className="w-24 text-right text-sm font-medium text-zinc-900 dark:text-white">
                        ₱{(item.hours * item.rate).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLabor(index)}
                        className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      
      case 6:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Payment & Summary</h3>
            
            {/* Summary */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-6">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Materials Subtotal</span>
                  <span className="font-medium text-zinc-900 dark:text-white">₱{materialsTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Labor Subtotal</span>
                  <span className="font-medium text-zinc-900 dark:text-white">₱{laborTotal.toLocaleString()}</span>
                </div>
                <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3">
                  <div className="flex justify-between text-lg font-semibold">
                    <span className="text-zinc-900 dark:text-white">Total Amount</span>
                    <span className="text-amber-600 dark:text-amber-400">₱{totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="installment">Installment</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Down Payment
                </label>
                <input
                  type="number"
                  value={downPayment}
                  onChange={(e) => setDownPayment(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
              <div className="flex justify-between text-lg font-semibold">
                <span className="text-amber-800 dark:text-amber-300">Balance Due</span>
                <span className="text-amber-800 dark:text-amber-300">₱{balanceDue.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Additional Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">New Job Order</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Create a new job order for a customer
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">Order Type</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOrderType('normal')}
              className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                orderType === 'normal'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              <div className="font-semibold">Normal Job Order</div>
              <div className="text-xs opacity-80">Custom service work order flow</div>
            </button>
            <button
              type="button"
              onClick={() => setOrderType('premade')}
              className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                orderType === 'premade'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              <div className="font-semibold">Premade Order</div>
              <div className="text-xs opacity-80">Walk-in sale from finished goods inventory</div>
            </button>
          </div>
        </div>

        {orderType === 'normal' && (
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {[
                { num: 1, label: 'Name' },
                { num: 2, label: 'Service' },
                { num: 3, label: 'Customer Info' },
                { num: 4, label: 'Vehicle' },
                { num: 5, label: 'Costing' },
                { num: 6, label: 'Payment' }
              ].map((s, index) => (
                <div key={s.num} className="flex items-center">
                  <button
                    onClick={() => setStep(s.num)}
                    className={`flex items-center justify-center w-10 h-10 rounded-full font-medium transition-colors ${
                      step >= s.num
                        ? 'bg-amber-600 text-white'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {s.num}
                  </button>
                  <span className={`ml-2 text-sm font-medium hidden sm:block ${
                    step >= s.num ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'
                  }`}>
                    {s.label}
                  </span>
                  {index < 5 && (
                    <div className={`w-8 sm:w-16 h-1 mx-2 rounded ${
                      step > s.num ? 'bg-amber-600' : 'bg-zinc-200 dark:bg-zinc-700'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            {orderType === 'normal' ? renderStep() : renderPremadeForm()}
          </div>

          {/* Navigation Buttons */}
          {orderType === 'normal' ? (
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={step === 1}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  step === 1
                    ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                Previous
              </button>
              {step < 6 ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
                >
                  Next
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Creating...
                    </>
                  ) : (
                    'Create Job Order'
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Creating...
                  </>
                ) : (
                  'Create Premade Order'
                )}
              </button>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}


