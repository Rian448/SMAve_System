'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

interface Worker {
  id: number;
  userId: number;
  userName: string;
  workerType: string;
  isAvailable: boolean;
  specialization?: string;
  branchId?: number;
}

interface WorkTask {
  id: number;
  taskNumber: string;
  jobOrderId: string;
  workerId?: number;
  workerName?: string;
  title: string;
  description?: string;
  taskType?: string;
  priority: string;
  status: string;
  estimatedHours?: number;
  actualHours?: number;
  dueDate?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface JobOrder {
  id: number;
  jobOrderId: string;
  customerName: string;
  description: string;
  status: string;
  branchName?: string;
}

interface CustomerOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  status: string;
}

interface OrderOption {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  type: 'job_order' | 'customer_order';
}

export default function TaskManagement() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [allOrders, setAllOrders] = useState<OrderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'workers'>('tasks');
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [showOrderUpdateModal, setShowOrderUpdateModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [newOrderStatus, setNewOrderStatus] = useState<string>('');
  
  const [formData, setFormData] = useState({
    workerId: '',
    jobOrderId: '',
    title: '',
    description: '',
    taskType: 'sewing',
    priority: 'normal',
    estimatedHours: '',
    dueDate: ''
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (user) {
      if (!['administrator', 'supervisor', 'sales_manager'].includes(user.role)) {
        router.push('/dashboard');
      } else {
        fetchData();
      }
    }
  }, [user, authLoading, router]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchWorkers(),
        fetchTasks(),
        fetchJobOrders()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkers = async () => {
    try {
      const res = await api.workers.getWorkersList();
      setWorkers(res.data?.workers || []);
    } catch (error) {
      console.error('Error fetching workers:', error);
    }
  };

  const fetchTasks = async (status?: string) => {
    try {
      const res = await api.workers.getAllTasks(status && status !== 'all' ? { status } : undefined);
      setTasks(res.data?.tasks || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchJobOrders = async () => {
    try {
      // Fetch both job orders and customer orders
      const res = await api.sales.getAllOrders();
      console.log('All orders response:', res);
      
      const orders: OrderOption[] = [];
      
      // Add job orders
      if (res.data?.jobOrders) {
        res.data.jobOrders
          .filter((order: JobOrder) => !['voided', 'cancelled'].includes(order.status))
          .forEach((order: JobOrder) => {
            orders.push({
              id: order.jobOrderId,
              orderNumber: order.jobOrderId,
              customerName: order.customerName,
              status: order.status,
              type: 'job_order'
            });
          });
      }
      
      // Add customer orders
      if (res.data?.customerOrders) {
        res.data.customerOrders
          .filter((order: CustomerOrder) => !['cancelled'].includes(order.status))
          .forEach((order: CustomerOrder) => {
            orders.push({
              id: order.orderNumber,
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              status: order.status,
              type: 'customer_order'
            });
          });
      }
      
      console.log('Combined orders:', orders);
      setAllOrders(orders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const handleSyncWorkers = async () => {
    if (!confirm('This will create worker profiles for all users with worker roles (seat_maker, sewer, staff) who don\'t have profiles yet. Continue?')) {
      return;
    }
    
    try {
      const res = await api.workers.syncWorkerProfiles();
      alert(res.data?.message || 'Worker profiles synced successfully!');
      fetchWorkers();
    } catch (error) {
      console.error('Error syncing workers:', error);
      alert('Failed to sync worker profiles.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await api.workers.createTask({
        workerId: parseInt(formData.workerId),
        jobOrderId: formData.jobOrderId,
        title: formData.title,
        description: formData.description,
        taskType: formData.taskType,
        priority: formData.priority,
        estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : null,
        dueDate: formData.dueDate || null
      });
      
      alert('Task created successfully!');
      setShowCreateForm(false);
      setFormData({
        workerId: '',
        jobOrderId: '',
        title: '',
        description: '',
        taskType: 'sewing',
        priority: 'normal',
        estimatedHours: '',
        dueDate: ''
      });
      fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task');
    }
  };

  const handleFilterChange = (newFilter: typeof taskFilter) => {
    setTaskFilter(newFilter);
    fetchTasks(newFilter);
  };

  const handleUpdateOrderStatus = async () => {
    if (!selectedOrderId || !newOrderStatus) return;
    
    try {
      // Determine if it's a job order or customer order based on ID format
      const isJobOrder = selectedOrderId.startsWith('JO-');
      const isCustomerOrder = selectedOrderId.startsWith('ORD-');
      
      if (isJobOrder) {
        // Get all job orders to find the numeric ID
        const allJobOrders = await api.sales.getJobOrders();
        const foundOrder = (allJobOrders.data || []).find((o: JobOrder) => o.jobOrderId === selectedOrderId);
        
        if (foundOrder) {
          await api.sales.updateJobOrder(foundOrder.id, { status: newOrderStatus as any });
          alert('Job order status updated successfully!');
          setShowOrderUpdateModal(false);
          setSelectedOrderId('');
          setNewOrderStatus('');
          fetchJobOrders();
          return;
        }
      } else if (isCustomerOrder) {
        // Get all customer orders to find the numeric ID
        const allCustomerOrders = await api.customerOrders.getOrders();
        const foundOrder = (allCustomerOrders.data || []).find((o: any) => o.orderNumber === selectedOrderId);
        
        if (foundOrder) {
          await api.customerOrders.updateStatus(foundOrder.id, newOrderStatus);
          alert('Customer order status updated successfully!');
          setShowOrderUpdateModal(false);
          setSelectedOrderId('');
          setNewOrderStatus('');
          fetchJobOrders();
          return;
        }
      } else {
        // Try both - first job orders, then customer orders
        const allJobOrders = await api.sales.getJobOrders();
        const foundJobOrder = (allJobOrders.data || []).find((o: JobOrder) => o.jobOrderId === selectedOrderId);
        
        if (foundJobOrder) {
          await api.sales.updateJobOrder(foundJobOrder.id, { status: newOrderStatus as any });
          alert('Job order status updated successfully!');
          setShowOrderUpdateModal(false);
          setSelectedOrderId('');
          setNewOrderStatus('');
          fetchJobOrders();
          return;
        }
        
        const allCustomerOrders = await api.customerOrders.getOrders();
        const foundCustomerOrder = (allCustomerOrders.data || []).find((o: any) => o.orderNumber === selectedOrderId);
        
        if (foundCustomerOrder) {
          await api.customerOrders.updateStatus(foundCustomerOrder.id, newOrderStatus);
          alert('Customer order status updated successfully!');
          setShowOrderUpdateModal(false);
          setSelectedOrderId('');
          setNewOrderStatus('');
          fetchJobOrders();
          return;
        }
      }
      
      alert('Order not found. Please check the order ID.');
    } catch (error) {
      console.error('Error updating order:', error);
      alert('Failed to update order status');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'normal': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'low': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-700 bg-green-50 border-green-200';
      case 'in_progress': return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'ready_for_installation': return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'pending': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'cancelled': return 'text-red-700 bg-red-50 border-red-200';
      case 'delivered': return 'text-purple-700 bg-purple-50 border-purple-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Task Management</h1>
            <p className="text-gray-600 mt-1">Manage tasks and update order status</p>
          </div>
          <div className="flex gap-3">
            {user?.role === 'administrator' && (
              <button
                onClick={handleSyncWorkers}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Sync Workers
              </button>
            )}
            <button
              onClick={() => setShowOrderUpdateModal(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              Update Order Status
            </button>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              {showCreateForm ? 'Cancel' : '+ Create Task'}
            </button>
          </div>
        </div>

        {/* Create Task Form */}
        {showCreateForm && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Create New Task</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Worker Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign to Worker *
                  </label>
                  <select
                    value={formData.workerId}
                    onChange={(e) => setFormData({ ...formData, workerId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  >
                    <option value="">Select Worker</option>
                    {workers.map((worker) => (
                      <option key={worker.id} value={worker.id}>
                        {worker.userName} ({worker.specialization || 'general'}) {worker.isAvailable ? '✓' : '○'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Job Order Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Order *
                  </label>
                  <select
                    value={formData.jobOrderId}
                    onChange={(e) => setFormData({ ...formData, jobOrderId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  >
                    <option value="">Select Order</option>
                    {allOrders.length === 0 ? (
                      <option disabled>No orders found</option>
                    ) : (
                      allOrders.map((order) => (
                        <option key={order.id} value={order.orderNumber}>
                          {order.orderNumber} - {order.customerName} ({order.status}) [{order.type === 'job_order' ? 'Job Order' : 'Customer Order'}]
                        </option>
                      ))
                    )}
                  </select>
                  {allOrders.length === 0 && (
                    <p className="text-sm text-amber-600 mt-1">No orders found. You can type the order ID manually below.</p>
                  )}
                  <input
                    type="text"
                    value={formData.jobOrderId}
                    onChange={(e) => setFormData({ ...formData, jobOrderId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white mt-2"
                    placeholder="Or type Order ID manually (e.g., JO-BA-2026-0001 or ORD-2026-0001)"
                  />
                </div>

                {/* Task Title */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Task Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    placeholder="e.g., Sew front seat covers"
                    required
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    rows={3}
                    placeholder="Task details..."
                  />
                </div>

                {/* Task Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Task Type *
                  </label>
                  <select
                    value={formData.taskType}
                    onChange={(e) => setFormData({ ...formData, taskType: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  >
                    <option value="cutting">Cutting</option>
                    <option value="sewing">Sewing</option>
                    <option value="assembly">Assembly</option>
                    <option value="finishing">Finishing</option>
                    <option value="quality_check">Quality Check</option>
                    <option value="packaging">Packaging</option>
                    <option value="installation">Installation</option>
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                {/* Estimated Hours */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estimated Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.estimatedHours}
                    onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    placeholder="e.g., 4"
                  />
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Create Task
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'tasks'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Tasks ({tasks.length})
            </button>
            <button
              onClick={() => setActiveTab('workers')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'workers'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Workers ({workers.length})
            </button>
          </div>
        </div>

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <>
            {/* Task Filter */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <div className="flex gap-2 overflow-x-auto">
                {(['all', 'pending', 'in_progress', 'completed'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => handleFilterChange(f)}
                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      taskFilter === f
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {f.replace('_', ' ').toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Tasks List */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">All Tasks</h2>
              </div>
              
              {tasks.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No tasks found</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-6 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
                            <span className={`text-xs px-2 py-1 rounded-full border ${getPriorityColor(task.priority)}`}>
                              {task.priority.toUpperCase()}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(task.status)}`}>
                              {task.status.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{task.description || 'No description'}</p>
                          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                            <span>📋 {task.taskNumber}</span>
                            <span>🔖 Order: {task.jobOrderId}</span>
                            <span>👤 {task.workerName || 'Unassigned'}</span>
                            <span>📅 Due: {formatDate(task.dueDate)}</span>
                            {task.taskType && <span>🔧 {task.taskType}</span>}
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          {task.status === 'completed' && (
                            <button
                              onClick={() => {
                                setSelectedOrderId(task.jobOrderId);
                                setShowOrderUpdateModal(true);
                              }}
                              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                            >
                              Update Order
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Workers Tab */}
        {activeTab === 'workers' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">All Workers</h2>
            </div>
            
            {workers.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-500">No workers found</p>
                {user?.role === 'administrator' && (
                  <button
                    onClick={handleSyncWorkers}
                    className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Sync Worker Profiles
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Worker Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Specialization</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {workers.map((worker) => (
                      <tr key={worker.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{worker.userName}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            {(worker.specialization || 'general').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm px-2 py-1 rounded-full border ${
                            worker.isAvailable
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-gray-50 text-gray-700 border-gray-200'
                          }`}>
                            {worker.isAvailable ? 'Available' : 'Unavailable'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {worker.branchId || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Order Status Update Modal */}
      {showOrderUpdateModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowOrderUpdateModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Update Order Status</h2>
              <p className="text-sm text-gray-600 mt-1">Update the status of an order</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Order
                </label>
                <select
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="">Select an order</option>
                  {/* Show all available orders */}
                  {allOrders.length > 0 ? (
                    allOrders.map((order) => (
                      <option key={order.id} value={order.orderNumber}>
                        {order.orderNumber} - {order.customerName} ({order.status})
                      </option>
                    ))
                  ) : (
                    /* Fallback: Show orders from tasks if allOrders is empty */
                    [...new Set(tasks.map(t => t.jobOrderId))].map((orderId) => (
                      <option key={orderId} value={orderId}>
                        {orderId}
                      </option>
                    ))
                  )}
                </select>
                <input
                  type="text"
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white mt-2"
                  placeholder="Or type Order ID manually"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Status
                </label>
                <select
                  value={newOrderStatus}
                  onChange={(e) => setNewOrderStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="">Select status</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress (Work Started)</option>
                  <option value="ready_for_installation">Ready for Installation (Still In Progress)</option>
                  <option value="completed">Completed / Installed</option>
                  <option value="delivered">Delivered</option>
                </select>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleUpdateOrderStatus}
                disabled={!selectedOrderId || !newOrderStatus}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Update Status
              </button>
              <button
                onClick={() => {
                  setShowOrderUpdateModal(false);
                  setSelectedOrderId('');
                  setNewOrderStatus('');
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
