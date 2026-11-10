'use client';
import { formatDate, formatDateTime } from '@/lib/dateUtils';
import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, RawMaterial, FinishedGood, MaterialUsageLog, Supplier, MaterialWasteLog, AIStatus, PremadeTransfer, FORECAST_METHOD_LABELS, type PremadeRecipe } from '@/lib/api';
import PremadeItemPicker from '@/components/PremadeItemPicker';
import { useConfirm } from '@/components/ConfirmDialog';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';
import Link from 'next/link';
import Paginated from '@/components/Paginated';

type TabType = 'raw-materials' | 'finished-goods' | 'material-usage' | 'waste-log' | 'ai-predictions';

const TAB_IDS: TabType[] = ['raw-materials', 'finished-goods', 'material-usage', 'waste-log', 'ai-predictions'];
// Permissions that show each tab (any one is enough), matching what its data needs
const TAB_PERMISSIONS: Record<TabType, string[]> = {
  'raw-materials': ['inventory.view'],
  'finished-goods': ['premade.view', 'premade.receive'],  // receivers confirm incoming deliveries here
  'material-usage': ['inventory.view'],
  'waste-log': ['inventory.view'],
  'ai-predictions': ['forecasting.view'],
};

/** Same rules as the server: a number from 0 up to 1,000,000 (the most of one item it takes) */
/** An item whose stock is being corrected by hand (Adjust stock) */
type AdjustTarget = { kind: 'material' | 'premade'; id: number; name: string; current: number; unit: string; promised?: number };
// Same list as the server (STOCK_ADJUST_REASONS)
const STOCK_ADJUST_REASONS = ['Physical count correction', 'Data entry error', 'Opening stock', 'Damaged / lost', 'Other'];


export default function InventoryPage() {
  // useSearchParams needs a Suspense boundary for this route to prerender.
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#011c72] border-t-transparent rounded-full" />
      </div>
    }>
      <InventoryContent />
    </Suspense>
  );
}

