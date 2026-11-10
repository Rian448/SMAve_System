'use client';
import { formatDate, manilaDateString, nextSaturdayManila } from '@/lib/dateUtils';
import { useCallback, useEffect, useRef, useState, Suspense, type ReactElement } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  api, ApiError, type Customer, type FinishedGood, type RawMaterial, type Branch,
  type PremadeDraft, type ManagedWorker, type VehicleInfo, type JobOrderPriority,
  vatBreakdown, jobOrderTotalFrom, jobOrderPriceBreakdown, MAX_JOB_ORDER_PRICE, isValidPriceInput, ACCEPTED_PAYMENT_METHODS, isAcceptedPaymentMethod, PAYMENT_METHOD_LABELS
} from '@/lib/api';
import Combobox from '@/components/Combobox';
import MaterialPicker from '@/components/MaterialPicker';
import PremadeItemPicker from '@/components/PremadeItemPicker';
import { useVatRate } from '@/lib/useVatRate';
import { useFieldErrors, FieldError, emailProblem } from '@/lib/useFieldErrors';

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
  // useSearchParams needs a Suspense boundary for this route to prerender.
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#011c72] border-t-transparent rounded-full" />
      </div>
    }>
      <NewJobOrderForm />
    </Suspense>
  );
}

function NewJobOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // When present we are editing an existing draft rather than creating a new order.
  const draftId = searchParams.get('draftId');
  const editingDraftId = draftId ? Number(draftId) : null;
  // ?confirm=1 (the Sales page's Confirm button): open the draft at its first unfinished step
  const confirmingDraft = !!editingDraftId && searchParams.get('confirm') === '1';
  const [loadingDraft, setLoadingDraft] = useState(!!editingDraftId);
  const [retailBranches, setRetailBranches] = useState<Branch[]>([]);
  const { user, can } = useAuth();
  // Accounts with all-branch access choose which branch a job order is for;
  // everyone else's orders go to their own branch.
  const choosesBranch = can('branches.all');
  const [orderBranchId, setOrderBranchId] = useState<number | ''>('');
  // Must be one of the retail branches listed (a draft saved before may point at the warehouse)
  const orderBranchValid = orderBranchId !== '' && retailBranches.some((b) => b.id === orderBranchId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Problems with a specific field are shown next to it; `error` is for the rest
  const fe = useFieldErrors();
  // ?premadeDraftId=… : editing a saved premade draft (no stock is taken until it is confirmed)
  const premadeDraftParam = searchParams.get('premadeDraftId');
  const editingPremadeDraftId = premadeDraftParam ? Number(premadeDraftParam) : null;
  const [premadeDraft, setPremadeDraft] = useState<PremadeDraft | null>(null);
  const [loadingPremadeDraft, setLoadingPremadeDraft] = useState(!!editingPremadeDraftId);
  const [savingPremadeDraft, setSavingPremadeDraft] = useState(false);
  const [notice, setNotice] = useState('');
  // The branch whose finished goods a premade order sells (a draft keeps its own)
  const [premadeBranchId, setPremadeBranchId] = useState<number | ''>('');
  const [orderType, setOrderType] = useState<'normal' | 'premade'>(editingPremadeDraftId ? 'premade' : 'normal');

  // Order number: the next generated one by default, or one typed in by hand.
  // 'auto' sends no number, so the server generates it at save time and it can't clash.
  const [numberMode, setNumberMode] = useState<'auto' | 'manual'>('auto');
  const [typedNumber, setTypedNumber] = useState('');
  const [previewNumber, setPreviewNumber] = useState('');
  const [numberCheck, setNumberCheck] = useState<{ checking: boolean; message: string | null }>({ checking: false, message: null });
  // An existing draft keeps the number it was saved with
  const [existingNumber, setExistingNumber] = useState('');
  const numberKind: 'job' | 'premade' = orderType === 'premade' ? 'premade' : 'job';
  const numberBranchId = choosesBranch ? (orderBranchId || undefined) : (user?.branchId || undefined);
  const refreshPreviewNumber = useCallback(() => {
    if (numberKind === 'job' && !numberBranchId) { setPreviewNumber(''); return; }
    api.orderNumbers.next(numberKind, numberKind === 'job' ? numberBranchId : undefined)
      .then((r) => setPreviewNumber(r.data?.number || ''))
      .catch(() => setPreviewNumber(''));
  }, [numberKind, numberBranchId]);
  useEffect(() => { if (!editingDraftId) refreshPreviewNumber(); }, [refreshPreviewNumber, editingDraftId]);
  // A typed number is checked as you type (after a short pause)
  useEffect(() => {
    if (numberMode !== 'manual') return;
    const value = typedNumber.trim();
    if (!value) return;
    const timer = setTimeout(() => {
      setNumberCheck({ checking: true, message: null });
      api.orderNumbers.check(numberKind, value)
        .then((r) => setNumberCheck({ checking: false, message: r.data?.available ? null : (r.data?.message || 'This number cannot be used.') }))
        .catch(() => setNumberCheck({ checking: false, message: null }));
    }, 400);
    return () => clearTimeout(timer);
  }, [numberMode, typedNumber, numberKind]);
  const resetToGeneratedNumber = () => {
    setNumberMode('auto'); setTypedNumber(''); setNumberCheck({ checking: false, message: null });
    fe.clear(); refreshPreviewNumber();
  };
  /** Why the order number can't be saved yet, or false */
  const orderNumberProblem = (): string | false => {
    if (numberMode !== 'manual') return false;
    if (!typedNumber.trim()) return 'Enter the order number, or press Generate.';
    if (!/^[A-Za-z0-9][A-Za-z0-9_./-]{2,49}$/.test(typedNumber.trim()))
      return 'Use 3 to 50 letters, numbers or - _ / . (no spaces).';
    return numberCheck.message || false;
  };
  /** What to send: a typed number, or nothing so the server generates one */
  const numberPayload = numberMode === 'manual' ? typedNumber.trim() : undefined;
  /** Stop a save while the typed number can't be used, and say why next to the box */
  const orderNumberBlocked = () => {
    const problem = orderNumberProblem();
    if (!problem) return false;
    fe.show({ orderNumber: problem });
    setError(problem);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  };
  /** The server refused the number (taken meanwhile, or not allowed): show it at the box */
  const showNumberError = (err: unknown) => {
    if (err instanceof ApiError && err.body?.code === 'order_number') {
      fe.show({ orderNumber: err.message });
      if (numberMode === 'auto') refreshPreviewNumber();
    }
  };
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
  // True once the finished goods list has loaded, so stock flags never show against an empty list
  const [premadeItemsReady, setPremadeItemsReady] = useState(false);
  const [inventoryMaterials, setInventoryMaterials] = useState<RawMaterial[]>([]);

  // Customer Information
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [linkedCustomerId, setLinkedCustomerId] = useState<number | null>(null);
  const [linkedCustomerDiscount, setLinkedCustomerDiscount] = useState<number | null>(null);
  const [orderDiscount, setOrderDiscount] = useState<string>('');  // editable per-order discount %
  // Prices include VAT by default; untick for a sale without VAT
  const [vatOn, setVatOn] = useState(true);
  const vatRate = useVatRate();
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const customerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vehicle Information
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [reupholsteryItemType, setReupholsteryItemType] = useState('');
  // Make/model reference data for the searchable dropdowns
  const [vehicleMakes, setVehicleMakes] = useState<string[]>([]);
  const [vehicleModels, setVehicleModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const modelFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Year options: current year (allow next model year) down to 1970, newest first
  const yearOptions = Array.from(
    { length: new Date().getFullYear() + 1 - 1970 + 1 },
    (_, i) => String(new Date().getFullYear() + 1 - i)
  );

  // Service Information
  // Defaults to the next Saturday; staff can pick another date
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState(() => nextSaturdayManila());
  const [priority, setPriority] = useState<JobOrderPriority>('normal');

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
  // Cutter and sewer are picked from the workers of that type, by those who manage labor
  const seesLaborCost = !!user && ['administrator', 'owner', 'supervisor'].includes(user.role);
  const [cutterName, setCutterName] = useState('');
  const [sewerName, setSewerName] = useState('');
  const [slipWorkers, setSlipWorkers] = useState<ManagedWorker[]>([]);

  useEffect(() => {
    if (!seesLaborCost) return;
    api.managedWorkers.list().then(res => {
      setSlipWorkers((res.data?.workers || []).filter(w => w.isActive));
    }).catch(() => {});
  }, [seesLaborCost]);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [profitMargin, setProfitMargin] = useState(250);
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const loadPremadeItems = async () => {
      if (orderType !== 'premade') return;
      // A draft being edited sells from its own branch; wait until it has loaded
      if (editingPremadeDraftId && !premadeBranchId) return;
      const branchId = premadeBranchId || user?.branchId;
      setPremadeLoading(true);
      setPremadeItemsReady(false);
      try {
        const response = await api.inventory.getFinishedGoods(branchId ? { branchId } : undefined);
        setPremadeItems(response.data || []);
        setPremadeItemsReady(true);
      } catch (err) {
        console.error(err);
        setError('Failed to load premade inventory items.');
      } finally {
        setPremadeLoading(false);
      }
    };
    loadPremadeItems();
  }, [orderType, user?.branchId, premadeBranchId, editingPremadeDraftId]);

  // ── Load a saved premade draft (?premadeDraftId=…) ─────────────────────────
  const applyPremadeDraft = (d: PremadeDraft) => {
    setPremadeDraft(d);
    setPremadeBranchId(d.branchId);
    setCustomerName(d.customerName || '');
    setCustomerPhone(d.customerPhone || '');
    setCustomerEmail(d.customerEmail || '');
    setCustomerAddress(d.customerAddress || '');
    setLinkedCustomerId(d.customerId ?? null);
    setNotes(d.notes || '');
    // A draft saved with a method no longer accepted (card, Maya, cheque) must pick a new one
    setPaymentMethod(isAcceptedPaymentMethod(d.paymentMethod) ? d.paymentMethod : (d.paymentMethod ? '' : 'cash'));
    const lines: { productId: number | ''; quantity: number }[] =
      d.items.length > 0 ? d.items : [{ productId: '', quantity: 1 }];
    setPremadeSelections(lines.map((it, i) => ({ id: `premade-${i + 1}`, productId: it.productId, quantity: it.quantity })));
    premadeSelectionIdRef.current = lines.length;
  };

  useEffect(() => {
    if (!editingPremadeDraftId) return;
    let cancelled = false;
    setLoadingPremadeDraft(true);
    api.premadeDrafts.get(editingPremadeDraftId)
      .then((res) => {
        if (cancelled || !res.data) return;
        if (res.data.status !== 'draft') {
          setError(`This draft was already recorded as ${res.data.productOrderNumber || 'an order'}.`);
          return;
        }
        applyPremadeDraft(res.data);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the draft.'); })
      .finally(() => { if (!cancelled) setLoadingPremadeDraft(false); });
    return () => { cancelled = true; };
  }, [editingPremadeDraftId]);

  // Also called by the material lookup window, so it shows current stock and prices
  const reloadInventoryMaterials = useCallback(async () => {
    const response = await api.inventory.getRawMaterials(
      user?.branchId ? { branchId: user.branchId, includeWarehouse: true } : undefined
    );
    setInventoryMaterials(response.data || []);
  }, [user?.branchId]);

  useEffect(() => {
    if (orderType !== 'normal') return;
    reloadInventoryMaterials().catch((err) => console.error('Failed to load inventory materials:', err));
  }, [orderType, reloadInventoryMaterials]);

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

  // Load the list of vehicle makes once.
  useEffect(() => {
    api.vehicles.getMakes()
      .then((res) => setVehicleMakes(res.data || []))
      .catch((err) => console.error('Failed to load vehicle makes:', err));
  }, []);

  // Load models for the selected make (debounced so free-typing doesn't spam
  // the API). Falls back to an empty list for makes not in our reference data,
  // in which case the user can still free-type a model.
  useEffect(() => {
    const make = vehicleMake.trim();
    if (modelFetchTimerRef.current) clearTimeout(modelFetchTimerRef.current);
    if (!make) { setVehicleModels([]); return; }
    modelFetchTimerRef.current = setTimeout(async () => {
      setLoadingModels(true);
      try {
        const res = await api.vehicles.getModels(make);
        setVehicleModels(res.data || []);
      } catch { setVehicleModels([]); }
      finally { setLoadingModels(false); }
    }, 350);
    return () => { if (modelFetchTimerRef.current) clearTimeout(modelFetchTimerRef.current); };
  }, [vehicleMake]);

  const linkCustomer = (c: Customer) => {
    setLinkedCustomerId(c.id);
    setLinkedCustomerDiscount(c.discountPercent ?? null);
    // Pre-fill the order discount from the customer's loyalty discount (still editable).
    if (c.discountPercent != null) setOrderDiscount(String(c.discountPercent));
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

  // A draft keeps every line, even one that sold out since it was saved: it is
  // flagged here with the stock on hand now, and can't be confirmed until it fits.
  const premadeStockIssue = (s: PremadeSelection): string | null => {
    if (!s.productId || !premadeItemsReady) return null;
    const item = premadeItems.find((i) => i.id === s.productId);
    if (!item) return 'No longer sold at this branch';
    const wanted = premadeSelections.filter((x) => x.productId === s.productId)
      .reduce((n, x) => n + x.quantity, 0);
    const stock = Number(item.quantity) || 0;
    if (stock <= 0) return 'Out of stock';
    if (stock < wanted) return `Insufficient stock: only ${stock} available`;
    return null;
  };
  const premadeHasStockIssue = !premadeLoading && premadeSelections.some((s) => premadeStockIssue(s) !== null);

  const premadeTotal = premadeSelections.reduce((sum, s) => {
    if (!s.productId) return sum;
    const item = premadeItems.find((i) => i.id === s.productId);
    return item ? sum + item.price * s.quantity : sum;
  }, 0);

  /** Step 1 of a premade order: customer, and every line has an item and a whole quantity */
  const premadeItemProblems = (forConfirm: boolean): Record<string, string | false> => {
    const lines = Object.fromEntries(premadeSelections.map((s) => [`premade-${s.id}`,
      !s.productId ? (premadeSelections.length > 1 ? 'Choose a premade item, or remove this line.' : false)
        : !(Number.isInteger(s.quantity) && s.quantity >= 1) ? 'Quantity must be a whole number of 1 or more.'
        : false,
    ]));
    const hasItems = premadeSelections.some((s) => s.productId);
    return {
      customerName: !customerName.trim() && 'Customer name is required.',
      customerEmail: emailProblem(customerEmail) || false,
      premadeItems: !hasItems ? 'Please select at least one premade item.'
        : premadeHasStockIssue && (forConfirm && editingPremadeDraftId
          ? 'Some items are out of stock or short. Edit the draft, remove them, or wait for stock.'
          : 'Some items are out of stock or short. Lower or remove them, or save the draft and wait for stock.'),
      ...lines,
    };
  };

  /** Step 2: the amount paid now (0 = unpaid) and, only when something is paid, how */
  const premadePaymentProblems = (): Record<string, string | false> => {
    const paid = paymentAmount === '' ? 0 : Number(paymentAmount);
    return {
      paymentAmount: !Number.isFinite(paid) ? 'Enter the amount paid as a number.'
        : paid < 0 ? 'Amount paid cannot be negative.'
        : Math.abs(paid * 100 - Math.round(paid * 100)) > 1e-6 ? 'Use at most 2 decimal places.'
        : paid > premadeTotal + 1e-9 && `Amount paid can't be more than the total of ₱${premadeTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`,
      paymentMethod: paid > 0 && !isAcceptedPaymentMethod(paymentMethod) && 'Choose how it was paid: Cash, GCash or Bank Transfer.',
    };
  };

  const materialTotal = materials.reduce(
    (sum, m) => sum + (Number(m.quantity) || 0) * (Number(m.unitPrice) || 0),
    0
  );
  const suggestedPrice = materialTotal > 0 ? materialTotal * (profitMargin / 100) : 0;

  // Per-order discount: clamp 0–100, derive the discounted total and savings.
  const orderDiscountPct = Math.min(Math.max(Number(orderDiscount) || 0, 0), 100);
  const discountAmount = estimatedTotal > 0 ? Math.round(estimatedTotal * (orderDiscountPct / 100) * 100) / 100 : 0;
  // The price already includes VAT: the customer pays the discounted price, and
  // VAT is the share of it shown below (never added on top). The server works
  // the total out again with the rate saved in Settings.
  const vatPct = vatOn ? vatRate : 0;
  const finalTotal = estimatedTotal > 0 ? jobOrderTotalFrom(estimatedTotal, orderDiscountPct) : 0;
  const vatAmount = vatBreakdown(finalTotal, vatPct).vat;

  // ── Steps: 1 Customer → 2 Service → 3 Vehicle → 4 Materials → 5 Review.
  // Reupholstery on its own is furniture, not a car: the Vehicle step is skipped.
  const reupholsteryOnly = reupholstery.selected && !flooring.selected && !ceiling.selected
    && !sidings.selected && !seatCovers.selected && !otherServices.selected;
  const skipVehicle = reupholsteryOnly;
  const nextStepOf = (s: number) => (s === 2 && skipVehicle ? 4 : s + 1);
  const prevStepOf = (s: number) => (s === 4 && skipVehicle ? 2 : s - 1);

  /** What is missing or wrong on a step (empty when it is complete). Kept in line
   *  with the server's checks in create_job_order. */
  const stepProblems = (n: number): Record<string, string | false> => {
    if (n === 1) return {
      orderBranch: choosesBranch && !orderBranchValid && 'Choose which branch this job order is for.',
      customerName: !customerName.trim() && 'Customer name is required.',
      customerEmail: emailProblem(customerEmail) || false,
    };
    if (n === 2) {
      const anyService = flooring.selected || reupholstery.selected || ceiling.selected ||
        sidings.selected || seatCovers.selected || otherServices.selected;
      const needMaterial = (on: boolean, value: string) => on && !value.trim() && 'Specify the material for this service.';
      return {
        services: !anyService && 'Please select at least one service.',
        'svc-flooring': needMaterial(flooring.selected, flooring.material),
        reupholsteryItem: reupholstery.selected && !reupholsteryItemType.trim() && 'Please specify what item will be reupholstered.',
        'svc-reupholstery': needMaterial(reupholstery.selected, reupholstery.material),
        'svc-ceiling': needMaterial(ceiling.selected, ceiling.material),
        'svc-sidings': needMaterial(sidings.selected, sidings.material),
        'svc-seatCovers': needMaterial(seatCovers.selected, seatCovers.material),
        'svc-other': otherServices.selected && !otherServices.description.trim() && 'Describe the service needed.',
        completionDate: !estimatedCompletionDate ? 'Choose the estimated completion date.'
          : estimatedCompletionDate < manilaDateString() && 'Estimated completion date cannot be in the past.',
      };
    }
    if (n === 3) {
      if (skipVehicle) return {};
      const year = Number(vehicleYear);
      const maxYear = new Date().getFullYear() + 1;
      return {
        vehicleMake: !vehicleMake.trim() && 'Enter the vehicle make.',
        vehicleModel: !vehicleModel.trim() && 'Enter the vehicle model.',
        vehicleYear: !vehicleYear.trim() ? 'Enter the vehicle year.'
          : (!Number.isInteger(year) || year < 1970 || year > maxYear) && `Enter a year from 1970 to ${maxYear}.`,
      };
    }
    if (n === 4) {
      const seen = new Set<string>();
      const rows = Object.fromEntries(materials.map((m) => {
        const key = m.materialSource === 'inventory' ? `inv-${m.materialId}` : `new-${m.name.trim().toLowerCase()}`;
        const duplicate = (m.materialSource === 'inventory' ? !!m.materialId : !!m.name.trim()) && seen.has(key);
        seen.add(key);
        const problem =
          m.materialSource === 'inventory' && !m.materialId ? 'Select a material from inventory, or switch this row to "Type New".'
          : !m.name.trim() ? 'Enter a name for this material.'
          : duplicate ? 'This material is already on another row. Change the quantity there instead.'
          : !(Number(m.quantity) > 0) ? 'Quantity must be more than 0.'
          : !(Number(m.unitPrice) > 0) ? 'Unit price must be more than ₱0.'
          : '';
        return [`material-${m.id}`, problem];
      }));
      return { materialsList: materials.length === 0 && 'Add at least one material for this job.', ...rows };
    }
    if (n === 5) {
      const discount = Number(orderDiscount || 0);
      return {
        price: !(estimatedTotal > 0) ? 'Enter the price for the work.'
          : estimatedTotal > MAX_JOB_ORDER_PRICE && 'Price for the work must be less than ₱100,000,000.',
        discount: (!Number.isFinite(discount) || discount < 0 || discount > 100) && 'Discount must be between 0 and 100%.',
        paymentMethod: !isAcceptedPaymentMethod(paymentMethod) && 'Choose the payment method: Cash, GCash or Bank Transfer.',
      };
    }
    return {};
  };

  const goNext = () => {
    setError(''); fe.clear();
    setStep((s) => nextStepOf(s));
  };

  const goBack = () => {
    setError(''); fe.clear();
    setStep((s) => Math.max(1, prevStepOf(s)));
  };

  /** What was typed on each service card; kept on the slip data so a draft reopens with it */
  const serviceDetails = () => ({
    flooring: flooring.material, reupholstery: reupholstery.material,
    ceiling: ceiling.material, sidings: sidings.material,
    seatCovers: { design: seatCovers.design, material: seatCovers.material, pocket: seatCovers.pocket, others: seatCovers.others },
    other: otherServices.description,
  });
  const buildSlipData = () => ({
    rows: slipRows,
    materialCenter, materialSides, materialBack,
    dStitch, piping, pockets, logo, specification,
    ...(seesLaborCost ? { cutterName, sewerName } : {}),
    serviceDetails: serviceDetails(),
  });

  // Confirming a draft: once it has loaded, open the first step with something
  // missing (with the messages shown), or the review step if it is complete.
  const confirmChecked = useRef(false);
  useEffect(() => {
    if (!confirmingDraft || loadingDraft || confirmChecked.current) return;
    confirmChecked.current = true;
    for (const n of [1, 2, 3, 4, 5]) {
      const problems = stepProblems(n);
      if (Object.values(problems).some(Boolean)) { setStep(n); fe.show(problems); return; }
    }
    setStep(5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmingDraft, loadingDraft]);

  // ── Load an existing draft for editing (?draftId=…) ───────────────────────
  // saveDraft stores the chosen services as a joined description string, so the
  // services are parsed back out of it here.
  useEffect(() => {
    if (!editingDraftId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await api.sales.getJobOrder(editingDraftId);
        const d = res.data;
        if (cancelled || !d) return;
        if (d.status !== 'draft') {
          setError('That order is no longer a draft and cannot be edited here.');
          return;
        }

        setCustomerName(d.customerName || '');
        setCustomerPhone(d.customerPhone || '');
        setCustomerEmail(d.customerEmail || '');
        if (d.customerId) setLinkedCustomerId(d.customerId);
        if (d.branchId) setOrderBranchId(d.branchId);
        setExistingNumber(d.jobOrderId || '');
        if (d.discountPercent != null) setOrderDiscount(String(d.discountPercent));
        setVatOn(Number(d.vatPercent) > 0);
        // Restore the price (it used to be lost when reopening a draft)
        // As a VAT-inclusive price, so saving keeps the draft's total (older drafts too)
        if (Number(d.totalPrice) > 0) {
          setEstimatedTotal(jobOrderPriceBreakdown(Number(d.totalPrice), d.discountPercent, d.vatPercent, true).subtotal);
        }
        if (d.notes) setNotes(d.notes);
        if (d.priority) setPriority(d.priority);
        if (d.estimatedCompletion) setEstimatedCompletionDate(String(d.estimatedCompletion).slice(0, 10));

        const v: Partial<VehicleInfo> = d.vehicleInfo || {};
        if (v.make === 'Reupholstery') {
          setReupholsteryItemType(v.model || '');
        } else {
          setVehicleMake(v.make && v.make !== 'N/A' ? v.make : '');
          setVehicleModel(v.model && v.model !== 'N/A' ? v.model : '');
          setVehicleYear(v.year ? String(v.year) : '');
          setVehiclePlate(v.plateNumber || '');
        }

        const services = String(d.description || '').toLowerCase();
        if (services.includes('flooring')) setFlooring(s => ({ ...s, selected: true }));
        if (services.includes('reupholstery')) {
          setReupholstery(s => ({ ...s, selected: true }));
          const match = services.match(/reupholstery \(([^)]*)\)/);
          if (match) setReupholsteryItemType(match[1]);
        }
        if (services.includes('ceiling')) setCeiling(s => ({ ...s, selected: true }));
        if (services.includes('sidings')) setSidings(s => ({ ...s, selected: true }));
        if (services.includes('seat_covers')) setSeatCovers(s => ({ ...s, selected: true }));
        if (services.includes('other')) setOtherServices(s => ({ ...s, selected: true }));

        // The slip and each service's details are kept on the draft's slip data
        const slip = d.slipData || {};
        const savedRows = slip.rows;
        if (Array.isArray(savedRows) && savedRows.length) {
          setSlipRows([0, 1, 2, 3].map((i) => ({ description: savedRows[i]?.description || '', hr: savedRows[i]?.hr || '' })));
        }
        setMaterialCenter(slip.materialCenter || ''); setMaterialSides(slip.materialSides || ''); setMaterialBack(slip.materialBack || '');
        setDStitch(slip.dStitch || ''); setPiping(slip.piping || ''); setPockets(slip.pockets || ''); setLogo(slip.logo || '');
        setSpecification(slip.specification || '');
        if (slip.cutterName) setCutterName(slip.cutterName);
        if (slip.sewerName) setSewerName(slip.sewerName);
        const sd = slip.serviceDetails || {};
        setFlooring(s => ({ ...s, material: sd.flooring || '' }));
        setReupholstery(s => ({ ...s, material: sd.reupholstery || '' }));
        setCeiling(s => ({ ...s, material: sd.ceiling || '' }));
        setSidings(s => ({ ...s, material: sd.sidings || '' }));
        setSeatCovers(s => ({ ...s, ...(sd.seatCovers || {}) }));
        setOtherServices(s => ({ ...s, description: sd.other || '' }));

        setMaterials((d.items || []).map((it, idx: number) => ({
          id: `draft-${idx}`,
          materialSource: it.materialId ? 'inventory' : 'custom',
          materialId: it.materialId ?? '',
          name: it.name || '',
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice ?? it.materialCost) || 0,
        })));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load draft.');
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();

    return () => { cancelled = true; };
  }, [editingDraftId]);

  useEffect(() => {
    if (!choosesBranch) return;
    api.settings.getBranchesPublic()
      .then((res) => {
        const retail = (res.data || []).filter((b) => !b.isWarehouse && b.isActive);
        setRetailBranches(retail);
        // A reopened draft keeps its branch only if it is still a retail branch
        setOrderBranchId((cur) => (cur && retail.some((b) => b.id === cur) ? cur : ''));
      })
      .catch(() => setRetailBranches([]));
  }, [choosesBranch]);

  // Save the current (possibly incomplete) job order as a draft so work isn't lost.
  // Drafts stay out of sales/pending counts until confirmed.
  const saveDraft = async () => {
    setError('');
    const draftProblems = {
      orderBranch: choosesBranch && !orderBranchValid && 'Choose which branch this job order is for.',
      customerName: !customerName.trim() && 'Enter a customer name to save a draft.',
      customerEmail: emailProblem(customerEmail),
    };
    if (Object.values(draftProblems).some(Boolean)) { setStep(1); fe.show(draftProblems); return; }
    if (!editingDraftId && orderNumberBlocked()) return;
    setLoading(true);
    try {
      const branchId = choosesBranch ? (orderBranchId as number) : (user?.branchId || 1);

      const selectedServices: string[] = [];
      if (flooring.selected) selectedServices.push('flooring');
      if (reupholstery.selected) selectedServices.push(reupholsteryItemType.trim() ? `reupholstery (${reupholsteryItemType.trim()})` : 'reupholstery');
      if (ceiling.selected) selectedServices.push('ceiling');
      if (sidings.selected) selectedServices.push('sidings');
      if (seatCovers.selected) selectedServices.push('seat_covers');
      if (otherServices.selected) selectedServices.push('other');
      const description = selectedServices.join(', ') || 'Draft order';

      const normalizedItems = materials
        .filter((m) => m.name.trim())
        .map((m) => ({
          name: m.name.trim(),
          materialId: m.materialId ? Number(m.materialId) : undefined,
          quantity: Number(m.quantity) || 0,
          unitPrice: Number(m.unitPrice) || 0,
          materialCost: Number(m.unitPrice) || 0,
          laborCost: 0,
        }));

      const vehicleInfo = reupholsteryOnly
        ? { make: 'Reupholstery', model: reupholsteryItemType.trim(), year: new Date().getFullYear(), plateNumber: '' }
        : { make: vehicleMake || 'N/A', model: vehicleModel || 'N/A', year: Number(vehicleYear) || null, plateNumber: vehiclePlate || '' };

      const draftData = {
        isDraft: true,
        customerName, customerPhone, customerEmail,
        ...(linkedCustomerId ? { customerId: linkedCustomerId } : {}),
        branchId,
        description,
        vehicleInfo,
        items: normalizedItems,
        notes,
        priority,
        discountPercent: orderDiscountPct,
        vatIncluded: vatOn,
        slipData: buildSlipData(),
        ...(estimatedCompletionDate ? { estimatedCompletion: estimatedCompletionDate } : {}),
        ...(estimatedTotal > 0 ? { estimatedCost: estimatedTotal, priceForWork: estimatedTotal } : {}),
        // Only a new draft takes a number; an existing one keeps its own
        ...(!editingDraftId && numberPayload ? { jobOrderNumber: numberPayload } : {}),
      };

      if (editingDraftId) {
        // Editing an existing draft — update in place so we don't leave a duplicate.
        const { isDraft: _isDraft, ...updates } = draftData;
        await api.sales.updateJobOrder(editingDraftId, updates);
      } else {
        await api.sales.createJobOrder(draftData);
      }
      router.push('/sales');
    } catch (err) {
      showNumberError(err);
      setError(err instanceof Error && err.message ? err.message : 'Failed to save draft.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (orderType === 'normal' && step < 5) {
      setError('');
      if (fe.show(stepProblems(step))) return;
      goNext();
      return;
    }

    // Premade step 1 → 2
    if (orderType === 'premade' && premadeStep === 1) {
      setError('');
      if (fe.show(premadeItemProblems(false))) return;
      setPremadeStep(2);
      return;
    }

    if (!editingDraftId && orderNumberBlocked()) return;
    setLoading(true);
    setError('');

    // ── Premade order submit ──────────────────────────────────────────────────
    if (orderType === 'premade') {
      const selected = premadeSelections.filter((s) => s.productId && s.quantity > 0);
      const itemProblems = premadeItemProblems(true);
      if (Object.values(itemProblems).some(Boolean)) {
        setLoading(false);
        setPremadeStep(1);
        fe.show(itemProblems);
        return;
      }
      if (fe.show(premadePaymentProblems())) { setLoading(false); return; }
      const paidNow = typeof paymentAmount === 'number' ? paymentAmount : 0;
      // The method only means something when money changed hands
      const methodPaid = paidNow > 0 ? paymentMethod : undefined;

      if (editingPremadeDraftId) {
        try {
          // Save what is on screen first, so the recorded order matches it
          await api.premadeDrafts.update(editingPremadeDraftId, premadeDraftInput());
          const recorded = await api.premadeDrafts.confirm(editingPremadeDraftId, {
            paymentAmount: paidNow,
            paymentMethod: methodPaid,
            ...(numberPayload ? { orderNumber: numberPayload } : {}),
          });
          // Straight to the recorded order (Product Orders is no longer in the menu)
          router.push(recorded.data?.id ? `/product-orders/${recorded.data.id}` : '/sales');
        } catch (err) {
          // Stock moved since the page loaded: show the draft as it stands now
          if (err instanceof ApiError && err.status === 409 && err.body?.data) {
            applyPremadeDraft(err.body.data as PremadeDraft);
            const fresh = await api.inventory.getFinishedGoods({ branchId: (err.body.data as PremadeDraft).branchId })
              .catch(() => null);
            if (fresh?.data) setPremadeItems(fresh.data);
            setPremadeStep(1);
          }
          showNumberError(err);
          setError(err instanceof Error && err.message ? err.message : 'Failed to record the job order.');
        } finally {
          setLoading(false);
        }
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
        const branchId = premadeBranchId || user?.branchId || inferredBranchId;
        if (branchId !== inferredBranchId) {
          setError('Selected finished goods do not match your assigned branch.');
          setLoading(false);
          return;
        }

        const premadeNotes = [notes, 'Order Source: Walk-in', methodPaid && `Payment Method: ${methodPaid}`]
          .filter(Boolean).join('\n');

        const recorded = await api.productOrders.create({
          customerName, customerPhone, customerEmail, customerAddress, branchId,
          notes: premadeNotes,
          paymentAmount: paidNow,
          paymentMethod: methodPaid,
          items: selected.map((s) => ({ productId: s.productId as number, quantity: s.quantity })),
          ...(numberPayload ? { orderNumber: numberPayload } : {}),
        });

        router.push(recorded.data?.id ? `/product-orders/${recorded.data.id}` : '/sales');
      } catch (err) {
        showNumberError(err);
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

    // Every step is checked again: something may have changed since (e.g. the date passed,
    // or a service was added so the vehicle is now needed). Open the first step with a problem.
    for (const n of [1, 2, 3, 4, 5]) {
      const problems = stepProblems(n);
      if (Object.values(problems).some(Boolean)) {
        setLoading(false); setStep(n);
        fe.show(problems);
        return;
      }
    }
    const branchId = choosesBranch ? (orderBranchId as number) : (user?.branchId || 1);

    // Add typed-in materials to inventory first (flagged as needed), so the order's
    // lines carry their inventory id and the stock is deducted when the job completes.
    const createdIds = new Map<string, number>();
    for (const m of materials.filter((x) => x.materialSource === 'custom' && x.name.trim())) {
      const existing = inventoryMaterials.find(
        (inv) => inv.materialType.trim().toLowerCase() === m.name.trim().toLowerCase());
      if (existing) { createdIds.set(m.id, existing.id); continue; }
      try {
        const res = await api.inventory.createRawMaterial({
          materialType: m.name.trim(),
          color: '', pattern: '',
          unitPrice: Number(m.unitPrice) || 0,
          stockQuantity: 0,
          branchId,
          status: 'needed',
        });
        if (res.data) createdIds.set(m.id, res.data.id);
      } catch (customErr) {
        console.error('Failed to save needed material:', customErr);
      }
    }

    const normalizedItems = materials.map((m) => ({
      name: m.name.trim(),
      category: 'material' as const,
      materialId: m.materialId ? Number(m.materialId) : createdIds.get(m.id),
      quantity: Number(m.quantity) || 0,
      unitPrice: Number(m.unitPrice) || 0,
      materialCost: Number(m.unitPrice) || 0,
      laborCost: 0
    }));

    if (normalizedItems.length === 0) {
      normalizedItems.push({ name: 'Service Package', category: 'material', materialId: undefined, quantity: 1, unitPrice: 0, materialCost: 0, laborCost: 0 });
    }

    if (labor.length > 0) {
      const totalLaborCost = labor.reduce(
        (sum, item) => sum + (Number(item.hours) || 0) * (Number(item.rate) || 0), 0
      );
      normalizedItems[0].laborCost = totalLaborCost;
    }

    const serviceDescription = selectedServices
      .map((s) => s.type === 'reupholstery' && s.itemType ? `reupholstery (${s.itemType})` : s.type)
      .join(', ');

    const computedVehicleInfo = reupholsteryOnly
      ? { make: 'Reupholstery', model: reupholsteryItemType.trim(), year: new Date().getFullYear(), plateNumber: '' }
      : { make: vehicleMake || 'N/A', model: vehicleModel || 'N/A', year: Number(vehicleYear) || new Date().getFullYear(), plateNumber: vehiclePlate || '' };

    const estimatedCompletion = estimatedCompletionDate || new Date().toISOString().slice(0, 10);

    const hasSlipData = slipRows.some((r) => r.description || r.hr) ||
      materialCenter || materialSides || materialBack ||
      dStitch || piping || pockets || logo || specification || cutterName || sewerName;

    const slipData = hasSlipData ? buildSlipData() : { serviceDetails: serviceDetails() };

    const grossTotal = estimatedTotal > 0 ? estimatedTotal : materialTotal;
    const orderTotal = jobOrderTotalFrom(grossTotal, orderDiscountPct);
    const finalDown = estimatedTotal > 0 ? Math.round((orderTotal / 2) * 100) / 100 : 0;

    try {
      const jobOrderData = {
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
        priority,
        discountPercent: orderDiscountPct,
        vatIncluded: vatOn,
        slipData,
        ...(orderTotal > 0 ? { estimatedCost: grossTotal, priceForWork: grossTotal } : {}),
      };

      if (editingDraftId) {
        // Confirm this draft in place (keeps its number, no duplicate left behind).
        // Money goes through Payments, so the down payment is recorded after, as a new order's is.
        const { downPayment: _down, paymentMethod: _method, ...updates } = jobOrderData;
        await api.sales.updateJobOrder(editingDraftId, { ...updates, status: 'pending' });
        if (finalDown > 0) {
          try {
            await api.payments.create({ jobOrderId: editingDraftId, amount: finalDown, paymentMethod, notes: 'Down payment' });
          } catch (payErr) {
            const why = payErr instanceof Error && payErr.message ? payErr.message : 'unknown error';
            setError(`The job order was confirmed, but its down payment was not recorded (${why}). Record it from the job order's Payments panel.`);
            return;
          }
        }
      } else {
        await api.sales.createJobOrder({ ...jobOrderData, ...(numberPayload ? { jobOrderNumber: numberPayload } : {}) });
      }
      router.push('/sales');
    } catch (err) {
      showNumberError(err);
      setError(err instanceof Error && err.message ? err.message : 'Failed to create job order. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const premadeDraftInput = () => ({
    customerId: linkedCustomerId,
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    customerEmail: customerEmail.trim(),
    customerAddress: customerAddress.trim(),
    notes,
    paymentMethod,
    items: premadeSelections.filter((s) => s.productId && s.quantity > 0)
      .map((s) => ({ productId: s.productId as number, quantity: s.quantity })),
  });

  // Saves without taking stock. A new draft is opened in place afterwards, so
  // saving again updates the same draft instead of making another.
  const savePremadeDraft = async () => {
    setError(''); setNotice('');
    const firstProduct = premadeItems.find((i) => premadeSelections.some((s) => s.productId === i.id));
    const branchId = premadeBranchId || user?.branchId || firstProduct?.branchId;
    const draftProblems = {
      customerName: !customerName.trim() && 'Enter the customer name to save a draft.',
      customerEmail: emailProblem(customerEmail),
      premadeItems: !branchId && 'Select at least one product so the draft knows which branch it sells from.',
    };
    if (!branchId || Object.values(draftProblems).some(Boolean)) { setPremadeStep(1); fe.show(draftProblems); return; }
    setSavingPremadeDraft(true);
    try {
      if (editingPremadeDraftId) {
        const res = await api.premadeDrafts.update(editingPremadeDraftId, premadeDraftInput());
        if (res.data) applyPremadeDraft(res.data);
        setNotice('Draft saved. No stock has been taken.');
      } else {
        const res = await api.premadeDrafts.create({ ...premadeDraftInput(), branchId });
        if (res.data) router.replace(`/sales/new?premadeDraftId=${res.data.id}&saved=1`);
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to save the draft.');
    } finally {
      setSavingPremadeDraft(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('saved')) setNotice('Draft saved. No stock has been taken; confirm it when the customer is ready.');
  }, [searchParams]);

  const premadePaymentAmount = typeof paymentAmount === 'number' ? paymentAmount : 0;
  const isPremadeFullPayment = premadePaymentAmount >= premadeTotal && premadeTotal > 0;
  const isPremadePartialPayment = premadePaymentAmount > 0 && premadePaymentAmount < premadeTotal;
  const premadeRemaining = Math.max(0, premadeTotal - premadePaymentAmount);

  const renderPremadeForm = () => {
    if (premadeStep === 1) {
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2 flex-wrap">
              {premadeDraft ? <>Premade Draft {premadeDraft.draftNumber}</> : 'Premade Order'}
              {premadeDraft && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">Draft</span>
              )}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Step 1 of 2 — Customer &amp; Items
              {premadeDraft?.branchName ? ` · ${premadeDraft.branchName}` : ''}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div {...fe.field('customerName')}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Customer Name *</label>
                <input type="text" value={customerName} onChange={(e) => { setCustomerName(e.target.value); unlinkCustomer(); }} required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="Customer name" />
                <FieldError message={fe.errors.customerName} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number <span className="font-normal text-gray-400">(optional)</span></label>
                <input type="tel" value={customerPhone} onChange={(e) => { setCustomerPhone(e.target.value); unlinkCustomer(); }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="09XX XXX XXXX" />
              </div>
              <div {...fe.field('customerEmail')}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="customer@email.com" />
                <FieldError message={fe.errors.customerEmail} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="Customer address" />
              </div>
            </div>
            {linkedCustomerId ? (
              <p className="mt-3 text-xs text-green-700">
                Linked to an existing customer record.{' '}
                <button type="button" onClick={unlinkCustomer} className="underline">Unlink</button>
              </p>
            ) : customerSuggestions.length > 0 && (
              <div className="mt-3 border border-[#c7d2f5] rounded-xl overflow-hidden">
                <div className="bg-[#eef1fb] px-4 py-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#011c72]">
                    {customerSuggestions.length} existing customer{customerSuggestions.length !== 1 ? 's' : ''} found
                  </p>
                  <button type="button" onClick={() => setCustomerSuggestions([])} className="text-xs text-[#011c72] underline">Dismiss</button>
                </div>
                {customerSuggestions.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-white">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-500 truncate">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                    </div>
                    <button type="button" onClick={() => linkCustomer(c)}
                      className="text-xs font-medium text-white bg-[#011c72] hover:bg-[#022494] px-3 py-1.5 rounded-lg shrink-0 ml-3">
                      Use This Customer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div {...fe.field('premadeItems', true)}>
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
                  <div className="hidden md:grid grid-cols-12 gap-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <div className="col-span-5">Item</div>
                    <div className="col-span-2">Qty</div>
                    <div className="col-span-2 text-right">Unit Price</div>
                    <div className="col-span-2 text-right">Amount</div>
                    <div className="col-span-1"></div>
                  </div>
                  {premadeSelections.map((selection) => {
                    const selectedItem = premadeItems.find((i) => i.id === selection.productId);
                    const stockIssue = premadeStockIssue(selection);
                    // A saved line whose product is no longer listed keeps its saved name
                    const savedLine = !selectedItem && selection.productId
                      ? premadeDraft?.items.find((it) => it.productId === selection.productId) : undefined;
                    return (
                      <div key={selection.id} {...fe.field(`premade-${selection.id}`)}
                        className={`grid grid-cols-1 md:grid-cols-12 gap-3 p-3 rounded-lg border ${stockIssue || fe.errors[`premade-${selection.id}`] ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="md:col-span-5">
                          <PremadeItemPicker
                            items={premadeItems}
                            value={selection.productId}
                            onSelect={(id) => updatePremadeSelection(selection.id, 'productId', id)}
                            takenIds={new Set(premadeSelections.filter((x) => x.id !== selection.id && x.productId).map((x) => Number(x.productId)))}
                            fallbackLabel={savedLine ? `${savedLine.name} (no longer available)` : undefined}
                            disabled={premadeItems.length === 0 && !savedLine}
                            invalid={!!fe.errors[`premade-${selection.id}`]}
                          />
                          {stockIssue && (
                            <p className="mt-1 text-xs font-semibold text-red-700">{stockIssue}</p>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          {/* Not capped at the stock: a draft may wait for stock, and is flagged above instead */}
                          <input type="number" min={1}
                            value={selection.quantity}
                            onChange={(e) => {
                              updatePremadeSelection(selection.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1));
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm" />
                        </div>
                        {/* The product's set price: read-only, the server charges this price too */}
                        <div className="md:col-span-2">
                          <input type="text" readOnly tabIndex={-1} aria-label="Unit price (fixed)"
                            value={selectedItem ? `₱${selectedItem.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                            title="Fixed price from inventory"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm text-right cursor-not-allowed" />
                        </div>
                        <div className="md:col-span-2 flex items-center justify-end text-sm font-semibold text-gray-900">
                          {selectedItem ? `₱${(selectedItem.price * selection.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                        </div>
                        <div className="md:col-span-1 flex items-center justify-end">
                          <button type="button" onClick={() => removePremadeSelection(selection.id)}
                            disabled={premadeSelections.length === 1} title="Remove this item"
                            className="p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <FieldError message={fe.errors[`premade-${selection.id}`]} className="md:col-span-12 mt-0" />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <FieldError message={fe.errors.premadeItems} />
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

        {/* Payment details: total, amount paid now, what is left, how it was paid, and the resulting status */}
        <div className="rounded-xl border border-gray-200 p-4 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Total Amount</label>
              <input type="text" readOnly tabIndex={-1}
                value={`₱${premadeTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 font-semibold cursor-not-allowed" />
            </div>
            <div {...fe.field('paymentAmount')}>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amount Paid</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₱</span>
                <input type="number" min="0" step="0.01" max={premadeTotal} value={paymentAmount}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                    setPaymentAmount(val === '' ? '' : (isNaN(val as number) ? '' : val as number));
                  }}
                  className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  placeholder="0.00" />
              </div>
              <FieldError message={fe.errors.paymentAmount} />
              <button type="button" onClick={() => setPaymentAmount(premadeTotal)} disabled={premadeTotal <= 0}
                className="mt-1 text-xs font-medium text-[#011c72] hover:underline disabled:opacity-50">
                Pay in full
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Remaining Balance</label>
              <input type="text" readOnly tabIndex={-1}
                value={`₱${premadeRemaining.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
              <div className="h-[42px] flex items-center">
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  isPremadeFullPayment ? 'bg-green-100 text-green-700'
                  : isPremadePartialPayment ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-100 text-gray-600'}`}>
                  {isPremadeFullPayment ? 'Fully Paid' : isPremadePartialPayment ? 'Partially Paid' : 'Unpaid'}
                </span>
              </div>
            </div>
          </div>
          <div {...fe.field('paymentMethod')}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method {premadePaymentAmount > 0
                ? <span className="text-red-500">*</span>
                : <span className="font-normal text-gray-400">(needed only when something is paid)</span>}
            </label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent">
              {!isAcceptedPaymentMethod(paymentMethod) && <option value="">Choose a payment method</option>}
              {ACCEPTED_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
            <FieldError message={fe.errors.paymentMethod} />
          </div>
          {isPremadePartialPayment && (
            <p className="text-xs text-gray-500">The remaining balance can be settled from the order detail page.</p>
          )}
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
    { num: 2, label: 'Service', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )},
    { num: 3, label: 'Vehicle', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l1 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1" />
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

            {/* All-branch accounts say which branch the work is for */}
            {choosesBranch && (
              <div {...fe.field('orderBranch')}>
                <label htmlFor="order-branch" className="block text-sm font-medium text-gray-700 mb-2">
                  Branch <span className="text-red-500">*</span>
                </label>
                <select id="order-branch" value={orderBranchId}
                  onChange={(e) => { setOrderBranchId(e.target.value ? Number(e.target.value) : ''); setError(''); }}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent">
                  <option value="">Select the branch this order is for</option>
                  {retailBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Your account works across branches, so choose the branch where this work or order belongs.
                </p>
                <FieldError message={fe.errors.orderBranch} />
              </div>
            )}

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
              <div {...fe.field('customerName')}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input type="text" value={customerName}
                  onChange={(e) => { setCustomerName(e.target.value); unlinkCustomer(); }}
                  required className={inputCls} placeholder="e.g. Juan dela Cruz" autoFocus />
                <FieldError message={fe.errors.customerName} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input type="tel" value={customerPhone}
                  onChange={(e) => { setCustomerPhone(e.target.value); unlinkCustomer(); }}
                  className={inputCls} placeholder="09XX XXX XXXX" />
              </div>
              <div {...fe.field('customerEmail')}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input type="email" value={customerEmail}
                  onChange={(e) => { setCustomerEmail(e.target.value); unlinkCustomer(); }}
                  className={inputCls} placeholder="customer@email.com" />
                <FieldError message={fe.errors.customerEmail} />
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

      // ── Step 3: Vehicle ────────────────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Vehicle Information</h3>
              <p className="text-sm text-gray-500 mt-1">Tell us about the vehicle</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div {...fe.field('vehicleMake')}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Make <span className="text-red-500">*</span></label>
                <Combobox
                  value={vehicleMake}
                  onChange={(v) => {
                    if (v !== vehicleMake) setVehicleModel(''); // reset model when make changes
                    setVehicleMake(v);
                  }}
                  options={vehicleMakes}
                  placeholder="Search or type a make (e.g. Toyota)"
                />
                <FieldError message={fe.errors.vehicleMake} />
              </div>
              <div {...fe.field('vehicleModel')}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Model <span className="text-red-500">*</span></label>
                <Combobox
                  value={vehicleModel}
                  onChange={setVehicleModel}
                  options={vehicleModels}
                  loading={loadingModels}
                  disabled={!vehicleMake.trim()}
                  placeholder={vehicleMake.trim() ? 'Search or type a model (e.g. Fortuner)' : 'Select a make first'}
                />
                <FieldError message={fe.errors.vehicleModel} />
              </div>
              <div {...fe.field('vehicleYear')}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Year <span className="text-red-500">*</span></label>
                <Combobox
                  value={vehicleYear}
                  onChange={setVehicleYear}
                  options={yearOptions}
                  placeholder="Search or type a year (e.g. 2023)"
                />
                <FieldError message={fe.errors.vehicleYear} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Plate Number</label>
                <input type="text" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)}
                  className={inputCls} placeholder="ABC 1234" />
              </div>
            </div>
          </div>
        );

      // ── Step 2: Service ────────────────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Select Services</h3>
              <p className="text-sm text-gray-500 mt-1">Choose one or more services needed</p>
              <FieldError message={fe.errors.services} />
              {skipVehicle && (
                <p className="mt-2 text-xs text-[#011c72]">Reupholstery only: the Vehicle step will be skipped.</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3" {...fe.field('services', true)}>
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
                      <div className="mt-3" onClick={(e) => e.stopPropagation()} {...fe.field('svc-flooring')}>
                        <input type="text" value={flooring.material}
                          onChange={(e) => { e.stopPropagation(); setFlooring({ ...flooring, material: e.target.value }); }}
                          placeholder="Specify material *" className={smallInputCls} />
                        <FieldError message={fe.errors['svc-flooring']} />
                      </div>
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
                        <div {...fe.field('reupholsteryItem')}>
                          <input type="text" value={reupholsteryItemType} onChange={(e) => setReupholsteryItemType(e.target.value)}
                            placeholder="Item to reupholster (e.g. Sofa set, dining chair) *" className={smallInputCls} />
                          <FieldError message={fe.errors.reupholsteryItem} />
                        </div>
                        <div {...fe.field('svc-reupholstery')}>
                          <input type="text" value={reupholstery.material}
                            onChange={(e) => setReupholstery({ ...reupholstery, material: e.target.value })}
                            placeholder="Specify material *" className={smallInputCls} />
                          <FieldError message={fe.errors['svc-reupholstery']} />
                        </div>
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
                      <div className="mt-3" onClick={(e) => e.stopPropagation()} {...fe.field('svc-ceiling')}>
                        <input type="text" value={ceiling.material}
                          onChange={(e) => { e.stopPropagation(); setCeiling({ ...ceiling, material: e.target.value }); }}
                          placeholder="Specify material *" className={smallInputCls} />
                        <FieldError message={fe.errors['svc-ceiling']} />
                      </div>
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
                      <div className="mt-3" onClick={(e) => e.stopPropagation()} {...fe.field('svc-sidings')}>
                        <input type="text" value={sidings.material}
                          onChange={(e) => { e.stopPropagation(); setSidings({ ...sidings, material: e.target.value }); }}
                          placeholder="Specify material *" className={smallInputCls} />
                        <FieldError message={fe.errors['svc-sidings']} />
                      </div>
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
                        <div {...fe.field('svc-seatCovers')}>
                          <input type="text" value={seatCovers.material} onChange={(e) => setSeatCovers({ ...seatCovers, material: e.target.value })} placeholder="Material *" className={smallInputCls} />
                          <FieldError message={fe.errors['svc-seatCovers']} />
                        </div>
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
                      <div className="mt-3" onClick={(e) => e.stopPropagation()} {...fe.field('svc-other')}>
                        <input type="text" value={otherServices.description}
                          onChange={(e) => { e.stopPropagation(); setOtherServices({ ...otherServices, description: e.target.value }); }}
                          placeholder="Describe your service needs *" className={smallInputCls} />
                        <FieldError message={fe.errors['svc-other']} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as JobOrderPriority)} className={inputCls}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div {...fe.field('completionDate')}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Completion Date <span className="text-red-500">*</span></label>
                {/* Completion can't be in the past (Manila date) */}
                <input type="date" value={estimatedCompletionDate} min={manilaDateString()}
                  onChange={(e) => setEstimatedCompletionDate(e.target.value)} className={inputCls} />
                <FieldError message={fe.errors.completionDate} />
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
              {seesLaborCost && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Cutter', type: 'cutter', value: cutterName, set: setCutterName },
                    { label: 'Sewer', type: 'sewer', value: sewerName, set: setSewerName },
                  ].map(({ label, type, value, set }) => {
                    const choices = slipWorkers.filter(w => w.workType.toLowerCase() === type);
                    return (
                      <div key={label}>
                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                        <select value={value} onChange={(e) => set(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent">
                          <option value="">{choices.length ? '— Select —' : `No active ${type}s`}</option>
                          {choices.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Material Items List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Materials &amp; Parts</p>
                  <p className="text-xs text-gray-500">At least one material, each with a quantity and unit price</p>
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
                <div {...fe.field('materialsList', true)}
                  className={`text-center py-6 border-2 border-dashed rounded-xl text-sm ${fe.errors.materialsList ? 'border-red-300 text-red-600' : 'border-gray-200 text-gray-400'}`}>
                  {fe.errors.materialsList || <>No materials added yet. Click &quot;Add Material&quot; to add what this job needs.</>}
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <div className="col-span-4">Source / Name</div>
                    <div className="col-span-3">Material</div>
                    <div className="col-span-2 text-center">Qty (yd)</div>
                    <div className="col-span-2 text-right">Unit Price</div>
                    <div className="col-span-1"></div>
                  </div>
                  {materials.map((m) => (
                    <div key={m.id} {...fe.field(`material-${m.id}`)}
                      className={`grid grid-cols-12 gap-2 items-center p-3 rounded-lg border ${fe.errors[`material-${m.id}`] ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
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
                          <MaterialPicker
                            materials={inventoryMaterials}
                            value={m.materialId ?? ''}
                            onSelect={(id) => updateMaterial(m.id, 'materialId', id)}
                            takenIds={new Set(materials.filter((x) => x.id !== m.id && x.materialId).map((x) => Number(x.materialId)))}
                            onRefresh={reloadInventoryMaterials}
                            invalid={!!fe.errors[`material-${m.id}`]}
                          />
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
                      <FieldError message={fe.errors[`material-${m.id}`]} className="col-span-12 mt-0" />
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
                  {reupholsteryOnly ? 'Item' : 'Vehicle'}
                </p>
                <p className="font-semibold text-gray-900">
                  {reupholsteryOnly
                    ? (reupholsteryItemType.trim() || 'Reupholstery item')
                    : `${vehicleMake || '—'} ${vehicleModel || ''}`.trim()}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {reupholsteryOnly ? 'Reupholstery' : `${vehicleYear || ''} ${vehiclePlate || ''}`.trim() || '—'}
                </p>
              </div>
            </div>

            {choosesBranch && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Branch</p>
                <p className="font-semibold text-gray-900">
                  {retailBranches.find((b) => b.id === orderBranchId)?.name || 'Not chosen'}
                </p>
              </div>
            )}

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
                  <label className="text-sm text-gray-600 shrink-0">Price as % of materials</label>
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
                    <p className="text-xs text-gray-500 mt-0.5">
                      {(profitMargin / 100).toLocaleString('en-PH', { maximumFractionDigits: 2 })}× materials cost (100% = break-even, before labor)
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-[#011c72]">
                      ₱{suggestedPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEstimatedTotal(suggestedPrice)}
                      disabled={suggestedPrice > MAX_JOB_ORDER_PRICE}
                      title={suggestedPrice > MAX_JOB_ORDER_PRICE ? 'Above the ₱99,999,999.99 price limit' : undefined}
                      className="text-xs font-medium text-white bg-[#011c72] hover:bg-[#022494] px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  Price for the Work <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">(VAT included, before discount)</span>
                </label>
                <div className="relative" {...fe.field('price')}>
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₱</span>
                  <input type="number" min="0" max={MAX_JOB_ORDER_PRICE} step="0.01"
                    value={estimatedTotal || ''}
                    onChange={(e) => {
                      // Up to 8 digits (under ₱100M): longer input is ignored
                      if (!isValidPriceInput(e.target.value)) return;
                      setEstimatedTotal(parseFloat(e.target.value) || 0);
                    }}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                    placeholder="0.00" />
                </div>
                <FieldError message={fe.errors.price} />
              </div>

              {/* Discount (editable per-order; pre-filled from the customer's loyalty discount) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discount
                  {linkedCustomerDiscount != null && (
                    <span className="ml-1 text-xs font-normal text-gray-400">
                      (customer loyalty: {linkedCustomerDiscount}%)
                    </span>
                  )}
                </label>
                <div className="relative" {...fe.field('discount')}>
                  <input type="number" min="0" max="100" step="0.5"
                    value={orderDiscount}
                    onChange={(e) => setOrderDiscount(e.target.value)}
                    className="w-full pr-8 pl-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                    placeholder="0" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">%</span>
                </div>
                <FieldError message={fe.errors.discount} />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input type="checkbox" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[#011c72]" />
                Price includes {vatRate}% VAT
              </label>

              {estimatedTotal > 0 && (orderDiscountPct > 0 || vatPct > 0) && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1 text-sm">
                  <div className="flex items-center justify-between text-gray-600">
                    <span>Price</span>
                    <span>₱{estimatedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {orderDiscountPct > 0 && (
                    <div className="flex items-center justify-between text-green-700">
                      <span>Discount ({orderDiscountPct}%)</span>
                      <span>− ₱{discountAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200">
                    <span>Total</span>
                    <span>₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {vatPct > 0 && (
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Includes VAT ({vatPct}%) · ₱{(finalTotal - vatAmount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} before VAT</span>
                      <span>₱{vatAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
              )}

              {estimatedTotal > 0 && (
                <div className="bg-[#eef1fb] border border-[#c7d2f5] rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#011c72]">Down Payment (50%)</p>
                    <p className="text-xs text-[#011c72] mt-0.5">Half of the total</p>
                  </div>
                  <span className="text-xl font-bold text-[#011c72]">
                    ₱{(finalTotal / 2).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            <div {...fe.field('paymentMethod')}>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method <span className="text-red-500">*</span></label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                {ACCEPTED_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                ))}
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
          <h1 className="text-3xl font-bold text-gray-900">
            {editingPremadeDraftId ? 'Premade Draft' : 'New Job Order'}
          </h1>
          <p className="text-gray-500 mt-1">
            {editingPremadeDraftId
                ? 'Not yet a job order: no stock is taken until you confirm it'
                : 'Record a job order for work the customer has confirmed'}
          </p>
        </div>

        {/* Order Type Selector */}
        {!editingPremadeDraftId && (
        <div className="mb-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Order Type</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" onClick={() => { setOrderType('normal'); setStep(1); setError(''); fe.clear(); }}
              className={`text-left px-4 py-3.5 rounded-xl border-2 transition-all ${orderType === 'normal' ? 'border-[#011c72] bg-[#eef1fb] text-[#011c72] shadow-sm' : 'border-gray-200 text-gray-700 hover:border-[#011c72]'}`}>
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <div className="font-semibold">Normal Job Order</div>
              </div>
              <div className="text-xs opacity-70">Custom service work order flow</div>
            </button>
            <button type="button" onClick={() => { setOrderType('premade'); setError(''); fe.clear(); }}
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
        )}

        {/* Order number: generated by default, or typed in. Fixed once the order exists. */}
        <div className="mb-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-5" {...fe.field('orderNumber')}>
          <label htmlFor="order-number" className="block text-sm font-semibold text-gray-700 mb-2">
            {orderType === 'premade' ? 'Sale Number' : 'Job Order Number'} <span className="text-red-500">*</span>
          </label>
          {editingDraftId ? (
            <>
              <p className="px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 font-mono text-gray-900">{existingNumber || '—'}</p>
              <p className="text-xs text-gray-400 mt-1">A draft keeps the number it was saved with.</p>
            </>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                <input id="order-number" type="text" maxLength={50} autoComplete="off"
                  value={numberMode === 'manual' ? typedNumber : previewNumber}
                  onChange={(e) => { setNumberMode('manual'); setTypedNumber(e.target.value.replace(/\s/g, '')); fe.clear(); }}
                  placeholder={numberKind === 'job' && !numberBranchId ? 'Choose the branch first, or type a number' : 'Type a number'}
                  aria-describedby="order-number-help"
                  className={`flex-1 min-w-0 font-mono ${inputCls}`} />
                <button type="button" onClick={resetToGeneratedNumber} disabled={numberMode === 'auto' && !!previewNumber}
                  title="Use the next number the system generates"
                  className="shrink-0 px-4 py-2.5 rounded-xl border border-[#011c72] text-[#011c72] text-sm font-semibold hover:bg-[#eef1fb] disabled:opacity-40 disabled:cursor-not-allowed">
                  {numberMode === 'manual' ? 'Reset to auto-generated' : 'Generate'}
                </button>
              </div>
              <p id="order-number-help" className={`text-xs mt-1 ${numberMode === 'manual' && (numberCheck.message || fe.errors['orderNumber']) ? 'text-red-600' : 'text-gray-400'}`}>
                {numberMode === 'auto'
                  ? 'Generated automatically when you save (the next free number). Type over it to use your own.'
                  : numberCheck.checking ? 'Checking…'
                  : fe.errors['orderNumber'] || numberCheck.message
                  || (typedNumber.trim() ? 'This number is free to use.' : 'Enter the number, or press Reset to auto-generated.')}
              </p>
            </>
          )}
        </div>

        {/* Step Indicator (Normal orders only) */}
        {orderType === 'normal' && (
          <div className="mb-6">
            <div className="flex items-start justify-between">
              {STEPS.map((s, index) => (
                <div key={s.num} className="flex items-start flex-1">
                  <div className="flex flex-col items-center">
                    <button type="button" disabled={s.num === 3 && skipVehicle}
                      title={s.num === 3 && skipVehicle ? 'Skipped: reupholstery only' : undefined}
                      onClick={() => { if (s.num < step && !(s.num === 3 && skipVehicle)) { setError(''); fe.clear(); setStep(s.num); } }}
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
                    <span className={`mt-1.5 text-xs font-medium hidden sm:block ${s.num === 3 && skipVehicle ? 'text-gray-400 line-through' : step >= s.num ? 'text-[#011c72]' : 'text-gray-400'}`}>
                      {s.label}{s.num === 3 && skipVehicle ? ' (skipped)' : ''}
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

        {editingDraftId && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-[#c7d2f5] bg-[#eef1fb] px-4 py-3">
            <svg className="w-5 h-5 shrink-0 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <p className="text-sm text-[#011c72]">
              {loadingDraft
                ? 'Loading draft…'
                : <>Editing a saved draft. Fields may stay empty while it is a draft: <span className="font-semibold">Update Draft</span> saves it as it is. To make it a real job order, fill in every required field and press <span className="font-semibold">Confirm Job Order</span> on the last step.</>}
            </p>
          </div>
        )}

        {/* Form Card */}
        {/* noValidate: problems are shown next to their fields, not as browser bubbles */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-5">
            {orderType === 'normal' ? renderStep() : renderPremadeForm()}
          </div>

          {/* Navigation Buttons */}
          {orderType === 'normal' ? (
            <div className="flex justify-between items-center gap-3">
              <button type="button" onClick={goBack} disabled={step === 1}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-colors ${
                  step === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>
              <div className="flex items-center gap-3">
                <button type="button" onClick={saveDraft} disabled={loading}
                  className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-base font-semibold bg-white border-2 border-[#011c72] text-[#011c72] hover:bg-[#eef1fb] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title={editingDraftId ? 'Save your changes to this draft' : 'Save this order as a draft to finish later'}>
                  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h8l4 4v10a2 2 0 01-2 2H7a2 2 0 01-2-2V5z M9 3v4h6" />
                  </svg>
                  {loading ? 'Saving…' : editingDraftId ? 'Update Draft' : 'Save as Draft'}
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
                      {editingDraftId ? 'Confirming...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {editingDraftId ? 'Confirm Job Order' : 'Create Job Order'}
                    </>
                  )}
                </button>
              )}
              </div>
            </div>
          ) : (
            <div className="flex justify-between gap-3">
              {premadeStep === 1 ? (
                <button type="button" onClick={() => router.back()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              ) : (
                <button type="button" onClick={() => { setError(''); fe.clear(); setPremadeStep(1); }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                {premadeStep === 2 && (
                  <button type="button" onClick={() => router.back()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                    Cancel
                  </button>
                )}
                <button type="button" onClick={savePremadeDraft} disabled={savingPremadeDraft || loading || loadingPremadeDraft}
                  title="Save to finish later. No stock is taken."
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold bg-white border-2 border-[#011c72] text-[#011c72] hover:bg-[#eef1fb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {savingPremadeDraft ? 'Saving…' : editingPremadeDraftId ? 'Save Draft' : 'Save as Draft'}
                </button>
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
                      {editingPremadeDraftId ? 'Confirm Job Order' : 'Create Premade Order'}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {notice && !error && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{notice}</div>
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
