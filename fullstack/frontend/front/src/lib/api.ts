// API client for Seatmakers Avenue System

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ApiResponse<T> {
  status: string;
  data?: T;
  message?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: 'administrator' | 'supervisor' | 'sales_manager' | 'seat_maker' | 'sewer' | 'owner' | 'supplier';
  roleName?: string;
  branch: string;
  branchId?: number;
  branchName?: string;
  /** Based at the warehouse (administrators only); grants no extra access */
  atWarehouse?: boolean;
  isActive?: boolean;
  phone?: string;
  /** Effective permissions (role defaults + grants − revokes), e.g. 'inventory.add' */
  permissions?: string[];
  /** In the Users list: whether the signed-in user may manage this account (only roles below theirs) */
  canManage?: boolean;
  manageBlockedReason?: string | null;
}

export interface PermissionModule {
  key: string;
  label: string;
  permissions: { key: string; action: string; label: string }[];
}

export interface PermissionCatalogue {
  modules: PermissionModule[];
  roleDefaults: Record<string, string[]>;
}

export interface UserPermissions {
  userId: number;
  role: string;
  roleDefaults: string[];
  grants: string[];
  revokes: string[];
  effective: string[];
  /** Fingerprint of what was loaded; sent back on save so stale saves are refused */
  version: string;
  /** False for customer accounts, and for accounts the signed-in user may not change */
  editable: boolean;
  readOnlyReason: string | null;
  /** Permissions the signed-in user may not grant or remove */
  locked: string[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface DashboardStats {
  totalJobOrders: number;
  pendingOrders: number;
  inProgressOrders: number;
  /** Job orders finished in the chosen period */
  completedOrders: number;
  /** Sales in the chosen period: job orders + premade, VAT excluded (same as the Owner P&L) */
  totalRevenue: number;
  jobOrderRevenue?: number;
  premadeRevenue?: number;
  completedPremadeOrders?: number;
  /** Cost of goods sold in the chosen period */
  totalCost: number;
  profit: number;
  profitMargin: number;
  lowStockItems: number;
  pendingDeliveries: number;
  totalRawMaterials: number;
  totalFinishedGoods: number;
  totalUsers?: number;
  totalBranches?: number;
  /** Branch these figures cover; null means the whole company (admins only) */
  scopeBranchId?: number | null;
  scopeBranchName?: string | null;
  period?: { key: DashboardPeriod; startDate: string; endDate: string };
}

export type DashboardPeriod = 'today' | 'week' | 'month' | 'year' | 'all';

export interface Activity {
  /** 'job_order' | 'delivery' — decides which record page this row opens. */
  type: string;
  /** Database id of the underlying record, used to build the link. */
  id?: number;
  /** Human-readable reference, e.g. "JO-BA-2026-0001". */
  reference?: string;
  title: string;
  description: string;
  timestamp: string;
  status: string;
}

export interface Alert {
  /** 'low_stock' | 'delivery_due' | 'overdue_order' — decides the link target. */
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  itemId: number;
  /** Only on low_stock: the material name, for deep-linking into inventory. */
  itemName?: string;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  priority: 'info' | 'warning' | 'urgent';
  isPinned: boolean;
  isActive: boolean;
  createdById?: number;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  discountPercent?: number | null;
  promoCode?: string | null;
  promoDiscount?: number | null;
  notes: string;
  createdAt?: string;
  orderHistory?: CustomerOrderSummary[];
  /** Set when the customer signed up online; walk-ins have no account */
  userId?: number | null;
  hasAccount?: boolean;
  username?: string | null;
  accountActive?: boolean;
  /** List only: job orders plus online product orders and custom requests */
  orderCount?: number;
  /** Detail only: orders placed through the online account */
  onlineOrders?: CustomerOnlineOrder[];
  /** What they still owe across their orders */
  unpaidTotal?: number;
  /** Excess payments the shop still has to return (refund or apply) */
  excessTotal?: number;
  /** Detail only: job orders with a balance left */
  unpaidOrders?: CustomerOrderSummary[];
  /** Detail only: every excess payment, open and settled */
  excessPayments?: ExcessPayment[];
}

/** Money received on a job order beyond its balance, held until returned */
export interface ExcessPayment {
  id: number;
  jobOrderId: number;
  jobOrderRef?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string | null;
  notes?: string | null;
  status: 'open' | 'refunded' | 'applied';
  receivedByName?: string | null;
  createdAt: string;
  resolvedByName?: string | null;
  resolvedAt?: string | null;
  refundMethod?: string | null;
  refundReference?: string | null;
  resolutionNotes?: string | null;
  appliedJobOrderId?: number | null;
  appliedJobOrderRef?: string | null;
}

export interface CustomerOnlineOrder {
  id: number;
  type: 'product' | 'custom';
  orderNumber: string;
  status: string;
  totalPrice: number;
  createdAt: string | null;
}

export interface CustomerOrderSummary {
  id: number;
  jobOrderId: string;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  downPayment: number;
  balance: number;
  createdAt: string;
  estimatedCompletion?: string | null;
}

export interface PhoneBlacklistRecord {
  id: number;
  phoneNumber: string;
  strikeCount: number;
  isBlocked: boolean;
  reason?: string;
  blockedAt?: string;
  createdAt: string;
}

/** One line of a premade draft, re-checked against stock every time it is loaded */
export interface PremadeDraftLine {
  productId: number;
  name: string;
  sku?: string;
  quantity: number;
  /** Stock on hand now (0 when the product is no longer sold at the branch) */
  available: number;
  /** Current price, used when the draft is confirmed */
  unitPrice: number;
  /** Price when the line was saved */
  savedUnitPrice: number;
  total: number;
  /** null when the line can be sold as it stands */
  issue: 'unavailable' | 'out_of_stock' | 'insufficient' | null;
  message: string;
}

/** A premade job order being prepared by staff: no stock is taken until it is confirmed */
export interface PremadeDraft {
  id: number;
  draftNumber: string;
  status: 'draft' | 'confirmed';
  branchId: number;
  branchName?: string | null;
  customerId?: number | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  notes: string;
  paymentMethod: string;
  items: PremadeDraftLine[];
  itemCount: number;
  totalAmount: number;
  /** False when any line is out of stock, short or no longer sold: it can't be confirmed yet */
  isAvailable: boolean;
  productOrderId?: number | null;
  productOrderNumber?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PremadeDraftInput {
  branchId?: number;
  customerId?: number | null;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  notes?: string;
  paymentMethod?: string;
  items?: Array<{ productId: number; quantity: number }>;
}

export interface ProductOrderItem {
  productId: number;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
  sourceBranchId?: number;
  sourceBranchName?: string;
}

export interface AppNotification {
  id: number;
  type: 'transfer_request' | 'transfer_dispatched' | 'order_ready' | string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  isArchived?: boolean;
  createdAt: string;
}

export interface TransferSummary {
  pending: number;
  inTransit: number;
  received: number;
  overdue: number;
}

export interface TransferDashboardItem extends ProductOrderTransfer {
  agingHours: number;
  isOverdue: boolean;
}

export interface ProductOrderTransfer {
  id: number;
  productOrderId: number;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  pickupBranchId?: number;
  pickupBranchName?: string;
  sourceBranchId: number;
  sourceBranchName?: string;
  items: ProductOrderItem[];
  status: 'pending' | 'transferred' | 'received' | 'cancelled';
  transferredByName?: string;
  transferredAt?: string;
  receivedByName?: string;
  receivedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProductOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress?: string;
  items: ProductOrderItem[];
  totalAmount: number;
  /** VAT rate included in the prices (12 on orders from before it was recorded) */
  vatPercent?: number;
  vatAmount?: number;
  branchId: number;
  branchName?: string;
  groupId?: string;
  pickupBranchId?: number;
  pickupBranchName?: string;
  shipmentStatus?: 'not_needed' | 'pending' | 'shipped' | 'received';
  transfers?: ProductOrderTransfer[];
  status: 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  amountPaid?: number;
  remainingBalance?: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProductOrderTimelineEvent {
  type: 'created' | 'status' | 'payment' | 'audit' | string;
  title: string;
  description: string;
  timestamp: string;
  by?: string;
}

/** Appearance set in Settings: images as data URLs; navIcons by sidebar key */
export interface Branding {
  logo: string | null;
  navIcons: Record<string, string>;
}

/** A material open job orders need more of than is in stock (Inventory → Needed for job orders) */
export interface NeededMaterial {
  id: number;
  itemId: string;
  name: string;
  branchId: number;
  branchName: string | null;
  unit: string;
  stock: number;
  needed: number;
  short: number;
  /** Typed in on a job order (not picked from Inventory) */
  typedIn: boolean;
  supplierId: number | null;
  orders: { id: number; jobOrderId: string; customerName: string; status: string; quantity: number }[];
  /** Existing materials with a similar name (a likely typo); typed-in materials only */
  similar: { id: number; name: string; branchName: string | null; stock: number; unit: string }[];
}

export interface RawMaterial {
  id: number;
  itemId: string;
  materialType: string;
  color: string;
  pattern: string;
  unitPrice: number;
  /** Purchase cost we pay the supplier per unit */
  costPerUnit?: number;
  /** Markup % applied on cost to derive unitPrice (e.g. 25 = +25%) */
  markupPercent?: number;
  /** Supplier item code / SKU from the stock-in log */
  sku?: string;
  stockQuantity: number;
  lowStockThreshold: number;
  branchName?: string | null;
  supplierId?: number;
  supplierName?: string;
  branchId: number;
  isArchived: boolean;
  /** 'available' = normal stock | 'needed' = reserved/ordered for a job order */
  status?: string;
  /** Job order ID this material was added for (when status is 'needed') */
  sourceJobOrderId?: string;
  /** Consumables (glue, thread...) are counted in plain units and marked used in Inventory */
  isConsumable?: boolean;
  /** 'yd' for length stock, else the consumable's count unit (pcs...) */
  unit?: string;
  /** A consumable marked partly used since it was last marked fully used */
  partialUseAt?: string | null;
  lastUpdated: string;
  /** Full time of the last change (stock used or received, edited) */
  updatedAt?: string | null;
}

export interface Supplier {
  id: number;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  materialsSupplied?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  /** Default payment term for this supplier's purchase orders; null = none agreed */
  paymentTerm?: PaymentTerm | null;
  paymentTermDays?: number | null;
  paymentTermLabel?: string | null;
  /** The supplier's own login (they set the delivery date of the POs sent to them) */
  userId?: number | null;
  loginUsername?: string | null;
  /** Inventory materials usually bought from this supplier */
  materials?: { id: number; name: string; stockQuantity: number; unit: string; branchName?: string | null }[];
}

/** A material a supplier supplies, when saving: one already in Inventory, or a new item to add */
export type SupplierMaterialEntry =
  | { materialId: number }
  | { new: { materialType: string; color?: string; pattern?: string; costPerUnit?: number } };

/** When a supplier must be paid: Cash in Advance (on approval), COD (on delivery)
 *  or Net N days (N days after the first delivery) */
export type PaymentTerm = 'advance' | 'cod' | 'net';

/** Where a PO stands against its payment term (null: no term, or cancelled) */
export type PurchaseOrderTermStatus = 'awaiting' | 'not_due' | 'due_soon' | 'overdue' | 'paid' | 'paid_late';

export interface PaymentTermOptions { netDays: number[]; reminderDays: number; maxDays: number }

export interface MaterialWasteLog {
  id: number;
  materialId: number;
  materialName?: string;
  materialColor?: string;
  materialPattern?: string;
  quantity: number;
  reason: string;
  notes?: string;
  branchId: number;
  branchName?: string;
  loggedBy: number;
  loggedByName?: string;
  createdAt: string;
  /** Set when this was extra material issued for a job order */
  jobOrderId?: number | null;
  jobOrderNumber?: string | null;
  workerId?: number | null;
  workerName?: string | null;
  /** Cost per unit when it was logged */
  unitCost?: number;
  value?: number;
}

export interface AIPrediction {
  itemId: string;
  materialType: string;
  color: string;
  pattern: string;
  currentStock: number;
  avgDailyUsage: number;
  daysUntilStockout: number;
  stockoutDate: string | null;
  restockByDate: string | null;
  suggestedRestockQty: number;
  avgLeadTimeDays: number;
  confidence: 'low' | 'medium' | 'high';
  dataSource: 'xlsx' | 'hybrid' | 'live';
  dataPoints: number;
  hasCurrentInventory: boolean;
  /** Forecasting method that tested best for this material (missing on predictions made before it existed) */
  method?: 'moving_average' | 'croston_sba' | 'exp_smoothing' | 'prophet';
  /** Its error on held-back weeks (WAPE %), and the plain moving average's; null with too little history */
  errorPercent?: number | null;
  baselineErrorPercent?: number | null;
}

/** A worker's finished work for a period: GET /api/managed-workers/:id/work-summary */
export interface WorkerWorkSummary {
  worker: ManagedWorker;
  start: string;
  end: string;
  /** pay is null for roles that may not see labor cost */
  totals: { tasks: number; jobOrders: number; hours: number; pay: number | null; yardsUsed: number; yardsExcess: number; openTasks: number };
  days: { date: string; tasks: number; hours: number; pay: number | null }[];
  tasks: {
    id: number;
    date: string;
    finishedAt: string | null;
    jobOrderRef: string;
    jobOrderDbId: number | null;
    task: string | null;
    customerName: string | null;
    vehicle: string | null;
    branchName: string | null;
    hours: number;
    pay: number | null;
    payOverridden: boolean;
    cuts: { material: string; unit: string; used: number; excess: number }[];
    consumables: { material: string; unit: string; quantity: number; partial: boolean }[];
  }[];
}

export const FORECAST_METHOD_LABELS: Record<NonNullable<AIPrediction['method']>, string> = {
  moving_average: 'Moving average', croston_sba: 'Croston (bursty use)',
  exp_smoothing: 'Exponential smoothing', prophet: 'Prophet',
};

export interface AIStatus {
  status: 'idle' | 'computing' | 'done' | 'error';
  predictions: AIPrediction[];
  totalItems: number;
  processedItems: number;
  uploadRows: number;
  uploadItems: number;
  lastUploadedAt: string | null;
  computedAt: string | null;
  error: string | null;
}

/** One material in a month of the usage chart: what was used, or (projected months)
 *  what the AI expects to be used, with its stock outlook */
export interface UsageTrendMaterial {
  itemId: string | null;
  name: string;
  unit: string;
  quantity: number;
  /** Actual months: how many times it was used, on how many job orders */
  uses?: number;
  jobOrders?: number;
  /** Projected months */
  currentStock?: number;
  stockoutDate?: string | null;
  restockByDate?: string | null;
  suggestedRestockQty?: number;
  confidence?: 'low' | 'medium' | 'high';
  runsOutThisMonth?: boolean;
}

export interface UsageTrendMonth {
  month: string;
  total: number;
  projected: boolean;
  materials?: UsageTrendMaterial[];
}

export interface InventoryForecastData {
  restockItems: (AIPrediction & { estimatedCost: number })[];
  monthlyUsageTrend: UsageTrendMonth[];
  totalPredictedItems: number;
  urgentCount: number;
  soonCount: number;
  periodItemCount: number;
  estimatedRestockCost: number;
  topConsuming: AIPrediction | null;
  hasPredictions: boolean;
  predictionStatus: string;
  period: string;
  /** Overall tested error of the forecasts (WAPE %) and of a plain moving average */
  forecastAccuracy?: { testedItems: number; errorPercent: number | null; baselineErrorPercent: number | null };
}

export interface PaymentRecord {
  id: number;
  jobOrderId: number;
  jobOrderRef?: string;
  customerName?: string;
  amount: number;
  paymentMethod: 'cash' | 'gcash' | 'card' | 'bank_transfer';
  referenceNumber?: string;
  notes?: string;
  recordedBy: number;
  recordedByName?: string;
  createdAt: string;
}

export type PaymentSort = 'latest' | 'oldest' | 'amount_desc' | 'amount_asc';

export interface PaymentSummary {
  totalRevenue: number;
  totalCollected: number;
  totalBalance: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
}

export interface PaymentOverride {
  id: number;
  jobOrderId: number;
  jobOrderRef?: string;
  customerName?: string;
  currentPaymentStatus?: string;
  currentBalance?: number;
  newPaymentStatus?: string | null;
  newBalance?: number | null;
  newDownPayment?: number | null;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: number;
  requestedByName?: string;
  reviewedByName?: string;
  reviewNotes?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface RawMaterialInput {
  itemId?: string;
  materialType: string;
  color?: string;
  pattern?: string;
  /** Selling price per unit. Optional when costPerUnit + markupPercent are given (server derives it). */
  unitPrice?: number;
  costPerUnit?: number;
  markupPercent?: number;
  sku?: string;
  stockQuantity: number;
  lowStockThreshold?: number;
  supplierId?: number | null;
  branchId: number;
  /** Set to 'needed' when material is being ordered specifically for a job order */
  status?: string;
  /** The job order ID this material is being ordered for */
  sourceJobOrderId?: string;
  isConsumable?: boolean;
  unit?: string;
}

export interface FinishedGood {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  category: string;
  price: number;
  cost: number;
  branchId: number;
  branchName?: string;
  /** True when this row sits in the warehouse rather than a shop branch. */
  isWarehouse?: boolean;
  /** Units already promised to branches but not yet confirmed. */
  pendingOutgoing?: number;
  /** quantity - pendingOutgoing: what can still be given out. */
  availableQuantity?: number;
  isArchived: boolean;
  lastUpdated: string;
}

/** A hand-over of premade stock from the warehouse to a branch, pending receipt. */
export interface PremadeTransfer {
  id: number;
  productId: number;
  productName?: string;
  sku?: string;
  unit: string;
  sourceBranchId: number;
  sourceBranchName?: string;
  destinationBranchId: number;
  destinationBranchName?: string;
  quantity: number;
  status: 'pending' | 'received' | 'cancelled';
  batchId?: string | null;
  notes: string;
  createdById?: number;
  createdByName?: string;
  createdAt: string;
  resolvedById?: number;
  resolvedByName?: string;
  resolvedAt?: string;
}

export interface PremadeRecipe {
  materials: {
    materialId: number; name: string; detail: string;
    /** Used by the whole latest batch */ batchQuantity: number;
    /** Per piece made; null when that batch's piece count wasn't recorded */ perPiece: number | null;
    costPerUnit: number; stock: number; branchName: string | null; available: boolean;
  }[];
  basedOn: { date: string | null; pieces: number | null } | null;
}

export interface PremadeProductInput {
  /** Make more of this warehouse product (its quantity goes up) instead of adding a new one;
   *  name, category and price are then kept from the product */
  existingProductId?: number;
  name?: string;
  quantity: number;
  unit?: string;
  category?: string;
  price?: number;
  /** Leave out to have the server work it out from the materials used */
  cost?: number;
  branchId: number;
  sku?: string;
  materialsUsed?: PremadeMaterialUsageInput[];
}

export interface PremadeMaterialUsageInput {
  materialId: number;
  quantityUsed: number;
}

export interface ChatMessage {
  id: number;
  senderId: number;
  senderName: string;
  senderUsername?: string;
  senderRole: string;
  content: string;
  createdAt: string;
}

export interface MaterialUsageLog {
  /** A number for usage logs; "po-…" for purchase order deliveries and returns */
  id: number | string;
  /** in = stock came in (PO delivery, given back), out = stock went out (used, returned to supplier) */
  direction?: 'in' | 'out';
  kind?: 'usage' | 'purchase_order';
  purchaseOrderId?: number;
  materialId: number;
  materialName?: string;
  materialUnit?: string;
  premadeProductId?: number;
  premadeProductName?: string;
  quantityUsed: number;
  usedInType: string;
  usedInReference: string;
  branchId: number;
  branchName?: string;
  usedBy?: number;
  usedByName?: string;
  managedWorkerId?: number;
  workerName?: string;
  notes?: string;
  usedAt: string;
}

/** Earlier work on a car / model, for suggesting materials on a new job order */
export interface VehicleHistory {
  sameCar: {
    id: number; jobOrderId: string; date: string | null; status: string; services: string; year?: number | string | null;
    plateNumber?: string | null; branchName?: string | null;
    materials: { materialId: number; name: string; quantity: number }[];
  }[];
  sameModelCount?: number;
  suggestion: {
    basedOnJobs: number; sameService: boolean; similarYear: boolean;
    items: { materialId: number; name: string; quantity: number; usedInJobs: number; share: number }[];
  } | null;
}

export interface JobOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  materialCost?: number;
  laborCost?: number;
  partType?: 'material' | 'labor' | 'service' | 'other';
  materialName?: string;
  workerName?: string;
  workerRate?: number;
  workerId?: number;
  notes?: string;
  /** FK to inventory_materials.id — used to deduct stock on job order completion */
  materialId?: number;
  /** What workers recorded using (from their cuts); replaces quantity in the actual cost */
  actualQuantity?: number;
  /** Older orders don't store this; see jobOrderItemCategory() */
  category?: 'material' | 'labor' | 'expense';
  /** Worker assignment this labor line is linked to (managed by the server) */
  assignmentId?: number;
  /** The slip's Cutter or Sewer this labor line was made for (managed by the server) */
  slipRole?: 'cutter' | 'sewer';
  /** What the worker was actually paid for this whole line, once their assignment is completed */
  actualLaborCost?: number;
  /** Read-only, from the linked worker assignment (not stored on the order) */
  assignmentStatus?: AssignmentStatus;
  scheduledDate?: string | null;
}

/** Material, labor or other expense. Older orders didn't store it: a line with only labor cost is labor. */
export function jobOrderItemCategory(item: JobOrderItem): 'material' | 'labor' | 'expense' {
  if (item.category) return item.category;
  return Number(item.laborCost) > 0 && Number(item.materialCost) === 0 ? 'labor' : 'material';
}

/** Standard Philippine VAT rate: the default in Settings, and the rate older product
 *  orders were receipted at. New orders use the rate saved in Settings. */
export const DEFAULT_VAT_PERCENT = 12;

/** Round to the centavo (halves up), the same way the server does. */
export function roundMoney(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Split a VAT-inclusive amount into its net and VAT parts; net + vat = gross. */
export function vatBreakdown(gross: number, vatPercent?: number | null) {
  const v = Math.max(Number(vatPercent) || 0, 0);
  const total = roundMoney(Number(gross) || 0);
  const net = v > 0 ? roundMoney(total / (1 + v / 100)) : total;
  return { total, net, vat: roundMoney(total - net), vatPercent: v };
}

/**
 * Splits a job order's stored final price into its parts.
 * - VAT-inclusive orders (vatInclusive): subtotal is the price entered (VAT
 *   included, before discount); total = subtotal − discount; `vat` is the VAT
 *   already inside the total.
 * - Older orders: subtotal is the price before discount and VAT, and VAT was
 *   added on top: total = subtotal − discount + vat.
 * Either way `net` is the total without VAT and the parts add up to the total.
 */
export function jobOrderPriceBreakdown(total: number, discountPercent?: number | null, vatPercent?: number | null,
                                       vatInclusive = false) {
  const d = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const { net, vat, vatPercent: v } = vatBreakdown(total, vatPercent);
  if (vatInclusive) {
    const subtotal = d < 100 ? roundMoney(total / (1 - d / 100)) : total;
    return { subtotal, discount: roundMoney(subtotal - total), afterDiscount: total, vat, net, total,
             discountPercent: d, vatPercent: v, vatInclusive };
  }
  const subtotal = d < 100 ? roundMoney(net / (1 - d / 100)) : net;
  return { subtotal, discount: roundMoney(subtotal - net), afterDiscount: net, vat, net, total,
           discountPercent: d, vatPercent: v, vatInclusive };
}

/** What a job order's price is saved from. The server works out the total and the
 *  VAT from these (using the rate in Settings) and ignores any total sent. */
export interface JobOrderPriceInput {
  /** Price for the work, VAT included, before discount */
  priceForWork?: number;
  /** Whether the price includes VAT (false for a sale without VAT) */
  vatIncluded?: boolean;
}

/** Highest price for the work (VAT included, before discount): 8 digits, under ₱100M */
export const MAX_JOB_ORDER_PRICE = 99_999_999.99;

/** Whether a typed price fits: up to 8 digits before the decimal point and 2 after */
export function isValidPriceInput(raw: string) {
  return raw === '' || /^\d{0,8}(\.\d{0,2})?$/.test(raw);
}

/** Final price from the VAT-inclusive price for the work and a discount %.
 *  VAT is already inside the price, so it never changes the total. The server
 *  works this out again and its figure is the one saved. */
export function jobOrderTotalFrom(price: number, discountPercent?: number | null) {
  const d = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  return roundMoney(price * (1 - d / 100));
}

export interface ManagedWorker {
  id: number;
  name: string;
  workType: string;
  /** Hidden (0) for roles that may not see labor cost */
  ratePerHour: number;
  /** per_hour | per_day | per_piece */
  payMode: 'per_hour' | 'per_day' | 'per_piece';
  isActive: boolean;
  createdAt?: string;
  /** The worker's own login (a seat maker or sewer account), if linked */
  userId?: number | null;
  userName?: string | null;
}

/** A purchase order as its supplier sees it in their account */
export interface SupplierOrder {
  id: number;
  poNumber: string;
  status: 'approved' | 'partially_received' | 'received';
  receivingStatus: PurchaseOrderReceivingStatus | null;
  items: { line: number; name: string; quantity: number; unit: string; unitPrice: number; totalPrice: number;
    receivedQuantity: number; remainingQuantity: number; priceBySupplier?: boolean }[];
  /** Why the prices can't be changed any more (sent, delivered or paid), or null */
  pricesLocked: string | null;
  /** When they marked the current delivery as sent (cleared after a partial delivery) */
  sentAt: string | null;
  sentNote: string | null;
  /** How much of each line they said they sent */
  sentItems?: { line: number; quantity: number }[];
  /** Each delivery received and each return, with dates and quantities */
  deliveries?: { kind: 'delivery' | 'return'; date: string | null; invoiceNumber?: string | null;
    returnReason?: string | null; replacement?: boolean | null;
    items: { name: string; quantity: number; unit: string }[] }[];
  /** When the order was fully received */
  receivedAt?: string | null;
  totalAmount: number;
  orderedAt: string | null;
  expectedDelivery: string | null;
  supplierNote: string | null;
  deliverySetAt: string | null;
  paymentTermLabel: string | null;
}
export interface SupplierPortalData {
  linked: boolean;
  supplierName?: string;
  orders?: SupplierOrder[];
}

/** A new login made for a worker from Worker Management */
export interface NewWorkerAccount {
  username: string;
  password: string;
  /** Optional: workers sign in with their username */
  email?: string;
}

/** A seat maker or sewer login that a worker can be linked to */
export interface LinkableWorkerAccount {
  id: number;
  fullName: string;
  username: string;
  linkedWorkerId?: number | null;
}

/** What a seat maker or sewer sees of their own work */
export interface MyWork {
  linked: boolean;
  worker?: { name: string; workType: string; payMode: string };
  assignments?: {
    id: number;
    jobOrderRef: string;
    title: string;
    description?: string | null;
    customerName?: string | null;
    vehicle?: { make?: string; model?: string; year?: number; plateNumber?: string } | null;
    priority: JobOrderPriority;
    scheduledDate?: string | null;
    assignmentType?: 'job_order' | 'special_task';
    status: AssignmentStatus;
    hoursWorked?: number | null;
    pay?: number | null;
    startTime?: string | null;
    endTime?: string | null;
    waitingOn?: WaitingOn | null;
    /** What they submitted (kept to correct it if it is sent back) */
    submission?: TaskSubmission | null;
    /** Why an administrator sent the work back */
    reviewNote?: string | null;
  }[];
}

/** submitted = the worker finished and it waits for an administrator to approve it */
export type AssignmentStatus = 'pending' | 'in_progress' | 'submitted' | 'completed';

export type TaskMaterialCut = { line?: number; materialId: number; cut: number; used: number; reason?: string };
export type TaskConsumableUse = { materialId: number; kind: 'full' | 'partial'; quantity?: number };
export type TaskMaterialNote = { name: string; qty: number; cut?: number; unit?: string; reason?: string };

/** What a worker filled in when they finished a task */
export interface TaskSubmission {
  startTime: string | null;
  endTime: string | null;
  hours: number | null;
  materialCuts: TaskMaterialCut[];
  consumables: TaskConsumableUse[];
  /** Readable list of what was used (names and amounts) */
  materialsUsed: TaskMaterialNote[];
  notes: string;
  submittedBy?: string | null;
  submittedAt?: string | null;
}

/** Sent when a worker (or an administrator for them) submits finished work */
export interface TaskSubmitPayload {
  startTime: string;
  endTime: string;
  materialCuts: TaskMaterialCut[];
  consumables: TaskConsumableUse[];
  materialsUsed: TaskMaterialNote[];
  notes?: string;
}

export type CutMaterialsData = { materials: CutMaterialLine[]; notInInventory: string[]; extraMaterials: RawMaterial[]; consumables: RawMaterial[] };

/** Work on a job order goes in the order it was given out: the earlier task still to finish */
export interface WaitingOn {
  assignmentId: number;
  workerName: string;
  description?: string | null;
  status: string;
}

/** A job order material line, for recording what a worker cut and used */
export interface CutMaterialLine {
  /** Index of the line on the job order */
  line: number;
  lineName: string;
  plannedQuantity: number;
  /** Already cut of this material by other tasks on the job order */
  alreadyCut?: number;
  /** False: an older line saved without its material; one of the options is chosen */
  linked: boolean;
  /** Inventory materials for the line: its own, or those an older line's name matches */
  options: RawMaterial[];
}

export interface WorkerAssignment {
  id: number;
  workerId: number;
  workerName: string;
  /** The worker has their own login, so they submit their work themselves */
  workerHasLogin?: boolean;
  workType: string;
  ratePerHour: number;
  payMode: 'per_hour' | 'per_day' | 'per_piece';
  jobOrderRef: string;
  jobOrderDbId?: number;
  /** The job order's priority (normal for special tasks) */
  jobOrderPriority?: JobOrderPriority;
  description?: string;
  expectedHours?: number;
  startTime?: string;
  endTime?: string;
  hoursWorked?: number;
  pay?: number;
  payOverride?: number;
  materialsUsed?: Array<{ name: string; qty: number; unit?: string }> | null;
  scheduledDate?: string;
  assignmentType: 'job_order' | 'special_task';
  specialTaskTitle?: string;
  status: AssignmentStatus;
  notes?: string;
  createdAt: string;
  /** Finished work waiting for approval (or the last one sent back) */
  submission?: TaskSubmission | null;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  isOverdue?: boolean;
  overdueByHours?: number;
  /** The earlier unfinished task on the job order this one must wait for */
  waitingOn?: WaitingOn | null;
  /** A sewing task whose job order's materials aren't cut yet: a warning, nothing is blocked */
  cuttingNotDone?: string | null;
}

export interface WorkerAvailabilityEntry {
  id: number;
  managedWorkerId: number;
  workerName: string;
  date: string;          // 'YYYY-MM-DD'
  isAvailable: boolean;  // false = marked unavailable/off
  note?: string;
}

export interface VehicleInfo {
  make: string;
  model: string;
  /** Can be empty on a draft that has no vehicle year yet */
  year: number | null;
  plateNumber: string;
  color?: string;
}

export type JobOrderPriority = 'low' | 'normal' | 'high' | 'urgent';

/** An assignment as the Worker Management calendar shows it on its day */
export interface CalendarAssignment {
  id: number;
  workerId: number;
  workerName: string;
  jobOrderRef: string;
  jobOrderDbId?: number | null;
  jobOrderPriority?: JobOrderPriority;
  assignmentType: string;
  specialTaskTitle?: string;
  status: string;
  description?: string;
  scheduledDate: string;
}

/** Order to work through job orders in: most urgent first */
export const PRIORITY_RANK: Record<JobOrderPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export const PRIORITY_LABELS: Record<JobOrderPriority, string> = {
  urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low',
};

export interface JobOrder {
  id: number;
  jobOrderId: string;
  customerId?: number;
  priority?: JobOrderPriority;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  /** Not sent for job orders today; shown as N/A when missing */
  customerAddress?: string;
  branchId: number;
  branchName: string;
  description: string;
  vehicleInfo?: VehicleInfo | null;
  items: JobOrderItem[];
  slipData?: {
    rows?: Array<{ description: string; hr: string }>;
    materialCenter?: string;
    materialSides?: string;
    materialBack?: string;
    dStitch?: string;
    piping?: string;
    pockets?: string;
    logo?: string;
    specification?: string;
    cutterName?: string;
    sewerName?: string;
    /** Each service's details, kept with the slip (e.g. the seat cover design) */
    serviceDetails?: {
      flooring?: string; reupholstery?: string; ceiling?: string; sidings?: string; other?: string;
      seatCovers?: { design?: string; material?: string; pocket?: string; others?: string };
    };
    /** Step 5's price as % of materials (250 = 2.5× the materials total), for the invoice */
    markupPercent?: number;
  } | null;
  estimatedCost: number;
  /** Planned lines plus any extra material issued for the order */
  actualCost: number;
  /** Extra material issued beyond the plan (only for users who see costs) */
  extraMaterials?: MaterialWasteLog[];
  extraMaterialsCost?: number;
  totalPrice: number;
  discountPercent?: number | null;
  vatPercent?: number | null;
  /** True if the price was entered with VAT included (VAT not added on top) */
  vatInclusive?: boolean;
  /** VAT inside totalPrice, as worked out by the server */
  vatAmount?: number;
  /** 'draft' = saved but not confirmed yet (listed under Drafts, not counted) */
  status: 'draft' | 'pending' | 'in_progress' | 'completed' | 'voided' | 'cancelled' | 'delivered';
  notes?: string;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  downPayment: number;
  balance: number;
  estimatedCompletion: string;
  completedAt?: string;
  createdAt: string;
  createdBy: number;
  updatedAt: string;
}

export interface CustomerOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  vehicleInfo: VehicleInfo;
  services: Array<{
    type: string;
    material?: string;
    design?: string;
    pocket?: string;
    others?: string;
    description?: string;
  }>;
  notes: string;
  status: 'pending' | 'processing' | 'in_progress' | 'ready_for_installation' | 'completed' | 'delivered' | 'cancelled';
  branchId?: number;
  branchName?: string;
  createdAt: string;
  userId?: number;
}

export interface PurchaseOrderItem {
  materialId?: number;
  name: string;
  quantity: number;
  unit: string;
  /** Ticked on the PO: the material is a consumable (counted in plain units) */
  consumable?: boolean;
  unitPrice: number;
  /** The supplier set this price from their account */
  priceBySupplier?: boolean;
  totalPrice: number;
  /** Index of the line on the PO (used when receiving) */
  line: number;
  /** Received and kept (deliveries minus returns to the supplier) */
  receivedQuantity: number;
  /** Sent back to the supplier */
  returnedQuantity?: number;
  remainingQuantity: number;
}

/** One delivery received against a PO, or the closing of one whose rest won't come */
/** Items returned to suppliers in a period, with totals by supplier and reason */
export interface PurchaseReturnsReport {
  period: { startDate: string; endDate: string };
  summary: { returns: number; lines: number; totalValue: number; replacedValue: number; suppliers: number };
  bySupplier: PurchaseReturnGroup[];
  byReason: PurchaseReturnGroup[];
  entries: {
    id: string; date: string | null; purchaseOrderId: number; poNumber: string; supplierId: number | null; supplierName: string;
    item: string; quantity: number; unit: string; unitPrice: number; value: number; reason: string; replacement: boolean;
    documentNumber: string | null; notes: string | null; byName: string | null;
  }[];
}
export interface PurchaseReturnGroup {
  key: string | number; label: string; count: number; returns: number; value: number; topReason: string | null;
}

export interface PurchaseOrderReceipt {
  id: number | null;
  /** return = sent back to the supplier */
  kind: 'delivery' | 'closed' | 'return';
  receivedAt: string | null;
  receivedByName: string | null;
  notes: string | null;
  items: { line: number; materialId?: number | null; name: string; quantity: number }[];
  /** Returns: why, and whether the supplier will replace the items */
  returnReason?: string | null;
  replacement?: boolean | null;
  /** Deliveries: the supplier's invoice / delivery receipt no. */
  invoiceNumber?: string | null;
}

export type PurchaseOrderReceivingStatus = 'not_received' | 'partial' | 'complete' | 'closed_short';

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplierId?: number;
  supplierName: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  status: 'pending' | 'approved' | 'partially_received' | 'received' | 'cancelled';
  /** Null while pending approval or cancelled */
  receivingStatus: PurchaseOrderReceivingStatus | null;
  receipts: PurchaseOrderReceipt[];
  /** Set by the supplier from their account once approved (null until then) */
  expectedDelivery: string | null;
  supplierNote?: string | null;
  deliverySetAt?: string | null;
  /** The supplier has a login and sets the delivery date themselves */
  supplierHasLogin?: boolean;
  /** When the supplier marked the current delivery as sent, and their note (e.g. DR no.) */
  supplierSentAt?: string | null;
  supplierSentNote?: string | null;
  /** How much of each line the supplier sent */
  supplierSentItems?: { line: number; quantity: number }[];
  /** Why it can't be received yet (the supplier hasn't sent it), or null */
  awaitingSupplier?: string | null;
  createdAt: string;
  createdBy: number;
  createdByName?: string | null;
  approvedAt?: string;
  approvedBy?: number;
  approvedByName?: string | null;
  receivedAt?: string;
  receivedBy?: number;
  receivedByName?: string | null;
  /** Paying the supplier, apart from receiving the goods */
  amountPaid: number;
  /** Left to pay on the whole order (orderTotal minus payments) */
  balance: number;
  /** What the order comes to now: ordered less returns not replaced (once closed: what was received) */
  orderTotal: number;
  /** Accounts payable recorded: value of what was received and kept */
  payableAmount: number;
  /** Value returned to the supplier */
  returnedAmount: number;
  /** Remaining accounts payable: payableAmount minus payments */
  payableBalance: number;
  /** Paid beyond what the order now comes to: the supplier owes it back */
  supplierCredit: number;
  /** Paid ahead for goods not received yet */
  prepaid: number;
  /** What the due date applies to (the order for Cash in Advance, else what arrived) */
  amountDue: number;
  /** First delivery date (the payable starts then) and the supplier invoice numbers */
  invoiceDate: string | null;
  invoiceNumbers: string[];
  /** Supplier credit refunded or applied to another PO (comes off amountPaid) */
  creditUsed: number;
  credits: PurchaseOrderCreditEntry[];
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  /** How each was paid isn't sent here: it shows in the Expense Log only */
  payments: PurchaseOrderPayment[];
  /** Payment term (copied from the supplier when made, may be changed) */
  paymentTerm: PaymentTerm | null;
  paymentTermDays: number | null;
  paymentTermLabel: string | null;
  /** YYYY-MM-DD; null until the term's starting point (approval / first delivery) */
  dueDate: string | null;
  termStatus: PurchaseOrderTermStatus | null;
  /** Negative when overdue; null when there's no due date or it's paid */
  daysUntilDue: number | null;
}

/** Use of a supplier credit: refunded by the supplier, or applied to another PO */
export interface PurchaseOrderCreditEntry {
  id: number; kind: 'refund' | 'applied'; amount: number; date: string | null;
  targetPurchaseOrderId: number | null; targetPoNumber: string | null;
  referenceNumber: string | null; notes: string | null; recordedByName: string | null;
  voided: boolean; voidReason: string | null;
}

export interface PurchaseOrderPayment {
  id: number; amount: number; paymentDate: string | null; referenceNumber: string | null; notes: string | null;
  /** Paid with a supplier credit from another PO (no new money out) */
  fromCredit?: boolean;
  recordedByName: string | null; recordedAt: string | null;
  voided: boolean; voidedAt: string | null; voidedByName: string | null; voidReason: string | null;
}

export interface DeliveryItem {
  name: string;
  quantity: number;
  unit: string;
}

export interface Delivery {
  id: number;
  deliveryNumber: string;
  type: 'branch_restock' | 'customer_delivery';
  fromBranchId: number;
  fromBranchName: string;
  toBranchId?: number;
  toBranchName?: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  jobOrderId?: number;
  jobOrderNumber?: string;
  items: DeliveryItem[];
  status: 'scheduled' | 'in_transit' | 'delivered' | 'cancelled';
  scheduledDate: string;
  timeSlot?: string;
  estimatedArrival?: string;
  deliveredAt?: string;
  driverName: string;
  driverContact: string;
  vehiclePlate: string;
  notes: string;
  createdAt: string;
  createdBy: number;
}

export interface JobOrderCost {
  id: number;
  jobOrderNumber: string;
  customerName?: string;
  materialsCost: number;
  laborCost: number;
  overheadCost: number;
  totalAmount: number;
  status: string;
  extraMaterialsCost?: number;
  estimatedCost?: number;
  actualCost?: number;
  variance?: number;
}

export interface CostComparison { estimated: number; actual: number; variance: number }

export interface CostingData {
  /** Job order database id (for links); jobOrderId is its display number */
  id: number;
  jobOrderId: string;
  items: JobOrderItem[];
  estimatedCost: number;
  actualCost: number;
  materialCost: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  totalPrice: number;
  grossProfit: number;
  profitMargin: number;
  variance: number;
  customerName?: string;
  status?: string;
  /** Estimated vs actual per component */
  components?: { materials: CostComparison; labor: CostComparison; overhead: CostComparison; total: CostComparison };
  /** Each line with what it costs (not its selling price) */
  lines?: { name: string; category: 'material' | 'labor' | 'expense'; quantity: number; unitCost: number;
            estimatedCost: number; actualCost: number; workerName?: string | null }[];
  extraMaterials?: MaterialWasteLog[];
  extraMaterialsCost?: number;
}

export interface Receipt {
  receiptNumber: string;
  date: string;
  customer: {
    name: string;
    phone: string;
    email: string;
  };
  jobOrder: string;
  branch: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  downPayment: number;
  balance: number;
  paymentStatus: string;
}

export interface SalesReport {
  period: { startDate: string; endDate: string };
  summary: {
    totalOrders: number;
    completedOrders: number;
    totalRevenue: number;
    pendingRevenue: number;
    averageOrderValue: number;
    /** VAT inside the earned job order and premade sales (not revenue) */
    vatCollected?: number;
  };
  statusBreakdown: Array<{ status: string; count: number; value: number }>;
  dailySales: Array<{ date: string; orders: number; revenue: number }>;
  premadeSummary: {
    totalOrders: number;
    completedOrders?: number;
    completedRevenue: number;
    pendingRevenue: number;
  };
  premadeDailySales: Array<{ date: string; orders: number; revenue: number }>;
}

export interface InventoryReport {
  summary: {
    totalRawMaterials: number;
    totalFinishedGoods: number;
    rawMaterialsValue: number;
    finishedGoodsValue: number;
    finishedGoodsCost: number;
    potentialProfit: number;
    lowStockItemsCount: number;
  };
  lowStockItems: Array<{
    id: number;
    name: string;
    currentStock: number;
    reorderPoint: number;
    unit: string;
  }>;
  categoryBreakdown: Array<{ category: string; count: number; value: number }>;
}

export interface BranchSettlementEntry {
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  orderDate: string;
  sourceBranchId: number;
  sourceBranchName: string;
  pickupBranchId: number;
  pickupBranchName: string;
  itemsValue: number;
  transferStatus: string;
  isSettled: boolean;
  customerName: string;
}

export interface BranchSettlementSummary {
  sourceBranchId: number;
  sourceBranchName: string;
  pickupBranchId: number;
  pickupBranchName: string;
  totalOwed: number;
  totalSettled: number;
  outstandingBalance: number;
  pendingOrders: number;
  completedOrders: number;
}

/** Extra material issued for job orders in a period, by worker and by reason */
export interface ExtraMaterialsReport {
  period: { startDate: string; endDate: string };
  summary: { count: number; totalValue: number; jobOrders: number; unassigned: number };
  byWorker: { key: number; label: string; count: number; value: number }[];
  byReason: { key: string; label: string; count: number; value: number }[];
  entries: MaterialWasteLog[];
}

export interface BranchSettlementReport {
  period: { startDate: string; endDate: string };
  summary: BranchSettlementSummary[];
  entries: BranchSettlementEntry[];
}

export interface AuditLog {
  id: number;
  userId: number;
  userName: string;
  action: string;
  module: string;
  details: string;
  ipAddress: string;
  timestamp: string;
}

export interface Branch {
  id: number;
  name: string;
  code: string;
  address: string;
  phone?: string;
  isWarehouse: boolean;
  isActive: boolean;
  isArchived?: boolean;
  deactivatedAt?: string | null;
  archivedAt?: string | null;
  createdAt?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  /** Higher ranks manage lower ones: administrator 5 … seat maker / sewer 1 */
  rank?: number;
  /** Whether the signed-in user may give this role out */
  assignable?: boolean;
}

// ============================================
// AUTH TOKEN MANAGEMENT
// ============================================

// Kept in sessionStorage, so closing the browser signs the user out — shop
// computers are shared, and the next person shouldn't find someone else signed in.
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    sessionStorage.setItem('authToken', token);
  } else {
    sessionStorage.removeItem('authToken');
  }
};

export const getAuthToken = (): string | null => {
  if (!authToken && typeof window !== 'undefined') {
    // A token left over from when it was kept for good is dropped, not reused
    localStorage.removeItem('authToken');
    authToken = sessionStorage.getItem('authToken');
  }
  return authToken;
};

// ============================================
// FETCH WRAPPER
// ============================================

/** The JSON body of an error response: a message, and sometimes a code or extra data
 *  (e.g. `code: 'already_completed'`, `data`, `existingProduct`) a screen can act on. */
export type ApiErrorBody = {
  message?: string;
  code?: string;
  data?: unknown;
  [key: string]: unknown;
} | null;

/** An error response from the API, carrying the HTTP status and the parsed body. */
export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;
  constructor(message: string, status: number, body: ApiErrorBody) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ============================================
// OWNER DASHBOARD & EXPENSES
// ============================================

export interface MonthlyFinancials { month: string; sales: number; expenses: number; netIncome: number }
export interface MethodAmount { method: string; amount: number }

/** Owner Dashboard filters: a date range (Philippine dates) and optionally one branch */
export interface OwnerFilters { startDate?: string; endDate?: string; branchId?: number | '' }

export interface OwnerSummary {
  period: { startDate: string; endDate: string; branchId: number | null };
  totals: {
    sales: number; grossReceipts: number; vatCollected: number; grossProfit: number; totalExpenses: number;
    netIncome: number; profitMargin: number; orderCounts: { jobOrders: number; premadeOrders: number };
    /** Cost of goods sold and operating expenses (together they make totalExpenses) */
    cogs: number; operatingExpenses: number;
    /** Gross profit as a % of sales */
    grossMargin: number;
  };
  /** What customers owe today (not limited to the period) */
  receivables: number;
  /** What is still owed to suppliers today */
  payables: { total: number; dueSoon: number; overdue: number; count: number; dueSoonCount: number; overdueCount: number };
  monthly: MonthlyFinancials[];
  cashflowByMethod: { in: MethodAmount[]; out: MethodAmount[]; totalIn: number; totalOut: number };
}

export interface ProfitAndLoss {
  period: { startDate: string; endDate: string; branchId: number | null };
  sales: number; jobSales: number; premadeSales: number;
  cogs: { materials: number; labor: number; otherJobCosts: number; premadeProducts: number; total: number };
  grossProfit: number;
  operatingExpenses: { byCategory: { category: string; amount: number }[]; total: number };
  totalExpenses: number; netIncome: number; profitMargin: number; vatCollected: number;
  /** What customers paid for these sales: sales + VAT */
  grossReceipts: number;
  orderCounts: { jobOrders: number; premadeOrders: number };
  monthly: MonthlyFinancials[];
}

export interface JobCostingRow {
  id: number; jobOrderId: string; customerName: string; description: string; branchName: string | null;
  finishedOn: string; status: string;
  customerPrice: number; vat: number; sellingPrice: number;
  materials: number; labor: number; otherCosts: number; grossMargin: number; marginPercent: number;
  estimatedCost?: number; actualCost?: number; extraMaterials?: number;
  lines: { name: string; category: 'material' | 'labor' | 'expense'; quantity: number; unitCost: number; cost: number; extra?: boolean }[];
}

export interface OwnerJobCosting {
  jobs: JobCostingRow[];
  totals: { sellingPrice: number; materials: number; labor: number; otherCosts: number; grossMargin: number; marginPercent: number; vat?: number };
}

export interface ReceivableInvoice {
  type: 'job_order' | 'product_order'; id: number; reference: string; customerName: string;
  branchName: string | null; orderStatus: string; date: string | null;
  subtotal: number; vat: number; totalPaid: number; balance: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  payments: { date: string | null; amount: number; method: string; reference: string | null; recordedBy: string | null }[];
}

export interface OwnerReceivables {
  invoices: ReceivableInvoice[];
  totals: { subtotal: number; totalPaid: number; balance: number };
}

export interface OwnerInventory {
  materialsValue: number; premadeValue: number; totalValue: number;
  /** Cost of goods sold in the selected period */
  cogs: ProfitAndLoss['cogs'];
  /** Items whose stock or cost isn't a real number; valued at 0 until fixed */
  invalidValues: string[];
  restock: { id: number; name: string; color: string | null; branchName: string | null; stock: number; threshold: number; status: 'out' | 'low' }[];
  outOfStock: number; lowStock: number;
  movements: { date: string | null; direction: 'in' | 'out'; item: string; quantity: number; reason: string; branchName: string | null }[];
}

export interface Expense {
  id: number; date: string; category: string; particulars: string; amount: number;
  paymentMethod: string; notes: string | null; branchId: number | null; branchName: string | null;
  createdBy: string | null; createdAt: string | null;
  referenceNumber?: string | null;
  /** Set when the entry is a supplier payment: changed or voided from its purchase order */
  purchaseOrderPaymentId?: number | null;
  purchaseOrderId?: number | null;
}

export interface ExpenseList {
  expenses: Expense[]; total: number; categories: string[]; paymentMethods: string[];
  /** Of the total, supplier payments for purchase orders (stock bought, not a running cost) */
  supplierPaymentsTotal?: number;
  /** Categories to filter by: the ones for logging, plus Supplier Payments */
  filterCategories?: string[];
}

/** The only ways customers can pay (and be refunded). Older records may still show
 *  card, Maya or cheque payments: those keep their labels below but can't be chosen. */
export const ACCEPTED_PAYMENT_METHODS = ['cash', 'gcash', 'bank_transfer'] as const;
export const isAcceptedPaymentMethod = (m: string | null | undefined) =>
  (ACCEPTED_PAYMENT_METHODS as readonly string[]).includes(m || '');

/** How a payment method key reads on screen */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank Transfer', credit_card: 'Credit Card',
  debit_card: 'Debit Card', check: 'Cheque', other: 'Other', not_recorded: 'Premade sales (method not recorded)',
  adjustment: 'Approved payment override',
};

