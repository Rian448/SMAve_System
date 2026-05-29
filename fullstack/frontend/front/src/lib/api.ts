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
  role: 'administrator' | 'supervisor' | 'sales_manager' | 'staff' | 'seat_maker' | 'sewer' | 'customer';
  roleName?: string;
  branch: string;
  branchId?: number;
  branchName?: string;
  isActive?: boolean;
  phone?: string;
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
}

export interface Activity {
  type: string;
  title: string;
  description: string;
  timestamp: string;
  status: string;
}

export interface Alert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  itemId: number;
}

export interface WorkerProfile {
  id: number;
  userId: number;
  userName: string;
  workerType: 'staff';
  isAvailable: boolean;
  specialization?: 'seat_maker' | 'sewer' | 'general' | string;
  branchId?: number;
}

export interface WorkTask {
  id: number;
  taskNumber: string;
  jobOrderId: string;
  workerId?: number;
  title: string;
  description?: string;
  taskType: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  estimatedHours?: number;
  actualHours?: number;
  dueDate?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  notes?: string;
}

export interface WorkTaskInput {
  jobOrderId: string;
  title: string;
  taskType: string;
  description?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  estimatedHours?: number;
  dueDate?: string;
  workerId?: number;
  notes?: string;
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
  status: 'pending' | 'transferred' | 'received';
  createdAt: string;
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

export interface MultiProductOrderResult {
  groupId: string;
  pickupBranchName: string;
  totalAmount: number;
  orders: ProductOrder[];
}

export interface IncomingShipmentGroup {
  groupId: string;
  orders: ProductOrder[];
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
}

export interface RawMaterial {
  id: number;
  itemId: string;
  materialType: string;
  color: string;
  pattern: string;
  unitPrice: number;
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

export interface RawMaterialInput {
  itemId?: string;
  materialType: string;
  color?: string;
  pattern?: string;
  unitPrice: number;
  stockQuantity: number;
  lowStockThreshold?: number;
  supplierId?: number | null;
  branchId: number;
  /** Set to 'needed' when material is being ordered specifically for a job order */
  status?: string;
  /** The job order ID this material is being ordered for */
  sourceJobOrderId?: string;
}

export interface RawMaterialSummaryGroup {
  key: string;
  name: string;
  color: string;
  pattern: string;
  unitPrice: number;
  totalStockQuantity: number;
  components: RawMaterial[];
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
  isArchived: boolean;
  lastUpdated: string;
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
}

export interface ManagedWorker {
  id: number;
  name: string;
  workType: string;
  ratePerHour: number;
  isActive: boolean;
  createdAt?: string;
}

export interface WorkerAssignment {
  id: number;
  workerId: number;
  workerName: string;
  workType: string;
  ratePerHour: number;
  jobOrderRef: string;
  jobOrderDbId?: number;
  description?: string;
  startTime?: string;
  endTime?: string;
  hoursWorked?: number;
  pay?: number;
  status: 'pending' | 'in_progress' | 'completed';
  notes?: string;
  createdAt: string;
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
  estimatedCost: number;
  actualCost: number;
  totalPrice: number;
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

export interface LineupSlipItem {
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface LineupSlip {
  id: number;
  slipNumber: string;
  jobOrderId: number;
  jobOrderNumber: string;
  customerName: string;
  branchId: number;
  items: LineupSlipItem[];
  priority: 'low' | 'normal' | 'high';
  assignedTo: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
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
  materialsCost: number;
  laborCost: number;
  overheadCost: number;
  totalAmount: number;
  status: string;
}

export interface CostingData {
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

export interface AnalyticsData {
  categoryDistribution: Array<{ name: string; count: number; value: number }>;
  topMaterials: Array<{ name: string; value: number }>;
  monthlyTrends: Array<{ month: string; purchases: number; sales: number }>;
}

export interface ForecastItem {
  month: string;
  forecastedOrders: number;
  forecastedRevenue: number;
  confidence: number;
}

export interface MaterialForecast {
  materialId: number;
  name: string;
  currentStock: number;
  reorderPoint: number;
  dailyUsage: number;
  daysUntilReorder: number;
  recommendedOrderQty: number;
  urgency: 'high' | 'medium' | 'low';
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
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
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

  // Analytics
  getAnalytics: () => fetchApi<AnalyticsData>('/api/analytics'),

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
    
