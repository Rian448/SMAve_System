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
  role: 'administrator' | 'supervisor' | 'sales_manager' | 'seat_maker' | 'sewer' | 'owner';
  roleName?: string;
  branch: string;
  branchId?: number;
  branchName?: string;
  /** Based at the warehouse: picks the branch each job order is for */
  atWarehouse?: boolean;
  isActive?: boolean;
  phone?: string;
  /** Effective permissions (role defaults + grants − revokes), e.g. 'inventory.add' */
  permissions?: string[];
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
  lastUpdated: string;
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
}

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
}

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

export interface InventoryForecastData {
  restockItems: (AIPrediction & { estimatedCost: number })[];
  monthlyUsageTrend: { month: string; total: number; projected: boolean }[];
  totalPredictedItems: number;
  urgentCount: number;
  soonCount: number;
  periodItemCount: number;
  estimatedRestockCost: number;
  topConsuming: AIPrediction | null;
  hasPredictions: boolean;
  predictionStatus: string;
  period: string;
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

export interface PremadeProductInput {
  name: string;
  quantity: number;
  unit?: string;
  category: string;
  price: number;
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
  id: number;
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
  /** Older orders don't store this; see jobOrderItemCategory() */
  category?: 'material' | 'labor' | 'expense';
  /** Worker assignment this labor line is linked to (managed by the server) */
  assignmentId?: number;
  /** What the worker was actually paid for this whole line, once their assignment is completed */
  actualLaborCost?: number;
  /** Read-only, from the linked worker assignment (not stored on the order) */
  assignmentStatus?: 'pending' | 'in_progress' | 'completed';
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
    status: 'pending' | 'in_progress' | 'completed';
    hoursWorked?: number | null;
    pay?: number | null;
    endTime?: string | null;
  }[];
}