const periodQuery = (p?: { startDate?: string; endDate?: string; branchId?: number | '' }) => {
  const q = new URLSearchParams();
  if (p?.startDate) q.set('startDate', p.startDate);
  if (p?.endDate) q.set('endDate', p.endDate);
  if (p?.branchId) q.set('branchId', String(p.branchId));
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const PERMISSIONS_STALE_EVENT = 'auth:permissions-stale';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options?.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers,
      ...options,
    });

    // A crashed request comes back as an HTML error page, not JSON: say so plainly
    // instead of surfacing the browser's "SyntaxError: Unexpected token '<'"
    const data = await response.json().catch(() => null);
    if (data === null) {
      throw new ApiError(`The server could not complete this request (error ${response.status}). Please try again.`,
        response.status, null);
    }

    // Handle 401 Unauthorized - clear token and redirect to login
    if (response.status === 401) {
      setAuthToken(null);
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please login again.');
    }

    // A refusal usually means our copy of the user's permissions is out of date
    // (an administrator changed them); AuthContext reloads them on this event.
    if (response.status === 403 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(PERMISSIONS_STALE_EVENT));
    }

    if (!response.ok) {
      // Keep the whole body on the error — some failures carry structured detail
      // the UI needs (e.g. a 409 listing which cart items went out of stock).
      throw new ApiError(data.message || `HTTP error! status: ${response.status}`, response.status, data);
    }

    return data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// ============================================