    recover: (email: string) =>
      fetchApi<null>('/api/auth/recover', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    
    register: (data: { username: string; password: string; email: string; fullName: string; phone: string }) =>
      fetchApi<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // ==================
  // DASHBOARD
  // ==================
  dashboard: {
    getStats: () => fetchApi<DashboardStats>('/api/dashboard/stats'),
    
    getRecentActivity: () => fetchApi<Activity[]>('/api/dashboard/recent-activity'),
    
    getAlerts: () => fetchApi<Alert[]>('/api/dashboard/alerts'),
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

    getRawMaterialsSummary: (params?: { includeArchived?: boolean; branchId?: number; category?: string; includeComponents?: boolean }) => {
      const query = new URLSearchParams();
      if (params?.includeArchived) query.append('includeArchived', 'true');
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      if (params?.category) query.append('category', params.category);
      if (params?.includeComponents) query.append('includeComponents', 'true');
      return fetchApi<RawMaterialSummaryGroup[]>(`/api/inventory/raw-materials/summary?${query}`);
    },

    getRawMaterialGroupDetail: (key: string, params?: { includeArchived?: boolean; branchId?: number }) => {
      const query = new URLSearchParams();
      query.append('key', key);
      if (params?.includeArchived) query.append('includeArchived', 'true');
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      return fetchApi<RawMaterialSummaryGroup>(`/api/inventory/raw-materials/group-detail?${query}`);
    },
    
    getRawMaterial: (id: number) => fetchApi<RawMaterial>(`/api/inventory/raw-materials/${id}`),
    
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
    
    archiveRawMaterial: (id: number) =>
      fetchApi<null>(`/api/inventory/raw-materials/${id}/archive`, { method: 'POST' }),
    
    restoreRawMaterial: (id: number) =>
      fetchApi<null>(`/api/inventory/raw-materials/${id}/restore`, { method: 'POST' }),
    
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

    getMaterialUsage: (params?: { branchId?: number; materialId?: number }) => {
      const query = new URLSearchParams();
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      if (params?.materialId) query.append('materialId', params.materialId.toString());
      return fetchApi<MaterialUsageLog[]>(`/api/inventory/material-usage?${query}`);
    },
    
    // Public Products (for customer ordering)
    getPublicProducts: (params?: { branchId?: number; category?: string }) => {
      const query = new URLSearchParams();
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      if (params?.category) query.append('category', params.category);
      return fetchApi<PublicProduct[]>(`/api/inventory/finished-goods/public?${query}`);
    },
    
    // Categories
    getCategories: () => fetchApi<{ rawMaterials: string[]; finishedGoods: string[] }>('/api/inventory/categories'),
    
    // Low Stock
    getLowStock: () => fetchApi<RawMaterial[]>('/api/inventory/low-stock'),

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
      notes?: string;
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
    
    voidJobOrder: (id: number) =>
      fetchApi<null>(`/api/sales/job-orders/${id}/void`, { method: 'POST' }),
    
    // Line-up Slips
    getLineupSlips: () => fetchApi<LineupSlip[]>('/api/sales/lineup-slips'),
    
    createLineupSlip: (slip: {
      jobOrderId: number;
      items?: LineupSlipItem[];
      priority?: string;
      assignedTo?: string;
      notes?: string;
    }) =>
      fetchApi<LineupSlip>('/api/sales/lineup-slips', {
        method: 'POST',
        body: JSON.stringify(slip),
      }),
    
    updateLineupSlip: (id: number, updates: Partial<LineupSlip>) =>
      fetchApi<LineupSlip>(`/api/sales/lineup-slips/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
  },

  // ==================
  // COSTING
  // ==================
  costing: {
    getAll: () => fetchApi<JobOrderCost[]>('/api/costing/all'),

    getJobOrderCosting: (orderId: number) =>
      fetchApi<CostingData>(`/api/costing/job-order/${orderId}`),
    
    updateActualCost: (orderId: number, data: { actualCost?: number; items?: JobOrderItem[] }) =>
      fetchApi<JobOrder>(`/api/costing/job-order/${orderId}/actual`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    
    getVarianceReport: () => fetchApi<Array<{
      jobOrderId: string;
      customerName: string;
      estimatedCost: number;
      actualCost: number;
      variance: number;
      variancePercent: number;
      status: string;
    }>>('/api/costing/variance-report'),
    
    generateReceipt: (orderId: number) => fetchApi<Receipt>(`/api/costing/receipt/${orderId}`),
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
      fromBranchId: number;
      toBranchId?: number;
      customerName?: string;
      customerAddress?: string;
      customerPhone?: string;
      jobOrderId?: number;
      jobOrderNumber?: string;
      items: DeliveryItem[];
      scheduledDate: string;
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
    
    getReceipt: (id: number) => fetchApi<{
      receiptNumber: string;
      date: string;
      deliveryNumber: string;
      type: string;
      from: string;
      to: string;
      address: string;
      items: DeliveryItem[];
      driver: string;
      vehicle: string;
      status: string;
      deliveredAt?: string;
    }>(`/api/deliveries/${id}/receipt`),
  },

  // ==================
  // CUSTOMER ORDERS
  // ==================
  customerOrders: {
    placeOrder: (orderData: {
      customerName: string;
      customerPhone: string;
      customerEmail: string;
      customerAddress: string;
      vehicleInfo: {
        make: string;
        model: string;
        year: string;
        plateNumber: string;
      };
      services: Array<{
        type: string;
        material?: string;
        design?: string;
        pocket?: string;
        others?: string;
        description?: string;
      }>;
      notes: string;
      orderDate: string;
      branchId?: number;
    }) =>
      fetchApi<{ id: number; orderNumber: string }>('/api/customer-orders', {
        method: 'POST',
        body: JSON.stringify(orderData),
      }),

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
  },

  // ==================
  // PRODUCT ORDERS (Premade Products)
  // ==================
  productOrders: {
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
      fetchApi<ProductOrder>('/api/product-orders/multi', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getGroup: (groupId: string) => fetchApi<ProductOrder[]>(`/api/product-orders/group/${groupId}`),

    getMyOrders: () => fetchApi<ProductOrder[]>('/api/product-orders/my-orders'),

    getPickupQueue: () => fetchApi<ProductOrder[]>('/api/product-orders/pickup-queue'),
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
  },

  // ==================
  // FORECASTING
  // ==================
  forecasting: {
    getDemandForecast: () => fetchApi<ForecastItem[]>('/api/forecasting/demand'),
    getMaterialForecast: () => fetchApi<MaterialForecast[]>('/api/forecasting/materials'),
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
    
    updateUser: (id: number, updates: Partial<User & { password?: string }>) =>
      fetchApi<User>(`/api/settings/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    
    archiveUser: (id: number) =>
      fetchApi<null>(`/api/settings/users/${id}/archive`, { method: 'POST' }),
    
    restoreUser: (id: number) =>
      fetchApi<null>(`/api/settings/users/${id}/restore`, { method: 'POST' }),
    
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

  // ==================
  // WORKERS
  // ==================
  workers: {
    getProfile: () => fetchApi<{ worker: WorkerProfile }>('/api/workers/profile'),
    
    toggleAvailability: (isAvailable: boolean) =>
      fetchApi<{ isAvailable: boolean }>('/api/workers/availability', {
        method: 'POST',
        body: JSON.stringify({ isAvailable }),
      }),
    
    getTasks: (status?: string) => {
      const query = status ? `?status=${status}` : '';
      return fetchApi<{ tasks: WorkTask[] }>(`/api/workers/tasks${query}`);
    },
    
    getTaskDetail: (taskId: number) =>
      fetchApi<{ task: WorkTask }>(`/api/workers/tasks/${taskId}`),
    
    updateTaskStatus: (taskId: number, data: { status: string; actualHours?: number; notes?: string }) =>
      fetchApi<{ task: WorkTask }>(`/api/workers/tasks/${taskId}/status`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    
    createTask: (task: WorkTaskInput) =>
      fetchApi<{ task: WorkTask }>('/api/workers/tasks', {
        method: 'POST',
        body: JSON.stringify(task),
      }),
    
    getAllTasks: (params?: { status?: string; jobOrderId?: string }) => {
      const query = new URLSearchParams();
      if (params?.status) query.append('status', params.status);
      if (params?.jobOrderId) query.append('jobOrderId', params.jobOrderId);
      return fetchApi<{ tasks: (WorkTask & { workerName?: string })[] }>(`/api/workers/all-tasks?${query}`);
    },
    
    getWorkersList: () =>
      fetchApi<{ workers: WorkerProfile[] }>('/api/workers/list'),
    
    syncWorkerProfiles: () =>
      fetchApi<{ status: string; message: string; created: number }>('/api/workers/sync', {
        method: 'POST',
      }),
  },

  managedWorkers: {
    list: () =>
      fetchApi<{ workers: ManagedWorker[] }>('/api/managed-workers'),
    create: (data: { name: string; workType: string; ratePerHour: number }) =>
      fetchApi<{ worker: ManagedWorker }>('/api/managed-workers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<{ name: string; workType: string; ratePerHour: number; isActive: boolean }>) =>
      fetchApi<{ worker: ManagedWorker }>(`/api/managed-workers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deactivate: (id: number) =>
      fetchApi<{ message: string }>(`/api/managed-workers/${id}`, { method: 'DELETE' }),
  },

  workerAssignments: {
    list: (workerId?: number) => {
      const query = workerId ? `?workerId=${workerId}` : '';
      return fetchApi<{ assignments: WorkerAssignment[] }>(`/api/worker-assignments${query}`);
    },
    create: (data: { workerId: number; jobOrderRef: string; jobOrderDbId?: number; description?: string; notes?: string }) =>
      fetchApi<{ assignment: WorkerAssignment }>('/api/worker-assignments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<{ status: string; hoursWorked: number; notes: string; description: string }>) =>
      fetchApi<{ assignment: WorkerAssignment }>(`/api/worker-assignments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      fetchApi<{ message: string }>(`/api/worker-assignments/${id}`, { method: 'DELETE' }),
  },
};

export default api;