function InventoryContent() {
  const { user, can } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const searchParams = useSearchParams();
  // Deep links from the dashboard's low-stock alerts arrive as
  // ?tab=raw-materials&status=low-stock&q=<material>
  const tabParam = searchParams.get('tab');
  // Purchase Orders and Suppliers have their own pages now; forward old ?tab= links
  const router = useRouter();
  useEffect(() => {
    if (tabParam === 'purchase-orders') router.replace('/purchase-orders');
    else if (tabParam === 'suppliers') router.replace('/suppliers');
  }, [tabParam, router]);
  const initialTab: TabType = TAB_IDS.includes(tabParam as TabType) ? (tabParam as TabType) : 'raw-materials';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const tabAllowed = useCallback((tab: TabType) => can(...TAB_PERMISSIONS[tab]), [can]);
  // The stock-out banner reads predictions too; the server lets inventory viewers see them
  const canReadPredictions = can('forecasting.view', 'inventory.view');

  // Someone who can't open the requested tab (e.g. premade access only) starts on one they can
  useEffect(() => {
    if (!user || tabAllowed(activeTab)) return;
    const first = TAB_IDS.find(tabAllowed);
    if (first) setActiveTab(first);
  }, [user, activeTab, tabAllowed]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<FinishedGood[]>([]);
  const [materialUsageLogs, setMaterialUsageLogs] = useState<MaterialUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const statusParam = searchParams.get('status');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in-stock' | 'low-stock' | 'out-of-stock'>(
    statusParam === 'low-stock' || statusParam === 'out-of-stock' || statusParam === 'in-stock'
      ? statusParam
      : 'all'
  );
  const [materialTypeFilter, setMaterialTypeFilter] = useState('');
  const [formError, setFormError] = useState('');
  // Problems with a specific field are shown next to it; formError is for the rest
  const fe = useFieldErrors();

  const [newMaterial, setNewMaterial] = useState({
    itemId: '',
    materialType: '',
    color: '',
    pattern: '',
    sku: '',
    costPerUnit: '',
    markupPercent: '25',
    unitPrice: '',
    priceMode: 'markup' as 'markup' | 'manual',
    supplierId: '',
    stockQuantity: ''
  });

  const [editingMaterialId, setEditingMaterialId] = useState<number | null>(null);
  const [editMaterial, setEditMaterial] = useState({
    materialType: '',
    color: '',
    pattern: '',
    sku: '',
    costPerUnit: '',
    markupPercent: '25',
    unitPrice: '',
    priceMode: 'markup' as 'markup' | 'manual',
    supplierId: '',
    stockQuantity: ''
  });

  const [globalThreshold, setGlobalThreshold] = useState(0);
  const [thresholdInput, setThresholdInput] = useState('');
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [notificationDismissed, setNotificationDismissed] = useState(false);
  // Stock alerts start as a one-line summary (counts only) so they don't push the
  // inventory down on every visit; opening them is remembered in this browser
  const [alertsCollapsed, setAlertsCollapsedState] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem('inventory.stockAlertsOpen') === '1') setAlertsCollapsedState(false); } catch { /* storage unavailable */ }
  }, []);
  const setAlertsCollapsed = (update: (prev: boolean) => boolean) => setAlertsCollapsedState(prev => {
    const next = update(prev);
    try { localStorage.setItem('inventory.stockAlertsOpen', next ? '0' : '1'); } catch { /* storage unavailable */ }
    return next;
  });

  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Waste Log
  const [wasteLogs, setWasteLogs] = useState<MaterialWasteLog[]>([]);
  const [newWaste, setNewWaste] = useState({ materialId: '', quantity: '', reason: '', notes: '' });
  const [wasteSearch, setWasteSearch] = useState('');

  // AI Predictions
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [predSearch, setPredSearch] = useState('');
  const [predUrgencyFilter, setPredUrgencyFilter] = useState<'all' | 'urgent' | 'soon' | 'ok'>('all');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [aiAlertDismissed, setAiAlertDismissed] = useState(false);

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
  // Adding stock to a product already in the warehouse (its quantity goes up) vs a new product
  const [premadeMode, setPremadeMode] = useState<'new' | 'restock'>('new');
  const [restockProductId, setRestockProductId] = useState<number | ''>('');
  const [recipe, setRecipe] = useState<PremadeRecipe | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  // Once the amounts are changed by hand, a new quantity no longer refills them
  const [materialsEdited, setMaterialsEdited] = useState(false);
  const [premadeNotice, setPremadeNotice] = useState('');
  const [editingPremadeId, setEditingPremadeId] = useState<number | null>(null);
  const [editPremade, setEditPremade] = useState({ quantity: '', price: '' });
  // Adjust stock: the only way to change stock by hand, and it needs a reason
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);
  const [adjustForm, setAdjustForm] = useState({ newQuantity: '', reason: '', notes: '' });
  const [adjustError, setAdjustError] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);
  const openAdjust = (target: AdjustTarget) => {
    setAdjusting(target);
    setAdjustForm({ newQuantity: String(target.current), reason: '', notes: '' });
    setAdjustError('');
  };
  const submitAdjust = async () => {
    if (!adjusting || adjustSaving) return;
    const qty = Number(adjustForm.newQuantity);
    const problem = adjustForm.newQuantity.trim() === '' || Number.isNaN(qty) ? 'Enter the correct stock.'
      : qty < 0 ? 'Stock cannot be negative.'
      : adjusting.kind === 'premade' && !Number.isInteger(qty) ? 'Premade stock is counted in whole pieces.'
      : adjusting.kind === 'premade' && qty < (adjusting.promised || 0) ? `${adjusting.promised} pcs are promised to deliveries awaiting receipt.`
      : qty === adjusting.current ? 'That is already the current stock.'
      : !adjustForm.reason ? 'Choose the reason.'
      : adjustForm.reason === 'Other' && !adjustForm.notes.trim() ? 'Explain the reason.'
      : '';
    if (problem) { setAdjustError(problem); return; }
    setAdjustSaving(true);
    setAdjustError('');
    try {
      await api.inventory.adjustStock({
        kind: adjusting.kind, itemId: adjusting.id, newQuantity: qty,
        reason: adjustForm.reason, notes: adjustForm.notes.trim() || undefined,
      });
      setAdjusting(null);
      await fetchInventory();
    } catch (err) {
      setAdjustError(err instanceof Error && err.message ? err.message : 'Could not adjust the stock.');
    } finally {
      setAdjustSaving(false);
    }
  };

  // ── Premade distribution (warehouse -> branches) ──────────────────────────
  type BranchOption = { id: number; name: string; isWarehouse: boolean; isActive: boolean };
  const [warehouse, setWarehouse] = useState<BranchOption | null>(null);
  const [transfers, setTransfers] = useState<PremadeTransfer[]>([]);
  const [transferBusyId, setTransferBusyId] = useState<number | null>(null);
  const [transferError, setTransferError] = useState('');
  // The product being given out, plus the per-branch amounts typed in the modal.
  const [distributing, setDistributing] = useState<FinishedGood | null>(null);
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [allBranchesQty, setAllBranchesQty] = useState('');
  const [distributeError, setDistributeError] = useState('');
  const [distributeSaving, setDistributeSaving] = useState(false);

  // Which location's finished goods to show: 'all', or a branch/warehouse id.
  const [premadeBranchFilter, setPremadeBranchFilter] = useState<string>('all');

  // Accounts with all-branch access manage every branch's stock; others only
  // their own. Premade stock is produced and sent out from the warehouse.
  const managesAllInventory = can('branches.all');
  const canDistribute = can('premade.distribute') && managesAllInventory;
  /** Admin/supervisor approve on someone's behalf, so they get a confirm step first. */
  const confirmsViaDialog = can('branches.all', 'premade.distribute');
  // Only all-branch access sees every branch's inventory (the server enforces the
  // same rule); everyone else sees their own branch.
  const seesAllInventory = managesAllInventory;
  const [inventoryBranch, setInventoryBranch] = useState<string>('all');
  const listBranchId = seesAllInventory
    ? (inventoryBranch === 'all' ? undefined : Number(inventoryBranch))
    : user?.branchId;
  const canChangeMaterial = (m: RawMaterial) => managesAllInventory || m.branchId === user?.branchId;

  useEffect(() => {
    if (activeTab !== 'ai-predictions' && tabAllowed(activeTab)) fetchInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tabAllowed, inventoryBranch]);

  const fetchAIPredictions = async () => {
    setAiLoading(true);
    try {
      const res = await api.inventory.ai.getPredictions();
      if (res.data) setAiStatus(res.data);
    } catch { /* ignore */ }
    finally { setAiLoading(false); }
  };

  // Predictions are optional here: fetched on mount for the stock-out banner and
  // when their tab opens, only for users allowed to read them. A failure just
  // leaves the banner hidden.
  useEffect(() => {
    if (canReadPredictions) fetchAIPredictions();
  }, [canReadPredictions]);

  useEffect(() => {
    if (activeTab === 'ai-predictions' && can('forecasting.view')) fetchAIPredictions();
  }, [activeTab, can]);

  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (aiStatus?.status === 'computing') {
      pollRef.current = setInterval(async () => {
        try {
          const res = await api.inventory.ai.getPredictions();
          if (res.data) setAiStatus(res.data);
        } catch { /* ignore */ }
      }, 3000);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [aiStatus?.status]);

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
        const active = r.data.filter((b) => b.isActive);
        // The warehouse is where premade stock is produced, so it belongs in the
        // location list; shop branches are kept separately for distribution.
        const wh = active.find((b) => b.isWarehouse) || null;
        setWarehouse(wh);
        setBranches(active.filter((b) => !b.isWarehouse));
        if (!newPremade.branchId) {
          // Default to the warehouse so adding stock doesn't silently raise a
          // delivery the admin didn't ask for.
          const def = wh || active.find((b) => b.id === user?.branchId) || active[0];
          if (def) setNewPremade(prev => ({ ...prev, branchId: String(def.id) }));
        }
      }
    }).catch(() => {});
  }, [user?.branchId]);

  useEffect(() => {
    if (activeTab === 'finished-goods' && newPremade.branchId && can('inventory.view', 'sales.add', 'sales.edit', 'purchase_orders.add')) {
      api.inventory.getRawMaterials({ branchId: Number(newPremade.branchId), includeWarehouse: true })
        .then(res => setRawMaterials(res.data || []))
        .catch(() => {});
    }
  }, [newPremade.branchId, activeTab, can]);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      if (activeTab === 'raw-materials') {
        const [matRes, supRes] = await Promise.all([
          api.inventory.getRawMaterials({ branchId: listBranchId }),
          // Only feeds the supplier picker; someone without supplier access still sees the stock
          can('suppliers.view', 'purchase_orders.add')
            ? api.inventory.getSuppliers().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ]);
        setRawMaterials(matRes.data || []);
        setSuppliers(supRes.data || []);
      } else if (activeTab === 'finished-goods') {
        const targetBranchId = Number(newPremade.branchId) || user?.branchId;
        const [finishedGoodsResponse, rawMaterialsResponse, transfersResponse] = await Promise.all([
          api.inventory.getFinishedGoods(),
          // Materials only feed the "made from" picker when adding stock
          can('inventory.view', 'sales.add', 'sales.edit', 'purchase_orders.add')
            ? api.inventory.getRawMaterials({ branchId: targetBranchId, includeWarehouse: true }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          // Pending deliveries are optional context — don't fail the tab over them.
          api.inventory.getPremadeTransfers({ status: 'pending' }).catch(() => ({ data: [] })),
        ]);
        setFinishedGoods(finishedGoodsResponse.data || []);
        setRawMaterials(rawMaterialsResponse.data || []);
        setTransfers(transfersResponse.data || []);
      } else if (activeTab === 'material-usage') {
        const response = await api.inventory.getMaterialUsage({ branchId: listBranchId });
        setMaterialUsageLogs(response.data || []);
      } else if (activeTab === 'waste-log') {
        const [wasteRes, matRes] = await Promise.all([
          api.inventory.getWasteLogs({ branchId: listBranchId }),
          // The picker only offers materials this account may log waste for: a
          // shop's own and the warehouse's, which supplies every shop
          api.inventory.getRawMaterials(managesAllInventory ? { branchId: listBranchId }
            : { branchId: user?.branchId, includeWarehouse: true }),
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

    const costPerUnit = Number(newMaterial.costPerUnit);
    const markupPercent = Number(newMaterial.markupPercent);
    const byMarkup = newMaterial.priceMode === 'markup';
    if (fe.show({
      'new-materialType': !newMaterial.materialType.trim() && 'Enter the material name.',
      'new-costPerUnit': byMarkup && (Number.isNaN(costPerUnit) || costPerUnit <= 0) && 'Enter the cost per unit (more than ₱0).',
      'new-markupPercent': byMarkup && Number.isNaN(markupPercent) && 'Markup must be a number.',
      'new-unitPrice': !byMarkup && Number.isNaN(Number(newMaterial.unitPrice)) && 'Selling price must be a number.',
    })) return;

    const itemId = newMaterial.itemId.trim() || undefined;

    setSaving(true);
    try {
      await api.inventory.createRawMaterial({
        ...(itemId !== undefined && { itemId }),
        materialType: newMaterial.materialType.trim(),
        color: newMaterial.color.trim(),
        pattern: newMaterial.pattern.trim(),
        sku: newMaterial.sku.trim() || undefined,
        costPerUnit: Number.isNaN(costPerUnit) ? 0 : costPerUnit,
        markupPercent: Number.isNaN(markupPercent) ? 25 : markupPercent,
        ...(newMaterial.priceMode === 'manual' ? { unitPrice: Number(newMaterial.unitPrice) } : {}),
        supplierId: newMaterial.supplierId ? Number(newMaterial.supplierId) : null,
        // New items start at 0 yd: stock comes in by receiving a purchase order
        stockQuantity: 0,
        branchId: user?.branchId || 1
      });

      setNewMaterial({ itemId: '', materialType: '', color: '', pattern: '', sku: '', costPerUnit: '', markupPercent: '25', unitPrice: '', priceMode: 'markup', supplierId: '', stockQuantity: '' });
      await fetchInventory();
    } catch (error) {
      setFormError((error as Error)?.message || 'Failed to add item.');
    } finally {
      setSaving(false);
    }
  };

  const startEditMaterial = (material: RawMaterial) => {
    fe.clear();
    setEditingMaterialId(material.id);
    setEditMaterial({
      materialType: material.materialType,
      color: material.color,
      pattern: material.pattern,
      sku: material.sku || '',
      costPerUnit: material.costPerUnit != null ? String(material.costPerUnit) : '',
      markupPercent: material.markupPercent != null ? String(material.markupPercent) : '25',
      unitPrice: String(material.unitPrice),
      priceMode: 'markup',
      supplierId: material.supplierId != null ? String(material.supplierId) : '',
      stockQuantity: String(material.stockQuantity)
    });
  };

  const handleSaveMaterial = async (materialId: number) => {
    setFormError('');

    const costPerUnit = Number(editMaterial.costPerUnit);
    const markupPercent = Number(editMaterial.markupPercent);
    // Stock isn't edited here: it comes from purchase orders and is corrected with Adjust stock
    if (fe.show({
      'edit-materialType': !editMaterial.materialType.trim() && 'Enter the material name.',
      'edit-unitPrice': editMaterial.priceMode === 'manual' && Number.isNaN(Number(editMaterial.unitPrice))
        && 'Selling price must be a number.',
    })) return;

    setSaving(true);
    try {
      await api.inventory.updateRawMaterial(materialId, {
        materialType: editMaterial.materialType.trim(),
        color: editMaterial.color.trim(),
        pattern: editMaterial.pattern.trim(),
        sku: editMaterial.sku.trim(),
        costPerUnit: Number.isNaN(costPerUnit) ? 0 : costPerUnit,
        markupPercent: Number.isNaN(markupPercent) ? 25 : markupPercent,
        ...(editMaterial.priceMode === 'manual' ? { unitPrice: Number(editMaterial.unitPrice) } : {}),
        supplierId: editMaterial.supplierId ? Number(editMaterial.supplierId) : null,
      });

      setEditingMaterialId(null);
      await fetchInventory();
    } catch (error) {
      setFormError((error as Error)?.message || 'Failed to update item.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePremade = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const quantity = Number(newPremade.quantity);
    const price = Number(newPremade.price);
    const branchId = Number(newPremade.branchId) || user?.branchId;
    const parsedMaterialsUsed = premadeMaterials.map((entry) => ({
      materialId: Number(entry.materialId), quantityUsed: Number(entry.quantityUsed),
    }));
    const restocking = premadeMode === 'restock';
    if (fe.show({
      'premade-product': restocking && !restockProductId && 'Choose the product to add stock to.',
      'premade-name': !restocking && !newPremade.name.trim() && 'Enter the product name.',
      'premade-quantity': (Number.isNaN(quantity) || !(quantity > 0)) && 'Enter how many pieces (more than 0).',
      'premade-price': !restocking && Number.isNaN(price) && 'Price must be a number.',
      'premade-branch': !branchId && 'Choose where this product goes.',
      'premade-materials': parsedMaterialsUsed.length === 0 && 'Add at least one material used.',
      ...Object.fromEntries(parsedMaterialsUsed.map((m, index) => [`premade-material-${index}`,
        !m.materialId ? 'Select the material used.'
          : (Number.isNaN(m.quantityUsed) || m.quantityUsed <= 0) && 'Enter how much was used (more than 0).',
      ])),
    }) || !branchId) return;

    // Choosing a shop branch raises a delivery that branch must accept, so make
    // that consequence explicit before saving.
    const target = branches.find(b => b.id === branchId);
    if (target && !target.isWarehouse) {
      const ok = await confirm({
        title: `Send ${quantity} pcs${restocking && restockProduct ? ` of ${restockProduct.name}` : ''} to ${target.name}?`,
        message: (
          <>
            The stock is produced at {warehouse?.name || 'the warehouse'} and sent to{' '}
            <span className="font-medium text-gray-900">{target.name}</span> as a delivery.
          </>
        ),
        warning: `It will not show in ${target.name}'s stock until they confirm receipt. Materials are deducted now.`,
        confirmLabel: 'Add and send',
        variant: 'warning',
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const res = await api.inventory.createFinishedGood(restocking
        ? { existingProductId: restockProductId as number, quantity, branchId, materialsUsed: parsedMaterialsUsed }
        : {
          name: newPremade.name.trim(),
          quantity,
          unit: 'pcs',
          category: newPremade.category,
          price,
          // No cost: the server works it out from the materials used
          branchId,
          materialsUsed: parsedMaterialsUsed
        });

      const def = branches.find(b => b.id === user?.branchId) || branches[0];
      setNewPremade({ name: '', quantity: '', price: '', category: 'General', branchId: def ? String(def.id) : '' });
      setPremadeMaterials([{ materialId: '', quantityUsed: '' }]);
      setRestockProductId(''); setRecipe(null); setMaterialsEdited(false);
      setPremadeNotice((res as { message?: string }).message || (restocking ? 'Stock added.' : 'Product added.'));
      await fetchInventory();
    } catch (error) {
      // The same product is already in stock: offer to add to it instead of a second item
      if (error instanceof ApiError && error.status === 409 && error.body?.existingProduct) {
        const existing = error.body.existingProduct as FinishedGood;
        setPremadeMode('restock');
        setFinishedGoods((prev) => (prev.some((g) => g.id === existing.id) ? prev : [...prev, existing]));
        await chooseRestockProduct(existing.id);
        setFormError('');
        setPremadeNotice(`${existing.name} is already in stock (${existing.quantity} pcs). Switched to Add Stock: check the materials and save to add ${quantity || ''} more.`);
      } else {
        setFormError((error as Error)?.message || 'Failed to add premade product.');
      }
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
    setMaterialsEdited(true);
    setPremadeMaterials((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  };

  /** Material rows from the product's last batch, scaled to the pieces being made now */
  const rowsFromRecipe = (r: PremadeRecipe | null, pieces: number) => {
    const usable = (r?.materials || []).filter((m) => m.available);
    if (usable.length === 0) return [{ materialId: '', quantityUsed: '' }];
    return usable.map((m) => ({
      materialId: String(m.materialId),
      quantityUsed: m.perPiece != null && pieces > 0 ? String(Math.round(m.perPiece * pieces * 10000) / 10000) : '',
    }));
  };

  const chooseRestockProduct = async (id: number) => {
    setRestockProductId(id);
    setRecipe(null);
    setMaterialsEdited(false);
    setRecipeLoading(true);
    try {
      const res = await api.inventory.getPremadeRecipe(id);
      setRecipe(res.data || null);
      setPremadeMaterials(rowsFromRecipe(res.data || null, Number(newPremade.quantity) || 0));
    } catch {
      setRecipe(null);
      setPremadeMaterials([{ materialId: '', quantityUsed: '' }]);
    } finally { setRecipeLoading(false); }
  };

  const switchPremadeMode = (mode: 'new' | 'restock') => {
    setPremadeMode(mode);
    setRestockProductId('');
    setRecipe(null);
    setMaterialsEdited(false);
    setPremadeNotice('');
    setPremadeMaterials([{ materialId: '', quantityUsed: '' }]);
    fe.clear();
  };

  // Warehouse rows are the ones stock is made into (branches get theirs by delivery)
  const restockable = finishedGoods.filter((g) => g.isWarehouse && !g.isArchived);
  const restockProduct = restockable.find((g) => g.id === restockProductId);
  const recipeById = new Map((recipe?.materials || []).map((m) => [String(m.materialId), m]));

  // ── Distribution ──────────────────────────────────────────────────────────

  const openDistribute = (item: FinishedGood) => {
    fe.clear();
    setDistributing(item);
    setAllocations({});
    setAllBranchesQty('');
    setDistributeError('');
  };

  const allocationTotal = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [allocations],
  );

  const handleDistribute = async (toAll: boolean) => {
    if (!distributing) return;
    setDistributeError('');

    const available = distributing.availableQuantity ?? distributing.quantity;
    const perBranch = Number(allBranchesQty) || 0;
    const total = toAll ? perBranch * branches.length : allocationTotal;

    // Checked here for immediate feedback; the server enforces it regardless.
    if (fe.show({
      [toAll ? 'distribute-all' : 'distribute-each']: total <= 0 ? 'Enter a quantity greater than zero.'
        : total > available && `Not enough stock. ${available} available to give out, but that totals ${total}.`,
    })) return;

    const ok = await confirm({
      title: toAll ? `Give ${perBranch} to each of ${branches.length} branches?` : 'Send this stock?',
      message: (
        <>
          {total} {distributing.unit || 'pcs'} of{' '}
          <span className="font-medium text-gray-900">{distributing.name}</span> will be sent out.
        </>
      ),
      warning: 'Stock stays in the warehouse until each branch confirms receipt.',
      confirmLabel: 'Send',
      variant: 'warning',
    });
    if (!ok) return;

    setDistributeSaving(true);
    try {
      if (toAll) {
        await api.inventory.distributeFinishedGood(distributing.id, {
          toAllBranches: true,
          quantityPerBranch: perBranch,
        });
      } else {
        await api.inventory.distributeFinishedGood(distributing.id, {
          allocations: Object.entries(allocations)
            .map(([branchId, qty]) => ({ branchId: Number(branchId), quantity: Number(qty) || 0 }))
            .filter(a => a.quantity > 0),
        });
      }
      setDistributing(null);
      await fetchInventory();
    } catch (err) {
      setDistributeError((err as Error)?.message || 'Failed to send the stock.');
    } finally {
      setDistributeSaving(false);
    }
  };

  /**
   * Accept a delivery. A branch's own sales manager accepts directly; an
   * admin or supervisor is approving on the branch's behalf, so they confirm first.
   */
  const handleConfirmTransfer = async (transfer: PremadeTransfer) => {
    setTransferError('');
    if (confirmsViaDialog) {
      const ok = await confirm({
        title: `Approve delivery to ${transfer.destinationBranchName}?`,
        message: (
          <>
            {transfer.quantity} {transfer.unit} of{' '}
            <span className="font-medium text-gray-900">{transfer.productName}</span> will move out of{' '}
            {transfer.sourceBranchName} and into {transfer.destinationBranchName}.
          </>
        ),
        warning: 'You are accepting this on the branch\'s behalf. Stock levels change immediately.',
        confirmLabel: 'Approve delivery',
        variant: 'warning',
      });
      if (!ok) return;
    }

    setTransferBusyId(transfer.id);
    try {
      await api.inventory.confirmPremadeTransfer(transfer.id);
      await fetchInventory();
    } catch (err) {
      setTransferError((err as Error)?.message || 'Failed to confirm the delivery.');
    } finally {
      setTransferBusyId(null);
    }
  };

  const handleCancelTransfer = async (transfer: PremadeTransfer) => {
    const ok = await confirm({
      title: 'Reject this delivery?',
      message: (
        <>
          {transfer.quantity} {transfer.unit} of {transfer.productName} will stay at{' '}
          {transfer.sourceBranchName}.
        </>
      ),
      confirmLabel: 'Reject',
      variant: 'danger',
    });
    if (!ok) return;

    setTransferBusyId(transfer.id);
    setTransferError('');
    try {
      await api.inventory.cancelPremadeTransfer(transfer.id);
      await fetchInventory();
    } catch (err) {
      setTransferError((err as Error)?.message || 'Failed to reject the delivery.');
    } finally {
      setTransferBusyId(null);
    }
  };

  const startEditPremade = (item: FinishedGood) => {
    fe.clear();
    setEditingPremadeId(item.id);
    setEditPremade({ quantity: String(item.quantity), price: String(item.price) });
  };

  const handleSavePremade = async (itemId: number) => {
    setFormError('');
    const price = Number(editPremade.price);
    if (fe.show({
      'editPremade-price': Number.isNaN(price) && 'Must be a number.',
    })) return;

    setSaving(true);
    try {
      // Only the price: stock is corrected with Adjust stock, with a reason
      await api.inventory.updateFinishedGood(itemId, { price, unit: 'pcs' });
      setEditingPremadeId(null);
      await fetchInventory();
    } catch (error) {
      setFormError((error as Error)?.message || 'Failed to update premade product.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateWasteLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (fe.show({
      'waste-material': !newWaste.materialId && 'Select the material.',
      'waste-quantity': !(Number(newWaste.quantity) > 0) && 'Enter how much was wasted.',
      'waste-reason': !newWaste.reason.trim() && 'Give a reason.',
    })) return;
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
    } catch (err) { setFormError((err as Error)?.message || 'Failed to log waste.'); }
    finally { setSaving(false); }
  };

  /** Undo a waste entry made by mistake: the quantity goes back into stock */
  const undoWaste = async (l: MaterialWasteLog) => {
    const ok = await confirm({
      title: 'Undo this waste entry?',
      message: (
        <>
          {l.quantity} yd of <span className="font-medium text-gray-900">{l.materialName}</span> goes back into stock
          {l.jobOrderNumber ? <> and comes off {l.jobOrderNumber}&apos;s cost</> : null}.
        </>
      ),
      confirmLabel: 'Undo',
      variant: 'warning',
    });
    if (!ok) return;
    setFormError('');
    try {
      await api.inventory.undoWasteLog(l.id);
      await fetchInventory();
    } catch (err) {
      setFormError((err as Error)?.message || 'Could not undo the waste entry.');
    }
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

  const handleUploadHistorical = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');
    try {
      const res = await api.inventory.ai.uploadHistorical(file);
      setUploadSuccess(res.message || `Uploaded ${res.data?.rowsSaved} rows. Computing predictions...`);
      await fetchAIPredictions();
    } catch (err) {
      setUploadError((err as Error)?.message || 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRecompute = async () => {
    try {
      await api.inventory.ai.recompute();
      await fetchAIPredictions();
    } catch (err) {
      setUploadError((err as Error)?.message || 'Failed to recompute.');
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(amount);

  /** Reorder level: the material's own, else the one in Settings (same rule as the server) */
  const reorderLevel = (own?: number) => (own && own > 0 ? own : globalThreshold);
  const isLowStock = (quantity: number, own?: number) => {
    const level = reorderLevel(own);
    return quantity > 0 && level > 0 && quantity <= level;
  };

  const getStockStatus = (quantity: number, ownThreshold?: number) => {
    if (quantity <= 0) {
      return { label: 'Out of Stock', class: 'bg-red-100 text-red-700' };
    }
    if (isLowStock(quantity, ownThreshold)) {
      return { label: 'Low Stock', class: 'bg-orange-100 text-orange-700' };
    }
    return { label: 'In Stock', class: 'bg-green-100 text-green-700' };
  };

  const uniqueMaterialTypes = useMemo(() =>
    Array.from(new Set(rawMaterials.map(m => m.materialType).filter(Boolean))).sort(),
    [rawMaterials]
  );

  const filteredRawMaterials = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return rawMaterials.filter((m) => {
      const matchesSearch = !q ||
        m.materialType.toLowerCase().includes(q) ||
        m.color.toLowerCase().includes(q) ||
        m.pattern.toLowerCase().includes(q) ||
        (m.itemId || '').toLowerCase().includes(q);
      const matchesType = !materialTypeFilter || m.materialType === materialTypeFilter;
      const qty = m.stockQuantity;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'out-of-stock' && qty <= 0) ||
        (statusFilter === 'low-stock' && isLowStock(qty, m.lowStockThreshold)) ||
        (statusFilter === 'in-stock' && qty > 0 && !isLowStock(qty, m.lowStockThreshold));
      return matchesSearch && matchesType && matchesStatus;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMaterials, searchTerm, statusFilter, materialTypeFilter, globalThreshold]);

  const filteredFinishedGoods = useMemo(() => {
    const q = searchTerm.toLowerCase();
    // The API already returns newest-first, so filtering preserves that order.
    return finishedGoods.filter((item) => {
      if (premadeBranchFilter !== 'all' && item.branchId !== Number(premadeBranchFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.sku || '').toLowerCase().includes(q)
      );
    });
  }, [finishedGoods, searchTerm, premadeBranchFilter]);

  const filteredUsageLogs = materialUsageLogs.filter((log) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (log.materialName || '').toLowerCase().includes(q) ||
      (log.usedInReference || '').toLowerCase().includes(q) ||
      (log.usedByName || '').toLowerCase().includes(q) ||
      (log.workerName || '').toLowerCase().includes(q)
    );
  });

  const filteredWasteLogs = wasteLogs.filter(l => {
    if (!wasteSearch) return true;
    const q = wasteSearch.toLowerCase();
    return (l.materialName || '').toLowerCase().includes(q) || l.reason.toLowerCase().includes(q) || (l.loggedByName || '').toLowerCase().includes(q)
      || (l.jobOrderNumber || '').toLowerCase().includes(q) || (l.workerName || '').toLowerCase().includes(q);
  });

  /** How many premade products sit at a given location, for the dropdown labels. */
  const countAtLocation = (branchId: number) =>
    finishedGoods.filter((item) => item.branchId === branchId).length;

  const lowStockItems = useMemo(() =>
    rawMaterials.filter(m => isLowStock(m.stockQuantity, m.lowStockThreshold)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    { id: 'waste-log' as TabType, name: 'Waste / Scrap', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    )},
    { id: 'ai-predictions' as TabType, name: 'AI Predictions', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    )},
  ].filter((tab) => tabAllowed(tab.id));

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
            <p className="text-gray-500 mt-1">Manage raw materials and finished goods</p>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-wrap items-center gap-3">
            {/* Global Low Stock Threshold Setting */}
            {can('settings.edit') && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200">
                <svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                      className="w-20 px-2 py-0.5 text-sm rounded border border-orange-300 bg-white text-gray-900"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveThreshold}
                      disabled={thresholdSaving}
                      className="text-xs font-medium text-orange-700 hover:text-orange-900 disabled:opacity-50"
                    >
                      {thresholdSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingThreshold(false); setThresholdInput(String(globalThreshold)); }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-orange-700">
                      Low stock alert: <strong>{globalThreshold > 0 ? `≤ ${globalThreshold} yd` : 'Off'}</strong>
                    </span>
                    <button
                      onClick={() => { setEditingThreshold(true); setThresholdInput(String(globalThreshold)); }}
                      className="text-xs text-orange-600 hover:text-orange-800 underline"
                    >
                      {globalThreshold > 0 ? 'Change' : 'Set'}
                    </button>
                  </>
                )}
              </div>
            )}
            <Link
              href="/purchase-orders/new"
              className="inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              New Purchase Order
            </Link>
          </div>
        </div>

        {formError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {formError}
          </div>
        )}

        {/* Low Stock Notifications */}
        {!notificationDismissed && (lowStockItems.length > 0 || outOfStockItems.length > 0) && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            {/* Header — always visible, click to collapse */}
            <button
              type="button"
              onClick={() => setAlertsCollapsed(prev => !prev)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Stock Alerts</span>
                <div className="flex items-center gap-1.5">
                  {outOfStockItems.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                      {outOfStockItems.length} out of stock
                    </span>
                  )}
                  {lowStockItems.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                      {lowStockItems.length} low stock
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setNotificationDismissed(true); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setNotificationDismissed(true); } }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Dismiss
                </span>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${alertsCollapsed ? '' : 'rotate-180'}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Collapsible body */}
            {!alertsCollapsed && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                {outOfStockItems.length > 0 && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-red-700">
                          {outOfStockItems.length} item{outOfStockItems.length > 1 ? 's' : ''} out of stock
                        </p>
                        <p className="text-xs text-red-600 mt-1">
                          {outOfStockItems.map(m => `${m.materialType}${m.color ? ` (${m.color})` : ''}`).join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {lowStockItems.length > 0 && (
                  <div className="p-4 rounded-xl bg-orange-50 border border-orange-200">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-orange-700">
                            {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} running low on stock
                          </p>
                          <Link
                            href="/purchase-orders/new"
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
                            <li key={m.id} className="text-xs text-orange-600">
                              {m.materialType}{m.color ? ` (${m.color})` : ''}{m.pattern ? ` / ${m.pattern}` : ''} — {m.stockQuantity} yd remaining
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Add Material Form */}
        {activeTab === 'raw-materials' && (
          <form onSubmit={handleCreateMaterial} noValidate className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Inventory Item</h2>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input
                type="text"
                value={newMaterial.itemId}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, itemId: e.target.value }))}
                placeholder="Item ID (e.g. LTH-001)"
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
              />
              <div {...fe.field('new-materialType')} className="md:col-span-2">
                <input
                  type="text"
                  value={newMaterial.materialType}
                  onChange={(e) => setNewMaterial((prev) => ({ ...prev, materialType: e.target.value }))}
                  placeholder="Material Name"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
                />
                <FieldError message={fe.errors['new-materialType']} />
              </div>
              <input
                type="text"
                value={newMaterial.sku}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, sku: e.target.value }))}
                placeholder="SKU"
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
              />
              <select
                value={newMaterial.supplierId}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, supplierId: e.target.value }))}
                className="md:col-span-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
              >
                <option value="">— Supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={newMaterial.color}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, color: e.target.value }))}
                placeholder="Color (optional)"
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
              />
              <input
                type="text"
                value={newMaterial.pattern}
                onChange={(e) => setNewMaterial((prev) => ({ ...prev, pattern: e.target.value }))}
                placeholder="Pattern (optional)"
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
              />
              <p className="self-center text-xs text-gray-500">
                Starts at <strong>0 yd</strong>. Stock is added by receiving a purchase order.
              </p>
            </div>

            {/* Pricing: cost -> selling price via markup, or manual override */}
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-4 mb-3">
                <span className="text-sm font-medium text-gray-700">Selling Price</span>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                  <button type="button"
                    onClick={() => setNewMaterial((prev) => ({ ...prev, priceMode: 'markup' }))}
                    className={`px-3 py-1.5 ${newMaterial.priceMode === 'markup' ? 'bg-[#011c72] text-white' : 'bg-white text-gray-600'}`}>
                    From cost + markup
                  </button>
                  <button type="button"
                    onClick={() => setNewMaterial((prev) => ({ ...prev, priceMode: 'manual' }))}
                    className={`px-3 py-1.5 ${newMaterial.priceMode === 'manual' ? 'bg-[#011c72] text-white' : 'bg-white text-gray-600'}`}>
                    Set manually
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div {...fe.field('new-costPerUnit')}>
                  <label className="block text-xs text-gray-500 mb-1">Cost per Yard (₱)</label>
                  <input type="number" min="0" step="0.01" value={newMaterial.costPerUnit}
                    onChange={(e) => setNewMaterial((prev) => ({ ...prev, costPerUnit: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900" />
                  <FieldError message={fe.errors['new-costPerUnit']} />
                </div>
                <div {...fe.field('new-markupPercent')}>
                  <label className="block text-xs text-gray-500 mb-1">Markup %</label>
                  <input type="number" min="0" step="0.01" value={newMaterial.markupPercent}
                    disabled={newMaterial.priceMode === 'manual'}
                    onChange={(e) => setNewMaterial((prev) => ({ ...prev, markupPercent: e.target.value }))}
                    placeholder="25"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 disabled:bg-gray-100 disabled:text-gray-400" />
                  <FieldError message={fe.errors['new-markupPercent']} />
                </div>
                <div {...fe.field('new-unitPrice')}>
                  <label className="block text-xs text-gray-500 mb-1">Selling Price (₱)</label>
                  {newMaterial.priceMode === 'manual' ? (
                    <input type="number" min="0" step="0.01" value={newMaterial.unitPrice}
                      onChange={(e) => setNewMaterial((prev) => ({ ...prev, unitPrice: e.target.value }))}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900" />
                  ) : (
                    <div className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 font-semibold">
                      {formatCurrency(Number(newMaterial.costPerUnit || 0) * (1 + Number(newMaterial.markupPercent || 0) / 100))}
                    </div>
                  )}
                  <FieldError message={fe.errors['new-unitPrice']} />
                </div>
                <p className="text-xs text-gray-400 pb-2">
                  This selling price is used when picking materials for products and job orders.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Add Item'}
              </button>
            </div>
          </form>
        )}

        {/* Add Premade Form */}
        {activeTab === 'finished-goods' && can('premade.add') && managesAllInventory && (
          <form onSubmit={handleCreatePremade} noValidate className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{premadeMode === 'restock' ? 'Add Stock to a Premade Product' : 'Add Premade Product'}</h2>
              <div role="tablist" aria-label="Add premade" className="inline-flex p-1 bg-gray-100 rounded-lg text-sm">
                {([['new', 'New product'], ['restock', 'Add stock to existing']] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={premadeMode === id} onClick={() => switchPremadeMode(id)}
                    className={`px-3 py-1.5 rounded-md font-medium ${premadeMode === id ? 'bg-white shadow-sm text-[#011c72]' : 'text-gray-600'}`}>{label}</button>
                ))}
              </div>
            </div>
            {premadeNotice && <p className="mb-3 p-3 rounded-lg bg-[#eef1fb] border border-[#c7d2f5] text-sm text-[#011c72]">{premadeNotice}</p>}
            {premadeMode === 'restock' && (
              <div className="mb-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div {...fe.field('premade-product')} className="md:col-span-2">
                  <PremadeItemPicker items={restockable} value={restockProductId}
                    onSelect={(id) => { setPremadeNotice(''); chooseRestockProduct(id); }}
                    invalid={!!fe.errors['premade-product']} />
                  <FieldError message={fe.errors['premade-product']} />
                </div>
                {restockProduct && (
                  <div className="text-sm text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>In stock: <strong className="text-gray-900">{restockProduct.quantity}</strong></span>
                    <span>Price: <strong className="text-gray-900">₱{restockProduct.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></span>
                    <span>{restockProduct.category}</span>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              {premadeMode === 'new' && <div {...fe.field('premade-name')} className="md:col-span-2">
                <input
                  type="text"
                  value={newPremade.name}
                  onChange={(e) => setNewPremade((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Product name"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
                />
                <FieldError message={fe.errors['premade-name']} />
              </div>}
              <div {...fe.field('premade-quantity')}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPremade.quantity}
                  onChange={(e) => {
                    setNewPremade((prev) => ({ ...prev, quantity: e.target.value }));
                    if (premadeMode === 'restock' && recipe && !materialsEdited) {
                      setPremadeMaterials(rowsFromRecipe(recipe, Number(e.target.value) || 0));
                    }
                  }}
                  placeholder={premadeMode === 'restock' ? 'Pieces to add' : 'Amount'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
                />
                <FieldError message={fe.errors['premade-quantity']} />
              </div>
              {premadeMode === 'new' && <div {...fe.field('premade-price')}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPremade.price}
                  onChange={(e) => setNewPremade((prev) => ({ ...prev, price: e.target.value }))}
                  placeholder="Price"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
                />
                <FieldError message={fe.errors['premade-price']} />
              </div>}
              {premadeMode === 'new' && <input
                type="text"
                value={newPremade.category}
                onChange={(e) => setNewPremade((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="Category"
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
              />}
              <div {...fe.field('premade-branch')}>
                <select
                  value={newPremade.branchId}
                  onChange={(e) => {
                    setNewPremade((prev) => ({ ...prev, branchId: e.target.value }));
                    // A restock keeps its filled-in materials (they come from the warehouse either way)
                    setPremadeMaterials(premadeMode === 'restock' && recipe
                      ? rowsFromRecipe(recipe, Number(newPremade.quantity) || 0)
                      : [{ materialId: '', quantityUsed: '' }]);
                    setMaterialsEdited(false);
                  }}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
                >
                  <option value="">Select location *</option>
                  {warehouse && (
                    <option value={warehouse.id}>{warehouse.name} (stock room)</option>
                  )}
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} (send as delivery)</option>
                  ))}
                </select>
                <FieldError message={fe.errors['premade-branch']} />
              </div>
            </div>

            <div className="mt-4" {...fe.field('premade-materials', true)}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">Materials Used (Required)</h3>
                {premadeMode === 'restock' && recipe?.basedOn && materialsEdited && (
                  <button type="button" onClick={() => { setMaterialsEdited(false); setPremadeMaterials(rowsFromRecipe(recipe, Number(newPremade.quantity) || 0)); }}
                    className="text-xs text-gray-600 hover:text-[#011c72] underline ml-auto mr-4">Reset to previous materials</button>
                )}
                <button
                  type="button"
                  onClick={addPremadeMaterialRow}
                  className="text-sm text-[#011c72] hover:text-[#011c72] font-medium"
                >
                  + Add Material
                </button>
              </div>
              <div className="space-y-2">
                {premadeMaterials.map((entry, index) => (
                  <div key={index} {...fe.field(`premade-material-${index}`)} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <select
                      value={entry.materialId}
                      onChange={(e) => updatePremadeMaterialRow(index, 'materialId', e.target.value)}
                      className="md:col-span-7 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
                    >
                      <option value="">Select material</option>
                      {rawMaterials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.materialType}{material.color ? ` - ${material.color}` : ''}{material.pattern ? ` (${material.pattern})` : ''} ({material.stockQuantity} yd available)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={entry.quantityUsed}
                      onChange={(e) => updatePremadeMaterialRow(index, 'quantityUsed', e.target.value)}
                      placeholder="Yards used"
                      className="md:col-span-3 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => removePremadeMaterialRow(index)}
                      className="md:col-span-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      Remove
                    </button>
                    {premadeMode === 'restock' && recipeById.get(entry.materialId) && (() => {
                      const r = recipeById.get(entry.materialId)!;
                      const needed = Number(entry.quantityUsed) || 0;
                      return (
                        <p className={`md:col-span-12 -mt-1 text-xs ${needed > r.stock ? 'text-red-600' : 'text-gray-500'}`}>
                          Previously {r.perPiece != null ? `${r.perPiece.toLocaleString('en-PH', { maximumFractionDigits: 4 })} yd per piece` : `${r.batchQuantity} yd for a batch`}
                          {r.costPerUnit > 0 && ` · ₱${r.costPerUnit.toLocaleString('en-PH', { minimumFractionDigits: 2 })} per yard (≈ ₱${(needed * r.costPerUnit).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for this)`}
                          {` · ${r.stock.toLocaleString('en-PH')} yd in stock`}{needed > r.stock && ' — not enough'}
                        </p>
                      );
                    })()}
                    <FieldError message={fe.errors[`premade-material-${index}`]} className="md:col-span-12 mt-0" />
                  </div>
                ))}
              </div>
              <FieldError message={fe.errors['premade-materials']} />
              <p className="mt-2 text-xs text-gray-500">
                {premadeMode === 'restock'
                  ? recipeLoading ? 'Loading the materials used last time…'
                    : recipe?.basedOn
                      ? `Filled in from the last batch (${recipe.basedOn.pieces ? `${recipe.basedOn.pieces} pcs, ` : ''}${recipe.basedOn.date ? formatDate(recipe.basedOn.date) : ''}) for the pieces you're adding. Adjust if needed: only what is entered here is deducted.`
                      : restockProductId ? 'No earlier material record for this product: enter the materials used.' : 'Choose a product to fill in the materials it used last time.'
                  : 'Stock will be deducted automatically based on the material quantities you enter.'}
              </p>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-[#011c72] hover:bg-[#01268c] text-white rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : premadeMode === 'restock' ? 'Add Stock' : 'Add Premade Product'}
              </button>
            </div>
          </form>
        )}

        {/* AI Restock Notification Banner */}
        {!aiAlertDismissed && aiStatus?.status === 'done' && activeTab !== 'ai-predictions' && (() => {
          const urgent = aiStatus.predictions.filter(p => p.daysUntilStockout <= 7);
          const soon = aiStatus.predictions.filter(p => p.daysUntilStockout > 7 && p.daysUntilStockout <= 14);
          if (urgent.length === 0 && soon.length === 0) return null;
          const top3 = [...urgent, ...soon].slice(0, 3);
          return (
            <div className="mb-6 rounded-xl border border-[#c7d2f5] bg-[#eef1fb] overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#dde6ff]">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#011c72] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <span className="text-xs font-semibold text-[#011c72] uppercase tracking-wide">AI Restock Alerts</span>
                  {urgent.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">{urgent.length} critical</span>
                  )}
                  {soon.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">{soon.length} soon</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab('ai-predictions')}
                    className="text-xs font-medium text-[#011c72] hover:text-amber-900 underline"
                  >
                    View all
                  </button>
                  <button onClick={() => setAiAlertDismissed(true)} className="text-xs text-gray-400 hover:text-gray-600">
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="px-4 py-3 space-y-1">
                {top3.map(p => (
                  <div key={p.itemId} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-800">
                      {p.itemId} — {p.materialType}{p.color ? ` (${p.color})` : ''}
                    </span>
                    <span className={p.daysUntilStockout <= 7 ? 'text-red-600 font-semibold' : 'text-orange-600'}>
                      {p.daysUntilStockout <= 7 ? `${p.daysUntilStockout}d left — order ${p.suggestedRestockQty} yd` : `Restock by ${p.restockByDate}`}
                    </span>
                  </div>
                ))}
                {(urgent.length + soon.length) > 3 && (
                  <p className="text-xs text-gray-500">+{(urgent.length + soon.length) - 3} more items need attention</p>
                )}
              </div>
            </div>
          );
        })()}

        {/* AI Historical Upload */}
        {activeTab === 'ai-predictions' && can('forecasting.view') && (
          <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Historical Data
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Upload an Excel file (.xlsx) with columns: <span className="font-mono text-xs bg-gray-100 px-1 rounded">Item_ID, Stock_Quantity, Incoming_Date, Outgoing_Date</span>. Optional: <span className="font-mono text-xs bg-gray-100 px-1 rounded">Restock_Date, Restock_Quantity, Restock_Cycle</span>
                </p>
                {aiStatus?.lastUploadedAt && (
                  <p className="text-xs text-gray-400 mt-1">
                    Last upload: {formatDateTime(aiStatus.lastUploadedAt)} — {aiStatus.uploadRows} rows, {aiStatus.uploadItems} items
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors cursor-pointer ${uploading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#011c72] hover:bg-[#01268c] text-white'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {uploading ? 'Uploading...' : 'Choose File'}
                  <input type="file" accept=".xlsx,.xls" className="hidden" disabled={uploading} onChange={handleUploadHistorical} />
                </label>
                {aiStatus?.uploadRows && aiStatus.uploadRows > 0 && aiStatus.status !== 'computing' && (
                  <button onClick={handleRecompute} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Recompute
                  </button>
                )}
              </div>
            </div>
            {uploadError && <p className="mt-3 text-sm text-red-600">{uploadError}</p>}
            {uploadSuccess && <p className="mt-3 text-sm text-green-600">{uploadSuccess}</p>}

            {/* Prominent progress bar shown directly in upload section */}
            {aiStatus?.status === 'computing' && (
              <div className="mt-4 p-4 rounded-lg bg-[#eef1fb] border border-[#c7d2f5]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-[#011c72] border-t-transparent rounded-full flex-shrink-0" />
                    <span className="text-sm font-semibold text-[#011c72]">AI Training in Progress</span>
                  </div>
                  <span className="text-sm font-bold text-[#011c72]">
                    {aiStatus.totalItems > 0 ? Math.round((aiStatus.processedItems / aiStatus.totalItems) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full bg-[#dde6ff] rounded-full h-3">
                  <div
                    className="bg-[#011c72] h-3 rounded-full transition-all duration-500"
                    style={{ width: aiStatus.totalItems > 0 ? `${(aiStatus.processedItems / aiStatus.totalItems) * 100}%` : '0%' }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-[#011c72]">{aiStatus.processedItems} of {aiStatus.totalItems} items trained</p>
                  <p className="text-xs text-[#011c72]">Auto-updates every 3 seconds</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add Waste Log Form */}
        {activeTab === 'waste-log' && can('inventory.log_waste') && (
          <form onSubmit={handleCreateWasteLog} noValidate className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Log Waste / Scrap</h2>
            <p className="text-xs text-gray-500 mb-4">For waste not tied to a job order (damaged or spoiled stock). Extra material used on a job order is recorded on that job order&apos;s page so it counts in its cost.</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div {...fe.field('waste-material')}>
                <select value={newWaste.materialId} onChange={e => setNewWaste(p => ({ ...p, materialId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900">
                  <option value="">Select Material *</option>
                  {rawMaterials.map(m => (
                    <option key={m.id} value={m.id}>{m.materialType}{m.color ? ` - ${m.color}` : ''}{m.pattern ? ` (${m.pattern})` : ''} ({m.stockQuantity} yd available)</option>
                  ))}
                </select>
                <FieldError message={fe.errors['waste-material']} />
              </div>
              <div {...fe.field('waste-quantity')}>
                <input type="number" min="0.01" step="0.01" value={newWaste.quantity} onChange={e => setNewWaste(p => ({ ...p, quantity: e.target.value }))} placeholder="Yards Wasted *" className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900" />
                <FieldError message={fe.errors['waste-quantity']} />
              </div>
              <div {...fe.field('waste-reason')}>
                <input type="text" value={newWaste.reason} onChange={e => setNewWaste(p => ({ ...p, reason: e.target.value }))} placeholder="Reason (e.g. cutting error) *" className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900" />
                <FieldError message={fe.errors['waste-reason']} />
              </div>
              <input type="text" value={newWaste.notes} onChange={e => setNewWaste(p => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)" className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900" />
            </div>
            <div className="mt-4">
              <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60">
                {saving ? 'Saving...' : 'Log Waste'}
              </button>
              <p className="mt-2 text-xs text-gray-500">This will deduct the quantity from the material&apos;s stock.</p>
            </div>
          </form>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#011c72] text-[#011c72]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>

          {/* Search + Filters */}
          {activeTab !== 'ai-predictions' && <div className="p-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={activeTab === 'finished-goods'
                    ? 'Search by product name, category, SKU...'
                    : 'Search by type, color, pattern, ID...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                />
              </div>
              {activeTab === 'raw-materials' && (
                <>
                  <select
                    value={materialTypeFilter}
                    onChange={(e) => setMaterialTypeFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  >
                    <option value="">All Types</option>
                    {uniqueMaterialTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  >
                    <option value="all">All Status</option>
                    <option value="in-stock">In Stock</option>
                    <option value="low-stock">Low Stock</option>
                    <option value="out-of-stock">Out of Stock</option>
                  </select>
                  {(searchTerm || materialTypeFilter || statusFilter !== 'all') && (
                    <button
                      onClick={() => { setSearchTerm(''); setMaterialTypeFilter(''); setStatusFilter('all'); }}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
                    >
                      Clear filters
                    </button>
                  )}
                </>
              )}
              {seesAllInventory && ['raw-materials', 'material-usage', 'waste-log'].includes(activeTab) && (
                <select
                  value={inventoryBranch}
                  onChange={(e) => setInventoryBranch(e.target.value)}
                  aria-label="Branch"
                  className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                >
                  <option value="all">All Branches</option>
                  {warehouse && <option value={warehouse.id}>{warehouse.name}</option>}
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              {activeTab === 'finished-goods' && (
                <>
                  <select
                    value={premadeBranchFilter}
                    onChange={(e) => setPremadeBranchFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                  >
                    <option value="all">All Locations ({finishedGoods.length})</option>
                    {warehouse && (
                      <option value={warehouse.id}>
                        {warehouse.name} ({countAtLocation(warehouse.id)})
                      </option>
                    )}
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({countAtLocation(b.id)})
                      </option>
                    ))}
                  </select>
                  {(searchTerm || premadeBranchFilter !== 'all') && (
                    <button
                      onClick={() => { setSearchTerm(''); setPremadeBranchFilter('all'); }}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
                    >
                      Clear filters
                    </button>
                  )}
                </>
              )}
            </div>
          </div>}

          {/* Content */}
          {loading && activeTab !== 'ai-predictions' ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading inventory...</p>
            </div>
          ) : activeTab === 'raw-materials' ? (
            <div className="divide-y divide-gray-100">
              {/* Result count */}
              <div className="px-5 py-2 bg-gray-50 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  {filteredRawMaterials.length} of {rawMaterials.length} item{rawMaterials.length !== 1 ? 's' : ''}
                </p>
              </div>
              {filteredRawMaterials.length === 0 ? (
                <div className="p-10 text-center">
                  <svg className="w-14 h-14 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <h3 className="text-base font-medium text-gray-900 mb-1">No items found</h3>
                  <p className="text-sm text-gray-500">
                    {searchTerm || materialTypeFilter || statusFilter !== 'all'
                      ? 'Try adjusting your search or filters.'
                      : 'Add your first item to get started.'}
                  </p>
                </div>
              ) : (
                <Paginated items={filteredRawMaterials} resetKey={[searchTerm, statusFilter, materialTypeFilter]} label="materials">{rows => (
                rows.map((material) => {
                  const status = getStockStatus(material.stockQuantity, material.lowStockThreshold);
                  const isEditing = editingMaterialId === material.id;
                  return (
                    <div key={material.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                      {isEditing ? (
                        /* Edit mode — inline grid */
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                            <div {...fe.field('edit-materialType')} className="md:col-span-2">
                              <input
                                type="text"
                                value={editMaterial.materialType}
                                onChange={(e) => setEditMaterial((prev) => ({ ...prev, materialType: e.target.value }))}
                                placeholder="Material Name"
                                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900"
                              />
                              <FieldError message={fe.errors['edit-materialType']} />
                            </div>
                            <input
                              type="text"
                              value={editMaterial.sku}
                              onChange={(e) => setEditMaterial((prev) => ({ ...prev, sku: e.target.value }))}
                              placeholder="SKU"
                              className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900"
                            />
                            <select
                              value={editMaterial.supplierId}
                              onChange={(e) => setEditMaterial((prev) => ({ ...prev, supplierId: e.target.value }))}
                              className="md:col-span-2 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900"
                            >
                              <option value="">— Supplier —</option>
                              {suppliers.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editMaterial.color}
                              onChange={(e) => setEditMaterial((prev) => ({ ...prev, color: e.target.value }))}
                              placeholder="Color"
                              className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900"
                            />
                            <input
                              type="text"
                              value={editMaterial.pattern}
                              onChange={(e) => setEditMaterial((prev) => ({ ...prev, pattern: e.target.value }))}
                              placeholder="Pattern"
                              className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900"
                            />
                          </div>
                          {/* Pricing */}
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-xs font-medium text-gray-700">Selling Price</span>
                              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                                <button type="button"
                                  onClick={() => setEditMaterial((prev) => ({ ...prev, priceMode: 'markup' }))}
                                  className={`px-2.5 py-1 ${editMaterial.priceMode === 'markup' ? 'bg-[#011c72] text-white' : 'bg-white text-gray-600'}`}>
                                  Cost + markup
                                </button>
                                <button type="button"
                                  onClick={() => setEditMaterial((prev) => ({ ...prev, priceMode: 'manual' }))}
                                  className={`px-2.5 py-1 ${editMaterial.priceMode === 'manual' ? 'bg-[#011c72] text-white' : 'bg-white text-gray-600'}`}>
                                  Manual
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 items-end">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Cost/Yard (₱)</label>
                                <input type="number" min="0" step="0.01" value={editMaterial.costPerUnit}
                                  onChange={(e) => setEditMaterial((prev) => ({ ...prev, costPerUnit: e.target.value }))}
                                  placeholder="0.00"
                                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Markup %</label>
                                <input type="number" min="0" step="0.01" value={editMaterial.markupPercent}
                                  disabled={editMaterial.priceMode === 'manual'}
                                  onChange={(e) => setEditMaterial((prev) => ({ ...prev, markupPercent: e.target.value }))}
                                  placeholder="25"
                                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400" />
                              </div>
                              <div {...fe.field('edit-unitPrice')}>
                                <label className="block text-xs text-gray-500 mb-1">Selling (₱)</label>
                                {editMaterial.priceMode === 'manual' ? (
                                  <input type="number" min="0" step="0.01" value={editMaterial.unitPrice}
                                    onChange={(e) => setEditMaterial((prev) => ({ ...prev, unitPrice: e.target.value }))}
                                    placeholder="0.00"
                                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
                                ) : (
                                  <div className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-900">
                                    {formatCurrency(Number(editMaterial.costPerUnit || 0) * (1 + Number(editMaterial.markupPercent || 0) / 100))}
                                  </div>
                                )}
                                <FieldError message={fe.errors['edit-unitPrice']} />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleSaveMaterial(material.id)}
                              className="px-3 py-1.5 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-medium transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingMaterialId(null)}
                              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div className="flex items-center gap-4">
                          {/* Color swatch */}
                          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#dde6ff] flex items-center justify-center">
                            <svg className="w-5 h-5 text-[#011c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                          {/* Main info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900">{material.materialType}</span>
                              {material.color && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{material.color}</span>
                              )}
                              {material.pattern && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{material.pattern}</span>
                              )}
                              {material.sku && (
                                <span className="text-xs font-mono text-gray-400">{material.sku}</span>
                              )}
                              {material.supplierName && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{material.supplierName}</span>
                              )}
                              {seesAllInventory && material.branchName && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-[#eef1fb] text-[#011c72]">{material.branchName}</span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                              {material.costPerUnit != null && material.costPerUnit > 0 && (
                                <span>Cost: <span className="font-medium text-gray-700">{formatCurrency(material.costPerUnit)}</span>
                                  {material.markupPercent != null && <span className="text-gray-400"> +{material.markupPercent}%</span>}
                                </span>
                              )}
                              <span>Selling: <span className="font-medium text-gray-700">{formatCurrency(material.unitPrice)}</span></span>
                              <span>Stock: <span className="font-medium text-gray-700">{material.stockQuantity} yd</span></span>
                            </div>
                          </div>
                          {/* Status + actions */}
                          <div className="flex-shrink-0 flex items-center gap-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.class}`}>
                              {status.label}
                            </span>
                            {canChangeMaterial(material) && (
                              <button
                                onClick={() => startEditMaterial(material)}
                                className="text-sm font-medium text-[#011c72] hover:text-[#011c72] transition-colors"
                              >
                                Edit
                              </button>
                            )}
                            {canChangeMaterial(material) && can('inventory.adjust_stock') && (
                              <button
                                onClick={() => openAdjust({ kind: 'material', id: material.id, current: material.stockQuantity,
                                  name: [material.materialType, material.color, material.pattern].filter(Boolean).join(' - '), unit: 'yd' })}
                                className="text-sm font-medium text-amber-700 hover:text-amber-800 transition-colors"
                              >
                                Adjust stock
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
                )}</Paginated>
              )}
            </div>
          ) : activeTab === 'finished-goods' ? (
            <div className="overflow-x-auto">
              {/* Deliveries awaiting receipt. Stock has not moved yet. */}
              {transfers.length > 0 && (
                <div className="border-b border-gray-200 bg-[#fbfcff] p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">
                        Incoming Deliveries ({transfers.length})
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Stock stays in the warehouse until the receiving branch confirms it.
                      </p>
                    </div>
                  </div>

                  {transferError && (
                    <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {transferError}
                    </p>
                  )}

                  <Paginated items={transfers} label="transfers">{rows => (
                  <ul className="space-y-2">
                    {rows.map((t) => {
                      const mine = user?.branchId === t.destinationBranchId;
                      const canAct = canDistribute || can('branches.all') || (can('premade.receive') && mine);
                      return (
                        <li key={t.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {t.quantity} {t.unit} · {t.productName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {t.sourceBranchName} → {t.destinationBranchName}
                              {t.createdByName ? ` · sent by ${t.createdByName}` : ''}
                              {' · '}{formatDateTime(t.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {canAct ? (
                              <>
                                <button
                                  onClick={() => handleConfirmTransfer(t)}
                                  disabled={transferBusyId === t.id}
                                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                  {transferBusyId === t.id ? '…' : mine && !confirmsViaDialog ? 'Accept' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => handleCancelTransfer(t)}
                                  disabled={transferBusyId === t.id}
                                  className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">
                                Awaiting {t.destinationBranchName}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  )}</Paginated>
                </div>
              )}

              {filteredFinishedGoods.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchTerm || premadeBranchFilter !== 'all'
                      ? 'No premade products match these filters'
                      : 'No premade products yet'}
                  </h3>
                  <p className="text-gray-500">
                    {premadeBranchFilter !== 'all' && !searchTerm
                      ? 'This location is not holding any premade stock right now.'
                      : searchTerm
                      ? 'Try a different search term or location.'
                      : 'Add premade stock using the form above.'}
                  </p>
                </div>
              ) : (
                <Paginated items={filteredFinishedGoods} resetKey={[searchTerm, premadeBranchFilter]} label="products">{rows => (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((item) => {
                      const status = getStockStatus(item.quantity);
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center mr-3">
                                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                                <p className="text-xs text-gray-500">{item.sku || 'No SKU'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`text-xs px-2 py-1 rounded-full ${item.isWarehouse ? 'bg-[#dde6ff] text-[#011c72] font-medium' : 'bg-gray-100 text-gray-600'}`}>
                              {item.branchName || `Branch ${item.branchId}`}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {item.category}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {/* Stock is corrected with Adjust stock (with a reason), not edited here */}
                            {(
                              <div>
                                <span className="text-sm font-medium text-gray-900">{item.quantity}</span>
                                {/* Pending deliveries are still counted in `quantity`,
                                    so show what is actually free to give out. */}
                                {!!item.pendingOutgoing && item.pendingOutgoing > 0 && (
                                  <p className="text-xs text-yellow-700 mt-0.5">
                                    {item.pendingOutgoing} pending · {item.availableQuantity} free
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {editingPremadeId === item.id ? (
                              <div {...fe.field('editPremade-price')}>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editPremade.price}
                                  onChange={(e) => setEditPremade((prev) => ({ ...prev, price: e.target.value }))}
                                  className="w-28 px-2 py-1 rounded border border-gray-200 bg-white text-sm text-gray-900"
                                />
                                <FieldError message={fe.errors['editPremade-price']} />
                              </div>
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
                                  className="text-[#011c72] hover:text-[#011c72] text-sm font-medium"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingPremadeId(null)}
                                  className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                              <button
                                onClick={() => startEditPremade(item)}
                                className="text-[#011c72] hover:text-[#011c72] text-sm font-medium"
                              >
                                Edit
                              </button>
                              {can('premade.adjust_stock') && (can('branches.all') || item.branchId === user?.branchId) && (
                                <button
                                  onClick={() => openAdjust({ kind: 'premade', id: item.id, current: item.quantity, name: item.name,
                                    unit: 'pcs', promised: item.pendingOutgoing || 0 })}
                                  className="ml-3 text-amber-700 hover:text-amber-800 text-sm font-medium"
                                >
                                  Adjust stock
                                </button>
                              )}
                              </>
                            )}
                            {/* Only warehouse stock is handed out to branches. */}
                            {editingPremadeId !== item.id && canDistribute && item.isWarehouse && (
                              <button
                                onClick={() => openDistribute(item)}
                                disabled={(item.availableQuantity ?? item.quantity) <= 0}
                                title={(item.availableQuantity ?? item.quantity) <= 0
                                  ? 'No free stock left to give out'
                                  : 'Give this stock to branches'}
                                className="ml-3 text-sm font-medium text-green-700 hover:text-green-800 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Give to branches
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}</Paginated>
              )}
            </div>
          ) : activeTab === 'material-usage' ? (
            <div className="overflow-x-auto">
              {materialUsageLogs.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No material usage yet</h3>
                  <p className="text-gray-500">Material usage entries appear here when premade products are added or job orders are completed.</p>
                </div>
              ) : (
                <Paginated items={filteredUsageLogs} resetKey={searchTerm} label="entries">{rows => (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">When Used</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Where Used</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">How Much</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Used By</th>
                      {seesAllInventory && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDateTime(log.usedAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {log.materialName || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {log.usedInReference}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {log.quantityUsed}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {log.workerName ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-full bg-[#011c72]/10 text-[#011c72] flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {log.workerName.charAt(0)}
                                </span>
                                {log.workerName}
                              </span>
                            ) : (log.usedByName || 'System')}
                          </td>
                          {seesAllInventory && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{log.branchName || '—'}</td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
                )}</Paginated>
              )}
            </div>
          ) : activeTab === 'ai-predictions' ? (
            <div>
              {/* Computing progress — detailed view inside tab */}
              {aiStatus?.status === 'computing' && (
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin w-5 h-5 border-2 border-[#011c72] border-t-transparent rounded-full shrink-0" />
                      <span className="text-sm font-semibold text-gray-800">Training AI models...</span>
                    </div>
                    <span className="text-lg font-bold text-[#011c72]">
                      {aiStatus.totalItems > 0 ? Math.round((aiStatus.processedItems / aiStatus.totalItems) * 100) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-[#011c72] h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                      style={{ width: aiStatus.totalItems > 0 ? `${Math.max((aiStatus.processedItems / aiStatus.totalItems) * 100, 2)}%` : '2%' }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold text-gray-900">{aiStatus.processedItems}</span> of <span className="font-semibold text-gray-900">{aiStatus.totalItems}</span> items
                    </p>
                    <p className="text-xs text-gray-400">
                      ~{aiStatus.totalItems > 0 && aiStatus.processedItems > 0
                        ? Math.ceil(((aiStatus.totalItems - aiStatus.processedItems) * 5) / 60)
                        : Math.ceil(aiStatus.totalItems * 5 / 60)} min remaining
                    </p>
                  </div>
                </div>
              )}

              {/* Refresh button */}
              <div className="flex justify-end px-4 pt-3">
                <button
                  onClick={fetchAIPredictions}
                  disabled={aiLoading || aiStatus?.status === 'computing'}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
                >
                  <svg className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </div>

              {/* Error state */}
              {aiStatus?.status === 'error' && (
                <div className="p-6 border-b border-gray-200">
                  <p className="text-sm text-red-600">Prediction error: {aiStatus.error}</p>
                  <p className="text-xs text-gray-500 mt-1">Make sure prophet is installed: <span className="font-mono bg-gray-100 px-1 rounded">pip install prophet</span></p>
                </div>
              )}

              {/* No data uploaded yet */}
              {(!aiStatus || aiStatus.status === 'idle') && (
                <div className="p-12 text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <h3 className="text-base font-medium text-gray-900 mb-1">No predictions yet</h3>
                  <p className="text-sm text-gray-500">Upload your historical Excel data above to generate AI restock recommendations.</p>
                </div>
              )}

              {/* Predictions list */}
              {aiStatus?.status === 'done' && aiStatus.predictions.length > 0 && (() => {
                const filtered = aiStatus.predictions.filter(p => {
                  const q = predSearch.toLowerCase();
                  const matchSearch = !q || p.itemId.toLowerCase().includes(q) || p.materialType.toLowerCase().includes(q) || p.color.toLowerCase().includes(q) || p.pattern.toLowerCase().includes(q);
                  const matchUrgency =
                    predUrgencyFilter === 'all' ||
                    (predUrgencyFilter === 'urgent' && p.daysUntilStockout <= 7) ||
                    (predUrgencyFilter === 'soon' && p.daysUntilStockout > 7 && p.daysUntilStockout <= 30) ||
                    (predUrgencyFilter === 'ok' && p.daysUntilStockout > 30);
                  return matchSearch && matchUrgency;
                });
                const urgent = aiStatus.predictions.filter(p => p.daysUntilStockout <= 7).length;
                const soon = aiStatus.predictions.filter(p => p.daysUntilStockout > 7 && p.daysUntilStockout <= 30).length;

                return (
                  <div>
                    {/* Summary bar */}
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {aiStatus.predictions.length} items analyzed
                          {aiStatus.computedAt && ` · Updated ${formatDateTime(aiStatus.computedAt)}`}
                        </span>
                        <span className="text-xs font-medium text-gray-500">·</span>
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">{urgent} urgent (&le;7 days)</span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">{soon} soon (8–30 days)</span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          placeholder="Search by ID, type, color..."
                          value={predSearch}
                          onChange={e => setPredSearch(e.target.value)}
                          className="flex-1 max-w-sm px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900"
                        />
                        <select
                          value={predUrgencyFilter}
                          onChange={e => setPredUrgencyFilter(e.target.value as typeof predUrgencyFilter)}
                          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900"
                        >
                          <option value="all">All Urgency</option>
                          <option value="urgent">Urgent (&le;7 days)</option>
                          <option value="soon">Soon (8–30 days)</option>
                          <option value="ok">OK (&gt;30 days)</option>
                        </select>
                      </div>
                    </div>

                    {/* Predictions table */}
                    <Paginated items={filtered} resetKey={[predSearch, predUrgencyFilter]} label="items">{rows => (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Stock</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Daily Use</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days Left</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Restock By</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Suggested Qty</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source / Confidence</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {rows.map(p => {
                            const isUrgent = p.daysUntilStockout <= 7;
                            const isSoon = p.daysUntilStockout > 7 && p.daysUntilStockout <= 30;
                            const daysClass = isUrgent
                              ? 'text-red-600 font-bold'
                              : isSoon
                              ? 'text-orange-600 font-semibold'
                              : 'text-green-600';
                            const srcColors = {
                              xlsx: 'bg-blue-100 text-blue-700',
                              hybrid: 'bg-purple-100 text-purple-700',
                              live: 'bg-green-100 text-green-700',
                            };
                            const confColors = {
                              low: 'bg-gray-100 text-gray-600',
                              medium: 'bg-yellow-100 text-yellow-700',
                              high: 'bg-green-100 text-green-700',
                            };
                            return (
                              <tr key={p.itemId} className={`hover:bg-gray-50 transition-colors ${isUrgent ? 'bg-red-50/30' : ''}`}>
                                <td className="px-4 py-3">
                                  <div className="text-sm font-semibold text-gray-900">{p.itemId}</div>
                                  <div className="text-xs text-gray-500">{p.materialType}{p.color ? ` · ${p.color}` : ''}{p.pattern ? ` · ${p.pattern}` : ''}</div>
                                  {!p.hasCurrentInventory && <span className="text-xs text-orange-500">Not in current inventory</span>}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700">{p.currentStock} yd</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{p.avgDailyUsage} yd/day</td>
                                <td className="px-4 py-3">
                                  <span className={`text-sm ${daysClass}`}>
                                    {p.daysUntilStockout >= 9999 ? '—' : `${p.daysUntilStockout} days`}
                                  </span>
                                  {isUrgent && <span className="ml-1 text-xs text-red-500">!</span>}
                                </td>
                                <td className="px-4 py-3">
                                  {p.restockByDate ? (
                                    <div>
                                      <div className={`text-sm font-medium ${isUrgent ? 'text-red-600' : 'text-gray-700'}`}>
                                        {formatDate(p.restockByDate)}
                                      </div>
                                      <div className="text-xs text-gray-400">{p.avgLeadTimeDays}d lead time</div>
                                    </div>
                                  ) : <span className="text-sm text-gray-400">—</span>}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.suggestedRestockQty} yd</td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-1">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${srcColors[p.dataSource]}`}>
                                      {p.dataSource === 'xlsx' ? 'XLSX' : p.dataSource === 'hybrid' ? 'Hybrid' : 'Live'}
                                    </span>
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${confColors[p.confidence]}`}>
                                      {p.confidence.charAt(0).toUpperCase() + p.confidence.slice(1)} conf.
                                    </span>
                                    {p.method && (
                                      <span className="text-[11px] text-gray-500"
                                        title="Error = how far off the method was when forecasting the most recent weeks it was not shown (lower is better)">
                                        {FORECAST_METHOD_LABELS[p.method]}
                                        {p.errorPercent != null && <> · {p.errorPercent}% error</>}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {filtered.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">No predictions match your filters.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    )}</Paginated>
                  </div>
                );
              })()}
            </div>
          ) : activeTab === 'waste-log' ? (
            <div className="overflow-x-auto">
              <div className="p-4 border-b border-gray-200">
                <input type="text" placeholder="Search waste logs..." value={wasteSearch} onChange={e => setWasteSearch(e.target.value)} className="w-full max-w-md pl-4 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-900" />
              </div>
              {wasteLogs.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-500">No waste logs yet. Use the form above to log wasted or scrapped materials.</p>
                </div>
              ) : (
                <Paginated items={filteredWasteLogs} resetKey={wasteSearch} label="waste logs">{rows => (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Yards Wasted</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Order</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Logged By</th>
                      {can('inventory.log_waste') && <th className="px-4 py-3"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map(l => (
                      <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(l.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">{l.materialName || 'N/A'}</span>
                          {l.materialColor && <span className="text-xs text-gray-500 ml-1">({l.materialColor})</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-red-600">{l.quantity} yd</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600">{l.reason}</span>
                          {l.notes && <p className="text-xs text-gray-400">{l.notes}</p>}
                          {l.workerName && <p className="text-xs text-gray-400">Worker: {l.workerName}</p>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {l.jobOrderId ? (
                            <a href={`/sales/${l.jobOrderId}`} className="text-[#011c72] hover:underline">{l.jobOrderNumber}</a>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {typeof l.value === 'number' ? `₱${l.value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{l.branchName || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{l.loggedByName || 'System'}</td>
                        {can('inventory.log_waste') && (
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            <button type="button" onClick={() => undoWaste(l)} title="Undo: return it to stock"
                              className="text-xs text-gray-500 hover:text-red-600 hover:underline">Undo</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}</Paginated>
              )}
            </div>
          ) : null}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Items</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {rawMaterials.length + finishedGoods.length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Out of Stock</p>
                <p className="text-2xl font-bold text-red-600 mt-1">
                  {outOfStockItems.length}
                </p>
                {lowStockItems.length > 0 && (
                  <p className="text-xs text-orange-600 mt-1">
                    +{lowStockItems.length} low stock
                  </p>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Value</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {formatCurrency(rawMaterials.reduce((sum, m) => sum + (m.stockQuantity * m.unitPrice), 0))}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Give warehouse stock to branches ── */}
      {distributing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDistributing(null)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Give to branches</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {distributing.name} ·{' '}
                  <span className="font-medium text-gray-700">
                    {distributing.availableQuantity ?? distributing.quantity} {distributing.unit || 'pcs'} free
                  </span>
                  {!!distributing.pendingOutgoing && distributing.pendingOutgoing > 0 && (
                    <> ({distributing.pendingOutgoing} already pending)</>
                  )}
                </p>
              </div>
              <button onClick={() => setDistributing(null)}
                className="text-xl leading-none text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <div className="space-y-5 p-6">
              {distributeError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {distributeError}
                </p>
              )}

              {branches.length === 0 ? (
                <p className="text-sm text-gray-500">There are no active branches to give stock to.</p>
              ) : (
                <>
                  <div {...fe.field('distribute-all')}>
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Give the same amount to every branch</h3>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" step="1"
                        value={allBranchesQty}
                        onChange={(e) => setAllBranchesQty(e.target.value)}
                        placeholder="Qty per branch"
                        className="w-40 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                      />
                      <button
                        type="button"
                        onClick={() => handleDistribute(true)}
                        disabled={distributeSaving || !Number(allBranchesQty)}
                        className="rounded-lg bg-[#011c72] px-4 py-2 text-sm font-semibold text-white hover:bg-[#01268c] disabled:opacity-50"
                      >
                        Give to all {branches.length}
                      </button>
                    </div>
                    {!!Number(allBranchesQty) && (
                      <p className="mt-1.5 text-xs text-gray-500">
                        Total needed: {Number(allBranchesQty) * branches.length} {distributing.unit || 'pcs'}
                      </p>
                    )}
                    <FieldError message={fe.errors['distribute-all']} />
                  </div>

                  <div className="border-t border-gray-100 pt-5" {...fe.field('distribute-each', true)}>
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Or set each branch</h3>
                    <div className="space-y-2">
                      {branches.map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-gray-700">{b.name}</span>
                          <input
                            type="number" min="0" step="1"
                            value={allocations[b.id] || ''}
                            onChange={(e) =>
                              setAllocations((prev) => ({ ...prev, [b.id]: e.target.value }))
                            }
                            placeholder="0"
                            className="w-28 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className={`text-xs ${allocationTotal > (distributing.availableQuantity ?? distributing.quantity) ? 'font-medium text-red-600' : 'text-gray-500'}`}>
                        Total: {allocationTotal} of {distributing.availableQuantity ?? distributing.quantity} free
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDistribute(false)}
                        disabled={distributeSaving || allocationTotal <= 0}
                        className="rounded-lg bg-[#011c72] px-4 py-2 text-sm font-semibold text-white hover:bg-[#01268c] disabled:opacity-50"
                      >
                        {distributeSaving ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                    <FieldError message={fe.errors['distribute-each']} />
                  </div>
                </>
              )}

              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Nothing leaves the warehouse yet — each branch must confirm receipt before the
                stock shows up in their inventory.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Adjust stock: correcting a count by hand, always with a reason */}
      {adjusting && (() => {
        const qty = Number(adjustForm.newQuantity);
        const change = adjustForm.newQuantity.trim() !== '' && !Number.isNaN(qty) ? qty - adjusting.current : null;
        const close = () => { if (!adjustSaving) setAdjusting(null); };
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={close}>
            <div role="dialog" aria-modal="true" aria-labelledby="adjust-title"
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="adjust-title" className="text-base font-semibold text-gray-900">Adjust stock</h2>
                  <p className="text-xs text-gray-500 truncate">{adjusting.name}</p>
                </div>
                <button onClick={close} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-gray-500">
                  For correcting the count only. New stock comes in through{' '}
                  {adjusting.kind === 'material' ? 'purchase orders' : 'Add Stock (made from raw materials) or deliveries'}.
                  Every adjustment is recorded with your name and reason.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Current stock</p>
                    <p className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-900">
                      {adjusting.current.toLocaleString('en-PH')} {adjusting.unit}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="adjust-qty" className="block text-xs text-gray-500 mb-1">Correct stock ({adjusting.unit}) *</label>
                    <input id="adjust-qty" type="number" min="0" step={adjusting.kind === 'premade' ? '1' : '0.01'} autoFocus
                      value={adjustForm.newQuantity} onChange={e => setAdjustForm(f => ({ ...f, newQuantity: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
                  </div>
                </div>
                {change !== null && change !== 0 && (
                  <p className={`text-sm font-medium ${change > 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {change > 0 ? '+' : ''}{Math.round(change * 100) / 100} {adjusting.unit}
                  </p>
                )}
                <div>
                  <label htmlFor="adjust-reason" className="block text-xs text-gray-500 mb-1">Reason *</label>
                  <select id="adjust-reason" value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900">
                    <option value="">Choose a reason…</option>
                    {STOCK_ADJUST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="adjust-notes" className="block text-xs text-gray-500 mb-1">
                    Notes {adjustForm.reason === 'Other' ? '*' : '(optional)'}
                  </label>
                  <input id="adjust-notes" type="text" maxLength={200} value={adjustForm.notes}
                    onChange={e => setAdjustForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. Counted 2 more rolls in storage"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900" />
                </div>
                {adjustError && <p role="alert" className="text-sm text-red-600">{adjustError}</p>}
              </div>
              <div className="p-5 border-t border-gray-200 flex gap-3">
                <button type="button" onClick={submitAdjust} disabled={adjustSaving}
                  className="flex-1 py-2.5 bg-[#011c72] hover:bg-[#022a9e] text-white text-sm font-medium rounded-xl disabled:opacity-50">
                  {adjustSaving ? 'Saving…' : 'Save adjustment'}
                </button>
                <button type="button" onClick={close} disabled={adjustSaving}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm disabled:opacity-50">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
      {confirmDialog}
    </div>
  );
}