// API FUNCTIONS
// ============================================

/** Item History: one recorded stock movement of an inventory item */
export type ItemHistoryKind = 'material' | 'premade';
export interface ItemHistoryEvent {
  key: string;
  at: string | null;
  type: string;
  label: string;
  /** Stock change: positive = in, negative = out, 0 = no stock change */
  quantity: number;
  usage?: 'custom' | 'premade';
  reference?: string | null;
  link?: { kind: 'job_order' | 'product_order' | 'purchase_order' | 'premade'; id: number } | null;
  customerName?: string | null;
  unitPrice?: number;
  total?: number;
  soldQuantity?: number;
  status?: string | null;
  paymentStatus?: string | null;
  branchName?: string | null;
  by?: string | null;
  worker?: string | null;
  notes?: string | null;
}
export interface ItemHistoryItem {
  id: number; name: string; detail: string; code: string; stock: number;
  branchId: number; branchName: string | null; isArchived: boolean; price?: number;
}
export interface ItemHistory {
  item: { id: number; kind: ItemHistoryKind; name: string; stock: number; code: string; branchName: string | null; isArchived: boolean; price: number };
  events: ItemHistoryEvent[];
  limitations: string[];
}

export const api = {
  // Health check
  healthCheck: () => fetchApi<null>('/api/health'),

  // ==================
  // VEHICLE REFERENCE DATA (makes / models)
  // ==================
  vehicles: {
    // List of vehicle makes/brands (alphabetical)
    getMakes: () => fetchApi<string[]>('/api/vehicles/makes'),
    // Models belonging to a given make
    getModels: (make: string) =>
      fetchApi<string[]>(`/api/vehicles/models?make=${encodeURIComponent(make)}`),
  },

  // ==================
  // AUTHENTICATION
  // ==================
  auth: {
    /** identifier: the account's username or its email address */
    login: (identifier: string, password: string) =>
      fetchApi<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      }),
    
    logout: () =>
      fetchApi<null>('/api/auth/logout', { method: 'POST' }),
    
    me: () => fetchApi<User>('/api/auth/me'),

  },

  // ==================
  // MY PROFILE (the signed-in user's own account)
  // ==================
  profile: {
    get: () => fetchApi<User>('/api/profile'),

    /** A new username also needs currentPassword */
    update: (data: { fullName?: string; phone?: string; username?: string; currentPassword?: string }) =>
      fetchApi<User>('/api/profile', { method: 'PUT', body: JSON.stringify(data) }),

    /** Returns a fresh token: every other session is signed out */
    changePassword: (currentPassword: string, newPassword: string) =>
      fetchApi<{ token: string }>('/api/profile/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),

    /** Sends a code to the new address; the email only changes once it is confirmed */
    requestEmailChange: (newEmail: string, currentPassword: string) =>
      fetchApi<null>('/api/profile/email/request', {
        method: 'POST',
        body: JSON.stringify({ newEmail, currentPassword }),
      }),

    confirmEmailChange: (code: string) =>
      fetchApi<User>('/api/profile/email/confirm', { method: 'POST', body: JSON.stringify({ code }) }),
  },

  // ==================
  // DASHBOARD
  // ==================
  dashboard: {
    // branchId is honoured for administrators only; everyone else always gets their own branch
    getStats: (branchId?: number, period: DashboardPeriod = 'month') => {
      const q = new URLSearchParams({ period });
      if (branchId) q.set('branchId', String(branchId));
      return fetchApi<DashboardStats>(`/api/dashboard/stats?${q}`);
    },
    
    getRecentActivity: (branchId?: number) =>
      fetchApi<Activity[]>(`/api/dashboard/recent-activity${branchId ? `?branchId=${branchId}` : ''}`),

    getAlerts: (branchId?: number) =>
      fetchApi<Alert[]>(`/api/dashboard/alerts${branchId ? `?branchId=${branchId}` : ''}`),
  },

  // ==================
  // INVENTORY
  // ==================
  inventory: {
    // Raw Materials
    getRawMaterials: (params?: { includeArchived?: boolean; branchId?: number; category?: string; includeWarehouse?: boolean }) => {
      const query = new URLSearchParams();
      if (params?.includeArchived) query.append('includeArchived', 'true');
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      if (params?.category) query.append('category', params.category);
      if (params?.includeWarehouse) query.append('includeWarehouse', 'true');
      return fetchApi<RawMaterial[]>(`/api/inventory/raw-materials?${query}`);
    },

    /** Materials open job orders need more of than is in stock */
    getNeededMaterials: (params?: { branchId?: number }) =>
      fetchApi<NeededMaterial[]>(`/api/inventory/needed-materials${params?.branchId ? `?branchId=${params.branchId}` : ''}`),

    /** A typed-in material that is really an existing one: move its job order lines there */
    mergeMaterial: (id: number, targetId: number) =>
      fetchApi<{ target: RawMaterial; jobOrders: string[] }>(`/api/inventory/raw-materials/${id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetId }),
      }),

    createRawMaterial: (material: RawMaterialInput) =>
      fetchApi<RawMaterial>('/api/inventory/raw-materials', {
        method: 'POST',
        body: JSON.stringify(material),
      }),
    
    updateRawMaterial: (id: number, material: Partial<RawMaterialInput>) =>
      fetchApi<RawMaterial>(`/api/inventory/raw-materials/${id}`, {
        method: 'PUT',
        body: JSON.stringify(material),
      }),

    // Finished Goods
    getFinishedGoods: (params?: { includeArchived?: boolean; branchId?: number }) => {
      const query = new URLSearchParams();
      if (params?.includeArchived) query.append('includeArchived', 'true');
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      return fetchApi<FinishedGood[]>(`/api/inventory/finished-goods?${query}`);
    },
    
    /** Materials the latest batch of a premade product used, per piece (to fill in a restock) */
    getPremadeRecipe: (id: number) =>
      fetchApi<PremadeRecipe>(`/api/inventory/finished-goods/${id}/recipe`),
    createFinishedGood: (item: PremadeProductInput) =>
      fetchApi<FinishedGood>('/api/inventory/finished-goods', {
        method: 'POST',
        body: JSON.stringify(item),
      }),

    /** A consumable fully used (takes `quantity`, default 1, out of stock) or partly used (recorded only) */
    consumableUse: (id: number, data: { kind: 'full' | 'partial'; quantity?: number; notes?: string }) =>
      fetchApi<RawMaterial>(`/api/inventory/raw-materials/${id}/consumable-use`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    /** Correct stock by hand, with a reason (recorded in Item History and the Audit Trail) */
    adjustStock: (data: { kind: 'material' | 'premade'; itemId: number; newQuantity: number; reason: string; notes?: string }) =>
      fetchApi<{ oldQuantity: number; newQuantity: number }>('/api/inventory/stock-adjustments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateFinishedGood: (id: number, item: Partial<PremadeProductInput>) =>
      fetchApi<FinishedGood>(`/api/inventory/finished-goods/${id}`, {
        method: 'PUT',
        body: JSON.stringify(item),
      }),

    /**
     * Hand warehouse stock to branches as pending deliveries. Pass either
     * explicit `allocations` or `toAllBranches` with a per-branch quantity.
     * Rejected outright if the total exceeds what's available.
     */
    distributeFinishedGood: (
      id: number,
      payload:
        | { allocations: Array<{ branchId: number; quantity: number }>; notes?: string }
        | { toAllBranches: true; quantityPerBranch: number; notes?: string },
    ) =>
      fetchApi<PremadeTransfer[]>(`/api/inventory/finished-goods/${id}/distribute`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getPremadeTransfers: (params?: { status?: string }) => {
      const query = new URLSearchParams();
      if (params?.status) query.append('status', params.status);
      return fetchApi<PremadeTransfer[]>(`/api/inventory/premade-transfers?${query}`);
    },

    /** Accept a delivery — this is what actually moves the stock. */
    confirmPremadeTransfer: (id: number) =>
      fetchApi<PremadeTransfer>(`/api/inventory/premade-transfers/${id}/confirm`, { method: 'POST' }),

    cancelPremadeTransfer: (id: number) =>
      fetchApi<PremadeTransfer>(`/api/inventory/premade-transfers/${id}/cancel`, { method: 'POST' }),

    getMaterialUsage: (params?: { branchId?: number; materialId?: number }) => {
      const query = new URLSearchParams();
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      if (params?.materialId) query.append('materialId', params.materialId.toString());
      return fetchApi<MaterialUsageLog[]>(`/api/inventory/material-usage?${query}`);
    },
    
    // Suppliers
    getSuppliers: (includeInactive?: boolean) => {
      const q = includeInactive ? '?includeInactive=true' : '';
      return fetchApi<Supplier[]>(`/api/inventory/suppliers${q}`);
    },
    /** Materials below their reorder level (lowest stock first) */
    getLowStock: () => fetchApi<RawMaterial[]>('/api/inventory/low-stock'),
    createSupplier: (data: Omit<Supplier, 'id' | 'isActive' | 'createdAt' | 'materials'> & { materials?: SupplierMaterialEntry[] }) =>
      fetchApi<Supplier>('/api/inventory/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    updateSupplier: (id: number, data: Partial<Omit<Supplier, 'materials'>> & { materials?: SupplierMaterialEntry[] }) =>
      fetchApi<Supplier>(`/api/inventory/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    /** Change the password of the supplier's own login (signs them out) */
    setSupplierPassword: (id: number, password: string) =>
      fetchApi<Supplier>(`/api/inventory/suppliers/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
    /** Make the supplier's own login (email optional; defaults to the supplier's email) */
    createSupplierLogin: (id: number, data: { username: string; password: string; email?: string }) =>
      fetchApi<Supplier>(`/api/inventory/suppliers/${id}/login`, { method: 'POST', body: JSON.stringify(data) }),

    // Waste Logs
    getWasteLogs: (params?: { branchId?: number }) => {
      const q = params?.branchId ? `?branchId=${params.branchId}` : '';
      return fetchApi<MaterialWasteLog[]>(`/api/inventory/waste-logs${q}`);
    },
    createWasteLog: (data: { materialId: number; quantity: number; reason: string; notes?: string; branchId?: number }) =>
      fetchApi<MaterialWasteLog>('/api/inventory/waste-logs', { method: 'POST', body: JSON.stringify(data) }),
    /** Undo a waste entry made by mistake: the quantity goes back into stock */
    undoWasteLog: (id: number) =>
      fetchApi<void>(`/api/inventory/waste-logs/${id}`, { method: 'DELETE' }),

    // AI Predictions
    ai: {
      getPredictions: () => fetchApi<AIStatus>('/api/inventory/ai/predictions'),
      recompute: () => fetchApi<{ message: string }>('/api/inventory/ai/recompute', { method: 'POST' }),
      uploadHistorical: async (file: File): Promise<ApiResponse<{ rowsSaved: number; uniqueItems: number; message: string }>> => {
        const token = getAuthToken();
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${API_BASE_URL}/api/inventory/ai/upload-historical`, {
          method: 'POST',
          headers: { ...(token && { Authorization: `Bearer ${token}` }) },
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || `Upload failed: ${response.status}`);
        return data;
      },
    },
  },

  // ==================
  // PAYMENTS
  // ==================
  payments: {
    /** Dates are Philippine calendar days (YYYY-MM-DD), both inclusive; sort defaults to latest first */
    getAll: (params?: { jobOrderId?: number; startDate?: string; endDate?: string; sort?: PaymentSort }) => {
      const qs = new URLSearchParams();
      if (params?.jobOrderId) qs.set('jobOrderId', String(params.jobOrderId));
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      if (params?.sort) qs.set('sort', params.sort);
      const q = qs.toString();
      return fetchApi<PaymentRecord[]>(`/api/payments${q ? `?${q}` : ''}`);
    },
    /** recordExcess: for non-cash payments over the balance, keep the extra as an excess payment */
    create: (data: { jobOrderId: number; amount: number; paymentMethod: string; referenceNumber?: string; notes?: string; recordExcess?: boolean }) =>
      fetchApi<PaymentRecord & { excess?: ExcessPayment | null }>('/api/payments', { method: 'POST', body: JSON.stringify(data) }),
    getSummary: () => fetchApi<PaymentSummary>('/api/payments/summary'),
  },

  excessPayments: {
    list: (params: { jobOrderId?: number; customerId?: number; status?: string }) => {
      const q = new URLSearchParams();
      if (params.jobOrderId) q.set('jobOrderId', String(params.jobOrderId));
      if (params.customerId) q.set('customerId', String(params.customerId));
      if (params.status) q.set('status', params.status);
      return fetchApi<ExcessPayment[]>(`/api/excess-payments?${q}`);
    },
    refund: (id: number, data: { refundMethod: string; referenceNumber?: string; notes?: string }) =>
      fetchApi<ExcessPayment>(`/api/excess-payments/${id}/refund`, { method: 'POST', body: JSON.stringify(data) }),
    /** Pays another of the same customer's orders with it; any rest stays open */
    apply: (id: number, jobOrderId: number) =>
      fetchApi<ExcessPayment>(`/api/excess-payments/${id}/apply`, { method: 'POST', body: JSON.stringify({ jobOrderId }) }),
  },

  // ==================
  // PAYMENT OVERRIDES (supervisor requests -> admin approval)
  // ==================
  paymentOverrides: {
    list: (params?: { status?: string; jobOrderId?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.append('status', params.status);
      if (params?.jobOrderId) q.append('jobOrderId', String(params.jobOrderId));
      const qs = q.toString();
      return fetchApi<PaymentOverride[]>(`/api/payment-overrides${qs ? `?${qs}` : ''}`);
    },
    create: (data: { jobOrderId: number; paymentStatus?: string; balance?: number; downPayment?: number; reason?: string }) =>
      fetchApi<PaymentOverride>('/api/payment-overrides', { method: 'POST', body: JSON.stringify(data) }),
    approve: (id: number, notes?: string) =>
      fetchApi<PaymentOverride>(`/api/payment-overrides/${id}/approve`, { method: 'POST', body: JSON.stringify({ notes }) }),
    reject: (id: number, notes?: string) =>
      fetchApi<PaymentOverride>(`/api/payment-overrides/${id}/reject`, { method: 'POST', body: JSON.stringify({ notes }) }),
  },

  // ==================
  // SALES
  // ==================
  sales: {
    /** Earlier jobs on the same car (plate) and materials usually used on the same model (suggestions) */
    getVehicleHistory: (params: { make?: string; model?: string; year?: string; plate?: string; services?: string; excludeId?: number }) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
      return fetchApi<VehicleHistory>(`/api/sales/job-orders/vehicle-history?${q}`);
    },
    // Job Orders
    getJobOrders: (params?: { status?: string; branchId?: number }) => {
      const query = new URLSearchParams();
      if (params?.status) query.append('status', params.status);
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      return fetchApi<JobOrder[]>(`/api/sales/job-orders?${query}`);
    },
    
    // Get both job orders and customer orders together
    getAllOrders: () => fetchApi<{
      jobOrders: JobOrder[];
      customerOrders: CustomerOrder[];
    }>('/api/sales/all-orders'),
    
    getJobOrder: (id: number) => fetchApi<JobOrder>(`/api/sales/job-orders/${id}`),
    
    createJobOrder: (order: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      branchId: number;
      description: string;
      vehicleInfo?: VehicleInfo;
      items: JobOrderItem[];
      estimatedCompletion?: string; // a draft may not have one yet
      downPayment?: number;
      discountPercent?: number;
      notes?: string;
      isDraft?: boolean;
      /** A number typed on the form; left out, the server generates the next one */
      jobOrderNumber?: string;
    } & JobOrderPriceInput) =>
      fetchApi<JobOrder>('/api/sales/job-orders', {
        method: 'POST',
        body: JSON.stringify(order),
      }),

    /** confirmDeposit: only when confirming a draft; its down payment is recorded in the same save */
    updateJobOrder: (id: number, updates: Partial<JobOrder> & JobOrderPriceInput & {
      confirmDeposit?: { amount: number; paymentMethod: string };
    }) =>
      fetchApi<JobOrder>(`/api/sales/job-orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),

    /** Extra material issued for a job order beyond its plan (a recut after a mistake, defects, rework) */
    getExtraMaterials: (jobOrderId: number) =>
      fetchApi<MaterialWasteLog[]>(`/api/sales/job-orders/${jobOrderId}/extra-materials`),
    issueExtraMaterials: (jobOrderId: number, data: { materialId: number; quantity: number; reason: string; workerId?: number; notes?: string }) =>
      fetchApi<MaterialWasteLog>(`/api/sales/job-orders/${jobOrderId}/extra-materials`, { method: 'POST', body: JSON.stringify(data) }),
    /** Undo an extra material entry made by mistake: it goes back into stock */
    undoExtraMaterial: (jobOrderId: number, logId: number) =>
      fetchApi<void>(`/api/sales/job-orders/${jobOrderId}/extra-materials/${logId}`, { method: 'DELETE' }),

    // Draft job orders — saved but not confirmed; excluded from normal lists/counts
    getDrafts: () => fetchApi<JobOrder[]>('/api/sales/drafts'),

    deleteJobOrder: (id: number) =>
      fetchApi<null>(`/api/sales/job-orders/${id}`, { method: 'DELETE' }),

  },

  // ==================
  // COSTING
  // ==================
  costing: {
    getAll: () => fetchApi<JobOrderCost[]>('/api/costing/all'),

    getJobOrderCosting: (orderId: number) =>
      fetchApi<CostingData>(`/api/costing/job-order/${orderId}`),

  },

  // ==================
  // PURCHASE ORDERS
  // ==================
  purchaseOrders: {
    getAll: (status?: string) => {
      const query = status ? `?status=${status}` : '';
      return fetchApi<PurchaseOrder[]>(`/api/purchase-orders${query}`);
    },
    
    getById: (id: number) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}`),
    /** The supplier's last price for each material (by material id), from earlier POs */
    lastPrices: (supplierId: number) =>
      fetchApi<Record<string, { price: number; poNumber: string; date: string | null; bySupplier: boolean }>>(
        `/api/purchase-orders/last-prices?supplierId=${supplierId}`),
    
    create: (po: {
      supplierName: string;
      supplierId?: number;
      items: Array<{ materialId?: number; name: string; quantity: number; unit: string; unitPrice: number; consumable?: boolean }>;
      /** Left out: the supplier's default. '' = no term */
      paymentTerm?: PaymentTerm | '';
      paymentTermDays?: number | null;
    }) =>
      fetchApi<PurchaseOrder>('/api/purchase-orders', {
        method: 'POST',
        body: JSON.stringify(po),
      }),
    
    approve: (id: number) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/approve`, { method: 'POST' }),
    
    /** Record what arrived; with no items, everything still outstanding is received */
    receive: (id: number, data?: { items: { line: number; quantity: number }[]; notes?: string; invoiceNumber?: string }) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify(data || {}) }),
    /** Return received items to the supplier (they leave stock; the payable goes down) */
    returnItems: (id: number, data: { items: { line: number; quantity: number }[]; reason: string; notes?: string; replacement: boolean;
      /** Return slip / debit memo no. */ documentNumber?: string; /** YYYY-MM-DD the replacement is expected */ expectedReplacement?: string }) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/return`, { method: 'POST', body: JSON.stringify(data) }),
    /** The rest of a partly received PO won't come: stop waiting for it */
    closeReceiving: (id: number, reason: string) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/close-receiving`, { method: 'POST', body: JSON.stringify({ reason }) }),
    /** Pay the supplier (also makes the Expense Log entry) */
    recordPayment: (id: number, data: { amount: number; paymentDate: string; paymentMethod: string; referenceNumber?: string; notes?: string }) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
    /** Supplier credit: refunded by the supplier, or applied to another PO of the same supplier */
    useSupplierCredit: (id: number, data: { kind: 'refund' | 'apply'; amount: number; date?: string; paymentMethod?: string;
      referenceNumber?: string; notes?: string; targetPurchaseOrderId?: number }) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/supplier-credit`, { method: 'POST', body: JSON.stringify(data) }),
    voidSupplierCredit: (id: number, creditId: number, reason: string) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/supplier-credit/${creditId}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
    voidPayment: (id: number, paymentId: number, reason: string) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/payments/${paymentId}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
    /** Change this PO's payment term ('' = no term) */
    setPaymentTerm: (id: number, paymentTerm: PaymentTerm | '', paymentTermDays?: number | null) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/payment-term`, {
        method: 'PUT', body: JSON.stringify({ paymentTerm, paymentTermDays: paymentTermDays ?? null }),
      }),
    /** The Net day options and reminder lead time set in Settings */
    paymentTermOptions: () => fetchApi<PaymentTermOptions>('/api/payment-terms'),
  },

  // ==================
  // DELIVERIES
  // ==================
  deliveries: {
    getAll: (params?: { status?: string; type?: string; jobOrderId?: number }) => {
      const query = new URLSearchParams();
      if (params?.status) query.append('status', params.status);
      if (params?.type) query.append('type', params.type);
      if (params?.jobOrderId) query.append('jobOrderId', String(params.jobOrderId));
      return fetchApi<Delivery[]>(`/api/deliveries?${query}`);
    },
    
    get: (id: number) => fetchApi<Delivery>(`/api/deliveries/${id}`),
    
    create: (delivery: {
      type: string;
      /** Defaults to the job order's branch */
      fromBranchId?: number;
      toBranchId?: number;
      customerName?: string;
      customerAddress?: string;
      customerPhone?: string;
      jobOrderId?: number;
      jobOrderNumber?: string;
      items: DeliveryItem[];
      scheduledDate: string;
      timeSlot?: string;
      estimatedArrival?: string;
      driverName?: string;
      driverContact?: string;
      vehiclePlate?: string;
      notes?: string;
    }) =>
      fetchApi<Delivery>('/api/deliveries', {
        method: 'POST',
        body: JSON.stringify(delivery),
      }),
    
    updateStatus: (id: number, status: string) =>
      fetchApi<Delivery>(`/api/deliveries/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),

    /** Administrators: undo a delivery marked delivered by mistake (back to in transit) */
    reopen: (id: number, reason: string) =>
      fetchApi<Delivery>(`/api/deliveries/${id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    
  },

  // ==================
  // CUSTOMER ORDERS
  // ==================
  customerOrders: {

    getOrders: () => fetchApi<CustomerOrder[]>('/api/customer-orders'),

    getOrder: (id: number) => fetchApi<CustomerOrder>(`/api/customer-orders/${id}`),

    updateStatus: (id: number, status: string) =>
      fetchApi<CustomerOrder>(`/api/customer-orders/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),

  },

  spamControl: {
    getBlacklist: () => fetchApi<PhoneBlacklistRecord[]>('/api/admin/phone-blacklist'),
    unblock: (id: number) => fetchApi<null>(`/api/admin/phone-blacklist/${id}/unblock`, { method: 'POST' }),
    deleteRecord: (id: number) => fetchApi<null>(`/api/admin/phone-blacklist/${id}`, { method: 'DELETE' }),
    flagOrderSpam: (id: number) => fetchApi<{ strikeCount: number; isBlocked: boolean }>(`/api/admin/product-orders/${id}/flag-spam`, { method: 'POST' }),
  },

  // ==================
  // PRODUCT ORDERS (Premade Products)
  // ==================
  /** Order numbers for the New Job Order form: a preview of the next one, and a check of a typed one */
  orderNumbers: {
    next: (kind: 'job' | 'premade', branchId?: number) =>
      fetchApi<{ number: string }>(`/api/order-numbers/next?kind=${kind}${branchId ? `&branchId=${branchId}` : ''}`),
    check: (kind: 'job' | 'premade', number: string) =>
      fetchApi<{ available: boolean; message: string | null }>(`/api/order-numbers/check?kind=${kind}&number=${encodeURIComponent(number)}`),
  },
  productOrders: {
    /** Staff record a premade product sale at a branch */
    create: (data: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      customerAddress?: string;
      items: Array<{ productId: number; quantity: number }>;
      branchId: number;
      notes?: string;
      paymentAmount?: number;
      /** Needed only when paymentAmount is above 0: cash, gcash or bank_transfer */
      paymentMethod?: string;
      /** A number typed on the form; left out, the server generates the next PS- number */
      orderNumber?: string;
    }) =>
      fetchApi<ProductOrder>('/api/product-orders', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getAll: (status?: string) => {
      const query = status ? `?status=${status}` : '';
      return fetchApi<ProductOrder[]>(`/api/product-orders${query}`);
    },

    get: (id: number) => fetchApi<ProductOrder>(`/api/product-orders/${id}`),

    getTimeline: (id: number) => fetchApi<ProductOrderTimelineEvent[]>(`/api/product-orders/${id}/timeline`),

    update: (id: number, data: { status?: ProductOrder['status']; paymentStatus?: ProductOrder['paymentStatus']; notes?: string; addPayment?: number }) =>
      fetchApi<ProductOrder>(`/api/product-orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    getPickupQueue: () => fetchApi<ProductOrder[]>('/api/product-orders/pickup-queue'),

    getDirectSales: () => fetchApi<ProductOrder[]>('/api/product-orders/direct-sales'),
  },

  // ==================
  // PREMADE JOB ORDER DRAFTS (saved, not yet recorded; no stock taken)
  // ==================
  premadeDrafts: {
    list: () => fetchApi<PremadeDraft[]>('/api/premade-drafts'),
    get: (id: number) => fetchApi<PremadeDraft>(`/api/premade-drafts/${id}`),
    create: (data: PremadeDraftInput & { branchId: number; customerName: string }) =>
      fetchApi<PremadeDraft>('/api/premade-drafts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: PremadeDraftInput) =>
      fetchApi<PremadeDraft>(`/api/premade-drafts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: number) => fetchApi<null>(`/api/premade-drafts/${id}`, { method: 'DELETE' }),
    /** Records the draft as a premade order. Stock is re-checked on the server; a 409 carries the flagged draft */
    confirm: (id: number, data: { paymentAmount?: number; paymentMethod?: string; orderNumber?: string }) =>
      fetchApi<ProductOrder>(`/api/premade-drafts/${id}/confirm`, { method: 'POST', body: JSON.stringify(data) }),
  },

  // ==================
  // PRODUCT ORDER TRANSFERS
  // ==================
  /** Read-only history of an inventory item's stock movements */
  itemHistory: {
    items: (kind: ItemHistoryKind) => fetchApi<ItemHistoryItem[]>(`/api/item-history/items?kind=${kind}`),
    get: (kind: ItemHistoryKind, itemId: number) => fetchApi<ItemHistory>(`/api/item-history?kind=${kind}&itemId=${itemId}`),
  },

  productOrderTransfers: {
    getMyRequests: () => fetchApi<ProductOrderTransfer[]>('/api/product-orders/my-transfer-requests'),

    markTransferred: (id: number) =>
      fetchApi<ProductOrderTransfer>(`/api/product-order-transfers/${id}/mark-transferred`, { method: 'POST' }),

    confirmReceipt: (id: number) =>
      fetchApi<ProductOrderTransfer>(`/api/product-order-transfers/${id}/confirm-receipt`, { method: 'POST' }),

    getDashboard: (params?: { status?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.append('status', params.status);
      return fetchApi<{ data: TransferDashboardItem[]; summary: TransferSummary }>(`/api/product-orders/transfer-dashboard${q.toString() ? '?' + q : ''}`);
    },

    bulkAction: (action: 'mark-sent' | 'confirm-receipt', transferIds: number[]) =>
      fetchApi<{ succeeded: number[]; failed: { id: number; reason: string }[] }>(
        '/api/product-order-transfers/bulk-action',
        { method: 'POST', body: JSON.stringify({ action, transferIds }) }
      ),
  },

  // ==================
  // NOTIFICATIONS
  // ==================
  notifications: {
    getAll: (limit = 30, archived = false) =>
      fetchApi<{ data: AppNotification[]; unreadCount: number }>(`/api/notifications?limit=${limit}${archived ? '&archived=1' : ''}`),
    markRead: (id: number) => fetchApi<void>(`/api/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => fetchApi<void>('/api/notifications/read-all', { method: 'POST' }),
    /** Move to the archive, or back to the bell with archived = false */
    archive: (id: number, archived = true) =>
      fetchApi<void>(`/api/notifications/${id}/archive`, { method: 'POST', body: JSON.stringify({ archived }) }),
    delete: (id: number) => fetchApi<void>(`/api/notifications/${id}`, { method: 'DELETE' }),
  },

  // ==================
  // FORECASTING
  // ==================
  forecasting: {
    getInventoryForecast: (params?: { period?: string }) => {
      const q = params?.period ? `?period=${params.period}` : '';
      return fetchApi<InventoryForecastData>(`/api/forecasting/inventory${q}`);
    },
  },

  // ==================
  // REPORTS
  // ==================
  reports: {
    getSalesReport: (params?: { startDate?: string; endDate?: string; branchId?: number }) => {
      const query = new URLSearchParams();
      if (params?.startDate) query.append('startDate', params.startDate);
      if (params?.endDate) query.append('endDate', params.endDate);
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      return fetchApi<SalesReport>(`/api/reports/sales?${query}`);
    },
    
    getInventoryReport: (branchId?: number) => {
      const query = branchId ? `?branchId=${branchId}` : '';
      return fetchApi<InventoryReport>(`/api/reports/inventory${query}`);
    },
    
    getAuditTrail: (params?: { startDate?: string; endDate?: string; userId?: number; module?: string }) => {
      const query = new URLSearchParams();
      if (params?.startDate) query.append('startDate', params.startDate);
      if (params?.endDate) query.append('endDate', params.endDate);
      if (params?.userId) query.append('userId', params.userId.toString());
      if (params?.module) query.append('module', params.module);
      return fetchApi<AuditLog[]>(`/api/reports/audit-trail?${query}`);
    },

    getExtraMaterialsReport: (params: { startDate?: string; endDate?: string; branchId?: number }) => {
      const q = new URLSearchParams();
      if (params.startDate) q.set('startDate', params.startDate);
      if (params.endDate) q.set('endDate', params.endDate);
      if (params.branchId) q.set('branchId', String(params.branchId));
      return fetchApi<ExtraMaterialsReport>(`/api/reports/extra-materials?${q}`);
    },
    /** Items returned to suppliers in the period */
    getPurchaseReturnsReport: (params: { startDate?: string; endDate?: string }) => {
      const q = new URLSearchParams();
      if (params.startDate) q.set('startDate', params.startDate);
      if (params.endDate) q.set('endDate', params.endDate);
      return fetchApi<PurchaseReturnsReport>(`/api/reports/purchase-returns?${q}`);
    },
    getSettlementReport: (params?: { startDate?: string; endDate?: string }) => {
      const query = new URLSearchParams();
      if (params?.startDate) query.append('startDate', params.startDate);
      if (params?.endDate) query.append('endDate', params.endDate);
      return fetchApi<BranchSettlementReport>(`/api/reports/branch-settlement?${query}`);
    },
  },

  // ==================
  // SETTINGS
  // ==================
  owner: {
    summary: (p?: OwnerFilters) => fetchApi<OwnerSummary>(`/api/owner/summary${periodQuery(p)}`),
    pnl: (p?: OwnerFilters) =>
      fetchApi<ProfitAndLoss>(`/api/owner/pnl${periodQuery(p)}`),
    jobCosting: (p?: OwnerFilters) =>
      fetchApi<OwnerJobCosting>(`/api/owner/job-costing${periodQuery(p)}`),
    receivables: (status?: string, branchId?: number | '') => {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (branchId) q.set('branchId', String(branchId));
      const s = q.toString();
      return fetchApi<OwnerReceivables>(`/api/owner/receivables${s ? `?${s}` : ''}`);
    },
    inventory: (p?: OwnerFilters) => fetchApi<OwnerInventory>(`/api/owner/inventory${periodQuery(p)}`),
  },

  expenses: {
    list: (p?: { startDate?: string; endDate?: string; category?: string; branchId?: number }) => {
      const q = periodQuery(p);
      const cat = p?.category ? `${q ? '&' : '?'}category=${encodeURIComponent(p.category)}` : '';
      const br = p?.branchId ? `${q || cat ? '&' : '?'}branchId=${p.branchId}` : '';
      return fetchApi<ExpenseList>(`/api/expenses${q}${cat}${br}`);
    },
    create: (data: { date: string; category: string; particulars: string; amount: number; paymentMethod: string; notes?: string; branchId?: number }) =>
      fetchApi<Expense>('/api/expenses', { method: 'POST', body: JSON.stringify(data) }),
    remove: (id: number) => fetchApi<void>(`/api/expenses/${id}`, { method: 'DELETE' }),
  },

  permissions: {
    catalogue: () => fetchApi<PermissionCatalogue>('/api/permissions'),
    getForUser: (userId: number) => fetchApi<UserPermissions>(`/api/users/${userId}/permissions`),
    /** Replaces the user's overrides; empty lists reset them to their role's defaults.
     *  Fails with 409 if they changed since `version` was loaded. */
    setForUser: (userId: number, data: { grants: string[]; revokes: string[]; version: string }) =>
      fetchApi<UserPermissions>(`/api/users/${userId}/permissions`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  settings: {
    /** Logo and custom sidebar icons (public: the sign-in page and browser tab use the logo) */
    getBranding: () => fetchApi<Branding>('/api/settings/branding'),
    /** null puts back the built-in logo / icon */
    updateBranding: (data: { logo?: string | null; navIcons?: Record<string, string | null> }) =>
      fetchApi<Branding>('/api/settings/branding', { method: 'PUT', body: JSON.stringify(data) }),
    // Users
    getUsers: (includeInactive?: boolean) => {
      const query = includeInactive ? '?includeInactive=true' : '';
      return fetchApi<User[]>(`/api/settings/users${query}`);
    },
    
    createUser: (user: {
      username: string;
      password: string;
      email: string;
      fullName: string;
      role: string;
        branch?: string;
        branchId?: number;
    }) =>
      fetchApi<User>('/api/settings/users', {
        method: 'POST',
        body: JSON.stringify(user),
      }),
    
    /** A new password needs adminPassword (the signed-in administrator's own password) */
    /** What the server accepts: any of these (branchId null = no branch). A new password needs adminPassword. */
    updateUser: (id: number, updates: {
      email?: string; fullName?: string; role?: string; branchId?: number | null; branch?: string;
      password?: string; adminPassword?: string;
    }) =>
      fetchApi<User>(`/api/settings/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    
    archiveUser: (id: number) =>
      fetchApi<null>(`/api/settings/users/${id}/archive`, { method: 'POST' }),
    
    restoreUser: (id: number) =>
      fetchApi<null>(`/api/settings/users/${id}/restore`, { method: 'POST' }),

    /** Asks the server whether this account can be permanently deleted, and why not. */
    checkUserDeletable: (id: number) =>
      fetchApi<{ canDelete: boolean; reason: string; blockers: string[] }>(
        `/api/settings/users/${id}/delete-check`,
      ),

    deleteUser: (id: number) =>
      fetchApi<null>(`/api/settings/users/${id}`, { method: 'DELETE' }),

    // Roles
    getRoles: () => fetchApi<Role[]>('/api/settings/roles'),
    
    // Branches
    getBranches: (includeInactive?: boolean, includeArchived?: boolean) => {
      const query = includeInactive
        ? `?includeInactive=true${includeArchived ? '&includeArchived=true' : ''}`
        : '';
      return fetchApi<Branch[]>(`/api/settings/branches${query}`);
    },

    archiveBranch: (id: number) =>
      fetchApi<Branch>(`/api/settings/branches/${id}/archive`, { method: 'POST' }),

    unarchiveBranch: (id: number) =>
      fetchApi<Branch>(`/api/settings/branches/${id}/unarchive`, { method: 'POST' }),

    checkBranchDeletable: (id: number) =>
      fetchApi<{ canDelete: boolean; reason: string; blockers: string[] }>(
        `/api/settings/branches/${id}/delete-check`,
      ),

    deleteBranch: (id: number) =>
      fetchApi<null>(`/api/settings/branches/${id}`, { method: 'DELETE' }),
    
    getBranchesPublic: () => fetchApi<Branch[]>('/api/settings/branches/public'),
    
    createBranch: (branch: { name: string; code: string; address: string; isWarehouse?: boolean }) =>
      fetchApi<Branch>('/api/settings/branches', {
        method: 'POST',
        body: JSON.stringify(branch),
      }),
    
    updateBranch: (id: number, updates: Partial<Branch>) =>
      fetchApi<Branch>(`/api/settings/branches/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),

    // System settings
    getSystemSettings: () => fetchApi<Record<string, string>>('/api/settings/system'),

    updateSystemSetting: (key: string, value: string | number) =>
      fetchApi<Record<string, string>>(`/api/settings/system/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
  },

  managedWorkers: {
    list: () =>
      fetchApi<{ workers: ManagedWorker[] }>('/api/managed-workers'),
    /** Seat maker and sewer logins a worker can be linked to */
    linkableAccounts: () => fetchApi<LinkableWorkerAccount[]>('/api/managed-workers/linkable-accounts'),
    /** The signed-in worker's own assignments */
    myWork: () => fetchApi<MyWork>('/api/my-work'),
    /** Change the password of a worker's own login (signs them out) */
    setPassword: (id: number, password: string) =>
      fetchApi<{ worker: ManagedWorker }>(`/api/managed-workers/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
    /** The signed-in worker starts one of their tasks */
    startMyTask: (id: number) => fetchApi<WorkerAssignment>(`/api/my-work/${id}/start`, { method: 'POST' }),
    /** The job order's materials for the worker's finish-task form (no prices) */
    myTaskMaterials: (id: number) => fetchApi<CutMaterialsData>(`/api/my-work/${id}/cut-materials`),
    /** The worker submits their finished task for an administrator to approve */
    submitMyTask: (id: number, data: TaskSubmitPayload) =>
      fetchApi<WorkerAssignment>(`/api/my-work/${id}/submit`, { method: 'POST', body: JSON.stringify(data) }),
    /** What a worker finished in a period (Philippine dates, YYYY-MM-DD), with hours and pay */
    workSummary: (workerId: number, start: string, end: string) =>
      fetchApi<WorkerWorkSummary>(`/api/managed-workers/${workerId}/work-summary?start=${start}&end=${end}`),
    /** The same, for the signed-in worker's own work */
    myWorkSummary: (start: string, end: string) =>
      fetchApi<WorkerWorkSummary>(`/api/my-work/summary?start=${start}&end=${end}`),
    /** Extra material issued under workers' names (filter by worker and/or job order) */
    extraMaterials: (params: { workerId?: number; jobOrderId?: number } = {}) => {
      const q = new URLSearchParams();
      if (params.workerId) q.set('workerId', String(params.workerId));
      if (params.jobOrderId) q.set('jobOrderId', String(params.jobOrderId));
      return fetchApi<MaterialWasteLog[]>(`/api/worker-extra-materials?${q}`);
    },
    /** newAccount makes a login for the worker (email optional) and links it */
    create: (data: { name: string; workType: string; ratePerHour?: number; payMode?: string; userId?: number | null;
      newAccount?: NewWorkerAccount }) =>
      fetchApi<{ worker: ManagedWorker }>('/api/managed-workers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<{ name: string; workType: string; ratePerHour: number; payMode: string; isActive: boolean; userId: number | null;
      newAccount: NewWorkerAccount }>) =>
      fetchApi<{ worker: ManagedWorker }>(`/api/managed-workers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  /** A supplier's own account: the purchase orders sent to them */
  supplierPortal: {
    orders: () => fetchApi<SupplierPortalData>('/api/supplier-portal/orders'),
    setDelivery: (id: number, data: { expectedDelivery: string; note?: string }) =>
      fetchApi<SupplierOrder>(`/api/supplier-portal/orders/${id}/delivery`, { method: 'PUT', body: JSON.stringify(data) }),
    /** The supplier marks the order (or the rest of it) as sent; only then can it be received */
    markSent: (id: number, items: { line: number; quantity: number }[], note?: string) =>
      fetchApi<SupplierOrder>(`/api/supplier-portal/orders/${id}/send`, { method: 'POST', body: JSON.stringify({ items, note }) }),
    /** The supplier sets or changes the unit prices (until the first delivery or payment) */
    setPrices: (id: number, prices: { line: number; unitPrice: number }[]) =>
      fetchApi<SupplierOrder>(`/api/supplier-portal/orders/${id}/prices`, { method: 'PUT', body: JSON.stringify({ prices }) }),
  },

  workerAssignments: {
    list: (workerId?: number) => {
      const query = workerId ? `?workerId=${workerId}` : '';
      return fetchApi<{ assignments: WorkerAssignment[] }>(`/api/worker-assignments${query}`);
    },
    /** Scheduled work by date: one worker's, or everyone's when workerId is left out */
    getCalendar: (params: { workerId?: number; month: string }) =>
      fetchApi<Record<string, CalendarAssignment[]>>(
        `/api/worker-assignments/calendar?month=${params.month}${params.workerId ? `&workerId=${params.workerId}` : ''}`
      ),
    create: (data: { workerId: number; jobOrderRef: string; jobOrderDbId?: number; description?: string; expectedHours?: number; notes?: string; scheduledDate?: string; assignmentType?: string; specialTaskTitle?: string; rework?: boolean; reworkReason?: string; another?: boolean;
      /** Confirms another task on a day the worker already has this job order */
      sameDay?: boolean }) =>
      fetchApi<{ assignment: WorkerAssignment; warning?: string | null }>('/api/worker-assignments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    /** workerId moves a task that hasn't started to another worker */
    /** materialCuts: on completion, what was cut from stock and how much of it was used (yards) */
    update: (id: number, data: Partial<{ status: string; hoursWorked: number; unitsWorked: number; payOverride: number; materialsUsed: object[]; materialCuts: { line?: number; materialId: number; cut: number; used: number; reason?: string }[]; consumables: { materialId: number; kind: 'full' | 'partial'; quantity?: number }[]; expectedHours: number; notes: string; description: string; scheduledDate: string; workerId: number }>) =>
      fetchApi<{ assignment: WorkerAssignment }>(`/api/worker-assignments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      fetchApi<{ message: string }>(`/api/worker-assignments/${id}`, { method: 'DELETE' }),
    /** The job order's materials a worker can record cuts of when finishing this task */
    cutMaterials: (id: number) =>
      fetchApi<CutMaterialsData>(`/api/worker-assignments/${id}/cut-materials`),
    /** Approve submitted work (unitsWorked: days or pieces for workers not paid by the hour), or send it back */
    review: (id: number, data: { action: 'approve'; payOverride?: number; unitsWorked?: number } | { action: 'return'; note: string }) =>
      fetchApi<WorkerAssignment & { pay?: number }>(`/api/worker-assignments/${id}/review`, { method: 'POST', body: JSON.stringify(data) }),
  },

  customers: {
    search: (q: string) =>
      fetchApi<Customer[]>(`/api/customers/search?q=${encodeURIComponent(q)}`),
    list: (q?: string) =>
      fetchApi<Customer[]>(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    get: (id: number) =>
      fetchApi<Customer>(`/api/customers/${id}`),
    create: (data: Omit<Customer, 'id' | 'createdAt' | 'orderHistory'>) =>
      fetchApi<Customer>('/api/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Omit<Customer, 'id' | 'createdAt' | 'orderHistory'>>) =>
      fetchApi<Customer>(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  announcements: {
    /** Archived announcements are returned only for administrators and supervisors. */
    list: (includeArchived?: boolean) =>
      fetchApi<Announcement[]>(
        `/api/announcements${includeArchived ? '?includeArchived=true' : ''}`,
      ),
    create: (data: { title: string; body: string; priority?: string; isPinned?: boolean }) =>
      fetchApi<Announcement>('/api/announcements', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{ title: string; body: string; priority: string; isPinned: boolean; isActive: boolean }>) =>
      fetchApi<Announcement>(`/api/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchApi<{ message: string }>(`/api/announcements/${id}`, { method: 'DELETE' }),
  },

  workerAvailability: {
    get: (params?: { workerId?: number; month?: string }) => {
      const q = new URLSearchParams();
      if (params?.workerId) q.append('workerId', String(params.workerId));
      if (params?.month) q.append('month', params.month);
      return fetchApi<{ entries: WorkerAvailabilityEntry[] }>(`/api/worker-availability?${q}`);
    },
    set: (data: { managedWorkerId: number; date: string; isAvailable: boolean | null; note?: string }) =>
      fetchApi<{ id?: number; date?: string; isAvailable?: boolean }>('/api/worker-availability', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  chat: {
    list: (since?: string) => {
      const q = since ? `?since=${encodeURIComponent(since)}` : '';
      return fetchApi<ChatMessage[]>(`/api/chat/messages${q}`);
    },
    send: (content: string) =>
      fetchApi<ChatMessage>('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
  },
};

export default api;