export interface WorkerAssignment {
  id: number;
  workerId: number;
  workerName: string;
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
  status: 'pending' | 'in_progress' | 'completed';
  notes?: string;
  createdAt: string;
  isOverdue?: boolean;
  overdueByHours?: number;
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
  year: number;
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
  status: 'pending' | 'in_progress' | 'completed' | 'voided' | 'cancelled' | 'delivered';
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
  unitPrice: number;
  totalPrice: number;
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplierId?: number;
  supplierName: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  status: 'pending' | 'approved' | 'received' | 'cancelled';
  expectedDelivery: string;
  createdAt: string;
  createdBy: number;
  approvedAt?: string;
  approvedBy?: number;
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
  };
  statusBreakdown: Array<{ status: string; count: number; value: number }>;
  dailySales: Array<{ date: string; orders: number; revenue: number }>;
  premadeSummary: {
    totalOrders: number;
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

/** An error response from the API, carrying the HTTP status and the parsed body. */
export class ApiError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
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

export interface OwnerSummary {
  period: { startDate: string; endDate: string };
  ytd: { sales: number; totalExpenses: number; netIncome: number; profitMargin: number; grossProfit: number; vatCollected: number };
  thisMonth: { sales: number; totalExpenses: number; netIncome: number };
  receivables: number;
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
  totals: { sellingPrice: number; materials: number; labor: number; otherCosts: number; grossMargin: number; marginPercent: number };
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
  cogsYtd: ProfitAndLoss['cogs'];
  restock: { id: number; name: string; color: string | null; branchName: string | null; stock: number; threshold: number; status: 'out' | 'low' }[];
  outOfStock: number; lowStock: number;
  movements: { date: string | null; direction: 'in' | 'out'; item: string; quantity: number; reason: string; branchName: string | null }[];
}

export interface Expense {
  id: number; date: string; category: string; particulars: string; amount: number;
  paymentMethod: string; notes: string | null; branchId: number | null; branchName: string | null;
  createdBy: string | null; createdAt: string | null;
}

export interface ExpenseList { expenses: Expense[]; total: number; categories: string[]; paymentMethods: string[] }

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

    const data = await response.json();

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
    login: (username: string, password: string) =>
      fetchApi<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
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
    
    createFinishedGood: (item: PremadeProductInput) =>
      fetchApi<FinishedGood>('/api/inventory/finished-goods', {
        method: 'POST',
        body: JSON.stringify(item),
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
    createSupplier: (data: Omit<Supplier, 'id' | 'isActive' | 'createdAt'>) =>
      fetchApi<Supplier>('/api/inventory/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    updateSupplier: (id: number, data: Partial<Supplier>) =>
      fetchApi<Supplier>(`/api/inventory/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

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
    getAll: (params?: { jobOrderId?: number }) => {
      const q = params?.jobOrderId ? `?jobOrderId=${params.jobOrderId}` : '';
      return fetchApi<PaymentRecord[]>(`/api/payments${q}`);
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
      estimatedCompletion: string;
      downPayment?: number;
      discountPercent?: number;
      notes?: string;
      isDraft?: boolean;
    } & JobOrderPriceInput) =>
      fetchApi<JobOrder>('/api/sales/job-orders', {
        method: 'POST',
        body: JSON.stringify(order),
      }),

    updateJobOrder: (id: number, updates: Partial<JobOrder> & JobOrderPriceInput) =>
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
    
    create: (po: {
      supplierName: string;
      supplierId?: number;
      items: Array<{ materialId?: number; name: string; quantity: number; unit: string; unitPrice: number }>;
      expectedDelivery: string;
    }) =>
      fetchApi<PurchaseOrder>('/api/purchase-orders', {
        method: 'POST',
        body: JSON.stringify(po),
      }),
    
    approve: (id: number) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/approve`, { method: 'POST' }),
    
    receive: (id: number) =>
      fetchApi<PurchaseOrder>(`/api/purchase-orders/${id}/receive`, { method: 'POST' }),
  },

  // ==================
  // DELIVERIES
  // ==================
  deliveries: {
    getAll: (params?: { status?: string; type?: string }) => {
      const query = new URLSearchParams();
      if (params?.status) query.append('status', params.status);
      if (params?.type) query.append('type', params.type);
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
    confirm: (id: number, data: { paymentAmount?: number; paymentMethod?: string }) =>
      fetchApi<ProductOrder>(`/api/premade-drafts/${id}/confirm`, { method: 'POST', body: JSON.stringify(data) }),
  },

  // ==================
  // PRODUCT ORDER TRANSFERS
  // ==================
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
    summary: () => fetchApi<OwnerSummary>('/api/owner/summary'),
    pnl: (p?: { startDate?: string; endDate?: string; branchId?: number | '' }) =>
      fetchApi<ProfitAndLoss>(`/api/owner/pnl${periodQuery(p)}`),
    jobCosting: (p?: { startDate?: string; endDate?: string }) =>
      fetchApi<OwnerJobCosting>(`/api/owner/job-costing${periodQuery(p)}`),
    receivables: (status?: string) =>
      fetchApi<OwnerReceivables>(`/api/owner/receivables${status ? `?status=${status}` : ''}`),
    inventory: () => fetchApi<OwnerInventory>('/api/owner/inventory'),
  },

  expenses: {
    list: (p?: { startDate?: string; endDate?: string; category?: string }) => {
      const q = periodQuery(p);
      const cat = p?.category ? `${q ? '&' : '?'}category=${encodeURIComponent(p.category)}` : '';
      return fetchApi<ExpenseList>(`/api/expenses${q}${cat}`);
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
    updateUser: (id: number, updates: Partial<User & { password?: string; adminPassword?: string }>) =>
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
    /** Extra material issued under workers' names (filter by worker and/or job order) */
    extraMaterials: (params: { workerId?: number; jobOrderId?: number } = {}) => {
      const q = new URLSearchParams();
      if (params.workerId) q.set('workerId', String(params.workerId));
      if (params.jobOrderId) q.set('jobOrderId', String(params.jobOrderId));
      return fetchApi<MaterialWasteLog[]>(`/api/worker-extra-materials?${q}`);
    },
    create: (data: { name: string; workType: string; ratePerHour: number; payMode?: string; userId?: number | null }) =>
      fetchApi<{ worker: ManagedWorker }>('/api/managed-workers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<{ name: string; workType: string; ratePerHour: number; payMode: string; isActive: boolean; userId: number | null }>) =>
      fetchApi<{ worker: ManagedWorker }>(`/api/managed-workers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
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
    create: (data: { workerId: number; jobOrderRef: string; jobOrderDbId?: number; description?: string; expectedHours?: number; notes?: string; scheduledDate?: string; assignmentType?: string; specialTaskTitle?: string }) =>
      fetchApi<{ assignment: WorkerAssignment }>('/api/worker-assignments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    /** workerId moves a task that hasn't started to another worker */
    update: (id: number, data: Partial<{ status: string; hoursWorked: number; unitsWorked: number; payOverride: number; materialsUsed: object[]; expectedHours: number; notes: string; description: string; scheduledDate: string; workerId: number }>) =>
      fetchApi<{ assignment: WorkerAssignment }>(`/api/worker-assignments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      fetchApi<{ message: string }>(`/api/worker-assignments/${id}`, { method: 'DELETE' }),
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
