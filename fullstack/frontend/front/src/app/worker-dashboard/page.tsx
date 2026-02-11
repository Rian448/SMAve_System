'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

interface WorkTask {
  id: number;
  taskNumber: string;
  jobOrderId: string;
  title: string;
  description: string;
  taskType: string;
  priority: string;
  status: string;
  estimatedHours: number;
  actualHours: number;
  dueDate: string;
  startedAt: string;
  completedAt: string;
  notes: string;
}

interface WorkerProfile {
  id: number;
  userId: number;
  workerType: string;
  isAvailable: boolean;
  specialization: string;
  branchId: number;
  userName: string;
}

export default function WorkerDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [selectedTask, setSelectedTask] = useState<WorkTask | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (user) {
      // Check if user is a worker
      const workerRoles = ['seat_maker', 'sewer', 'staff'];
      if (!workerRoles.includes(user.role)) {
        router.push('/dashboard');
      } else {
        fetchWorkerData();
      }
    }
  }, [user, authLoading, router]);

  const fetchWorkerData = async () => {
    try {
      setLoading(true);
      
      // Fetch worker profile
      const profileRes = await api.workers.getProfile();
      setProfile(profileRes.data?.worker);
      
      // Fetch tasks
      await fetchTasks(filter);
    } catch (error: any) {
      console.error('Error fetching worker data:', error);
      if (error.response?.status === 403) {
        router.push('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async (status?: string) => {
    try {
      const res = await api.workers.getTasks(status && status !== 'all' ? status : undefined);
      setTasks(res.data?.tasks || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const toggleAvailability = async () => {
    if (!profile) return;
    
    try {
      const res = await api.workers.toggleAvailability(!profile.isAvailable);
      
      setProfile({ ...profile, isAvailable: res.data?.isAvailable || false });
    } catch (error) {
      console.error('Error toggling availability:', error);
      alert('Failed to update availability');
    }
  };

  const updateTaskStatus = async (taskId: number, newStatus: string, actualHours?: number) => {
    try {
      await api.workers.updateTaskStatus(taskId, {
        status: newStatus,
        actualHours
      });
      
      // Refresh tasks
      await fetchTasks(filter);
      setSelectedTask(null);
      alert('Task updated successfully');
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Failed to update task');
    }
  };

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    fetchTasks(newFilter);
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
      case 'pending': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'cancelled': return 'text-red-700 bg-red-50 border-red-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <p className="text-red-600">Worker profile not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Worker Dashboard</h1>
              <p className="text-gray-600 mt-1">Welcome, {profile.userName}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                  STAFF
                </span>
                <span className="text-sm px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {(profile.specialization || 'general').replace('_', ' ').toUpperCase()}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={toggleAvailability}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                  profile.isAvailable
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                }`}
              >
                {profile.isAvailable ? '✓ Available' : '✗ Unavailable'}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-500">Total Tasks</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{tasks.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-3xl font-bold text-yellow-600 mt-2">
              {tasks.filter(t => t.status === 'pending').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-500">In Progress</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {tasks.filter(t => t.status === 'in_progress').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-500">Completed</p>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {tasks.filter(t => t.status === 'completed').length}
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex gap-2 overflow-x-auto">
            {(['all', 'pending', 'in_progress', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => handleFilterChange(f)}
                className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  filter === f
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
            <h2 className="text-xl font-bold text-gray-900">My Tasks</h2>
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
                  className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedTask(task)}
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
                      <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                        <span>📋 {task.taskNumber}</span>
                        <span>🔖 Job Order: {task.jobOrderId}</span>
                        <span>⏱️ Est: {task.estimatedHours || 'N/A'}h</span>
                        <span>📅 Due: {formatDate(task.dueDate)}</span>
                        {task.taskType && <span>🔧 Type: {task.taskType}</span>}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      {task.status === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTaskStatus(task.id, 'in_progress');
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                          Start Task
                        </button>
                      )}
                      {task.status === 'in_progress' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const hours = prompt('Enter actual hours spent:');
                            if (hours) {
                              updateTaskStatus(task.id, 'completed', parseFloat(hours));
                            }
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedTask.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">{selectedTask.taskNumber}</p>
                </div>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <div className="mt-1">
                  <span className={`text-sm px-3 py-1 rounded-full border ${getStatusColor(selectedTask.status)}`}>
                    {selectedTask.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Priority</label>
                <div className="mt-1">
                  <span className={`text-sm px-3 py-1 rounded-full border ${getPriorityColor(selectedTask.priority)}`}>
                    {selectedTask.priority.toUpperCase()}
                  </span>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="mt-1 text-gray-900">{selectedTask.description || 'No description'}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Job Order ID</label>
                  <p className="mt-1 text-gray-900">{selectedTask.jobOrderId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Task Type</label>
                  <p className="mt-1 text-gray-900">{selectedTask.taskType || 'N/A'}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Estimated Hours</label>
                  <p className="mt-1 text-gray-900">{selectedTask.estimatedHours || 'N/A'} hours</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Actual Hours</label>
                  <p className="mt-1 text-gray-900">{selectedTask.actualHours || 'N/A'} hours</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Due Date</label>
                  <p className="mt-1 text-gray-900">{formatDate(selectedTask.dueDate)}</p>
                </div>
                {selectedTask.startedAt && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Started At</label>
                    <p className="mt-1 text-gray-900">{formatDate(selectedTask.startedAt)}</p>
                  </div>
                )}
              </div>
              
              {selectedTask.completedAt && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Completed At</label>
                  <p className="mt-1 text-gray-900">{formatDate(selectedTask.completedAt)}</p>
                </div>
              )}
              
              {selectedTask.notes && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Notes</label>
                  <p className="mt-1 text-gray-900">{selectedTask.notes}</p>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-gray-200 flex gap-3">
              {selectedTask.status === 'pending' && (
                <button
                  onClick={() => {
                    updateTaskStatus(selectedTask.id, 'in_progress');
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Start Task
                </button>
              )}
              {selectedTask.status === 'in_progress' && (
                <button
                  onClick={() => {
                    const hours = prompt('Enter actual hours spent:');
                    if (hours) {
                      updateTaskStatus(selectedTask.id, 'completed', parseFloat(hours));
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Mark as Complete
                </button>
              )}
              <button
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
