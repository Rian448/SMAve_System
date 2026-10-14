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
  role: 'administrator' | 'supervisor' | 'sales_manager' | 'seat_maker' | 'sewer' | 'customer';
  roleName?: string;
  branch: string;
  branchId?: number;
  branchName?: string;
  isActive?: boolean;
  phone?: string;
}

export interface SignupDetails {
  username: string;
  password: string;
  email: string;
  fullName: string;
  phone: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface DashboardStats {
  totalJobOrders: number;
  pendingOrders: number;
  inProgressOrders: number;
  completedOrders: number;
  totalRevenue: number;
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
}

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

export interface Appointment {
  id: number;
  appointmentNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  contactMethod: 'branch_visit' | 'phone_call';
  branchId?: number;
  branchName?: string;
  preferredDate: string;
  preferredTime?: string;
  description?: string;
  vehicleInfo?: VehicleInfo;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  confirmedTime?: string;
  confirmedBy?: number;
  confirmedByName?: string;
  confirmedByRole?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt?: string;
  /** Booked from a signed-in customer account (a quotation can be sent to it) */
  hasAccount?: boolean;
  /** The latest quotation made from this appointment */
  quotation?: AppointmentQuotation | null;
}

export interface AppointmentQuotation {
  id: number;
  jobOrderId: string;
  status: string;
  quoteStatus: QuoteStatus | null;
  quoteRejectReason?: string | null;
}

/** A job order sent to the customer as a quotation: sent → accepted | rejected */
export type QuoteStatus = 'sent' | 'accepted' | 'rejected';

export interface QuoteFields {
  quoteStatus?: QuoteStatus | null;
  quoteRejectReason?: string | null;
  quoteSentAt?: string | null;
  quoteRespondedAt?: string | null;
  appointmentId?: number | null;
}

/** A customer's own job order or quotation, as shown in My Orders (no costs) */
export interface CustomerJobOrder extends QuoteFields {
  id: number;
  jobOrderId: string;
  description: string;
  vehicleInfo?: VehicleInfo | null;
  branchName: string;
  status: string;
  paymentStatus: string;
  totalPrice: number;
  discountPercent?: number | null;
  vatPercent?: number | null;
  downPayment: number;
  balance: number;
  estimatedCompletion: string | null;
  completedAt?: string | null;
  createdAt: string | null;
  /** Specification from the order slip, e.g. center/side/back material, stitching */
  specs: { label: string; value: string }[];
  /** Work steps written on the order slip */
  workSteps: string[];
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

/** One line of a saved cart re-checked against current stock. */
export interface AvailabilityRow {
  productId: number;
  name: string;
  sku?: string;
  requested: number;
  available: number;
  currentPrice: number | null;
  savedPrice?: number;
  /** null when the line is fine; otherwise why it blocks confirmation. */
  issue: 'unavailable' | 'out_of_stock' | 'insufficient' | 'invalid' | null;
  message: string;
}

/** A customer's saved premade cart, not yet a real order. */
export interface CartDraft {
  id: number;
  kind: 'premade';
  userId: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  pickupBranchId?: number | null;
  pickupBranchName?: string | null;
  notes: string;
  items: ProductOrderItem[];
  itemCount: number;
  /** Total at *current* prices, counting only lines with no issue. */
  totalAmount: number;
  availability: AvailabilityRow[];
  /** False when any line is out of stock or short — confirmation is blocked. */
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface PublicProduct {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  category: string;
  price: number;
  branchId: number;
  branchName?: string;
  /** False when out of stock (only sent with includeUnavailable) */
  isAvailable?: boolean;
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
  cost: number;
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

/** Standard Philippine VAT rate, used when VAT is switched on for a job order */
export const DEFAULT_VAT_PERCENT = 12;

/**
 * Splits a job order's final price into subtotal → discount → VAT → total.
 * Only the total and the two percentages are stored, so the rest is derived
 * backwards from them; the parts always add up to the stored total.
 */
export function jobOrderPriceBreakdown(total: number, discountPercent?: number | null, vatPercent?: number | null) {
  const d = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const v = Math.max(Number(vatPercent) || 0, 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  const afterDiscount = round(total / (1 + v / 100));
  const vat = round(total - afterDiscount);
  const subtotal = d < 100 ? round(afterDiscount / (1 - d / 100)) : afterDiscount;
  return { subtotal, discount: round(subtotal - afterDiscount), afterDiscount, vat, total, discountPercent: d, vatPercent: v };
}

/** Highest price for the work (before discount and VAT): 8 digits, under ₱100M */
export const MAX_JOB_ORDER_PRICE = 99_999_999.99;

/** Whether a typed price fits: up to 8 digits before the decimal point and 2 after */
export function isValidPriceInput(raw: string) {
  return raw === '' || /^\d{0,8}(\.\d{0,2})?$/.test(raw);
}

/** Final price from the price before discount, a discount % and a VAT % */
export function jobOrderTotalFrom(subtotal: number, discountPercent?: number | null, vatPercent?: number | null) {
  const d = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const v = Math.max(Number(vatPercent) || 0, 0);
  return Math.round(subtotal * (1 - d / 100) * (1 + v / 100) * 100) / 100;
}

export interface ManagedWorker {
  id: number;
  name: string;
  workType: string;
  ratePerHour: number;
  /** per_hour | per_day | per_piece */
  payMode: 'per_hour' | 'per_day' | 'per_piece';
  isActive: boolean;
  createdAt?: string;
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

export interface JobOrder {
  id: number;
  jobOrderId: string;
  customerId?: number;
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
  actualCost: number;
  totalPrice: number;
  discountPercent?: number | null;
  vatPercent?: number | null;
  status: 'pending' | 'in_progress' | 'completed' | 'voided' | 'cancelled' | 'delivered';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  downPayment: number;
  balance: number;
  estimatedCompletion: string;
  completedAt?: string;
  createdAt: string;
  createdBy: number;
  updatedAt: string;
  quoteStatus?: QuoteStatus | null;
  quoteRejectReason?: string | null;
  quoteSentAt?: string | null;
  quoteRespondedAt?: string | null;
  appointmentId?: number | null;
}

export interface QuotationItem {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
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
  // Quotation fields
  userId?: number;
  quotationItems?: QuotationItem[];
  quotationTotal?: number;
  quotationStatus?: 'pending_quotation' | 'quoted' | 'accepted' | 'rejected';
  quotationNotes?: string;
  customerResponseNotes?: string;
  quotedAt?: string;
  respondedAt?: string;
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
}

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

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
};

export const getAuthToken = (): string | null => {
  if (!authToken && typeof window !== 'undefined') {
    authToken = localStorage.getItem('authToken');
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

    /** Sign-up step 1: checks the details and emails a 6-digit code */
    sendSignupCode: (data: SignupDetails) =>
      fetchApi<null>('/api/auth/register/send-code', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    /** Sign-up step 2: creates the account once the emailed code checks out */
    register: (data: SignupDetails & { code: string }) =>
      fetchApi<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
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
  // MY JOB ORDERS (customer side: staff-made job orders and quotations)
  // ==================
  myJobOrders: {
    list: () => fetchApi<CustomerJobOrder[]>('/api/job-orders/mine'),

    /** Accept turns the quotation into a job order; reject needs a reason */
    respondToQuotation: (id: number, response: 'accept' | 'reject', reason?: string) =>
      fetchApi<CustomerJobOrder>(`/api/job-orders/${id}/quotation/respond`, {
        method: 'POST',
        body: JSON.stringify({ response, reason }),
      }),
  },

  // ==================
  // DASHBOARD
  // ==================
  dashboard: {
    // branchId is honoured for administrators only; everyone else always gets their own branch
    getStats: (branchId?: number) =>
      fetchApi<DashboardStats>(`/api/dashboard/stats${branchId ? `?branchId=${branchId}` : ''}`),
    
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
    
    // Public Products (for customer ordering)
    getPublicProducts: (params?: { branchId?: number; category?: string; includeUnavailable?: boolean }) => {
      const query = new URLSearchParams();
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      if (params?.category) query.append('category', params.category);
      if (params?.includeUnavailable) query.append('includeUnavailable', 'true');
      return fetchApi<PublicProduct[]>(`/api/inventory/finished-goods/public?${query}`);
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
    create: (data: { jobOrderId: number; amount: number; paymentMethod: string; referenceNumber?: string; notes?: string }) =>
      fetchApi<PaymentRecord>('/api/payments', { method: 'POST', body: JSON.stringify(data) }),
    getSummary: () => fetchApi<PaymentSummary>('/api/payments/summary'),
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
      totalPrice?: number;
      discountPercent?: number;
      notes?: string;
      isDraft?: boolean;
    }) =>
      fetchApi<JobOrder>('/api/sales/job-orders', {
        method: 'POST',
        body: JSON.stringify(order),
      }),

    updateJobOrder: (id: number, updates: Partial<JobOrder>) =>
      fetchApi<JobOrder>(`/api/sales/job-orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),

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

    // Customer's own orders
    getMyOrders: () => fetchApi<CustomerOrder[]>('/api/customer-orders/my-orders'),

    getMyOrder: (id: number) => fetchApi<CustomerOrder>(`/api/customer-orders/my-orders/${id}`),

    // Quotation management
    setQuotation: (id: number, data: {
      items: Array<{ name: string; description?: string; quantity: number; unitPrice: number }>;
      notes?: string;
    }) =>
      fetchApi<CustomerOrder>(`/api/customer-orders/${id}/quotation`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    respondToQuotation: (id: number, response: 'accept' | 'reject', notes?: string) =>
      fetchApi<CustomerOrder>(`/api/customer-orders/${id}/respond`, {
        method: 'PUT',
        body: JSON.stringify({ response, notes }),
      }),
  },

  // ==================
  // APPOINTMENTS
  // ==================
  appointments: {
    create: (data: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      contactMethod: 'branch_visit' | 'phone_call';
      branchId: number;
      preferredDate: string;
      preferredTime?: string;
      description?: string;
      vehicleInfo?: VehicleInfo;
    }) =>
      fetchApi<Appointment>('/api/appointments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getAll: (status?: string) => {
      const query = status ? `?status=${status}` : '';
      return fetchApi<Appointment[]>(`/api/appointments${query}`);
    },

    update: (id: number, data: { status?: string; adminNotes?: string; confirmedTime?: string }) =>
      fetchApi<Appointment>(`/api/appointments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    getMyAppointments: () => fetchApi<Appointment[]>('/api/appointments/my-appointments'),
    get: (id: number) => fetchApi<Appointment>(`/api/appointments/${id}`),
    markNoShow: (id: number) =>
      fetchApi<{ strikeCount: number; isBlocked: boolean }>(`/api/admin/appointments/${id}/no-show`, { method: 'POST' }),
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
    /** The logged-in customer's saved cart, or null if they have none. */
    getCartDraft: () => fetchApi<CartDraft | null>('/api/product-orders/draft'),

    saveCartDraft: (data: {
      items: Array<{ productId: number; quantity: number }>;
      pickupBranchId?: number | null;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      customerAddress?: string;
      notes?: string;
    }) =>
      fetchApi<CartDraft>('/api/product-orders/draft', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deleteCartDraft: () =>
      fetchApi<{ message: string }>('/api/product-orders/draft', { method: 'DELETE' }),

    /**
     * Confirms the saved cart into a real order. Rejects with status 409 and an
     * `availability` report when stock has moved since the cart was saved.
     */
    confirmCartDraft: (data?: {
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      customerAddress?: string;
      pickupBranchId?: number;
      notes?: string;
    }) =>
      fetchApi<ProductOrder>('/api/product-orders/draft/confirm', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),

    /** Staff view of all customers' unconfirmed saved carts. */
    getPremadeDrafts: () => fetchApi<CartDraft[]>('/api/product-orders/drafts'),

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

    multiCreate: (data: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      customerAddress?: string;
      items: Array<{ productId: number; quantity: number }>;
      pickupBranchId: number;
      notes?: string;
    }) =>
      fetchApi<ProductOrder>('/api/product-orders/multi-branch', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getMyOrders: () => fetchApi<ProductOrder[]>('/api/product-orders/my-orders'),
    /** Customer cancels their own order; only allowed while it is pending */
    cancelMyOrder: (id: number) =>
      fetchApi<ProductOrder>(`/api/product-orders/my-orders/${id}/cancel`, { method: 'POST' }),

    getPickupQueue: () => fetchApi<ProductOrder[]>('/api/product-orders/pickup-queue'),

    getDirectSales: () => fetchApi<ProductOrder[]>('/api/product-orders/direct-sales'),
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
    getBranches: (includeInactive?: boolean) => {
      const query = includeInactive ? '?includeInactive=true' : '';
      return fetchApi<Branch[]>(`/api/settings/branches${query}`);
    },
    
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
    create: (data: { name: string; workType: string; ratePerHour: number; payMode?: string }) =>
      fetchApi<{ worker: ManagedWorker }>('/api/managed-workers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<{ name: string; workType: string; ratePerHour: number; payMode: string; isActive: boolean }>) =>
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
    getCalendar: (params: { workerId: number; month: string }) =>
      fetchApi<Record<string, Array<{ id: number; jobOrderRef: string; assignmentType: string; specialTaskTitle?: string; workerName: string; status: string; description?: string }>>>(
        `/api/worker-assignments/calendar?workerId=${params.workerId}&month=${params.month}`
      ),
    create: (data: { workerId: number; jobOrderRef: string; jobOrderDbId?: number; description?: string; expectedHours?: number; notes?: string; scheduledDate?: string; assignmentType?: string; specialTaskTitle?: string }) =>
      fetchApi<{ assignment: WorkerAssignment }>('/api/worker-assignments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<{ status: string; hoursWorked: number; unitsWorked: number; payOverride: number; materialsUsed: object[]; expectedHours: number; notes: string; description: string; scheduledDate: string }>) =>
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
