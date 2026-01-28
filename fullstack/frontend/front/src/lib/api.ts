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
  role: 'administrator' | 'supervisor' | 'sales_manager' | 'staff';
  branch: string;
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

export interface RawMaterial {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  category: string;
  price: number;
  reorderPoint: number;
  supplier: string;
  branchId: number;
  isArchived: boolean;
  lastUpdated: string;
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
  isArchived: boolean;
  lastUpdated: string;
}

export interface JobOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  materialCost?: number;
  laborCost?: number;
}

export interface VehicleInfo {
  make: string;
  model: string;
  year: number;
  plateNumber: string;
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
  status: 'pending' | 'in_progress' | 'completed' | 'voided' | 'cancelled';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  downPayment: number;
  balance: number;
  estimatedCompletion: string;
  completedAt?: string;
  createdAt: string;
  createdBy: number;
  updatedAt: string;
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
    getRawMaterials: (params?: { includeArchived?: boolean; branchId?: number; category?: string }) => {
      const query = new URLSearchParams();
      if (params?.includeArchived) query.append('includeArchived', 'true');
      if (params?.branchId) query.append('branchId', params.branchId.toString());
      if (params?.category) query.append('category', params.category);
      return fetchApi<RawMaterial[]>(`/api/inventory/raw-materials?${query}`);
    },
    
    getRawMaterial: (id: number) => fetchApi<RawMaterial>(`/api/inventory/raw-materials/${id}`),
    
    createRawMaterial: (material: Omit<RawMaterial, 'id' | 'isArchived' | 'lastUpdated'>) =>
      fetchApi<RawMaterial>('/api/inventory/raw-materials', {
        method: 'POST',
        body: JSON.stringify(material),
      }),
    
    updateRawMaterial: (id: number, material: Partial<RawMaterial>) =>
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
    
    createFinishedGood: (item: Omit<FinishedGood, 'id' | 'isArchived' | 'lastUpdated'>) =>
      fetchApi<FinishedGood>('/api/inventory/finished-goods', {
        method: 'POST',
        body: JSON.stringify(item),
      }),
    
    // Categories
    getCategories: () => fetchApi<{ rawMaterials: string[]; finishedGoods: string[] }>('/api/inventory/categories'),
    
    // Low Stock
    getLowStock: () => fetchApi<RawMaterial[]>('/api/inventory/low-stock'),
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
  // FORECASTING
  // ==================
  forecasting: {
    getDemandForecast: () => fetchApi<ForecastItem[]>('/api/forecasting/demand'),
    
    getMaterialForecast: () => fetchApi<MaterialForecast[]>('/api/forecasting/materials'),
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
      branch: string;
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
    
    createBranch: (branch: { name: string; code: string; address: string; isWarehouse?: boolean }) =>
      fetchApi<Branch>('/api/settings/branches', {
        method: 'POST',
        body: JSON.stringify(branch),
      }),
  },
};

export default api;
