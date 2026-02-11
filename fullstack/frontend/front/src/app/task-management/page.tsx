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
  branchId: number;
}

interface WorkTask {
  id: number;
  taskNumber: string;
  jobOrderId: string;
  workerId: number;
  title: string;
  status: string;
}

export default function TaskManagement() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
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
        fetchWorkers();
      }
    }
  }, [user, authLoading, router]);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      const res = await api.workers.getWorkersList();
      setWorkers(res.data?.workers || []);
    } catch (error) {
      console.error('Error fetching workers:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter only available workers for task assignment
  const availableWorkers = workers.filter(w => w.isAvailable);

  const handleSyncWorkers = async () => {
    if (!confirm('This will create worker profiles for all users with worker roles (seat_maker, sewer, staff) who don\'t have profiles yet. Continue?')) {
      return;
    }
    
    try {
      const res = await api.workers.syncWorkerProfiles();
      const data = res.data;
      
      let message = data?.message || 'Worker profiles synced successfully!';
      if (data?.createdUsers && data.createdUsers.length > 0) {
        message += `\n\nCreated profiles for:\n${data.createdUsers.join(', ')}`;
      }
      if (data?.skippedUsers && data.skippedUsers.length > 0) {
        message += `\n\nAlready had profiles:\n${data.skippedUsers.join(', ')}`;
      }
      message += `\n\nTotal users with worker roles: ${data?.totalUsersWithWorkerRoles || 0}`;
      
      alert(message);
      fetchWorkers(); // Reload workers list
    } catch (error) {
      console.error('Error syncing workers:', error);
      alert('Failed to sync worker profiles. Check console for details.');
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
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task');
    }
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Task Management</h1>
            <p className="text-gray-600 mt-1">Assign tasks to workers</p>
          </div>
          <div className="flex gap-3">
            {user?.role === 'administrator' && (
              <button
                onClick={handleSyncWorkers}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                title="Create worker profiles for existing users"
              >
                Sync Workers
              </button>
            )}
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
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
                    {availableWorkers.length === 0 ? (
                      <option disabled>No available workers</option>
                    ) : (
                      availableWorkers.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.userName} ({worker.specialization || 'general'})
                        </option>
                      ))
                    )}
                  </select>
                  {availableWorkers.length === 0 && (
                    <p className="text-sm text-amber-600 mt-1">⚠️ No workers are currently available. Make workers available to assign tasks.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job Order ID *
                  </label>
                  <input
                    type="text"
                    value={formData.jobOrderId}
                    onChange={(e) => setFormData({ ...formData, jobOrderId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    placeholder="e.g., JO-BA-2026-0001"
                    required
                  />
                </div>

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
                  </select>
                </div>

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

        {/* Workers List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Available Workers</h2>
          </div>
          
          {workers.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No workers found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Worker Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Worker Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Branch ID
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workers.map((worker) => (
                    <tr key={worker.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{worker.userName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                          Staff
                        </span>
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
      </div>
    </div>
  );
}
